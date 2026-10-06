#!/usr/bin/env node
// PostToolUse(Edit|Write): prettier --write + eslint --fix on the edited JS/TS file only; dotnet format whitespace for C#.
// Uses locally installed tools; silently skips any that are not installed. Exit 2 reports remaining errors.
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { readInput, block, allow } from '../lib/hook-io.mjs';
import { projectRoot, resolveInRoot, packageOf, findLocalBin, localMajor, run, commandExists } from '../lib/detect.mjs';

const PRETTIER_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.css', '.scss', '.html', '.md', '.yml', '.yaml']);
const ESLINT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const TIMEOUT = 25_000;

const input = await readInput();
const filePath = String(input?.tool_input?.file_path ?? '');
if (!filePath) allow();

const root = projectRoot();
const { abs, rel } = resolveInRoot(root, filePath);
const ext = extname(abs).toLowerCase();
if (!existsSync(abs) || rel.startsWith('..') || rel.includes('node_modules/') || rel.startsWith('.claude/')) allow();

const pkg = packageOf(root, abs);
const cwd = pkg ? join(root, pkg) : root;
const problems = [];

if (PRETTIER_EXT.has(ext)) {
  const prettier = findLocalBin(root, pkg, 'prettier');
  if (prettier) {
    // Prettier 3 renamed --loglevel to --log-level.
    const logFlag = localMajor(root, pkg, 'prettier') >= 3 ? '--log-level' : '--loglevel';
    const res = run(process.execPath, [prettier, '--write', '--ignore-unknown', logFlag, 'warn', abs], { cwd: root, timeout: TIMEOUT });
    if (res.code !== 0) problems.push(`prettier:\n${res.output}`);
  }
}

if (ESLINT_EXT.has(ext)) {
  const eslint = findLocalBin(root, pkg, 'eslint');
  if (eslint) {
    // --no-warn-ignored exists only in ESLint 9+ (flat config); ESLint 8 (eslintrc, common in legacy apps) rejects it.
    const args = localMajor(root, pkg, 'eslint') >= 9 ? ['--fix', '--no-warn-ignored', abs] : ['--fix', abs];
    const res = run(process.execPath, [eslint, ...args], { cwd, timeout: TIMEOUT });
    // eslint: 1 = lint errors remain, 2 = config/crash (e.g. no config in this project) -> do not block on that.
    if (res.code === 1) problems.push(`eslint:\n${res.output}`);
    else if (res.code !== 0) process.stderr.write(`[format-on-write] eslint could not run on ${rel} (exit ${res.code}); skipped.\n`);
  }
}

// C#: whitespace-only formatting needs no build or restore, so it is fast and works offline.
if (ext === '.cs' && commandExists('dotnet')) {
  const res = run('dotnet', ['format', 'whitespace', root, '--folder', '--include', rel], { cwd: root, timeout: 45_000 });
  if (res.code !== 0) process.stderr.write(`[format-on-write] dotnet format could not run on ${rel} (exit ${res.code}); skipped.\n`);
}

if (problems.length) block(`Remaining issues in ${rel} after auto-fix:\n${problems.join('\n\n').slice(0, 6000)}`);
allow();
