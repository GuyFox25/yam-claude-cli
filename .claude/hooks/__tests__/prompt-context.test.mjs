import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHook } from './helpers.mjs';

// Runs against this template repo, so the real .claude/rules files are used.
let stateDir;
before(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'claude-state-'));
});
after(() => rmSync(stateDir, { recursive: true, force: true }));

const submit = (prompt, session = 's1') => {
  const res = runHook('prompt-context.mjs', { hook_event_name: 'UserPromptSubmit', session_id: session, prompt }, process.cwd(), { CLAUDE_HOOK_STATE_DIR: stateDir });
  assert.equal(res.code, 0, res.stderr);

  return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput : null;
};

test('a migration prompt gets the db.md key points', () => {
  const out = submit('add a migration for the orders table');

  assert.equal(out.hookEventName, 'UserPromptSubmit');
  assert.match(out.additionalContext, /\.claude\/rules\/db\.md/);
  assert.match(out.additionalContext, /PostgreSQL:/);
  assert.doesNotMatch(out.additionalContext, /^paths:/m);
});

test('the same rule file is added only once per session', () => {
  assert.equal(submit('now write the migration'), null);
});

test('a test prompt gets testing.md; an endpoint prompt gets backend.md', () => {
  assert.match(submit('write tests for the user service', 's2').additionalContext, /testing\.md[\s\S]*backend\.md|backend\.md[\s\S]*testing\.md/);
});

test('React prompts get react.md, but Claude Code "hooks" do not', () => {
  assert.equal(submit('add some more hooks to settings', 's3'), null);
  assert.match(submit('build an OrderForm component', 's3').additionalContext, /react\.md/);
});

test('unrelated prompts and slash commands add nothing', () => {
  assert.equal(submit('what does this repo do?', 's4'), null);
  assert.equal(submit('/commit migration', 's4'), null);
});
