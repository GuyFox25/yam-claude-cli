import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHook, makeRepo, cleanup } from './helpers.mjs';

const logOf = (root) =>
  readFileSync(join(root, '.claude', 'logs', 'audit.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

test('appends one line per tool call with file/command but never contents', () => {
  const root = makeRepo();
  const post = (tool_name, tool_input, tool_response = {}) => runHook('audit-log.mjs', { hook_event_name: 'PostToolUse', session_id: 's1', tool_name, tool_input, tool_response }, root);
  post('Write', { file_path: join(root, 'server', 'src', 'a.ts'), content: 'SECRET_CONTENT' });
  post('Bash', { command: 'npm test' }, { stdout: 'ok' });
  post('Grep', { pattern: 'TODO', path: join(root, 'client') });
  post('Edit', { file_path: join(root, 'x.ts'), old_string: 'a', new_string: 'b' }, { error: 'String not found' });
  const log = logOf(root);
  const raw = readFileSync(join(root, '.claude', 'logs', 'audit.jsonl'), 'utf8');
  cleanup(root);

  assert.equal(log.length, 4);
  assert.deepEqual(
    log.map(({ tool, file, command, pattern, ok, session }) => ({ tool, file, command, pattern, ok, session })),
    [
      { tool: 'Write', file: 'server/src/a.ts', command: undefined, pattern: undefined, ok: true, session: 's1' },
      { tool: 'Bash', file: undefined, command: 'npm test', pattern: undefined, ok: true, session: 's1' },
      { tool: 'Grep', file: 'client', command: undefined, pattern: 'TODO', ok: true, session: 's1' },
      { tool: 'Edit', file: 'x.ts', command: undefined, pattern: undefined, ok: false, session: 's1' },
    ],
  );
  assert.ok(log.every((e) => !Number.isNaN(Date.parse(e.ts))));
  assert.doesNotMatch(raw, /SECRET_CONTENT/);
});

test('rotates the log past the size limit, and never fails on bad input', () => {
  const root = makeRepo();
  const env = { CLAUDE_AUDIT_MAX_BYTES: '100' };
  for (let i = 0; i < 3; i++) runHook('audit-log.mjs', { tool_name: 'Bash', tool_input: { command: `echo ${'x'.repeat(80)}` } }, root, env);
  const rotated = existsSync(join(root, '.claude', 'logs', 'audit.1.jsonl'));
  const bad = runHook('audit-log.mjs', 'not json', root);
  cleanup(root);

  assert.ok(rotated);
  assert.equal(bad.code, 0);
});

test('credentials in commands and URLs are redacted', () => {
  const root = makeRepo();
  runHook('audit-log.mjs', { tool_name: 'Bash', tool_input: { command: 'DATABASE_URL=postgres://admin:s3cret@db-prod:5432/app npm run db:migrate' } }, root);
  runHook('audit-log.mjs', { tool_name: 'Bash', tool_input: { command: 'sqlcmd -Q "x" "Server=sql;User Id=sa;Password=hunter2"' } }, root);
  const raw = readFileSync(join(root, '.claude', 'logs', 'audit.jsonl'), 'utf8');
  cleanup(root);

  assert.doesNotMatch(raw, /s3cret|hunter2/);
  assert.match(raw, /postgres:\/\/\*\*\*@db-prod/);
});
