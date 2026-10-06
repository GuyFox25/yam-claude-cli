import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, cleanup, fakeBin, HOOKS_DIR } from './helpers.mjs';

const events = fixture('stop-check.json');
let stateDir;
let edits;

before(async () => {
  // Isolated ledger dir; inherited by the hook processes through process.env.
  stateDir = mkdtempSync(join(tmpdir(), 'claude-state-'));
  process.env.CLAUDE_HOOK_STATE_DIR = stateDir;
  edits = await import('../../lib/edits.mjs');
});

after(() => rmSync(stateDir, { recursive: true, force: true }));

// Fake tsc: fails when any .ts file under the project (-p dir) contains "TYPE_ERROR" (prints its absolute path).
const FAKE_TSC = `const fs = require('fs'); const path = require('path');
const dir = process.argv[process.argv.indexOf('-p') + 1];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const bad = walk(dir).filter((f) => f.endsWith('.ts') && fs.readFileSync(f, 'utf8').includes('TYPE_ERROR'));
if (bad.length) { bad.forEach((f) => console.log(f + '(1,1): error TS2322: Type mismatch.')); process.exit(2); }`;

// Fake eslint: exit 1 when a given file contains "LINT_ERROR".
const FAKE_ESLINT = `const fs = require('fs');
const bad = process.argv.slice(2).filter((f) => !f.startsWith('-') && fs.readFileSync(f, 'utf8').includes('LINT_ERROR'));
if (bad.length) { console.log(bad[0] + ': no-unused-vars'); process.exit(1); }`;

// Fake vitest: "related --run <files>" fails when a given file contains "TEST_FAIL".
const FAKE_VITEST = `const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] !== 'related' || !args.includes('--run')) { console.log('bad args ' + args.join(' ')); process.exit(3); }
const files = args.filter((a) => !a.startsWith('-') && a !== 'related');
const bad = files.filter((f) => fs.readFileSync(f, 'utf8').includes('TEST_FAIL'));
if (bad.length) { console.log('FAIL related to ' + bad[0]); process.exit(1); }
console.log('ok ' + files.join(','));`;

const base = (extra = {}) => ({
  'server/package.json': { name: 'server', devDependencies: { vitest: '*' } },
  'server/tsconfig.json': '{}',
  'server/src/old.ts': 'export const old = 1;\n',
  ...fakeBin('', 'typescript', FAKE_TSC),
  ...fakeBin('', 'eslint', FAKE_ESLINT),
  ...fakeBin('', 'vitest', FAKE_VITEST),
  ...extra,
});

const SESSION = events.stop.session_id;
const stop = (root) => runHook('stop-check.mjs', events.stop, root);

test('does nothing when stop_hook_active (prevents loops)', () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/src/a.ts': 'TYPE_ERROR' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = runHook('stop-check.mjs', events.reentry, root);

  assert.equal(res.code, 0);
  assert.equal(res.stdout, '');
  assert.deepEqual(edits.readEdits(root, SESSION), ['server/src/a.ts'], 'ledger kept for the next stop');
  cleanup(root);
});

test("ignores the user's own uncommitted work (nothing edited by Claude)", () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/src/a.ts': 'TYPE_ERROR LINT_ERROR TEST_FAIL' } });
  const res = stop(root);
  cleanup(root);

  assert.equal(res.code, 0);
  assert.equal(res.stdout, '');
});

test('blocks on type errors in an edited file', () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/src/a.ts': 'TYPE_ERROR' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = stop(root);
  cleanup(root);
  const out = JSON.parse(res.stdout);

  assert.equal(out.decision, 'block');
  assert.match(out.reason, /## server typecheck/);
  assert.match(out.reason, /a\.ts\(1,1\): error TS2322/);
});

test('type errors only in files Claude did not edit do not block, and the ledger is cleared', () => {
  const root = makeRepo({ committed: base({ 'server/src/old.ts': 'TYPE_ERROR' }), dirty: { 'server/src/a.ts': 'export const a = 1;' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = stop(root);

  assert.equal(res.stdout, '', res.stderr);
  assert.deepEqual(edits.readEdits(root, SESSION), []);
  cleanup(root);
});

test('blocks on lint errors in an edited file', () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/src/a.ts': 'LINT_ERROR' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = stop(root);
  cleanup(root);

  assert.match(JSON.parse(res.stdout).reason, /## server lint \(eslint\)[\s\S]*no-unused-vars/);
});

test('runs only the tests related to the edited files', () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/src/a.ts': 'TEST_FAIL', 'server/src/b.ts': 'TEST_FAIL' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = stop(root);
  cleanup(root);
  const { reason } = JSON.parse(res.stdout);

  assert.match(reason, /## server test \(vitest related\)[\s\S]*FAIL related to src\/a\.ts/);
  assert.doesNotMatch(reason, /b\.ts/);
});

test('non-code edits (docs) need no checks', () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/README.md': 'TYPE_ERROR' } });
  edits.recordEdit(root, SESSION, 'server/README.md');
  const res = stop(root);

  assert.equal(res.stdout, '');
  assert.deepEqual(edits.readEdits(root, SESSION), []);
  cleanup(root);
});

test('track-edits records repo-relative paths and skips files outside the repo', () => {
  const root = makeRepo({ committed: base() });
  const event = (file_path) => ({ hook_event_name: 'PostToolUse', session_id: 'track', tool_name: 'Edit', tool_input: { file_path } });
  runHook('track-edits.mjs', event(join(root, 'server', 'src', 'a.ts')), root);
  runHook('track-edits.mjs', event('server/src/a.ts'), root);
  runHook('track-edits.mjs', event(join(tmpdir(), 'elsewhere.ts')), root);

  assert.deepEqual(edits.readEdits(root, 'track'), ['server/src/a.ts']);
  cleanup(root);
});

test('check.mjs --files runs file-scoped checks', () => {
  const root = makeRepo({ committed: base(), dirty: { 'server/src/a.ts': 'LINT_ERROR', 'server/src/b.ts': 'export const b = 1;' } });
  const check = (files) =>
    spawnSync(process.execPath, [join(HOOKS_DIR, '..', 'scripts', 'check.mjs'), 'lint', '--files', ...files], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
  const bad = check(['server/src/a.ts']);
  const good = check(['server/src/b.ts']);
  cleanup(root);

  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /server: eslint FAIL/);
  assert.equal(good.status, 0, good.stdout);
});

test('errorsInFiles matches absolute (dotnet), root- and cwd-relative (tsc) paths, plus continuation lines', async () => {
  const { errorsInFiles } = await import('../../lib/scoped.mjs');
  const root = join(tmpdir(), 'repo');
  const abs = join(root, 'Api', 'Services', 'UsersService.cs');
  const output = [
    `${abs}(10,5): error CS0103: The name 'x' does not exist [${join(root, 'Api', 'Api.csproj')}]`,
    `${join(root, 'Api', 'Services', 'OtherService.cs')}(3,1): error CS1002: ; expected`,
    'src/a.ts(1,7): error TS2322: Type mismatch.',
    '  Type string is not assignable to type number.',
    'src/a.tsx(2,1): error TS1005: not mine',
  ].join('\n');

  assert.deepEqual(errorsInFiles(output, ['Api/Services/UsersService.cs'], root, [root]).length, 1);
  assert.deepEqual(errorsInFiles(output, ['client/src/a.ts'], root, [join(root, 'client')]), [
    'src/a.ts(1,7): error TS2322: Type mismatch.',
    '  Type string is not assignable to type number.',
  ]);
});

// Fake full suite (the package's test script): fails when any src file contains "TEST_FAIL".
const FULL_SUITE = `const fs = require('fs'); const path = require('path');
const bad = fs.readdirSync('src').filter((f) => fs.readFileSync(path.join('src', f), 'utf8').includes('TEST_FAIL'));
if (bad.length) { console.log('FAIL suite: ' + bad.join(',')); process.exit(1); }
console.log('suite ok');`;
const withSuite = () => base({ 'server/package.json': { name: 'server', scripts: { test: 'node run-tests.cjs' }, devDependencies: { vitest: '*' } }, 'server/run-tests.cjs': FULL_SUITE });

test('runs the full test suite of a touched package and flags possibly pre-existing failures', () => {
  const root = makeRepo({ committed: withSuite(), dirty: { 'server/src/a.ts': 'export const a = 1;', 'server/src/b.ts': 'TEST_FAIL' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = stop(root);
  cleanup(root);
  const { decision, reason } = JSON.parse(res.stdout);

  assert.equal(decision, 'block');
  assert.match(reason, /## server test \(npm run test\)[\s\S]*FAIL suite: b\.ts/);
  assert.match(reason, /may be pre-existing/);
});

test('a passing full suite lets the stop through', () => {
  const root = makeRepo({ committed: withSuite(), dirty: { 'server/src/a.ts': 'export const a = 1;' } });
  edits.recordEdit(root, SESSION, 'server/src/a.ts');
  const res = stop(root);
  cleanup(root);

  assert.equal(res.stdout, '', res.stderr);
});
