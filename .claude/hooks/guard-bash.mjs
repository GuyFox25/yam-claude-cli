#!/usr/bin/env node
// PreToolUse(Bash|PowerShell): block destructive (files, git history, databases) and network commands, and
// migrate/seed commands aimed at a non-local database (asks when the target can't be determined).
import { join } from 'node:path';
import { readInput, block, allow, ask } from '../lib/hook-io.mjs';
import { projectRoot, readJson, PACKAGES } from '../lib/detect.mjs';
import { dbHosts, isLocalHost } from '../lib/db-target.mjs';

const input = await readInput({ strict: true });
const command = String(input?.tool_input?.command ?? '');
if (!command.trim()) allow();

// Quoted text and heredoc bodies are data (commit messages, grep patterns), not commands, so they are blanked out
// before the command checks. Exceptions: text that still executes ($(...) or backticks inside it), and wrappers that
// run a string as a command (bash -c, eval, powershell -Command, ...), where everything is checked as-is.
const EXECUTES = /\$\(|`/;
const WRAPPER = /(^|[\s;&|(])(bash|sh|zsh|eval|xargs|pwsh|powershell(\.exe)?|cmd(\.exe)?|Invoke-Expression|iex)(\s|$)/i;

const stripHeredocs = (s) =>
  s.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2(?=\s*$|\s*\n)/gm, (all, quote, tag, body) =>
    !quote && EXECUTES.test(body) ? all : all.replace(body, ''),
  );
const stripQuotes = (s) =>
  s.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (q) => (q.startsWith('"') && EXECUTES.test(q) ? q : '""'));

const stripped = stripQuotes(stripHeredocs(command));
const code = WRAPPER.test(stripped) ? command : stripped;

const segments = code
  .split(/&&|\|\||;|\||\n/)
  .map((s) => s.replace(/^[\s({`$]+/, '').trim())
  .filter(Boolean);

const tokensOf = (seg) => seg.split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ''));

// rm -rf (bash), Remove-Item/rm/ri/del -Recurse -Force (PowerShell, abbreviations included), rd|rmdir|del /s /q (cmd).
const RM_CMD = /^(rm|remove-item|ri|del|erase|rd|rmdir)$/i;
const isRecursiveForceDelete = (tokens) => {
  const idx = tokens.findIndex((t) => RM_CMD.test(t) || t.endsWith('/rm'));
  if (idx === -1) return false;
  const flags = tokens.slice(idx + 1).filter((t) => t.startsWith('-') || t.startsWith('/'));
  const recursive = flags.some((f) => /^--recursive$/i.test(f) || /^-[a-zA-Z]*[rR]/.test(f) || /^\/s$/i.test(f));
  const force = flags.some((f) => f === '--force' || /^-[a-zA-Z]*f/.test(f) || /^-fo(r(c(e)?)?)?$/i.test(f) || /^\/q$/i.test(f));

  return recursive && force;
};

// Global git options that take a separate value: git -C dir push, git --work-tree x push, ...
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);
const gitSub = (tokens) => {
  const idx = tokens.findIndex((t) => t === 'git' || /^git(\.exe)?$/i.test(t));
  if (idx === -1) return null;
  for (let i = idx + 1; i < tokens.length; i++) {
    if (GIT_VALUE_OPTS.has(tokens[i])) i++;
    else if (!tokens[i].startsWith('-')) return { name: tokens[i], rest: tokens.slice(i + 1) };
  }

  return null;
};

const URL_SPEC = /^(https?:|git\+|git:|ssh:|github:|gitlab:|bitbucket:)|^[\w.-]+\/[\w.-]+#|\.tgz$/i;
const INSTALLERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'pnpx', 'bunx', 'pip', 'pip3']);
const INSTALL_VERBS = new Set(['install', 'i', 'add', 'dlx', 'exec', 'x']);

const isUrlInstall = (tokens) => {
  const idx = tokens.findIndex((t) => INSTALLERS.has(t));
  if (idx === -1) return false;
  const rest = tokens.slice(idx + 1);
  const direct = ['npx', 'pnpx', 'bunx'].includes(tokens[idx]);

  return (direct || rest.some((t) => INSTALL_VERBS.has(t))) && rest.some((t) => URL_SPEC.test(t));
};

// Irreversible database operations (they may target a shared DB registered in pgAdmin/Compass).
const DB_TOOLS = [
  [/(^|[\s;&|(])dropdb(\.exe)?(\s|$)/, 'dropdb deletes a whole database'],
  [/\bprisma\s+migrate\s+reset\b/, 'prisma migrate reset drops the database'],
  [/\bprisma\s+db\s+push\b.*--accept-data-loss/, 'prisma db push --accept-data-loss'],
  [/\bprisma\s+db\s+push\b.*--force-reset/, 'prisma db push --force-reset drops the database'],
  [/\bdrizzle-kit\s+drop\b/, 'drizzle-kit drop deletes migrations'],
  [/\bdotnet\s+ef\s+database\s+drop\b/, 'dotnet ef database drop'],
  [/\bdotnet\s+ef\s+database\s+update\s+0(\s|$)/, 'dotnet ef database update 0 reverts every migration'],
];
// Statements are only checked when a DB client runs them, so grep/searching for "DROP TABLE" stays allowed.
// They are checked on the raw command because the SQL is usually quoted (psql -c "...").
const DB_CLIENT = /(^|[\s;&|(])(psql|mongosh|mongo|mysql|sqlite3|sqlcmd|node\s+-e|node\s+--eval|prisma\s+db\s+execute)(\.exe)?(\s|$)/;
const DB_STATEMENTS = [
  [/\bdrop\s+(database|schema|table)\b/i, 'DROP DATABASE/SCHEMA/TABLE'],
  [/\btruncate\s+(table\s+)?["\w]/i, 'TRUNCATE deletes all rows'],
  [/\bdropDatabase\s*\(/, 'db.dropDatabase()'],
  [/\.drop\s*\(\s*\)/, 'collection.drop()'],
  [/\.deleteMany\s*\(\s*\{\s*\}\s*\)/, 'deleteMany({}) deletes every document'],
];

const reasons = [];
for (const [re, why] of DB_TOOLS) if (re.test(code)) reasons.push(`destructive database command: ${why}`);
if (DB_CLIENT.test(code)) for (const [re, why] of DB_STATEMENTS) if (re.test(command)) reasons.push(`destructive database command: ${why}`);
if (/(^|[\s;&|(`$])(curl|wget)(\.exe)?(\s|$)/i.test(code)) reasons.push('curl/wget are not allowed (network is closed)');
if (/\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm|Start-BitsTransfer)\b/i.test(code)) reasons.push('web requests are not allowed (network is closed)');

for (const seg of segments) {
  const tokens = tokensOf(seg);
  if (isRecursiveForceDelete(tokens)) reasons.push(`recursive force delete: "${seg}"`);
  if (/(^|\s)--force(-with-lease|-if-includes)?(\s|=|$)/.test(seg)) reasons.push(`--force flag: "${seg}"`);
  const sub = gitSub(tokens);
  if (sub?.name === 'push') reasons.push('git push is not allowed; the user pushes manually');
  if (sub?.name === 'reset' && sub.rest.includes('--hard')) reasons.push('git reset --hard discards work');
  if (sub && sub.rest.some((t) => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(t)) && ['clean', 'checkout', 'branch', 'switch', 'push', 'tag', 'rm'].includes(sub.name)) {
    reasons.push(`forced git ${sub.name}: "${seg}"`);
  }
  if (sub?.name === 'branch' && sub.rest.some((t) => /^-[a-zA-Z]*D[a-zA-Z]*$/.test(t))) reasons.push(`forced branch delete: "${seg}"`);
  if (isUrlInstall(tokens)) reasons.push(`install from a URL/git source: "${seg}"`);
}

if (reasons.length) {
  block(`Blocked by .claude/hooks/guard-bash.mjs:\n- ${[...new Set(reasons)].join('\n- ')}\nAsk the user to run it themselves if it is really needed.`);
}

// Migrations and seeds only ever run against a local database. Hosts are checked, never printed (they may be internal).
const MIGRATE_TOOL =
  /\bdrizzle-kit\s+(migrate|push)\b|\bprisma\s+(migrate\s+(dev|deploy)|db\s+(push|seed))\b|\bmigrate-mongo\s+(up|down)\b|\btypeorm(-ts-node-\w+)?\s+migration:(run|revert)\b|\bknex\s+(migrate|seed):\w+|\bsequelize(-cli)?\s+db:(migrate|seed)/;
const EF_UPDATE = /\bdotnet\s+ef\s+database\s+update\b/;
const PM = /^(npm|pnpm|yarn|bun)(\.cmd)?$/;

const root = projectRoot();
const scripts = new Map();
for (const pkg of ['.', ...PACKAGES]) {
  for (const [name, body] of Object.entries(readJson(join(root, pkg, 'package.json'))?.scripts ?? {})) {
    scripts.set(name, `${scripts.get(name) ?? ''} ${body}`);
  }
}
const isMigrateScript = (name) => scripts.has(name) && (/migrat|db:push|seed/i.test(name) || MIGRATE_TOOL.test(scripts.get(name)));
const runsMigration = (seg) => {
  // Skip inline env assignments: DATABASE_URL=... npm run db:migrate
  const tokens = tokensOf(seg).filter((t, i, all) => !all.slice(0, i + 1).every((x) => /^[A-Za-z_]\w*=/.test(x)));

  return MIGRATE_TOOL.test(seg) || (PM.test(tokens[0] ?? '') && tokens.slice(1).some((t) => !t.startsWith('-') && isMigrateScript(t)));
};

const dotnet = EF_UPDATE.test(code);
if (dotnet || segments.some(runsMigration)) {
  const hosts = dbHosts(root, command, { dotnet });
  const remote = hosts.filter((h) => !isLocalHost(h)).length;
  if (remote) {
    block(`Blocked by .claude/hooks/guard-bash.mjs: this migration/seed would run against a non-local database (${remote} non-local host${remote > 1 ? 's' : ''} in the env/connection settings). Only local databases are migrated from here; ask the user to run it. A local docker host can be allowed with CLAUDE_LOCAL_DB_HOSTS in .claude/settings.local.json "env".`);
  }
  if (!hosts.length) {
    ask('guard-bash could not verify the database host of this migration/seed (no DATABASE_URL-style variable or connection string found). Approve only if it targets a local database.');
  }
}
allow();
