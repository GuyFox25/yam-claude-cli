import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHook, makeRepo, cleanup } from './helpers.mjs';

let root;
let stateDir;

before(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'claude-state-'));
  root = makeRepo({
    committed: {
      'utils/package.json': { name: '@app/utils' },
      'utils/src/index.ts': "export * from './schemas/order';\n",
      'utils/src/schemas/user.ts': 'export const userSchema = {};\n',
      'utils/src/schemas/order.ts': 'export const orderSchema = {};\n',
      'utils/src/schemas/user.test.ts': "import { userSchema } from './user';\n",
      'db/package.json': { name: '@app/db' },
      'db/src/users.ts': "import { userSchema } from '@app/utils/schemas/user';\n",
      'server/package.json': { name: 'server' },
      'server/src/users/users.service.ts': "import { userSchema } from '../../../utils/src/schemas/user.js';\n",
      'server/src/orders/orders.service.ts': "import { orderSchema } from '@app/utils';\n",
      'client/package.json': { name: 'client' },
      'client/src/App.tsx': "import { other } from '@app/utils/schemas/other';\n",
    },
  });
});

after(() => {
  cleanup(root);
  rmSync(stateDir, { recursive: true, force: true });
});

const edit = (file, session = 's1') =>
  runHook('ripple-advice.mjs', { hook_event_name: 'PostToolUse', session_id: session, tool_name: 'Edit', tool_input: { file_path: join(root, file) } }, root, { CLAUDE_HOOK_STATE_DIR: stateDir });
const note = (res) => {
  assert.equal(res.code, 0, res.stderr);

  return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput.additionalContext : null;
};

test('lists the db and server files that import the edited utils module (package subpath and relative path)', () => {
  const text = note(edit('utils/src/schemas/user.ts'));

  assert.match(text, /utils\/src\/schemas\/user\.ts changed/);
  assert.match(text, /db\/src\/users\.ts/);
  assert.match(text, /server\/src\/users\/users\.service\.ts/);
  assert.doesNotMatch(text, /orders\.service|App\.tsx|user\.test/);
  assert.match(text, /check\.mjs typecheck --changed/);
});

test('imports through the utils entry count when the entry re-exports the module', () => {
  assert.match(note(edit('utils/src/schemas/order.ts')), /server\/src\/orders\/orders\.service\.ts/);
});

test('only once per file per session', () => {
  assert.equal(note(edit('utils/src/schemas/user.ts')), null);
  assert.notEqual(note(edit('utils/src/schemas/user.ts', 's2')), null);
});

test('no note for non-utils files or utils tests', () => {
  assert.equal(note(edit('server/src/users/users.service.ts')), null);
  assert.equal(note(edit('utils/src/schemas/user.test.ts')), null);
});
