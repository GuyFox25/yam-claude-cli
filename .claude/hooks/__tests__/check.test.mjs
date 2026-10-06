import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeRepo, cleanup, HOOKS_DIR } from './helpers.mjs';

const CHECK = join(HOOKS_DIR, '..', 'scripts', 'check.mjs');
const check = (root, args) => spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });

test('unknown target fails instead of reporting a skip', () => {
  const root = makeRepo({ committed: { 'client/package.json': { name: 'client', scripts: { test: 'node -e ""' } } } });
  const res = check(root, ['test', 'clients']);
  cleanup(root);

  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown target\(s\): clients/);
});

test('--changed with nothing changed exits 0', () => {
  const root = makeRepo({ committed: { 'client/package.json': { name: 'client' } } });
  const res = check(root, ['lint', '--changed']);
  cleanup(root);

  assert.equal(res.status, 0);
  assert.match(res.stdout, /no changed packages/);
});

test('bad kind prints usage and fails', () => {
  const res = check(process.cwd(), ['build']);

  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage/);
});
