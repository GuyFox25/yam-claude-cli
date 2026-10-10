#!/usr/bin/env node
// SessionStart(startup|resume|clear|compact): print branch, uncommitted files, the package the branch most likely concerns,
// the detected stack, the client's form/data libraries, each package's ESLint config, and the in-house libraries (regenerating their expert agents). After compaction, also the pre-compaction snapshot. Stdout is added to Claude's context.
import { readInput } from '../lib/hook-io.mjs';
import {
  projectRoot,
  git,
  changedFiles,
  packageOf,
  defaultBranch,
  detectPackageManager,
  detectFramework,
  detectOrm,
  detectTestRunner,
  existingPackages,
  detectBackend,
  detectClient,
  detectClientLibs,
  detectEslintConfig,
  detectDbEngine,
  detectDotnetTestFramework,
  dotnetProject,
  dotnetTarget,
  toPosix,
} from '../lib/detect.mjs';
import { discoverLibs, syncAgents, agentName } from '../lib/libs.mjs';
import { readSnapshot } from '../lib/snapshot.mjs';
import { readJsonl, slowHooks } from '../lib/hook-log.mjs';

const input = await readInput();
const root = projectRoot();
const MAX_FILES = 30;

const BRANCH_KEYWORDS = [
  ['client', /\b(client|ui|web|frontend|fe|front)\b/],
  ['server', /\b(server|api|backend|be|endpoint|route)s?\b/],
  ['db', /\b(db|database|migration|schema|seed|sql|orm)s?\b/],
  ['utils', /\b(utils?|shared|common|types?|zod)\b/],
];

const branch = git(root, ['branch', '--show-current']).trim() || '(detached HEAD)';
const dirty = changedFiles(root);

const guessPackage = () => {
  const words = branch.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  // The earliest keyword wins: in <type>/<package>-<desc> the package comes first (fix/server-ui-bug -> server).
  const hit = BRANCH_KEYWORDS.map(([pkg, re]) => [pkg, words.search(re)])
    .filter(([, at]) => at !== -1)
    .sort((a, b) => a[1] - b[1])[0];
  if (hit) return `${hit[0]} (from branch name)`;
  const base = defaultBranch(root);
  const committed = base ? git(root, ['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean) : [];
  const counts = {};
  for (const f of [...committed, ...dirty]) {
    const p = packageOf(root, f);
    if (p) counts[p] = (counts[p] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return top ? `${top[0]} (${top[1]} changed files)` : 'unknown';
};

const describeClient = () => {
  const client = detectClient(root);
  if (!client) return 'n/a';

  return `react-${client.lang}${client.classComponents ? ' (class components present: keep them, new ones are function components)' : ''}`;
};

const describeBackend = () => {
  const backend = detectBackend(root);
  if (backend === 'external') return 'external (no server/ in repo, e.g. SAP ABAP via OData; see CLAUDE.md Project-specific)';
  if (backend === 'dotnet') {
    const tests = detectDotnetTestFramework(root);

    return `dotnet (${dotnetProject(root).rel}${tests ? `, tests=${tests}` : ''}; check target: ${dotnetTarget(root)})`;
  }

  return backend;
};

// Which form, schema and data libraries new client code must follow (react.md: never add a second one, never mix Zod and Yup).
const describeClientLibs = () => {
  const libs = detectClientLibs(root);
  if (!libs) return [];

  return [`Client libs: forms=${libs.forms ?? 'none'}, data=${libs.data ?? 'none'} (follow these; don't add a second form or data library)`];
};

const describeEslint = (pkgs) => {
  const configs = pkgs.filter((p) => p !== dotnetTarget(root)).map((p) => `${p}=${detectEslintConfig(root, p) ?? 'none'}`);

  return configs.length ? [`ESLint: ${configs.join(', ')} (where its rules differ from .claude/rules, ESLint wins)`] : [];
};

// In-house libraries: list them, and (re)generate their expert agents. Never fail the session on this.
const describeLibs = () => {
  try {
    const libs = discoverLibs(root);
    if (!libs.length) return [];
    const { written } = syncAgents(root, libs);
    const items = libs.map((l) => `  ${l.name} ${l.version} -> agent ${agentName(l.name)}${l.linked ? ` (linked: ${toPosix(l.real)})` : ''}`);
    const note = written.length ? ['  (new or updated library agents load next session; until then use the library-expert agent)'] : [];

    return ['In-house libraries (ask their agent before using them; details: node .claude/scripts/lib-info.mjs show <lib>):', ...items, ...note];
  } catch (err) {
    return [`In-house libraries: discovery failed (${err.message})`];
  }
};

// After compaction: the snapshot precompact-snapshot saved (prompts, decisions, plan, todos, edited files).
const describeSnapshot = () => {
  const snapshot = input?.source === 'compact' ? readSnapshot(root, input?.session_id) : null;

  return snapshot ? ['', 'Pre-compaction snapshot (task, decisions, edited files; trust it over the summary for details):', snapshot] : [];
};

// Hook timing budget: the recent runs in .claude/logs/hooks.jsonl (written by hook-io) whose p95 is over CLAUDE_HOOK_SLOW_MS.
const describeSlowHooks = () => {
  try {
    const slow = slowHooks(readJsonl(root, 'hooks', { tail: 500 }));
    if (!slow.length) return [];
    const items = slow.map((h) => `${h.hook} p95 ${(h.p95 / 1000).toFixed(1)}s (${h.runs} runs)`);

    return [`Slow hooks: ${items.join(', ')}. Tell the user; details: node .claude/scripts/audit-report.mjs`];
  } catch {
    return [];
  }
};

const pkgs = existingPackages(root);
const lines = [
  `Branch: ${branch}`,
  `Likely package: ${guessPackage()}`,
  `Uncommitted files (${dirty.length}):`,
  ...dirty.slice(0, MAX_FILES).map((f) => `  ${f}`),
  ...(dirty.length > MAX_FILES ? [`  ... and ${dirty.length - MAX_FILES} more`] : []),
  `Stack: pm=${detectPackageManager(root)}, client=${describeClient()}, backend=${describeBackend()}, server=${detectFramework(root) ?? 'n/a'}, orm=${detectOrm(root) ?? 'n/a'}, db=${detectDbEngine(root) ?? 'n/a'}, tests=${detectTestRunner(root) ?? 'n/a'}, packages=${pkgs.join(',') || 'none'}`,
  ...describeClientLibs(),
  ...describeEslint(pkgs),
  ...describeLibs(),
  ...describeSlowHooks(),
  'Run checks with: node .claude/scripts/check.mjs <test|lint|typecheck> [pkg|--changed]',
  ...describeSnapshot(),
];

process.stdout.write(`${lines.join('\n')}\n`);
