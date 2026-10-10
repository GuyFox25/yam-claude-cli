import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, cleanup, HOOKS_DIR } from './helpers.mjs';

const { blocked, allowed } = fixture('guard-boundaries.json');
let root;

before(() => {
  root = makeRepo({
    committed: {
      'db/package.json': { name: 'db', dependencies: { 'drizzle-orm': '*' } },
      'db/drizzle/0000_init.sql': 'CREATE TABLE a ();\n',
      'db/prisma/migrations/20240101_init/migration.sql': 'CREATE TABLE b ();\n',
      'server/package.json': { name: 'server', dependencies: {} },
      'utils/package.json': { name: '@app/utils' },
      'server/src/app.ts': '//\n',
      'client/src/App.tsx': 'a\n',
      'Api/Migrations/20240101_Init.cs': 'a\n',
      'Api/Migrations/AppDbContextModelSnapshot.cs': 'a\n',
    },
  });
});

after(() => cleanup(root));

// Fixture paths are relative; hooks receive absolute paths from Claude Code, so test both forms.
const withAbsolutePath = (event) => ({ ...event, tool_input: { ...event.tool_input, file_path: join(root, event.tool_input.file_path) } });

for (const event of blocked) {
  test(`blocks ${event.tool_name} ${event.tool_input.file_path}`, () => {
    const res = runHook('guard-boundaries.mjs', withAbsolutePath(event), root);

    assert.equal(res.code, 2, res.stderr);
    assert.match(res.stderr, /Blocked/);
  });
}

for (const event of allowed) {
  test(`allows ${event.tool_name} ${event.tool_input.file_path}`, () => {
    const res = runHook('guard-boundaries.mjs', withAbsolutePath(event), root);

    assert.equal(res.code, 0, res.stderr);
  });
}

test('relative file_path is resolved against the project dir', () => {
  const res = runHook('guard-boundaries.mjs', blocked[5], root);

  assert.equal(res.code, 2);
});

test('node_modules block names the linked checkout of a library', () => {
  const repo = makeRepo({ committed: { 'lib-src/package.json': { name: '@acme/ui', version: '1.0.0' }, 'lib-src/index.js': 'a\n' } });
  mkdirSync(join(repo, 'node_modules', '@acme'), { recursive: true });
  symlinkSync(join(repo, 'lib-src'), join(repo, 'node_modules', '@acme', 'ui'), 'junction');
  const event = { tool_name: 'Edit', tool_input: { file_path: join(repo, 'node_modules/@acme/ui/index.js'), old_string: 'a', new_string: 'b' } };
  const res = runHook('guard-boundaries.mjs', event, repo);
  cleanup(repo);

  assert.equal(res.code, 2);
  assert.match(res.stderr, /library @acme\/ui/);
  assert.match(res.stderr, /linked checkout: .*lib-src/);
});

test('migration dir from drizzle.config out is protected', () => {
  const repo = makeRepo({
    committed: {
      'db/package.json': { name: 'db', devDependencies: { 'drizzle-kit': '*' } },
      'db/drizzle.config.ts': "export default { out: './sql/migrations', schema: './src/schema.ts' };\n",
      'db/sql/migrations/0000_x.sql': 'select 1;\n',
    },
  });
  const event = { tool_name: 'Edit', tool_input: { file_path: join(repo, 'db/sql/migrations/0000_x.sql'), old_string: 'a', new_string: 'b' } };
  const res = runHook('guard-boundaries.mjs', event, repo);
  cleanup(repo);

  assert.equal(res.code, 2, res.stderr);
});

test('Windows path variants (lowercase drive, MSYS /c/...) are still guarded', { skip: process.platform !== 'win32' }, () => {
  const target = join(root, 'db/drizzle/0000_init.sql');
  const variants = [target[0].toLowerCase() + target.slice(1), `/${target[0].toLowerCase()}/${target.slice(3).split('\\').join('/')}`];
  for (const file_path of variants) {
    const res = runHook('guard-boundaries.mjs', { tool_name: 'Edit', tool_input: { file_path, old_string: 'a', new_string: 'b' } }, root);

    assert.equal(res.code, 2, `${file_path}: ${res.stderr}`);
  }
});

test('invalid hook input fails closed', () => {
  const res = spawnSync(process.execPath, [join(HOOKS_DIR, 'guard-boundaries.mjs')], { input: '{not json', encoding: 'utf8', env: { ...process.env, CLAUDE_HOOK_LOG: 'off' } });

  assert.equal(res.status, 2);
});

const CLASS_SRC = "import React, { Component } from 'react';\n\nexport default class Old extends Component {\n  render() {\n    return null;\n  }\n}\n";
const askRepo = () =>
  makeRepo({
    committed: {
      'client/package.json': { name: 'client', dependencies: { react: '^18.0.0' } },
      'client/src/Old.jsx': CLASS_SRC,
      'server/package.json': { name: 'server', dependencies: { express: '^4.0.0' } },
    },
  });
// The hookSpecificOutput of an "ask", or null when the hook allowed silently.
const asked = (res) => {
  assert.equal(res.code, 0, res.stderr);

  return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput : null;
};

test('asks before converting a class component into a function component', () => {
  const repo = askRepo();
  const file_path = join(repo, 'client/src/Old.jsx');
  const edit = { tool_name: 'Edit', tool_input: { file_path, old_string: 'export default class Old extends Component {', new_string: 'const Old = () => {' } };
  const write = { tool_name: 'Write', tool_input: { file_path, content: 'export const Old = () => null;\n' } };
  const keep = { tool_name: 'Edit', tool_input: { file_path, old_string: 'return null;', new_string: 'return <div />;' } };
  const results = [edit, write, keep].map((e) => asked(runHook('guard-boundaries.mjs', e, repo)));
  cleanup(repo);

  assert.equal(results[0]?.permissionDecision, 'ask');
  assert.match(results[0].permissionDecisionReason, /class component/);
  assert.equal(results[1]?.permissionDecision, 'ask');
  assert.equal(results[2], null);
});

test('asks before adding a dependency, not for a version bump', () => {
  const repo = askRepo();
  const file_path = join(repo, 'server/package.json');
  const edit = (new_string) => ({ tool_name: 'Edit', tool_input: { file_path, old_string: '"express": "^4.0.0"', new_string } });
  const [added, bumped] = [edit('"express": "^4.0.0",\n    "lodash": "^4.17.21"'), edit('"express": "^4.19.0"')].map((e) => asked(runHook('guard-boundaries.mjs', e, repo)));
  const driver = runHook('guard-boundaries.mjs', edit('"express": "^4.0.0",\n    "pg": "^8.0.0"'), repo);
  cleanup(repo);

  assert.equal(added?.permissionDecision, 'ask');
  assert.match(added.permissionDecisionReason, /lodash/);
  assert.equal(bumped, null);
  assert.equal(driver.code, 2, 'a DB driver in server/ is still a hard block');
});

test('Read of a file over 256 KB is blocked unless offset/limit is given', () => {
  const repo = makeRepo({ committed: { 'server/src/fixtures/big.json': `[${'"x",'.repeat(70_000)}"x"]`, 'server/src/small.ts': 'export const a = 1;\n' } });
  const read = (file_path, extra = {}) => runHook('guard-boundaries.mjs', { tool_name: 'Read', tool_input: { file_path: join(repo, file_path), ...extra } }, repo);
  const whole = read('server/src/fixtures/big.json');
  const part = read('server/src/fixtures/big.json', { limit: 100 });
  const small = read('server/src/small.ts');
  cleanup(repo);

  assert.equal(whole.code, 2);
  assert.match(whole.stderr, /\d+ KB.*offset\/limit/s);
  assert.equal(part.code, 0, part.stderr);
  assert.equal(small.code, 0, small.stderr);
});

test('large images and PDFs are not blocked by the size guard', () => {
  const big = 'x'.repeat(300 * 1024);
  const repo = makeRepo({ committed: { 'docs/screen.png': big, 'docs/spec.pdf': big } });
  const read = (file_path, extra = {}) => runHook('guard-boundaries.mjs', { tool_name: 'Read', tool_input: { file_path: join(repo, file_path), ...extra } }, repo);
  const results = [read('docs/screen.png'), read('docs/spec.pdf', { pages: '1-3' })];
  cleanup(repo);

  for (const res of results) assert.equal(res.code, 0, res.stderr);
});

test('the Drizzle barrel check allows namespace imports and single-file schema modules', () => {
  const repo = makeRepo({
    committed: {
      'db/package.json': { name: 'db', dependencies: { 'drizzle-orm': '*' } },
      'server/package.json': { name: 'server', dependencies: {} },
      'server/src/users/schema.ts': 'export const createUserSchema = {};\n',
      'db/src/schema/index.ts': "export * from './users';\n",
    },
  });
  const write = (file_path, content) => runHook('guard-boundaries.mjs', { tool_name: 'Write', tool_input: { file_path: join(repo, file_path), content } }, repo);
  const client = write('db/src/client.ts', "import * as schema from './schema';\nexport const db = drizzle(pool, { schema });\n");
  const zod = write('server/src/users/users.service.ts', "import { createUserSchema } from './schema';\n");
  const barrel = write('db/src/repos/users.ts', "import { users } from '../schema';\n");
  cleanup(repo);

  assert.equal(client.code, 0, client.stderr);
  assert.equal(zod.code, 0, zod.stderr);
  assert.equal(barrel.code, 2);
});
