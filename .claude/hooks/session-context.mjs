#!/usr/bin/env node
// SessionStart(startup|resume|clear|compact): print branch, uncommitted files, the package the branch most likely concerns,
// the detected stack, and the in-house libraries (regenerating their expert agents). Stdout is added to Claude's context.
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
  detectDbEngine,
  detectDotnetTestFramework,
  dotnetProject,
  dotnetTarget,
  toPosix,
} from '../lib/detect.mjs';
import { discoverLibs, syncAgents, agentName } from '../lib/libs.mjs';

await readInput();
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

const pkgs = existingPackages(root);
const lines = [
  `Branch: ${branch}`,
  `Likely package: ${guessPackage()}`,
  `Uncommitted files (${dirty.length}):`,
  ...dirty.slice(0, MAX_FILES).map((f) => `  ${f}`),
  ...(dirty.length > MAX_FILES ? [`  ... and ${dirty.length - MAX_FILES} more`] : []),
  `Stack: pm=${detectPackageManager(root)}, client=${describeClient()}, backend=${describeBackend()}, server=${detectFramework(root) ?? 'n/a'}, orm=${detectOrm(root) ?? 'n/a'}, db=${detectDbEngine(root) ?? 'n/a'}, tests=${detectTestRunner(root) ?? 'n/a'}, packages=${pkgs.join(',') || 'none'}`,
  ...describeLibs(),
  'Run checks with: node .claude/scripts/check.mjs <test|lint|typecheck> [pkg|--changed]',
];

process.stdout.write(`${lines.join('\n')}\n`);
