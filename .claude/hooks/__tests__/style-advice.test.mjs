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

// N numbered code lines, so a file of an exact length is easy to build.
const codeLines = (n, prefix = 'const v') => Array.from({ length: n }, (_, i) => `${prefix}${i} = ${i};`).join('\n');
const edit = (repo, file_path, old_string, new_string) => ({ tool_name: 'Edit', tool_input: { file_path: join(repo, file_path), old_string, new_string } });

test('file size: flagged only on the write or edit that crosses ~150 (components) / ~250 lines', () => {
  const big = `${codeLines(300)}\n`;
  const repo = makeRepo({
    committed: {
      'client/package.json': { name: 'client' },
      'utils/package.json': { name: 'utils' },
      // As left by an edit that replaced `const v0 = 0;` with 21 lines: 140 lines before, 160 now.
      'client/src/Grow/Grow.tsx': `${codeLines(21, 'const w')}\n${codeLines(140).split('\n').slice(1).join('\n')}\n`,
      'utils/src/legacy.ts': `${big}const extra = 1;\n`,
    },
  });
  const created = (file, n) => notesFor(repo, file, `${codeLines(n)}\n`, { type: 'create' });

  assert.match(created('client/src/Card/Card.tsx', 151), /file is 151 lines \(limit ~150 for a component\)/);
  assert.equal(created('client/src/Card/Card.tsx', 140).includes('file is'), false);
  assert.match(created('utils/src/format.ts', 251), /file is 251 lines \(limit ~250\)/);
  assert.equal(created('utils/src/format.ts', 200).includes('file is'), false);
  assert.equal(created('utils/src/format.test.ts', 400).includes('file is'), false);

  // The Edit already happened: the file on disk is the result, and the hook undoes the edit to get the old length.
  const grown = note(runHook('style-advice.mjs', edit(repo, 'client/src/Grow/Grow.tsx', 'const v0 = 0;', codeLines(21, 'const w')), repo));
  assert.match(grown?.additionalContext ?? '', /file is 160 lines/);
  const legacy = note(runHook('style-advice.mjs', edit(repo, 'utils/src/legacy.ts', 'const extra = 0;', 'const extra = 1;'), repo));
  assert.equal(legacy?.additionalContext.includes('file is') ?? false, false);
  cleanup(repo);
});

const component = (logic, jsx) =>
  [
    "import { useState } from 'react';",
    '',
    "import styles from './Panel.module.scss';",
    '',
    'export const Panel = (): JSX.Element => {',
    codeLines(logic, '  const v'),
    '',
    '  return (',
    `    <div className={styles.panel}>`,
    Array.from({ length: jsx }, (_, i) => `      <span>{v${i % Math.max(logic, 1)}}</span>`).join('\n'),
    '    </div>',
    '  );',
    '};',
    '',
  ].join('\n');

test('logic vs JSX: flagged when a component has more than ~40 logic lines and more logic than markup', () => {
  const repo = makeRepo({ committed: { 'client/package.json': { name: 'client' }, 'client/src/Big/Big.tsx': component(60, 5) } });
  const created = (file, content) => notesFor(repo, file, content, { type: 'create' });

  assert.match(created('client/src/Panel/Panel.tsx', component(50, 10)), /component logic \(\d+ lines\) outweighs its JSX \(\d+ lines\)/);
  assert.equal(created('client/src/Panel/Panel.tsx', component(45, 60)).includes('outweighs'), false);
  assert.equal(created('client/src/Panel/Panel.tsx', component(20, 5)).includes('outweighs'), false);
  assert.equal(created('client/src/hooks/usePanel.tsx', component(50, 10)).includes('outweighs'), false);
  assert.equal(created('client/src/Panel/Panel.test.tsx', component(50, 10)).includes('outweighs'), false);

  const already = note(runHook('style-advice.mjs', edit(repo, 'client/src/Big/Big.tsx', '  const v1 = 0;', '  const v1 = 1;'), repo));
  assert.equal(already?.additionalContext.includes('outweighs') ?? false, false);
  cleanup(repo);
});
