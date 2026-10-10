// End-to-end smoke test: export the template into a copy of each fixture project (fixtures/projects/<name>, one per stack),
// commit the setup like a developer would, then check that session-context detects the right stack and that the check
// runner and a guard hook work there. The fixtures live under .claude/ on purpose: the template's own stack detection
// skips hidden folders, so a fixture .sln or package.json never changes how this repo sees itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, runHook, makeRepo, cleanup, HOOKS_DIR } from './helpers.mjs';

const PROJECTS = join(HOOKS_DIR, '__tests__', 'fixtures', 'projects');
const SCRIPTS = join(HOOKS_DIR, '..', 'scripts');
const { startup } = fixture('session-context.json');

const git = (cwd, args) => spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
const node = (cwd, script, args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, CLAUDE_HOOK_LOG: 'off' } });

// The stack part of the status line for each fixture.
const STATUS_STACK = {
  'sap-client': 'react-ts',
  'legacy-jsx': 'react-js',
  dotnet: 'react-ts+dotnet',
  'express-drizzle': 'express',
  'nest-prisma': 'nestjs',
  mongo: 'express',
};

// The Stack: fields each fixture must produce (substrings of the line).
const EXPECTED = {
  'sap-client': ['pm=npm', 'client=react-ts', 'backend=external', 'orm=n/a', 'db=n/a', 'tests=vitest', 'packages=client'],
  'legacy-jsx': ['client=react-js (class components present', 'backend=external', 'tests=jest'],
  dotnet: ['client=react-ts', 'backend=dotnet (server/Api.sln', 'check target: server', 'db=mssql'],
  'express-drizzle': ['pm=pnpm', 'backend=express', 'server=express', 'orm=drizzle', 'db=postgresql', 'tests=vitest', 'packages=server,db,utils'],
  'nest-prisma': ['backend=nestjs', 'server=nestjs', 'orm=prisma', 'db=postgresql', 'tests=jest'],
  mongo: ['backend=express', 'orm=mongoose', 'db=mongodb', 'tests=jest'],
};

for (const [name, fields] of Object.entries(EXPECTED)) {
  test(`${name}: export, detect the stack, run checks and guards`, () => {
    const root = makeRepo({ branch: 'chore/claude-code-setup' });
    try {
      cpSync(join(PROJECTS, name), root, { recursive: true });
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '-m', 'fixture']);

      const exported = node(root, 'export-template.mjs', [root]);
      assert.equal(exported.status, 0, exported.stderr);
      assert.ok(existsSync(join(root, '.claude/settings.json')));
      assert.ok(!existsSync(join(root, '.claude/template-source.md')));
      assert.ok(!existsSync(join(root, 'CODEOWNERS')));
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '-m', 'chore: add claude code setup']);

      const session = runHook('session-context.mjs', startup, root);
      assert.equal(session.code, 0, session.stderr);
      const stack = session.stdout.split('\n').find((l) => l.startsWith('Stack:')) ?? '';
      for (const field of fields) assert.ok(stack.includes(field), `expected "${field}" in: ${stack}`);
      assert.match(session.stdout, /Branch: chore\/claude-code-setup/);

      // The status line reads the stack session-context just cached, and the exported template version.
      const line = spawnSync(process.execPath, [join(SCRIPTS, 'statusline.mjs')], { input: '{"model":{"display_name":"Opus"}}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
      const version = JSON.parse(readFileSync(join(root, '.claude/template-manifest.json'), 'utf8')).template;
      assert.equal(line.stdout.trim(), `Opus · chore/claude-code-setup · ${STATUS_STACK[name]} · template ${version}`);

      // Nothing uncommitted after the setup commit, so --changed has nothing to do and must say so cleanly.
      const check = node(root, 'check.mjs', ['typecheck', '--changed']);
      assert.equal(check.status, 0, check.stderr + check.stdout);
      assert.match(check.stdout, /nothing to typecheck/);

      // The exported project's .claude/ is protected (no template marker there).
      const edit = runHook('guard-boundaries.mjs', { tool_name: 'Edit', tool_input: { file_path: join(root, '.claude/rules/react.md'), old_string: 'a', new_string: 'b' } }, root);
      assert.equal(edit.code, 2);
      assert.match(edit.stderr, /managed by the shared Claude template/);
    } finally {
      cleanup(root);
    }
  });
}
