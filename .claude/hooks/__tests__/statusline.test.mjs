import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOOKS_DIR, fixture, makeRepo, runHook, writeFiles, cleanup } from './helpers.mjs';
import { recordEdit } from '../../lib/edits.mjs';

const STATUSLINE = join(HOOKS_DIR, '..', 'scripts', 'statusline.mjs');
const CLIENT = { 'client/package.json': { name: 'client', dependencies: { react: '*' } }, 'client/src/App.tsx': 'export const App = () => null;\n' };
let stateDir;

before(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'claude-statusline-'));
});
after(() => cleanup(stateDir));

const env = (root) => ({ ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_HOOK_STATE_DIR: stateDir, CLAUDE_HOOK_LOG: 'off' });
const status = (root, input) => spawnSync(process.execPath, [STATUSLINE], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: env(root) });
const withEdits = (root, session, files) => {
  const prev = process.env.CLAUDE_HOOK_STATE_DIR;
  process.env.CLAUDE_HOOK_STATE_DIR = stateDir;
  for (const f of files) recordEdit(root, session, f);
  process.env.CLAUDE_HOOK_STATE_DIR = prev;
};

test('template repo: model, package from branch, branch, stack, edited count, template (source)', () => {
  const root = makeRepo({ committed: { ...CLIENT, '.claude/template-source.md': 'marker\n' }, branch: 'feat/client-orders' });
  withEdits(root, 's1', ['client/src/App.tsx', 'client/src/Orders.tsx']);
  const res = status(root, { session_id: 's1', model: { display_name: 'Opus' }, workspace: { current_dir: root } });
  cleanup(root);

  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), 'Opus · client · feat/client-orders · react-ts · 2 edited · template (source)');
});

test('exported project: the manifest version, no edited part without edits, backend joined to the client', () => {
  const root = makeRepo({
    committed: { ...CLIENT, 'server/package.json': { name: 'server', dependencies: { express: '*' } }, '.claude/template-manifest.json': { template: 'abc1234', files: [] } },
    branch: 'fix/server-ui-bug',
  });
  const res = status(root, { session_id: 'none', model: { display_name: 'Sonnet' } });
  cleanup(root);

  assert.equal(res.stdout.trim(), 'Sonnet · server · fix/server-ui-bug · react-ts+express · template abc1234');
});

test('uses the stack cached by session-context', () => {
  const root = makeRepo({ committed: CLIENT });
  runHook('session-context.mjs', fixture('session-context.json').startup, root, { CLAUDE_HOOK_STATE_DIR: stateDir });
  // The cache wins: change the repo after the session started and the status line still shows the cached stack.
  writeFiles(root, { 'server/package.json': { name: 'server', dependencies: { '@nestjs/core': '*' } } });
  const res = status(root, {});
  cleanup(root);

  assert.match(res.stdout, /main · react-ts\n/);
});

test('garbage input still prints what it can and exits 0', () => {
  const root = makeRepo({ committed: CLIENT });
  const res = status(root, 'not json');
  cleanup(root);

  assert.equal(res.status, 0);
  assert.match(res.stdout, /^main · react-ts$/m);
});
