// File-scoped checks: lint, typecheck and tests limited to a given set of files (the ones Claude edited).
// - lint: eslint on exactly those files (C# is already formatted on write).
// - typecheck: the package's typecheck/build runs as usual (types are project-wide), but only errors located
//   in the given files count; errors elsewhere are reported as a non-blocking note.
// - test: only tests related to the files (vitest related / jest --findRelatedTests / dotnet test --filter),
//   or the changed test files themselves for other runners.
import { existsSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import {
  IS_WIN,
  toPosix,
  packageOf,
  dotnetTarget,
  dotnetProject,
  resolveCheck,
  findLocalBin,
  localMajor,
  detectTestRunner,
  commandExists,
  run,
} from './detect.mjs';

const JS_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const TS_RE = /\.(ts|tsx|mts|cts)$/i;
const CS_RE = /\.cs$/i;
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const MAX_OUTPUT = 3000;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const norm = (s) => {
  const posix = toPosix(s.replace(ANSI, ''));

  return IS_WIN ? posix.toLowerCase() : posix;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clip = (s) => (s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n... (truncated)` : s);

// Lines of compiler output that point at one of `files` (any of: absolute, root-relative, cwd-relative),
// plus their indented continuation lines.
export const errorsInFiles = (output, files, root, cwds) => {
  const candidates = new Set();
  for (const rel of files) {
    const abs = join(root, rel);
    candidates.add(norm(abs));
    candidates.add(norm(rel));
    for (const cwd of cwds) candidates.add(norm(relative(cwd, abs)));
  }
  const re = new RegExp(`(^|[\\s'"])(${[...candidates].map(escapeRe).join('|')})[(:]`);
  const picked = [];
  let keep = false;
  for (const line of output.split(/\r?\n/)) {
    if (re.test(norm(line))) keep = true;
    else if (!/^\s/.test(line)) keep = false;
    if (keep && !picked.includes(line)) picked.push(line);
  }

  return picked;
};

const groupByPackage = (root, files) => {
  const groups = new Map();
  for (const rel of files) {
    if (!(JS_RE.test(rel) || CS_RE.test(rel)) || !existsSync(join(root, rel))) continue;
    const pkg = packageOf(root, rel);
    if (!pkg) continue;
    groups.set(pkg, [...(groups.get(pkg) ?? []), rel]);
  }

  return groups;
};

const pkgDir = (root, pkg) => (pkg === '.' ? root : join(root, pkg));

const lint = (root, pkg, files, timeout) => {
  if (pkg === dotnetTarget(root)) return null;
  const js = files.filter((f) => JS_RE.test(f));
  if (!js.length) return null;
  const eslint = findLocalBin(root, pkg, 'eslint');
  if (!eslint) return { status: 'skip', label: 'eslint', output: 'eslint not installed' };
  const cwd = pkgDir(root, pkg);
  const targets = js.map((f) => relative(cwd, join(root, f)));
  const flags = localMajor(root, pkg, 'eslint') >= 9 ? ['--no-warn-ignored'] : [];
  const res = run(process.execPath, [eslint, ...flags, ...targets], { cwd, timeout });
  if (res.code === 0) return { status: 'pass', label: 'eslint' };
  if (res.code === 1) return { status: 'fail', label: 'eslint', output: clip(res.output) };

  return { status: 'skip', label: 'eslint', output: `eslint could not run (exit ${res.code})` };
};

const typecheck = (root, pkg, files, timeout) => {
  const isDotnet = pkg === dotnetTarget(root);
  const mine = files.filter((f) => (isDotnet ? CS_RE.test(f) : TS_RE.test(f)));
  if (!mine.length) return null;
  const plan = resolveCheck(root, pkg, 'typecheck');
  if (!plan || plan.skip) return { status: 'skip', label: 'typecheck', output: plan?.skip ?? 'no typecheck for this package' };
  const res = run(plan.cmd, plan.args, { cwd: plan.cwd, timeout });
  if (res.code === 0) return { status: 'pass', label: plan.label };
  const errors = errorsInFiles(res.output, mine, root, [plan.cwd, pkgDir(root, pkg)]);
  if (errors.length) return { status: 'fail', label: plan.label, output: clip(errors.join('\n')) };

  return { status: 'pass', label: plan.label, note: 'the typecheck has errors, but none in the files you changed (not blocking)' };
};

const dotnetTests = (root, files, timeout) => {
  if (!commandExists('dotnet')) return { status: 'skip', label: 'dotnet test', output: 'dotnet SDK not on PATH' };
  // UsersService.cs -> tests matching UsersServiceTests; UsersServiceTests.cs -> itself.
  const names = files.filter((f) => CS_RE.test(f)).map((f) => basename(f, extname(f)));
  const filter = [...new Set(names.map((n) => (/Tests?$/.test(n) ? n : `${n}Tests`)))].map((n) => `FullyQualifiedName~${n}`).join('|');
  const dn = dotnetProject(root);
  const res = run('dotnet', ['test', dn.file, '--no-restore', '-nologo', '--filter', filter], { cwd: dn.dir, timeout });

  return res.code === 0 ? { status: 'pass', label: `dotnet test --filter ${filter}` } : { status: 'fail', label: `dotnet test --filter ${filter}`, output: clip(res.output) };
};

const tests = (root, pkg, files, timeout) => {
  if (pkg === dotnetTarget(root)) return dotnetTests(root, files, timeout);
  const js = files.filter((f) => JS_RE.test(f));
  if (!js.length) return null;
  const cwd = pkgDir(root, pkg);
  const targets = js.map((f) => toPosix(relative(cwd, join(root, f))));
  const runner = detectTestRunner(root, pkg === '.' ? null : pkg);
  let cmd = null;
  if (runner === 'vitest') {
    const bin = findLocalBin(root, pkg, 'vitest');
    if (bin) cmd = { args: [bin, 'related', '--run', '--passWithNoTests', ...targets], label: 'vitest related' };
  } else if (runner === 'jest') {
    const bin = findLocalBin(root, pkg, 'jest');
    if (bin) cmd = { args: [bin, '--findRelatedTests', ...targets, '--passWithNoTests'], label: 'jest --findRelatedTests' };
  }
  if (cmd) {
    const res = run(process.execPath, cmd.args, { cwd, timeout });

    return res.code === 0 ? { status: 'pass', label: cmd.label } : { status: 'fail', label: cmd.label, output: clip(res.output) };
  }
  // Other runners (node --test, mocha, ...) cannot select related tests: run only the changed test files.
  const testFiles = targets.filter((f) => TEST_FILE_RE.test(f));
  if (!testFiles.length) return { status: 'skip', label: 'test', output: 'no related-test support for this runner and no test file changed' };
  const plan = resolveCheck(root, pkg, 'test', testFiles);
  if (!plan || plan.skip) return { status: 'skip', label: 'test', output: plan?.skip ?? 'no test script' };
  const res = run(plan.cmd, plan.args, { cwd: plan.cwd, timeout });

  return res.code === 0 ? { status: 'pass', label: plan.label } : { status: 'fail', label: plan.label, output: clip(res.output) };
};

const CHECKS = { lint, typecheck, test: tests };

// files: posix paths relative to root. kinds: subset of ['lint', 'typecheck', 'test'].
// Returns [{ pkg, kind, status: 'pass'|'fail'|'skip', label, output?, note? }].
export const scopedChecks = (root, files, kinds, { deadline = Date.now() + 600_000 } = {}) => {
  const results = [];
  for (const [pkg, pkgFiles] of groupByPackage(root, files)) {
    for (const kind of kinds) {
      const remaining = deadline - Date.now();
      if (remaining < 5_000) {
        results.push({ pkg, kind, status: 'skip', label: kind, output: 'out of time' });
        continue;
      }
      const res = CHECKS[kind](root, pkg, pkgFiles, remaining);
      if (res) results.push({ pkg, kind, ...res });
    }
  }

  return results;
};
