#!/usr/bin/env node
// PreToolUse(Read|Edit|Write|MultiEdit): protect secrets (Read: env/secrets only), lockfiles, applied migrations (Drizzle/Prisma/EF Core), settings,
// installed libraries, and the package boundaries (server has no ORM/SQL; client never imports server, db or DB drivers).
import { existsSync, realpathSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { readInput, block, allow } from '../lib/hook-io.mjs';
import { projectRoot, toPosix, resolveInRoot, IS_WIN, LOCKFILES, migrationDirs, isTracked, isEfMigration, pkgJson } from '../lib/detect.mjs';

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

if (relCmp.startsWith('client/') && isCode) {
  const pkgNames = ['server', 'db'].map((p) => pkgJson(root, p)?.name).filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  // '../../db', '../../db/index' and '../server/src/x' alike (index imports have no trailing segment).
  const upward = added.match(/['"]((?:\.\.\/)+(?:server|db)(?:\/[^'"]*)?)['"]/);
  const named = pkgNames.length ? added.match(importOf(pkgNames.join('|'))) : null;
  const match = upward ?? named;
  if (match) {
    block(`Blocked: client/ must not import server or db code (found "${match[1]}"). Call the backend over HTTP and import shared types from utils/.`);
  }
  const driver = added.match(importOf(DATA_MODULES));
  if (driver) block(`Blocked: client/ must not use an ORM or DB driver (found "${driver[1]}"). The client talks to the backend over HTTP only.`);
}

allow();
