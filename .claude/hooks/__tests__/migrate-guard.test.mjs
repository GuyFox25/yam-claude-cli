import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHook, makeRepo, cleanup } from './helpers.mjs';

// Isolate from the developer's own environment.
const CLEAN_ENV = Object.fromEntries(
  ['DATABASE_URL', 'DB_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DIRECT_URL', 'MONGODB_URI', 'MONGO_URL', 'MONGO_URI', 'PGHOST', 'DB_HOST', 'CLAUDE_LOCAL_DB_HOSTS'].map((k) => [k, '']),
);
const REMOTE = 'postgres://admin:s3cret@db-prod.internal.corp:5432/app';
const DB_PKG = { name: '@app/db', scripts: { 'db:migrate': 'drizzle-kit migrate', 'db:studio': 'drizzle-kit studio' }, devDependencies: { 'drizzle-kit': '*' } };

const bash = (root, command, env = {}) => {
  const res = runHook('guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, root, { ...CLEAN_ENV, ...env });
  const out = res.stdout ? JSON.parse(res.stdout).hookSpecificOutput : null;

  return { ...res, decision: out?.permissionDecision ?? null, reason: out?.permissionDecisionReason ?? '' };
};

const withRepo = (files, fn) => {
  const root = makeRepo({ committed: { 'db/package.json': DB_PKG, ...files } });
  try {
    fn(root);
  } finally {
    cleanup(root);
  }
};

test('blocks a migration whose db/.env points at a remote host, without printing the URL or host', () => {
  withRepo({ 'db/.env': `DATABASE_URL=${REMOTE}\n` }, (root) => {
    const res = bash(root, 'npx drizzle-kit migrate');

    assert.equal(res.code, 2);
    assert.match(res.stderr, /non-local database/);
    assert.doesNotMatch(res.stderr, /db-prod|s3cret|admin/);
  });
});

test('a migration against localhost falls through to the normal permission prompt', () => {
  withRepo({ 'db/.env': 'DATABASE_URL="postgres://dev:dev@localhost:5432/app"\n' }, (root) => {
    const res = bash(root, 'npx drizzle-kit migrate');

    assert.equal(res.code, 0, res.stderr);
    assert.equal(res.decision, null);
  });
});

test('an inline DATABASE_URL prefix decides alone', () => {
  withRepo({ 'db/.env': `DATABASE_URL=${REMOTE}\n` }, (root) => {
    assert.equal(bash(root, 'DATABASE_URL=postgres://u:p@127.0.0.1:5432/app npm run db:migrate -w @app/db').code, 0);
    assert.equal(bash(root, `DATABASE_URL=${REMOTE} npx drizzle-kit push`).code, 2);
  });
});

test('package scripts that run a migration tool are recognized; others are not', () => {
  withRepo({ '.env': `DATABASE_URL=${REMOTE}\n` }, (root) => {
    assert.equal(bash(root, 'npm run db:migrate -w @app/db').code, 2);
    assert.equal(bash(root, 'npm run db:studio -w @app/db').code, 0);
    assert.equal(bash(root, 'git commit -m "add db:migrate script"').code, 0);
  });
});

test('asks when no database URL can be found', () => {
  withRepo({}, (root) => {
    const res = bash(root, 'npx prisma migrate deploy');

    assert.equal(res.code, 0);
    assert.equal(res.decision, 'ask');
    assert.match(res.reason, /could not verify the database host/);
  });
});

test('uses the variable named in drizzle.config and the env var from the process', () => {
  withRepo({ 'db/drizzle.config.ts': 'export default { dbCredentials: { url: process.env.APP_PG_URL! } };\n', 'db/.env': `APP_PG_URL=${REMOTE}\n` }, (root) => {
    assert.equal(bash(root, 'npx drizzle-kit migrate').code, 2);
  });
  withRepo({}, (root) => {
    assert.equal(bash(root, 'npx drizzle-kit migrate', { DATABASE_URL: REMOTE }).code, 2);
  });
});

test('CLAUDE_LOCAL_DB_HOSTS allows a docker-compose service host', () => {
  withRepo({ 'db/.env': 'DATABASE_URL=postgres://dev:dev@postgres:5432/app\n' }, (root) => {
    assert.equal(bash(root, 'npx drizzle-kit migrate').code, 2);
    assert.equal(bash(root, 'npx drizzle-kit migrate', { CLAUDE_LOCAL_DB_HOSTS: 'postgres, mongo' }).code, 0);
  });
});

test('dotnet ef database update reads appsettings connection strings', () => {
  const remote = { ConnectionStrings: { Default: 'Server=sql-prod.corp,1433;Database=App;User Id=sa;Password=x' } };
  const local = { ConnectionStrings: { Default: 'Host=localhost;Database=app;Username=dev;Password=dev' } };
  withRepo({ 'Api/appsettings.Development.json': remote }, (root) => {
    const res = bash(root, 'dotnet ef database update');

    assert.equal(res.code, 2);
    assert.doesNotMatch(res.stderr, /sql-prod/);
  });
  withRepo({ 'Api/appsettings.json': local }, (root) => {
    assert.equal(bash(root, 'dotnet ef database update').code, 0);
  });
});

test('mongo seed lists and migrate-mongo are checked', () => {
  withRepo({ 'db/.env': 'MONGODB_URI=mongodb://u:p@mongo-a.corp:27017,mongo-b.corp:27017/app?replicaSet=rs0\n' }, (root) => {
    assert.equal(bash(root, 'npx migrate-mongo up').code, 2);
  });
});
