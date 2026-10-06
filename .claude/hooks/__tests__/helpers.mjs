// Test helpers: run a hook with a JSON event on stdin, and build throwaway git repos.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const HOOKS_DIR = join(here, '..');

export const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

export const runHook = (hook, event, root = process.cwd()) => {
  const res = spawnSync(process.execPath, [join(HOOKS_DIR, hook)], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 120_000,
  });

  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
};

const sh = (cwd, args) => spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });

export const writeFiles = (root, files) => {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
};

// committed: files in the initial commit on main. dirty: files written afterwards (uncommitted).
export const makeRepo = ({ committed = {}, dirty = {}, branch } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'claude-hooks-'));
  sh(root, ['init', '-q', '-b', 'main']);
  writeFiles(root, { 'README.md': 'fixture\n', ...committed });
  sh(root, ['add', '-A']);
  sh(root, ['commit', '-q', '-m', 'init']);
  if (branch) sh(root, ['checkout', '-q', '-b', branch]);
  writeFiles(root, dirty);

  return root;
};

export const cleanup = (root) => rmSync(root, { recursive: true, force: true });

// Fake CLI installed in node_modules: runs `source` as its bin.
export const fakeBin = (dir, name, source) => ({
  [join(dir, 'node_modules', name, 'package.json')]: { name, version: '0.0.0', bin: { [name === 'typescript' ? 'tsc' : name]: 'bin.cjs' } },
  [join(dir, 'node_modules', name, 'bin.cjs')]: source,
});
