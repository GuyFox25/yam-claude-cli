import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, cleanup } from './helpers.mjs';

const { flagged, clean } = fixture('style-advice.json');
let root;

before(() => {
  root = makeRepo({ committed: { 'client/package.json': { name: 'client' }, 'server/package.json': { name: 'server' } } });
});

after(() => cleanup(root));

// An overwrite of an existing file, so the missing-test nudge (tested separately) stays out of the style cases.
const write = (file_path, content, type = 'update') => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(root, file_path), content }, tool_response: { type } });
const note = (res) => {
  assert.equal(res.code, 0, res.stderr);

  return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput : null;
};

for (const { rule, file_path, content } of flagged) {
  test(`flags ${rule} in ${file_path}`, () => {
    const out = note(runHook('style-advice.mjs', write(file_path, content), root));

    assert.equal(out?.hookEventName, 'PostToolUse');
    assert.ok(out.additionalContext.includes(rule), out.additionalContext);
    assert.match(out.additionalContext, /ESLint config wins/);
  });
}

for (const { file_path, content } of clean) {
  test(`no note for ${file_path}: ${content.split('\n')[0]}`, () => {
    assert.equal(note(runHook('style-advice.mjs', write(file_path, content), root)), null);
  });
}

test('only the added text of an Edit is checked', () => {
  const event = { tool_name: 'Edit', tool_input: { file_path: join(root, 'server/src/x.ts'), old_string: 'function old() {}', new_string: 'const fresh = (): void => {};' } };

  assert.equal(note(runHook('style-advice.mjs', event, root)), null);
});

test('flags a Yup form in a client whose forms use zodResolver', () => {
  const repo = makeRepo({
    committed: {
      'client/package.json': { name: 'client' },
      'client/src/forms/UserForm.tsx': "import { zodResolver } from '@hookform/resolvers/zod';\n",
    },
  });
  const event = { tool_name: 'Write', tool_input: { file_path: join(repo, 'client/src/forms/OrderForm.tsx'), content: "import { yupResolver } from '@hookform/resolvers/yup';\n" } };
  const out = note(runHook('style-advice.mjs', event, repo));
  cleanup(repo);

  assert.match(out?.additionalContext ?? '', /keep Zod/);
});

const notesFor = (repo, file_path, content, { env = {}, type = 'update' } = {}) => {
  const event = { tool_name: 'Write', tool_input: { file_path: join(repo, file_path), content }, tool_response: { type } };

  return note(runHook('style-advice.mjs', event, repo, env))?.additionalContext ?? '';
};

test('debug leftovers: console.log and debugger in source, .only in tests', () => {
  assert.match(notesFor(root, 'server/src/a.ts', "console.log('x');\n"), /debug leftover: remove `console.log`/);
  assert.match(notesFor(root, 'client/src/b.jsx', 'debugger;\n'), /debug leftover: remove `debugger`/);
  assert.match(notesFor(root, 'server/src/a.test.ts', "it.only('works', () => {});\n"), /focused test/);
  assert.equal(notesFor(root, 'server/src/a.test.ts', "console.log('debugging a test');\n"), '');
  assert.equal(notesFor(root, 'server/src/a.ts', "/* no console.log here */\nlogger.info('x');\n"), '');
});

test('missing test nudge: only for a newly created source file with no test anywhere in its package', () => {
  const repo = makeRepo({ committed: { 'server/package.json': { name: 'server' }, 'server/test/orders.service.test.ts': '//\n' } });
  const created = (file, content = 'export const x = 1;\n') => notesFor(repo, file, content, { type: 'create' });

  assert.match(created('server/src/users.service.ts'), /new file without a test: add `users\.service\.test\.ts`.*\/write-tests server\/src\/users\.service\.ts/);
  assert.equal(created('server/src/orders.service.ts'), '');
  assert.equal(created('server/src/index.ts'), '');
  assert.equal(created('server/src/users.types.ts'), '');
  assert.equal(notesFor(repo, 'server/src/users.service.ts', 'export const x = 1;\n', { type: 'update' }), '');
  cleanup(repo);
});

test('hard-coded UI text: on when the client has an i18n library, or with CLAUDE_HOOK_I18N=on', () => {
  const plain = makeRepo({ committed: { 'client/package.json': { name: 'client', dependencies: { react: '*' } } } });
  const intl = makeRepo({ committed: { 'client/package.json': { name: 'client', dependencies: { 'react-i18next': '*' } } } });
  const jsx = '<button title="Save order">שמור</button>\n';

  assert.equal(notesFor(plain, 'client/src/Save.tsx', jsx), '');
  assert.match(notesFor(plain, 'client/src/Save.tsx', jsx, { env: { CLAUDE_HOOK_I18N: 'on' } }), /hard-coded UI text/);
  assert.match(notesFor(intl, 'client/src/Save.tsx', jsx), /hard-coded UI text/);
  assert.equal(notesFor(intl, 'client/src/Save.tsx', jsx, { env: { CLAUDE_HOOK_I18N: 'off' } }), '');
  assert.equal(notesFor(intl, 'client/src/Save.tsx', "<button title={t('orders.save')}>{t('orders.save')}</button>\n"), '');
  cleanup(plain);
  cleanup(intl);
});

test('RTL: physical directions flagged only with CLAUDE_HOOK_RTL=on, in styles and style objects', () => {
  const on = { env: { CLAUDE_HOOK_RTL: 'on' } };

  assert.equal(notesFor(root, 'client/src/a.module.scss', '.a {\n  margin-left: 8px;\n}\n'), '');
  assert.match(notesFor(root, 'client/src/a.module.scss', '.a {\n  margin-left: 8px;\n  text-align: right;\n}\n', on), /margin-inline-start/);
  assert.match(notesFor(root, 'client/src/A.tsx', "const s = { paddingRight: 4, textAlign: 'left' };\n", on), /marginInlineStart/);
  assert.equal(notesFor(root, 'client/src/a.module.scss', '.a {\n  margin-inline-start: 8px;\n  text-align: start;\n}\n', on), '');
});

test('C#: async void, missing Async suffix and SQL built from strings', () => {
  const cs = (file, content) => notesFor(root, file, content);

  assert.match(cs('Api/Services/OrderService.cs', 'public async void Save() { }\n'), /`async void`/);
  assert.equal(cs('Api/Views/Form.cs', 'private async void OnClick(object sender, EventArgs e) { }\n'), '');
  assert.match(cs('Api/Services/OrderService.cs', 'public async Task<Order> GetOrder(int id, CancellationToken ct)\n'), /without the `Async` suffix/);
  assert.equal(cs('Api/Services/OrderService.cs', 'public async Task<Order> GetOrderAsync(int id, CancellationToken ct)\n'), '');
  assert.equal(cs('Api/Controllers/OrdersController.cs', 'public async Task<IActionResult> Get(int id)\n'), '');
  assert.match(cs('Api/Data/OrderRepo.cs', 'var rows = db.Orders.FromSqlRaw($"SELECT * FROM orders WHERE id = {id}");\n'), /SQL built from strings/);
  assert.match(cs('Api/Data/OrderRepo.cs', 'var sql = "SELECT * FROM orders WHERE name = \'" + name + "\'";\n'), /SQL built from strings/);
  assert.equal(cs('Api/Data/OrderRepo.cs', 'var rows = db.Orders.FromSqlInterpolated($"SELECT * FROM orders WHERE id = {id}");\n'), '');
  assert.match(cs('Api/Services/OrderService.cs', 'public async void Save() { }\n'), /analyzers and \.editorconfig win/);
  assert.equal(cs('Api/Migrations/20240101_Init.cs', 'public async void Up() { }\n'), '');
});
