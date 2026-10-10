import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, writeFiles, cleanup } from './helpers.mjs';
import { percentile, slowHooks } from '../../lib/hook-log.mjs';

const LOG_ON = { CLAUDE_HOOK_LOG: 'on' };
const readLog = (root) =>
  readFileSync(join(root, '.claude/logs/hooks.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const editEnv = (root) => ({ tool_name: 'Write', tool_input: { file_path: join(root, '.env'), content: 'X=1' } });

test('a blocking guard logs hook, decision, duration and the first line of the reason', () => {
  const root = makeRepo();
  const res = runHook('guard-boundaries.mjs', editEnv(root), root, LOG_ON);
  const [entry] = readLog(root);
  cleanup(root);

  assert.equal(res.code, 2);
  assert.equal(entry.hook, 'guard-boundaries');
  assert.equal(entry.decision, 'block');
  assert.equal(typeof entry.ms, 'number');
  assert.match(entry.reason, /^Blocked: .*\.env is an env file/);
});

test('a fast allow writes nothing', () => {
  const root = makeRepo();
  const res = runHook('guard-boundaries.mjs', { tool_name: 'Write', tool_input: { file_path: join(root, 'notes.md'), content: 'hi' } }, root, LOG_ON);
  const exists = existsSync(join(root, '.claude/logs/hooks.jsonl'));
  cleanup(root);

  assert.equal(res.code, 0, res.stderr);
  assert.equal(exists, false);
});

test('CLAUDE_HOOK_LOG=off writes nothing, even for a block', () => {
  const root = makeRepo();
  runHook('guard-boundaries.mjs', editEnv(root), root, { CLAUDE_HOOK_LOG: 'off' });
  const exists = existsSync(join(root, '.claude/logs/hooks.jsonl'));
  cleanup(root);

  assert.equal(exists, false);
});

test('session-context warns about hooks whose p95 is over the budget, never about stop-check', () => {
  const slow = Array.from({ length: 10 }, () => ({ hook: 'style-advice', decision: 'allow', ms: 3500 }));
  const stop = Array.from({ length: 10 }, () => ({ hook: 'stop-check', decision: 'allow', ms: 90_000 }));
  const fast = Array.from({ length: 10 }, () => ({ hook: 'guard-bash', decision: 'block', ms: 80 }));
  const root = makeRepo();
  writeFiles(root, { '.claude/logs/hooks.jsonl': [...slow, ...stop, ...fast].map((e) => JSON.stringify(e)).join('\n') });
  const res = runHook('session-context.mjs', fixture('session-context.json').startup, root);
  cleanup(root);

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Slow hooks: style-advice p95 3\.5s \(10 runs\)/);
  assert.doesNotMatch(res.stdout, /stop-check p95|guard-bash p95/);
});

test('percentile and slowHooks', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([], 95), 0);
  assert.deepEqual(slowHooks([{ hook: 'a', ms: 100 }, { hook: 'b', ms: 5000 }, { hook: 'b', ms: 6000 }], 1000), [{ hook: 'b', runs: 2, p95: 6000 }]);
});
