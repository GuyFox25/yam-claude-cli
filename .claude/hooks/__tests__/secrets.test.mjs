import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runHook, makeRepo, cleanup } from './helpers.mjs';
import { findSecrets } from '../../lib/secrets.mjs';

// Fake secrets are assembled at runtime so this file itself never contains one (the guard would block writing it).
const AWS = `AKIA${'Q7'.repeat(8)}`;
const GH = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
const SLACK = `xoxb-${'1234567890'}-abcdefghij`;
const SK = `sk-ant-${'Zx9'.repeat(10)}`;
const JWT = `eyJ${'hbGciOiJIUzI1'}.eyJ${'zdWIiOiIxMjM0'}.${'SflKxwRJSMeKKF2Q'}`;
const PEM = `-----BEGIN ${'RSA PRIVATE'} KEY-----`;
const PASS = `Hunter${'2Secure'}!`;

const SECRETS = [
  ['private key', `${PEM}\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----`],
  ['AWS access key', `const key = '${AWS}';`],
  ['GitHub token', `GITHUB_TOKEN=${GH}`],
  ['Slack token', `webhook: '${SLACK}'`],
  ['API key (sk-…)', `const client = new Anthropic({ apiKey: '${SK}' });`],
  ['JWT', `headers: { Authorization: 'Bearer ${JWT}' }`],
  ['connection string with a password', `DATABASE_URL=postgres://app:${PASS}@db.internal:5432/app`],
  ['connection string with a password', `"Default": "Server=sql01;Database=App;User Id=app;Password=${PASS};"`],
  ['hard-coded credential', `const dbPassword = '${PASS}';`],
  ['hard-coded credential', `CLIENT_SECRET: "${PASS}${PASS}"`],
];

const CLEAN = [
  'const password = process.env.DB_PASSWORD;',
  "const apiKey = '<your-api-key>';",
  "password: '********'",
  'DATABASE_URL=postgres://app:${DB_PASSWORD}@localhost:5432/app',
  'DATABASE_URL=postgres://user:changeme@localhost:5432/app',
  "const tokenStorageKey = 'auth_token_storage';",
  "passwordLabel: 'Enter your password'",
  "<input type=\"password\" name=\"password\" />",
  "const secret = 'short';",
  "it('rejects a bad password', () => login({ password: 'test-password-1' }));",
  'Server=localhost;Database=App;Trusted_Connection=True;',
  'API_KEY=',
  'git clone git@github.com:org/repo.git',
  'DATABASE_URL=postgres://user:pass@db.internal:5432/app',
  `DATABASE_URL=postgres://app:${PASS}@localhost:5432/app_dev`,
  `Server=(local);Database=App;User Id=sa;Password=${PASS};`,
];

for (const [kind, text] of SECRETS) {
  test(`finds ${kind}: ${text.split('\n')[0].slice(0, 40)}`, () => {
    const hits = findSecrets(text);

    assert.equal(hits.length > 0, true, text);
    assert.equal(hits[0].kind, kind);
  });
}

for (const text of CLEAN) {
  test(`no secret in: ${text}`, () => {
    assert.deepEqual(findSecrets(text), []);
  });
}

test('reports the line, never the value', () => {
  assert.deepEqual(findSecrets(`a\nb\nconst key = '${AWS}';`), [{ kind: 'AWS access key', line: 3 }]);
});

let root;
before(() => {
  root = makeRepo();
});
after(() => cleanup(root));

test('guard-boundaries blocks a Write with a secret and does not echo it', () => {
  const event = { tool_name: 'Write', tool_input: { file_path: join(root, 'server/src/config.ts'), content: `export const key = '${AWS}';\n` } };
  const res = runHook('guard-boundaries.mjs', event, root);

  assert.equal(res.code, 2);
  assert.match(res.stderr, /looks like it contains a secret: AWS access key \(line 1/);
  assert.doesNotMatch(res.stderr, new RegExp(AWS));
});

test('guard-boundaries checks only the new text of an Edit', () => {
  const removing = { tool_name: 'Edit', tool_input: { file_path: join(root, 'server/src/config.ts'), old_string: `'${AWS}'`, new_string: 'process.env.AWS_KEY' } };
  const adding = { tool_name: 'Edit', tool_input: { file_path: join(root, 'server/src/config.ts'), old_string: 'x', new_string: `const dbPassword = '${PASS}';` } };

  assert.equal(runHook('guard-boundaries.mjs', removing, root).code, 0);
  assert.equal(runHook('guard-boundaries.mjs', adding, root).code, 2);
});

test('guard-boundaries allows placeholders in .env.example', () => {
  const event = { tool_name: 'Write', tool_input: { file_path: join(root, '.env.example'), content: 'DATABASE_URL=postgres://user:<password>@localhost:5432/app\nAPI_KEY=\n' } };

  assert.equal(runHook('guard-boundaries.mjs', event, root).code, 0);
});
