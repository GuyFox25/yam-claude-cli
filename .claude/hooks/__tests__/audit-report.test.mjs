import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HOOKS_DIR, makeRepo, writeFiles, cleanup } from './helpers.mjs';

const REPORT = join(HOOKS_DIR, '..', 'scripts', 'audit-report.mjs');
const now = Date.now();
const ago = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');

const HOOKS = [
  { ts: ago(1), hook: 'guard-boundaries', decision: 'block', ms: 90, reason: 'Blocked: client/.env.local is an env file. Never edit secrets' },
  { ts: ago(1), hook: 'guard-boundaries', decision: 'block', ms: 80, reason: 'Blocked: server/.env is an env file. Never edit secrets' },
  { ts: ago(2), hook: 'guard-boundaries', decision: 'block', ms: 85, reason: 'Blocked: pnpm-lock.yaml is a lockfile. Change dependencies' },
  { ts: ago(2), hook: 'guard-bash', decision: 'block', ms: 60, reason: 'Blocked: rm -rf is not allowed' },
  { ts: ago(2), hook: 'guard-boundaries', decision: 'ask', ms: 70, reason: 'Adding a dependency to client/package.json' },
  { ts: ago(3), hook: 'style-advice', decision: 'advise', ms: 2600, reason: 'Style notes for client/src/A.tsx (advisory, from .claude/rules):' },
  { ts: ago(3), hook: 'stop-check', decision: 'block', ms: 45_000, reason: 'Stop checks failed: client lint, server test' },
  { ts: ago(3), hook: 'stop-check', decision: 'block', ms: 30_000, reason: 'Stop checks failed: client lint' },
  { ts: ago(30), hook: 'guard-bash', decision: 'block', ms: 50, reason: 'Blocked: old entry outside the window' },
];
const AUDIT = [
  { ts: ago(1), session: 's1', tool: 'Edit', file: 'client/src/A.tsx', ok: true },
  { ts: ago(1), session: 's1', tool: 'Write', file: 'client/src/B.tsx', ok: true },
  { ts: ago(1), session: 's2', tool: 'Edit', file: 'server/src/app.ts', ok: true },
  { ts: ago(1), session: 's2', tool: 'Bash', command: 'npm test', ok: false },
  { ts: ago(1), session: 's2', tool: 'Bash', command: 'git status', ok: true },
];

let root;
before(() => {
  root = makeRepo();
  writeFiles(root, { '.claude/logs/hooks.jsonl': jsonl(HOOKS), '.claude/logs/audit.jsonl': jsonl(AUDIT) });
});
after(() => cleanup(root));

const run = (args) => spawnSync(process.execPath, [REPORT, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });

test('text report: blocks with normalized reasons, stop blocks by check, slow hooks, edits and failures', () => {
  const res = run([]);

  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Blocks: guard-boundaries 3 \(<file> is an env file 2; <file> is a lockfile 1\), guard-bash 1/);
  assert.match(res.stdout, /Asks: guard-boundaries 1/);
  assert.match(res.stdout, /Advice: style-advice 1/);
  assert.match(res.stdout, /Stop blocked: 2 time\(s\) \(lint 2, test 1\)/);
  assert.match(res.stdout, /style-advice: p50 2\.6s, p95 2\.6s \(1 runs\)  <- slow/);
  assert.doesNotMatch(res.stdout, /stop-check: .*<- slow/);
  assert.match(res.stdout, /Edits by package: client 2, server 1/);
  assert.match(res.stdout, /Failed tool calls: Bash 1\/2/);
  assert.match(res.stdout, /Tool calls: 5 in 2 session\(s\)/);
  assert.doesNotMatch(res.stdout, /old entry/);
  assert.doesNotMatch(res.stdout, /\.env\.local/);
});

test('--days widens the window and --json returns the same data', () => {
  const report = JSON.parse(run(['--days', '60', '--json']).stdout);

  assert.equal(report.days, 60);
  assert.equal(report.blocks.find((b) => b.hook === 'guard-bash').count, 2);
  assert.deepEqual(report.stop.byCheck, { lint: 2, test: 1 });
});

test('no logs: says so instead of failing', () => {
  const empty = makeRepo();
  const res = spawnSync(process.execPath, [REPORT], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: empty } });
  cleanup(empty);

  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /No log entries in this period/);
});

test('a bad --days value is a usage error', () => {
  assert.equal(run(['--days', 'abc']).status, 1);
});
