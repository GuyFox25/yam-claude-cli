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

const write = (file_path, content) => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(root, file_path), content } });
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
