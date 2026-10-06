import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeRepo, cleanup } from './helpers.mjs';
import {
  detectPackageManager,
  detectFramework,
  detectOrm,
  detectTestRunner,
  findScript,
  migrationDirs,
  resolveCheck,
  detectBackend,
  detectClient,
  detectDotnetTestFramework,
  dotnetProject,
  dotnetTarget,
  existingTargets,
  packageOf,
  isEfMigration,
  detectDbEngine,
} from '../../lib/detect.mjs';

test('pnpm + NestJS + Drizzle + Vitest', () => {
  const root = makeRepo({
    committed: {
      'pnpm-lock.yaml': '',
      'server/package.json': { dependencies: { '@nestjs/core': '*' } },
      'db/package.json': { dependencies: { 'drizzle-orm': '*' }, devDependencies: { vitest: '*' }, scripts: { 'type-check': 'tsc' } },
    },
  });

  assert.equal(detectPackageManager(root), 'pnpm');
  assert.equal(detectFramework(root), 'nestjs');
  assert.equal(detectOrm(root), 'drizzle');
  assert.equal(detectTestRunner(root), 'vitest');
  assert.equal(resolveCheck(root, 'db', 'typecheck').label, 'pnpm run type-check');
  assert.equal(resolveCheck(root, 'server', 'lint'), null);
  cleanup(root);
});

test('npm + Express + Prisma + Jest', () => {
  const root = makeRepo({
    committed: {
      'package-lock.json': '{}',
      'server/package.json': { dependencies: { express: '*' }, devDependencies: { jest: '*' } },
      'db/package.json': { dependencies: { '@prisma/client': '*' } },
    },
  });

  assert.equal(detectPackageManager(root), 'npm');
  assert.equal(detectFramework(root), 'express');
  assert.equal(detectOrm(root), 'prisma');
  assert.equal(detectTestRunner(root, 'server'), 'jest');
  cleanup(root);
});

test('findScript picks the first matching candidate', () => {
  assert.equal(findScript({ scripts: { 'db:migrate': 'x', migrate: 'y' } }, 'migrate'), 'db:migrate');
  assert.equal(findScript({ scripts: {} }, 'seed'), null);
});

test('npm passes extra args after --', () => {
  const root = makeRepo({ committed: { 'package-lock.json': '{}', 'client/package.json': { scripts: { test: 'vitest' } } } });

  assert.deepEqual(resolveCheck(root, 'client', 'test', ['src/a.test.ts']).args, ['run', 'test', '--', 'src/a.test.ts']);
  assert.ok(migrationDirs(root).includes('db/prisma/migrations'));
  cleanup(root);
});

test('.NET backend: solution found below the root, .cs files map to the server target', () => {
  const root = makeRepo({
    committed: {
      'client/package.json': { name: 'client', dependencies: { react: '*' } },
      'backend/App.sln': '',
      'backend/Api/Api.csproj': '<Project><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" /></ItemGroup></Project>',
      'backend/Api.Tests/Api.Tests.csproj': '<Project><ItemGroup><PackageReference Include="xunit" /></ItemGroup></Project>',
    },
  });

  assert.equal(detectBackend(root), 'dotnet');
  assert.equal(dotnetProject(root).rel, 'backend/App.sln');
  assert.equal(detectDotnetTestFramework(root), 'xunit');
  assert.equal(dotnetTarget(root), 'server');
  assert.deepEqual(existingTargets(root), ['client', 'server']);
  assert.equal(packageOf(root, 'backend/Api/UsersController.cs'), 'server');
  assert.equal(packageOf(root, 'client/src/App.jsx'), 'client');
  const plan = resolveCheck(root, 'server', 'typecheck');
  if (plan.skip) assert.match(plan.skip, /dotnet/);
  else assert.equal(plan.label, 'dotnet build backend/App.sln');
  cleanup(root);
});

test('no server/ and no .NET means an external backend (e.g. SAP OData)', () => {
  const root = makeRepo({ committed: { 'client/package.json': { name: 'client', dependencies: { react: '*' } } } });

  assert.equal(detectBackend(root), 'external');
  assert.equal(dotnetTarget(root), null);
  cleanup(root);
});

test('legacy JS client with class components; JS client has no typecheck', () => {
  const root = makeRepo({
    committed: {
      'client/package.json': { name: 'client', dependencies: { react: '*' }, scripts: { test: 'jest' } },
      'client/src/Old.jsx': "import React from 'react';\nexport default class Old extends React.Component {}\n",
      'client/src/New.jsx': 'export const New = () => null;\n',
    },
  });

  assert.deepEqual(detectClient(root), { lang: 'js', classComponents: true });
  assert.equal(resolveCheck(root, 'client', 'typecheck'), null);
  cleanup(root);
});

test('TS client with function components only', () => {
  const root = makeRepo({
    committed: {
      'client/package.json': { name: 'client', devDependencies: { typescript: '*' } },
      'client/src/App.tsx': 'export const App = (): null => null;\n',
    },
  });

  assert.deepEqual(detectClient(root), { lang: 'ts', classComponents: false });
  cleanup(root);
});

test('EF Core migrations are recognized by their ModelSnapshot', () => {
  const root = makeRepo({
    committed: {
      'Api/Migrations/AppDbContextModelSnapshot.cs': '',
      'Api/Migrations/20240101_Init.cs': '',
      'Api/Controllers/UsersController.cs': '',
    },
  });

  assert.equal(isEfMigration(root, join(root, 'Api/Migrations/20240101_Init.cs')), true);
  assert.equal(isEfMigration(root, join(root, 'Api/Controllers/UsersController.cs')), false);
  cleanup(root);
});

test('DB engine: Drizzle dialect postgresql (Express + Drizzle + Postgres)', () => {
  const root = makeRepo({
    committed: {
      'server/package.json': { dependencies: { express: '*' } },
      'db/package.json': { dependencies: { 'drizzle-orm': '*', pg: '*' }, devDependencies: { 'drizzle-kit': '*' } },
      'db/drizzle.config.ts': "export default { dialect: 'postgresql', schema: './src/schema.ts', out: './drizzle' };\n",
    },
  });

  assert.equal(detectOrm(root), 'drizzle');
  assert.equal(detectDbEngine(root), 'postgresql');
  cleanup(root);
});

test('DB engine: Prisma provider mongodb', () => {
  const root = makeRepo({
    committed: {
      'db/package.json': { dependencies: { '@prisma/client': '*' } },
      'db/prisma/schema.prisma': 'datasource db {\n  provider = "mongodb"\n  url      = env("DATABASE_URL")\n}\n',
    },
  });

  assert.equal(detectOrm(root), 'prisma');
  assert.equal(detectDbEngine(root), 'mongodb');
  cleanup(root);
});

test('DB engine: Mongoose + migrate-mongo migrations dir', () => {
  const root = makeRepo({
    committed: {
      'db/package.json': { dependencies: { mongoose: '*' }, devDependencies: { 'migrate-mongo': '*' } },
      'db/migrate-mongo-config.js': "module.exports = { migrationsDir: 'mongo-migrations', changelogCollectionName: 'changelog' };\n",
    },
  });

  assert.equal(detectOrm(root), 'mongoose');
  assert.equal(detectDbEngine(root), 'mongodb');
  assert.ok(migrationDirs(root).includes('db/mongo-migrations'));
  cleanup(root);
});

test('DB engine: .NET Npgsql provider', () => {
  const root = makeRepo({
    committed: {
      'Api/Api.csproj': '<Project><ItemGroup><PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" /></ItemGroup></Project>',
    },
  });

  assert.equal(detectDbEngine(root), 'postgresql');
  cleanup(root);
});

test('DB engine: unknown without config or drivers', () => {
  const root = makeRepo({ committed: { 'client/package.json': { dependencies: { react: '*' } } } });

  assert.equal(detectDbEngine(root), null);
  cleanup(root);
});

test('JS client with typescript only as a devDependency stays js', () => {
  const root = makeRepo({
    committed: {
      'client/package.json': { name: 'client', devDependencies: { typescript: '*' } },
      'client/src/App.jsx': 'export const App = () => null;\n',
      'client/src/global.d.ts': 'declare module "*.svg";\n',
    },
  });

  assert.equal(detectClient(root).lang, 'js');
  cleanup(root);
});

test('csproj-only .NET layout three levels deep is found', () => {
  const root = makeRepo({ committed: { 'server/src/Api/Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web" />\n' } });

  assert.equal(dotnetProject(root)?.rel, 'server/src/Api/Api.csproj');
  cleanup(root);
});
