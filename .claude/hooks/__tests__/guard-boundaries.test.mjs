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
  const res = spawnSync(process.execPath, [join(HOOKS_DIR, 'guard-boundaries.mjs')], { input: '{not json', encoding: 'utf8' });

  assert.equal(res.status, 2);
});
