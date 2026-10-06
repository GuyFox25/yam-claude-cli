import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHook, makeRepo, cleanup } from './helpers.mjs';

const line = (obj) => JSON.stringify(obj);
const TRANSCRIPT = [
  line({ type: 'user', message: { role: 'user', content: 'add a cancelledAt column to orders' } }),
  line({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta noise' } }),
  line({ type: 'user', message: { role: 'user', content: '<command-name>/compact</command-name>' } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [] } }] } }),
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'q1', content: 'User answered: nullable timestamp' }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'p1', name: 'ExitPlanMode', input: { plan: '# Plan\nAdd column, migration, service.' } }] } }),
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'p1', content: 'User has approved your plan.' }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'p2', name: 'ExitPlanMode', input: { plan: '# Rejected plan\nDrop the orders table.' } }] } }),
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'p2', is_error: true, content: "The user doesn't want to proceed with this tool use." }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'TodoWrite', input: { todos: [{ content: 'write migration', status: 'completed' }, { content: 'update service', status: 'in_progress' }] } }] } }),
  'not json',
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'also update the client table' }] } }),
].join('\n');

test('saves prompts, decisions, plan, todos and git status; session-context restores it after compaction', () => {
  const root = makeRepo({ dirty: { 'db/src/orders.ts': 'x' } });
  const transcript = join(root, 'transcript.jsonl');
  writeFileSync(transcript, TRANSCRIPT);
  const res = runHook('precompact-snapshot.mjs', { hook_event_name: 'PreCompact', session_id: 'abc', transcript_path: transcript, trigger: 'auto', custom_instructions: '' }, root);
  const snapshot = readFileSync(join(root, '.claude', 'scratch', 'compact-abc.md'), 'utf8');
  const restored = runHook('session-context.mjs', { hook_event_name: 'SessionStart', source: 'compact', session_id: 'abc' }, root);
  const startup = runHook('session-context.mjs', { hook_event_name: 'SessionStart', source: 'startup', session_id: 'abc' }, root);
  cleanup(root);

  assert.equal(res.code, 0, res.stderr);
  assert.match(snapshot, /trigger: auto/);
  assert.match(snapshot, /- add a cancelledAt column to orders\n- also update the client table/);
  assert.doesNotMatch(snapshot, /meta noise|command-name|tool_result/);
  assert.match(snapshot, /## Decisions[\s\S]*nullable timestamp/);
  assert.match(snapshot, /## Last approved plan\n# Plan/);
  assert.doesNotMatch(snapshot, /Rejected plan/);
  assert.match(snapshot, /\[completed\] write migration\n- \[in_progress\] update service/);
  assert.match(snapshot, /db\/src\/orders\.ts/);
  assert.match(restored.stdout, /Pre-compaction snapshot[\s\S]*cancelledAt/);
  assert.doesNotMatch(startup.stdout, /Pre-compaction snapshot/);
});

test('a missing transcript still writes a snapshot and never fails', () => {
  const root = makeRepo();
  const res = runHook('precompact-snapshot.mjs', { session_id: 'x', transcript_path: join(root, 'nope.jsonl'), trigger: 'manual' }, root);
  const snapshot = readFileSync(join(root, '.claude', 'scratch', 'compact-x.md'), 'utf8');
  cleanup(root);

  assert.equal(res.code, 0);
  assert.match(snapshot, /\(none found\)/);
});
