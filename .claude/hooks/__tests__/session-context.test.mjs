import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, writeFiles, cleanup } from './helpers.mjs';

const events = fixture('session-context.json');

const STACK = {
  'pnpm-workspace.yaml': "packages:\n  - 'client'\n  - 'server'\n  - 'db'\n  - 'utils'\n",
  'server/package.json': { name: 'server', dependencies: { '@nestjs/core': '*' } },
  'db/package.json': { name: 'db', dependencies: { 'drizzle-orm': '*' }, devDependencies: { vitest: '*' } },
};

test('reports branch, dirty files, package from branch name, and stack', () => {
  const root = makeRepo({ committed: STACK, branch: 'feat/db-add-users-table', dirty: { 'db/src/schema.ts': 'x' } });
  const res = runHook('session-context.mjs', events.startup, root);
  cleanup(root);

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Branch: feat\/db-add-users-table/);
  assert.match(res.stdout, /Likely package: db \(from branch name\)/);
  assert.match(res.stdout, /db\/src\/schema\.ts/);
  assert.match(res.stdout, /pm=pnpm, client=n\/a, backend=nestjs, server=nestjs, orm=drizzle, db=n\/a, tests=vitest/);
  assert.doesNotMatch(res.stdout, /In-house libraries/);
});

test('SAP-style client-only repo: legacy JS client, external backend, in-house library with agent', () => {
  const root = makeRepo({
    committed: {
      'package-lock.json': '{}',
      'client/package.json': { name: 'client', dependencies: { react: '*', '@acme/ui': '*' } },
      'client/src/Old.jsx': "import React from 'react';\nexport default class Old extends React.Component {}\n",
    },
  });
  writeFiles(root, {
    'client/node_modules/@acme/ui/package.json': { name: '@acme/ui', version: '3.0.0' },
    'client/node_modules/@acme/ui/claude-lib.md': '---\nsummary: Design system.\n---\n',
  });
  const res = runHook('session-context.mjs', events.startup, root);
  const agentWritten = existsSync(join(root, '.claude', 'agents', 'lib-acme-ui.md'));
  cleanup(root);

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /client=react-js \(class components present/);
  assert.match(res.stdout, /backend=external \(no server\/ in repo, e\.g\. SAP ABAP via OData/);
  assert.match(res.stdout, /@acme\/ui 3\.0\.0 -> agent lib-acme-ui/);
  assert.ok(agentWritten);
});

test('Express + Drizzle on PostgreSQL shows db=postgresql', () => {
  const root = makeRepo({
    committed: {
      'package-lock.json': '{}',
      'server/package.json': { name: 'server', dependencies: { express: '*' } },
      'db/package.json': { name: 'db', dependencies: { 'drizzle-orm': '*', pg: '*' } },
      'db/drizzle.config.ts': "export default { dialect: 'postgresql' };\n",
    },
  });
  const res = runHook('session-context.mjs', events.startup, root);
  cleanup(root);

  assert.match(res.stdout, /pm=npm, client=n\/a, backend=express, server=express, orm=drizzle, db=postgresql/);
});

test('falls back to the package with most changed files', () => {
  const root = makeRepo({
    committed: STACK,
    branch: 'feat/onboarding-flow',
    dirty: { 'client/src/a.tsx': 'a', 'client/src/b.tsx': 'b', 'server/src/c.ts': 'c' },
  });
  const res = runHook('session-context.mjs', events.resume, root);
  cleanup(root);

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Likely package: client \(2 changed files\)/);
});

test('package guess uses the earliest keyword in the branch name', () => {
  const root = makeRepo({ committed: STACK, branch: 'fix/server-ui-bug' });
  const res = runHook('session-context.mjs', events.startup, root);
  cleanup(root);

  assert.match(res.stdout, /Likely package: server \(from branch name\)/);
});
