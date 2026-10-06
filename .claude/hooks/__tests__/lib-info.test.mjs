import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOOKS_DIR, makeRepo, writeFiles, cleanup } from './helpers.mjs';
import { discoverLibs, syncAgents, parseFrontmatter, agentName, GENERATED_MARKER } from '../../lib/libs.mjs';

const LIB_INFO = join(HOOKS_DIR, '..', 'scripts', 'lib-info.mjs');

const libInfo = (root, ...args) => {
  const res = spawnSync(process.execPath, [LIB_INFO, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });

  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
};

const PROMPT = `---
name: "@acme/ui"
summary: React component library with the company design system.
whenToUse: building screens, forms or tables in client
---
# @acme/ui
Use <AcmeTable rows columns /> for every data table.
`;

let root;

before(() => {
  root = makeRepo({
    committed: {
      'client/package.json': { name: 'client', dependencies: { '@acme/ui': '^2.0.0', '@acme/odata': 'file:../odata', react: '*' } },
      'client/src/Users.tsx': "import { AcmeTable } from '@acme/ui';\nimport { Button } from '@acme/ui/buttons';\n",
      'package-lock.json': { packages: { 'node_modules/@acme/ui': { version: '2.0.0' } } },
      // A linked checkout of a second library, outside node_modules.
      'odata-src/package.json': { name: '@acme/odata', version: '0.3.0', types: 'index.d.ts' },
      'odata-src/claude-lib.md': '---\nname: "@acme/odata"\nsummary: Typed client for SAP Gateway OData services.\n---\nAlways fetch the CSRF token first.\n',
      'odata-src/index.d.ts': 'export declare function createClient(url: string): unknown;\n',
    },
  });
  writeFiles(root, {
    'node_modules/@acme/ui/package.json': { name: '@acme/ui', version: '2.1.0', types: 'dist/index.d.ts', peerDependencies: { react: '>=18' } },
    'node_modules/@acme/ui/claude-lib.md': PROMPT,
    'node_modules/@acme/ui/dist/index.d.ts': "export declare const AcmeTable: () => null;\nexport * from './buttons';\nexport { format as formatCell } from './format';\n",
    'node_modules/@acme/ui/dist/buttons.d.ts': 'export interface ButtonProps { label: string }\nexport declare function Button(p: ButtonProps): null;\n',
    'node_modules/@acme/ui/CHANGELOG.md': '# Changelog\n\n## 2.1.0\n- Added AcmeTable sorting\n\n## 2.0.0\n- BREAKING: renamed Grid to AcmeTable\n\n## 1.9.0\n- old\n',
    'node_modules/react/package.json': { name: 'react', version: '18.0.0' },
  });
  mkdirSync(join(root, 'client', 'node_modules', '@acme'), { recursive: true });
  symlinkSync(join(root, 'odata-src'), join(root, 'client', 'node_modules', '@acme', 'odata'), 'junction');
});

after(() => cleanup(root));

test('discovers only dependencies that ship claude-lib.md, including linked checkouts', () => {
  const libs = discoverLibs(root);

  assert.deepEqual(libs.map((l) => l.name), ['@acme/odata', '@acme/ui']);
  const ui = libs.find((l) => l.name === '@acme/ui');
  assert.equal(ui.version, '2.1.0');
  assert.equal(ui.linked, false);
  assert.equal(ui.meta.summary, 'React component library with the company design system.');
  assert.equal(libs.find((l) => l.name === '@acme/odata').linked, true);
});

test('parseFrontmatter and agent names', () => {
  assert.deepEqual(parseFrontmatter('---\na: 1\nb: "x y"\n---\nbody'), { a: '1', b: 'x y' });
  assert.equal(agentName('@acme/ui'), 'lib-acme-ui');
});

test('list and show', () => {
  const list = libInfo(root, 'list');
  assert.equal(list.code, 0, list.stderr);
  assert.match(list.stdout, /@acme\/ui 2\.1\.0 .*agent: lib-acme-ui/);
  assert.match(list.stdout, /@acme\/odata 0\.3\.0 .*linked -> .*odata-src/);

  const show = libInfo(root, 'show', '@acme/ui');
  assert.equal(show.code, 0, show.stderr);
  assert.match(show.stdout, /peerDependencies: react@>=18/);
  assert.match(show.stdout, /AcmeTable rows columns/);
});

test('show falls back to README for a library without claude-lib.md', () => {
  writeFiles(root, { 'node_modules/react/README.md': '# React\nA UI library.\n' });
  const res = libInfo(root, 'show', 'react');

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /no claude-lib\.md/);
  assert.match(res.stdout, /A UI library/);
});

test('api follows re-exports in the type declarations', () => {
  const res = libInfo(root, 'api', '@acme/ui');

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /const AcmeTable/);
  assert.match(res.stdout, /formatCell/);
  assert.match(res.stdout, /interface ButtonProps/);
  assert.match(res.stdout, /function Button/);
});

test('usage lists import sites, including subpath imports', () => {
  const res = libInfo(root, 'usage', '@acme/ui');

  assert.match(res.stdout, /client\/src\/Users\.tsx:1:/);
  assert.match(res.stdout, /client\/src\/Users\.tsx:2:/);
});

test('changes shows changelog entries between the committed and installed version', () => {
  const res = libInfo(root, 'changes', '@acme/ui');

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /2\.0\.0 -> 2\.1\.0/);
  assert.match(res.stdout, /AcmeTable sorting/);
  assert.doesNotMatch(res.stdout, /renamed Grid/);
});

test('unknown library fails with a hint', () => {
  const res = libInfo(root, 'show', '@acme/missing');

  assert.equal(res.code, 1);
  assert.match(res.stderr, /not installed/);
});

test('sync-agents writes one agent per library and removes stale generated ones only', () => {
  const agents = join(root, '.claude', 'agents');
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, 'lib-gone.md'), `---\nname: lib-gone\n---\n${GENERATED_MARKER}\n`);
  writeFileSync(join(agents, 'lib-handmade.md'), '---\nname: lib-handmade\n---\nhand written\n');

  const first = syncAgents(root);
  assert.deepEqual(first.written.sort(), ['.claude/agents/lib-acme-odata.md', '.claude/agents/lib-acme-ui.md']);
  assert.deepEqual(first.removed, ['.claude/agents/lib-gone.md']);
  assert.ok(existsSync(join(agents, 'lib-handmade.md')));

  const ui = readFileSync(join(agents, 'lib-acme-ui.md'), 'utf8');
  assert.match(ui, /^name: lib-acme-ui$/m);
  assert.match(ui, /description: "Expert on the in-house library @acme\/ui: React component library/);
  assert.match(ui, /tools: Read, Grep, Glob, Bash\(node \.claude\/scripts\/lib-info\.mjs:\*\)/);
  assert.match(ui, /lib-info\.mjs show @acme\/ui/);

  assert.deepEqual(syncAgents(root), { written: [], removed: [] });
  rmSync(agents, { recursive: true, force: true });
});
