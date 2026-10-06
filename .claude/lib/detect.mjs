// Runtime detection of the project's stack. Node built-ins only.
// Everything project-specific is discovered here so the rest of .claude/ stays generic.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

export const PACKAGES = ['client', 'server', 'db', 'utils'];

export const SCRIPT_CANDIDATES = {
  test: ['test', 'test:unit'],
  lint: ['lint'],
  typecheck: ['typecheck', 'type-check', 'check-types', 'tsc'],
  migrate: ['db:migrate', 'migrate', 'migration:run', 'prisma:migrate'],
  seed: ['db:seed', 'seed', 'prisma:seed'],
};

export const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'packages.lock.json',
];

export const DOTNET_FILE_RE = /\.(cs|csproj|sln|slnx|razor|cshtml|props|targets)$/i;
const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', 'dist', 'build', 'coverage', 'out']);

export const projectRoot = () => resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

export const toPosix = (p) => p.split('\\').join('/');

export const IS_WIN = process.platform === 'win32';

const realOrSelf = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
};

// Realpath of the nearest existing ancestor, with the missing tail re-appended (for files about to be created).
const realpathLoose = (p) => {
  const tail = [];
  let cur = p;
  while (!existsSync(cur) && dirname(cur) !== cur) {
    tail.unshift(basename(cur));
    cur = dirname(cur);
  }

  return join(realOrSelf(cur), ...tail);
};

// Resolve a tool's file_path against the project root. MSYS-style /c/... paths, relative paths and
// junction/subst/symlinked roots all map to the same posix `rel`; rel starts with '..' when outside the repo.
export const resolveInRoot = (root, filePath) => {
  const native = IS_WIN && /^\/[a-zA-Z]\//.test(filePath) ? `${filePath[1]}:${filePath.slice(2)}` : filePath;
  const abs = resolve(root, native);
  let rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) rel = relative(realOrSelf(root), realpathLoose(abs));

  return { abs, rel: toPosix(rel) };
};

export const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

export const pkgJson = (root, pkg) => readJson(join(root, pkg, 'package.json'));

export const existingPackages = (root) => PACKAGES.filter((p) => existsSync(join(root, p, 'package.json')));

export const allDeps = (json) => ({
  ...(json?.dependencies ?? {}),
  ...(json?.devDependencies ?? {}),
  ...(json?.peerDependencies ?? {}),
});

const hasDep = (root, pkgs, names) =>
  pkgs.some((p) => {
    const deps = allDeps(p === '.' ? readJson(join(root, 'package.json')) : pkgJson(root, p));

    return names.some((n) => n in deps);
  });

export const detectPackageManager = (root) => {
  if (existsSync(join(root, 'pnpm-lock.yaml')) || existsSync(join(root, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  const field = readJson(join(root, 'package.json'))?.packageManager;
  if (typeof field === 'string') return field.split('@')[0];

  return 'npm';
};

export const detectFramework = (root, pkg = 'server') => {
  if (hasDep(root, [pkg], ['@nestjs/core'])) return 'nestjs';
  if (hasDep(root, [pkg], ['express'])) return 'express';

  return null;
};

// Files under dir up to maxDepth levels deep, skipping dependency/build/hidden folders. Capped at max.
export const walkFiles = (dir, { maxDepth = 8, max = 5000, filter = () => true } = {}) => {
  const out = [];
  const walk = (d, depth) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) return;
      const full = join(d, e.name);
      if (e.isFile() && filter(full)) out.push(full);
      else if (e.isDirectory() && depth < maxDepth && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(full, depth + 1);
    }
  };
  walk(dir, 0);

  return out;
};

const dotnetCache = new Map();

// The .NET solution (or project) of the repo: a *.sln wins over a *.csproj, shallowest first. Null if none.
export const dotnetProject = (root) => {
  if (dotnetCache.has(root)) return dotnetCache.get(root);
  // depth 3 catches csproj-only layouts such as server/src/Api/Api.csproj.
  const files = walkFiles(root, { maxDepth: 3, filter: (f) => /\.(sln|slnx|csproj)$/i.test(f) });
  const depth = (f) => toPosix(relative(root, f)).split('/').length;
  const pick = (re) => files.filter((f) => re.test(f)).sort((a, b) => depth(a) - depth(b))[0];
  const file = pick(/\.slnx?$/i) ?? pick(/\.csproj$/i);
  const result = file ? { file, dir: dirname(file), rel: toPosix(relative(root, file)) } : null;
  dotnetCache.set(root, result);

  return result;
};

// 'nestjs' | 'express' | 'node' (server/ without a known framework) | 'dotnet' | 'external' (no backend in the repo, e.g. SAP OData).
export const detectBackend = (root) => {
  const node = existsSync(join(root, 'server', 'package.json'));
  if (node) return detectFramework(root) ?? 'node';
  if (dotnetProject(root)) return 'dotnet';

  return 'external';
};

// { lang: 'ts' | 'js', classComponents } for client/, or null when there is no client package.
export const detectClient = (root) => {
  const json = pkgJson(root, 'client');
  if (!json) return null;
  const files = walkFiles(join(root, 'client', 'src'), { max: 400, filter: (f) => /\.(jsx?|tsx?)$/.test(f) });
  // Not the `typescript` dependency: legacy JS apps often have it as a devDep (eslint parser, IDE support).
  const ts = existsSync(join(root, 'client', 'tsconfig.json')) || files.some((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'));
  const classComponents = files.some((f) => /\bextends\s+(React\.)?(Pure)?Component\b/.test(readFileSync(f, 'utf8')));

  return { lang: ts ? 'ts' : 'js', classComponents };
};

// The client's form and server-state libraries, from its dependencies: { forms, data } (null entries when none).
// forms: react-hook-form+zod | react-hook-form+yup | react-hook-form | formik. data: in-house query libs first, then the rest.
export const detectClientLibs = (root) => {
  const json = pkgJson(root, 'client');
  if (!json) return null;
  const deps = allDeps(json);
  const schema = ['zod', 'yup'].filter((n) => n in deps).join('+');
  const forms = 'react-hook-form' in deps ? `react-hook-form${schema ? `+${schema}` : ''}` : 'formik' in deps ? 'formik' : null;
  const inHouse = Object.keys(deps).filter((n) => /^(@[\w-]+\/)?(yam-lib|mador-yam-[\w-]+)$/.test(n));
  const known = ['@tanstack/react-query', 'react-query', 'swr', '@reduxjs/toolkit', 'redux'].filter((n) => n in deps);
  const data = [...inHouse, ...known];

  return { forms, data: data.length ? data.join(',') : null };
};

// flat | eslintrc | null for a package (its own config, else the root's). Its rules win over .claude/rules.
export const detectEslintConfig = (root, pkg) => {
  for (const dir of [join(root, pkg), root]) {
    const files = existsSync(dir) ? readdirSync(dir) : [];
    if (files.some((f) => /^eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/.test(f))) return 'flat';
    if (files.some((f) => /^\.eslintrc(\.(js|cjs|json|yaml|yml))?$/.test(f)) || readJson(join(dir, 'package.json'))?.eslintConfig) return 'eslintrc';
  }

  return null;
};

// xunit | nunit | mstest, from PackageReference entries in the solution's csproj files.
export const detectDotnetTestFramework = (root) => {
  const dn = dotnetProject(root);
  if (!dn) return null;
  const refs = walkFiles(dn.dir, { maxDepth: 3, filter: (f) => /\.csproj$/i.test(f) })
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  if (/Include="xunit/i.test(refs)) return 'xunit';
  if (/Include="NUnit/i.test(refs)) return 'nunit';
  if (/Include="MSTest/i.test(refs)) return 'mstest';

  return null;
};

// Check target for the .NET backend: 'server' unless server/ is a Node package, then 'dotnet'.
export const dotnetTarget = (root) => {
  if (!dotnetProject(root)) return null;

  return existsSync(join(root, 'server', 'package.json')) ? 'dotnet' : 'server';
};

// Node packages plus the .NET backend target, if any.
export const existingTargets = (root) => {
  const targets = existingPackages(root);
  const dn = dotnetTarget(root);

  return dn && !targets.includes(dn) ? [...targets, dn] : targets;
};

export const commandExists = (cmd) => spawnSync(cmd, ['--version'], { shell: process.platform === 'win32', stdio: 'ignore', timeout: 20_000 }).status === 0;

// EF Core migration file: inside a Migrations/ folder that holds a *ModelSnapshot.cs.
export const isEfMigration = (root, abs) => {
  let dir = dirname(abs);
  // relative() (not startsWith) so drive-letter case and separators do not matter on Windows.
  const inside = (d) => {
    const r = relative(root, d);

    return r !== '' && !r.startsWith('..') && !isAbsolute(r);
  };
  while (inside(dir)) {
    if (basename(dir) === 'Migrations') {
      try {
        if (readdirSync(dir).some((f) => f.endsWith('ModelSnapshot.cs'))) return true;
      } catch {
        // folder may not exist yet for a new file
      }
    }
    dir = dirname(dir);
  }

  return false;
};

export const detectOrm = (root) => {
  const scope = ['db', '.'];
  if (hasDep(root, scope, ['drizzle-orm', 'drizzle-kit'])) return 'drizzle';
  if (hasDep(root, scope, ['prisma', '@prisma/client'])) return 'prisma';
  if (hasDep(root, scope, ['mongoose'])) return 'mongoose';
  if (hasDep(root, scope, ['mongodb'])) return 'mongodb-driver';

  return null;
};

// Config files (drizzle.config.*, migrate-mongo-config.*, schema.prisma) in db/ and the root, as [dir, file] pairs.
const configFiles = (root, re) =>
  ['db', '.', 'db/prisma', 'prisma'].flatMap((base) => {
    const dir = join(root, base);
    try {
      return readdirSync(dir).filter((f) => re.test(f)).map((f) => [dir, f]);
    } catch {
      return [];
    }
  });

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const ENGINE_ALIASES = { postgres: 'postgresql', pg: 'postgresql', postgresql: 'postgresql', mysql: 'mysql', sqlite: 'sqlite', mongodb: 'mongodb', sqlserver: 'mssql', mssql: 'mssql', turso: 'sqlite', singlestore: 'mysql' };

// postgresql | mysql | sqlite | mongodb | mssql | null. Config wins over dependencies; .NET providers are checked last.
export const detectDbEngine = (root) => {
  for (const [dir, file] of configFiles(root, /^drizzle\.config\.(ts|js|mjs|cjs|json)$/)) {
    const dialect = readText(join(dir, file)).match(/\bdialect\s*:\s*['"`](\w+)['"`]/)?.[1];
    if (dialect && ENGINE_ALIASES[dialect]) return ENGINE_ALIASES[dialect];
  }
  for (const [dir, file] of configFiles(root, /^schema\.prisma$/)) {
    const provider = readText(join(dir, file)).match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/)?.[1];
    if (provider && ENGINE_ALIASES[provider]) return ENGINE_ALIASES[provider];
  }
  const scope = ['db', '.', 'server'];
  if (hasDep(root, scope, ['mongoose', 'mongodb'])) return 'mongodb';
  if (hasDep(root, scope, ['pg', 'postgres', 'pg-promise', '@neondatabase/serverless', '@vercel/postgres'])) return 'postgresql';
  if (hasDep(root, scope, ['mysql2', 'mysql', '@planetscale/database'])) return 'mysql';
  if (hasDep(root, scope, ['better-sqlite3', 'sqlite3', '@libsql/client'])) return 'sqlite';
  const dn = dotnetProject(root);
  if (dn) {
    const refs = walkFiles(dn.dir, { maxDepth: 3, filter: (f) => /\.csproj$/i.test(f) })
      .map(readText)
      .join('\n');
    if (/Include="Npgsql/i.test(refs)) return 'postgresql';
    if (/Include="MongoDB\.Driver/i.test(refs)) return 'mongodb';
    if (/Include="Microsoft\.EntityFrameworkCore\.SqlServer|Include="Microsoft\.Data\.SqlClient|Include="System\.Data\.SqlClient/i.test(refs)) return 'mssql';
    if (/Include="(Pomelo\.EntityFrameworkCore\.MySql|MySql)/i.test(refs)) return 'mysql';
    if (/Include="Microsoft\.EntityFrameworkCore\.Sqlite/i.test(refs)) return 'sqlite';
  }

  return null;
};

export const detectTestRunner = (root, pkg) => {
  const scope = pkg ? [pkg, '.'] : [...PACKAGES, '.'];
  if (hasDep(root, scope, ['vitest'])) return 'vitest';
  if (hasDep(root, scope, ['jest', 'ts-jest', '@swc/jest'])) return 'jest';

  return null;
};

export const findScript = (json, kind) => {
  const scripts = json?.scripts ?? {};

  return (SCRIPT_CANDIDATES[kind] ?? [kind]).find((name) => name in scripts) ?? null;
};

// Directories (posix, relative to root) that may hold migrations.
export const migrationDirs = (root) => {
  const dirs = new Set(['db/drizzle', 'db/migrations', 'db/src/migrations', 'db/prisma/migrations', 'prisma/migrations', 'drizzle']);
  for (const base of ['db', '.']) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!/^drizzle\.config\.(ts|js|mjs|cjs|json)$/.test(file)) continue;
      const match = readFileSync(join(dir, file), 'utf8').match(/\bout\s*:\s*['"`]([^'"`]+)['"`]/);
      if (match) dirs.add(toPosix(relative(root, resolve(dir, match[1]))));
    }
  }
  // migrate-mongo: migrationsDir in migrate-mongo-config.*, relative to that config file.
  for (const [dir, file] of configFiles(root, /^migrate-mongo-config\.(js|cjs|mjs|ts)$/)) {
    const match = readText(join(dir, file)).match(/\bmigrationsDir\s*:\s*['"`]([^'"`]+)['"`]/);
    if (match) dirs.add(toPosix(relative(root, resolve(dir, match[1]))));
  }

  return [...dirs];
};

export const packageOf = (root, file) => {
  const abs = isAbsolute(file) ? file : join(root, file);
  const rel = toPosix(relative(root, abs));
  const first = rel.split('/')[0];
  if (DOTNET_FILE_RE.test(rel)) {
    const dn = dotnetProject(root);
    if (dn && !relative(dn.dir, abs).startsWith('..')) return dotnetTarget(root);
  }

  return PACKAGES.includes(first) ? first : null;
};

// Resolve a locally installed CLI to its JS entry so it runs via node, no shell needed.
export const findLocalBin = (root, pkg, depName, binName = depName) => {
  const dirs = pkg && pkg !== '.' ? [join(root, pkg), root] : [root];
  for (const dir of dirs) {
    const base = join(dir, 'node_modules', depName);
    const json = readJson(join(base, 'package.json'));
    if (!json?.bin) continue;
    const bin = typeof json.bin === 'string' ? json.bin : json.bin[binName];
    if (bin && existsSync(join(base, bin))) return join(base, bin);
  }

  return null;
};

// Major version of a locally installed tool (same lookup order as findLocalBin), or 0 if unknown.
export const localMajor = (root, pkg, depName) => {
  const dirs = pkg && pkg !== '.' ? [join(root, pkg), root] : [root];
  for (const dir of dirs) {
    const version = readJson(join(dir, 'node_modules', depName, 'package.json'))?.version;
    if (version) return Number.parseInt(version, 10) || 0;
  }

  return 0;
};

const quote = (arg) => (/^[\w./:=@+-]+$/.test(arg) ? arg : `"${String(arg).replace(/"/g, '\\"')}"`);

// Run a command, capture output. Package-manager shims need a shell on Windows.
export const run = (cmd, args, { cwd, timeout = 170_000, inherit = false } = {}) => {
  const useShell = process.platform === 'win32' && cmd !== process.execPath;
  const res = spawnSync(useShell ? quote(cmd) : cmd, useShell ? args.map(quote) : args, {
    cwd,
    timeout,
    shell: useShell,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });

  return {
    code: res.status ?? (res.error ? 1 : 0),
    output: `${res.stdout ?? ''}${res.stderr ?? ''}${res.error ? String(res.error) : ''}`.trim(),
  };
};

const DOTNET_ARGS = {
  typecheck: ['build', '--no-restore', '-nologo', '-clp:ErrorsOnly', '-v', 'q'],
  test: ['test', '--no-restore', '-nologo'],
  lint: ['format', '--verify-no-changes', '--no-restore'],
};

// How to run a check (test | lint | typecheck) for one package ('.' = root).
// Null when nothing applies; { skip } when it applies but cannot run here.
export const resolveCheck = (root, pkg, kind, extra = []) => {
  if (pkg === dotnetTarget(root)) {
    const dn = dotnetProject(root);
    if (!commandExists('dotnet')) return { skip: 'dotnet SDK not on PATH' };
    const [verb, ...flags] = DOTNET_ARGS[kind];

    return { cmd: 'dotnet', args: [verb, dn.file, ...flags, ...extra], cwd: dn.dir, label: `dotnet ${verb} ${dn.rel}` };
  }
  const cwd = pkg === '.' ? root : join(root, pkg);
  const json = readJson(join(cwd, 'package.json'));
  const script = findScript(json, kind);
  if (script) {
    const pm = detectPackageManager(root);
    const sep = pm === 'npm' && extra.length ? ['--'] : [];

    return { cmd: pm, args: ['run', script, ...sep, ...extra], cwd, label: `${pm} run ${script}` };
  }
  if (kind === 'typecheck' && existsSync(join(cwd, 'tsconfig.json'))) {
    const tsc = findLocalBin(root, pkg, 'typescript', 'tsc');
    if (tsc) return { cmd: process.execPath, args: [tsc, '--noEmit', '-p', cwd], cwd, label: 'tsc --noEmit' };
  }

  return null;
};

export const git = (root, args) => {
  const res = spawnSync('git', args, { cwd: root, encoding: 'utf8' });

  return res.status === 0 ? res.stdout : '';
};

// Uncommitted files (staged, unstaged, untracked), posix paths relative to root.
export const changedFiles = (root) =>
  git(root, ['status', '--porcelain=v1', '-uall'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''));

export const isTracked = (root, rel) => git(root, ['ls-files', '--', rel]).trim() !== '';

export const defaultBranch = (root) =>
  ['main', 'master', 'origin/main', 'origin/master'].find((b) => git(root, ['rev-parse', '--verify', '--quiet', b]).trim()) ?? null;
