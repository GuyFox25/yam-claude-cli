import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, cleanup, fakeBin, writeFiles } from './helpers.mjs';

const events = fixture('format-on-write.json');

// Fake prettier appends a marker; fake eslint fails when the file contains BAD.
const FAKE_PRETTIER = `const fs = require('fs'); const f = process.argv[process.argv.length - 1]; fs.appendFileSync(f, '// formatted\\n');`;
const FAKE_ESLINT = `const fs = require('fs'); const f = process.argv[process.argv.length - 1];
if (fs.readFileSync(f, 'utf8').includes('BAD')) { console.log(f + '\\n  1:1  error  no-explicit-any'); process.exit(1); }`;

let root;

before(() => {
  root = makeRepo({ committed: { 'client/package.json': { name: 'client' } } });
  writeFiles(root, {
    ...fakeBin('', 'prettier', FAKE_PRETTIER),
    ...fakeBin('client', 'eslint', FAKE_ESLINT),
    'client/src/good.ts': 'export const a = 1;\n',
    'client/src/bad.ts': 'export const a: any = BAD;\n',
    'client/public/logo.png': 'png',
  });
});

after(() => cleanup(root));

test('formats a clean file and passes', () => {
  const res = runHook('format-on-write.mjs', events.clean, root);

  assert.equal(res.code, 0, res.stderr);
  assert.match(readFileSync(join(root, 'client/src/good.ts'), 'utf8'), /formatted/);
});

test('exits 2 with remaining eslint errors', () => {
  const res = runHook('format-on-write.mjs', events.lintError, root);

  assert.equal(res.code, 2);
  assert.match(res.stderr, /no-explicit-any/);
});

test('ignores unsupported file types', () => {
  const res = runHook('format-on-write.mjs', events.unsupported, root);

  assert.equal(res.code, 0);
  assert.equal(readFileSync(join(root, 'client/public/logo.png'), 'utf8'), 'png');
});

test('skips quietly when no tools are installed', () => {
  const bare = makeRepo({ committed: { 'client/src/good.ts': 'x\n' } });
  const res = runHook('format-on-write.mjs', events.clean, bare);
  cleanup(bare);

  assert.equal(res.code, 0, res.stderr);
});
