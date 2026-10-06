#!/usr/bin/env node
// PreToolUse(Read|Edit|Write|MultiEdit): protect secrets (Read: env/secrets, plus whole reads of lockfiles, build output and huge files), lockfiles, applied migrations (Drizzle/Prisma/EF Core), settings,
// installed libraries, and the package boundaries (server has no ORM/SQL and its controllers/routers never call db; client never imports
// server, db or DB drivers; db imports only utils; utils imports nothing internal; Drizzle tables never come from a schema barrel).
// Asks the user first when an edit adds a dependency or turns a class component into a function component.
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { readInput, block, allow, ask } from '../lib/hook-io.mjs';
import { projectRoot, toPosix, resolveInRoot, IS_WIN, LOCKFILES, migrationDirs, isTracked, isEfMigration, pkgJson, packageOf, allDeps, readJson } from '../lib/detect.mjs';
import { resultAfterEdit } from '../lib/apply-edit.mjs';
import { importSpecs } from '../lib/imports.mjs';
import { heavyReason } from '../lib/read-guard.mjs';

const input = await readInput({ strict: true });
const ti = input?.tool_input ?? {};
const filePath = String(ti.file_path ?? '');
if (!filePath) allow();

const root = projectRoot();
const { abs, rel } = resolveInRoot(root, filePath);
// NTFS is case-insensitive: compare lowercased paths on Windows so `.ENV` or `.Claude/Settings.json` cannot slip through.
const fold = (s) => (IS_WIN ? s.toLowerCase() : s);
const relCmp = fold(rel);
const name = basename(rel);
const nameCmp = fold(name);
const isCode = /^\.(m|c)?(j|t)sx?$/.test(extname(nameCmp));
const added = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e?.new_string)].filter((s) => typeof s === 'string').join('\n');

const DATA_MODULES =
  'drizzle-orm|@prisma/client|prisma|@prisma/[\\w-]+|pg|pg-promise|postgres|mysql|mysql2|knex|typeorm|@nestjs/typeorm|@mikro-orm/[\\w-]+|sequelize|sequelize-typescript|kysely|better-sqlite3|sqlite3|@neondatabase/serverless|@vercel/postgres|@planetscale/database|mongoose|@nestjs/mongoose|mongodb|@typegoose/typegoose';
const importOf = (modules) => new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|^\\s*import\\s+)['"](${modules})(?:/[^'"]*)?['"]`, 'm');
const DEP_RE = new RegExp(`"(${DATA_MODULES})"\\s*:`);
// Committed templates that document variables without secrets.
const ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template', '.env.dist']);

const isEnv = nameCmp.startsWith('.env') && !ENV_TEMPLATES.has(nameCmp);
// Read only needs the secrets check (settings can't exempt .env.example from a `.env.*` deny rule, this hook can).
if (input?.tool_name === 'Read') {
  if (isEnv || relCmp.split('/').includes('secrets')) block(`Blocked: ${rel} may contain secrets. Never read it; ask the user for the values you need (or read .env.example).`);
  // A Read with offset/limit is a deliberate partial read, so heavy files are allowed then.
  const heavy = ti.limit == null && ti.offset == null ? heavyReason(abs, relCmp) : null;
  if (heavy) block(`Blocked: ${rel} ${heavy}, so reading it whole wastes context. Use Grep, or Read with offset/limit if you really need it.`);
  allow();
}
if (isEnv) block(`Blocked: ${rel} is an env file. Never edit secrets; ask the user to change it (documenting a variable in .env.example is fine).`);
if (LOCKFILES.includes(nameCmp)) block(`Blocked: ${rel} is a lockfile. Change dependencies through the package manager (the user approves installs).`);
if (relCmp === '.claude/settings.json') block('Blocked: .claude/settings.json is team-managed. Propose the change to the user, or use .claude/settings.local.json.');
// In exported projects .claude/ is managed by the template; only the template repo (which has the marker) edits it.
if (relCmp.startsWith('.claude/') && relCmp !== '.claude/settings.local.json' && !existsSync(join(root, '.claude', 'template-source.md'))) {
  block(`Blocked: ${rel} is managed by the shared Claude template. Change it in the template repo and re-export (export-template.mjs); put project details in the "## Project-specific" section of a CLAUDE.md instead.`);
}

if (relCmp.split('/').includes('node_modules')) {
  const segs = rel.split('/');
  const i = segs.lastIndexOf('node_modules');
  const lib = segs[i + 1]?.startsWith('@') ? segs.slice(i + 1, i + 3).join('/') : segs[i + 1];
  let where = 'in its own repo';
  try {
    const real = realpathSync(join(root, ...segs.slice(0, i + 1), ...lib.split('/')));
    if (!real.split(/[\\/]/).includes('node_modules')) where = `in its linked checkout: ${toPosix(real)}`;
  } catch {
    // not installed yet; keep the generic hint
  }
  block(`Blocked: ${rel} is inside node_modules (library ${lib}). Installed code is overwritten on install; change the library ${where}, publish/link it, then update the dependency.`);
}

const inMigrations = migrationDirs(root).some((dir) => relCmp.startsWith(`${fold(dir)}/`)) || (name.endsWith('.cs') && isEfMigration(root, abs));
if (inMigrations && existsSync(abs) && isTracked(root, rel)) {
  block(`Blocked: ${rel} is an applied (committed) migration. Never edit applied migrations; generate a new migration instead.`);
}

if (relCmp.startsWith('server/')) {
  const match = (isCode ? added.match(importOf(DATA_MODULES)) : null) ?? (name === 'package.json' ? added.match(DEP_RE) : null);
  if (match) {
    block(`Blocked: server/ must not use SQL/ORM/DB drivers (found "${match[1]}"). Data access belongs in db/; call the db API and share types via utils/.`);
  }
}

const specifiers = isCode ? importSpecs(added) : [];
const ownPackage = rel.split('/')[0];

// First specifier that reaches one of `pkgs`: by package name (`db`, `@app/db/x`) or by a relative path that resolves into its folder.
const importOfPackages = (pkgs) => {
  const names = pkgs.map((p) => pkgJson(root, p)?.name).filter(Boolean);

  return specifiers.find((spec) => {
    if (spec.startsWith('.')) {
      const target = packageOf(root, resolve(dirname(abs), spec));

      return target !== ownPackage && pkgs.includes(target);
    }

    return names.some((n) => spec === n || spec.startsWith(`${n}/`));
  });
};

if (relCmp.startsWith('client/') && isCode) {
  const match = importOfPackages(['server', 'db']);
  if (match) {
    block(`Blocked: client/ must not import server or db code (found "${match}"). Call the backend over HTTP and import shared types from utils/.`);
  }
  const driver = added.match(importOf(DATA_MODULES));
  if (driver) block(`Blocked: client/ must not use an ORM or DB driver (found "${driver[1]}"). The client talks to the backend over HTTP only.`);
}

if (relCmp.startsWith('utils/') && isCode) {
  const match = importOfPackages(['client', 'server', 'db']);
  if (match) block(`Blocked: utils/ must not import other packages of this repo (found "${match}"). utils is the shared base that every package depends on.`);
}

if (relCmp.startsWith('db/') && isCode) {
  const match = importOfPackages(['client', 'server']);
  if (match) block(`Blocked: db/ may import only utils/ (found "${match}"). Move shared types and schemas to utils/.`);
}

// Every controller/router goes through a service (backend.md), so only services may import the db API.
const isHttpLayer = /\.(controller|routes?|router)\.[cm]?[jt]sx?$/.test(nameCmp) || /\/(routes|routers|controllers)\//.test(relCmp);
if (relCmp.startsWith('server/') && isCode && isHttpLayer) {
  const match = importOfPackages(['db']);
  if (match) {
    block(`Blocked: ${rel} is a controller/router and imports the db API directly (found "${match}"). Call a service (<feature>.service.ts) and let the service call db.`);
  }
}

// Drizzle tables are imported from their own file (code-style.md), never from the schema barrel.
const usesDrizzle = ['db', 'utils', 'server', '.'].some((p) => 'drizzle-orm' in allDeps(p === '.' ? readJson(join(root, 'package.json')) : pkgJson(root, p)));
if (usesDrizzle && isCode && /^(db|server|utils)\//.test(relCmp)) {
  const internal = ['utils', 'db'].map((p) => pkgJson(root, p)?.name).filter(Boolean);
  const isProjectPath = (spec) => /^(\.|@\/|~\/|#)/.test(spec) || internal.some((n) => spec.startsWith(`${n}/`));
  const barrel = specifiers.find((spec) => isProjectPath(spec) && /(^|\/)schema(\/index)?(\.[cm]?[jt]s)?$/.test(spec));
  if (barrel) {
    block(`Blocked: "${barrel}" is the Drizzle schema barrel. Import each table from its own file: ../schema/<table> in db, <utils package>/schema/<table> from utils (add the subpath to utils' exports if it's missing).`);
  }
}

// Asks: never on unparseable edits, and only after every hard block above has passed.
const CLASS_RE = /\bextends\s+(React\.)?(Pure)?Component\b/;
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const depNames = (text) => {
  try {
    const json = JSON.parse(text || '{}');

    return new Set(DEP_FIELDS.flatMap((f) => Object.keys(json?.[f] ?? {})));
  } catch {
    return null;
  }
};

if (relCmp.startsWith('client/') && isCode && existsSync(abs)) {
  const result = resultAfterEdit(abs, input?.tool_name, ti);
  if (result && CLASS_RE.test(result.before) && !CLASS_RE.test(result.after)) {
    ask(`${rel} is a class component and this edit removes the class. Existing class components stay classes unless the user asked to convert them (.claude/rules/react.md).`);
  }
}

if (name === 'package.json') {
  const result = resultAfterEdit(abs, input?.tool_name, ti);
  const before = result && depNames(result.before);
  const after = result && depNames(result.after);
  const addedDeps = before && after ? [...after].filter((d) => !before.has(d)) : [];
  if (addedDeps.length) {
    ask(`This edit adds ${addedDeps.length === 1 ? 'a dependency' : 'dependencies'} to ${rel}: ${addedDeps.join(', ')}. New dependencies need the user's approval (.claude/rules/code-style.md), and the lockfile changes only through the package manager.`);
  }
}

allow();
