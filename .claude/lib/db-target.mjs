// Which database hosts a migrate/seed command would reach. Reads env files and appsettings privately:
// callers only get host names to classify, and must never print them (they may be internal servers).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { walkFiles } from './detect.mjs';

const DEFAULT_VARS = ['DATABASE_URL', 'DB_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DIRECT_URL', 'MONGODB_URI', 'MONGO_URL', 'MONGO_URI', 'PGHOST', 'DB_HOST'];
// Production/staging files are never what a local migrate loads.
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local'];
const ENV_DIRS = ['db', 'server', '.'];
// `.` and `(local)` are SQL Server's shorthands for the local default instance.
const LOCAL = /^(localhost|127(\.\d+){3}|::1|\[::1\]|0\.0\.0\.0|host\.docker\.internal|\.|\(local\))$/i;

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

// Variable names the ORM config actually reads: env("X") in schema.prisma, process.env.X in drizzle.config.*.
const configVars = (root) => {
  const names = new Set();
  for (const dir of ['db', '.', 'prisma', 'db/prisma']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const file of readdirSync(base)) {
      if (!/^(schema\.prisma|drizzle\.config\.[cm]?[jt]s)$/.test(file)) continue;
      for (const m of readText(join(base, file)).matchAll(/\benv\(\s*["'](\w+)["']\s*\)|process\.env\.(\w+)|process\.env\[\s*["'](\w+)["']\s*\]/g)) {
        names.add(m[1] ?? m[2] ?? m[3]);
      }
    }
  }

  return names;
};

const parseEnv = (text) => {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }

  return vars;
};

// Host of a URL (postgres://u:p@host:5432/db, mongodb+srv://...), a key=value connection string, or a bare host.
export const hostOf = (value) => {
  const v = String(value ?? '').trim();
  if (!v || v.includes('${')) return null;
  if (/^[a-z][\w+.-]*:\/\//i.test(v)) {
    // Mongo seed lists (host1,host2) are not valid URLs: take the first host.
    const authority = v.replace(/^[a-z][\w+.-]*:\/\//i, '').split(/[/?#]/)[0];
    const hostPart = authority.slice(authority.lastIndexOf('@') + 1).split(',')[0];

    return hostPart.startsWith('[') ? hostPart.slice(0, hostPart.indexOf(']') + 1) : hostPart.split(':')[0] || null;
  }
  const kv = v.match(/(?:^|;)\s*(?:host|server|data source|address|addr)\s*=\s*([^;]+)/i);
  if (kv) return kv[1].trim().replace(/^tcp:/i, '').split(/[,\\]/)[0].trim().replace(/^\(localdb\)$/i, 'localhost');
  if (/^[\w.-]+$/.test(v)) return v;

  return null;
};

export const isLocalHost = (host, extra = process.env.CLAUDE_LOCAL_DB_HOSTS) => {
  const allowed = String(extra ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

  return LOCAL.test(host) || /^\(localdb\)/i.test(host) || allowed.includes(host.toLowerCase());
};

const inlineVars = (command) => {
  const vars = {};
  for (const m of command.matchAll(/(?:^|[\s;&|])([A-Z_][A-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/g)) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');

  return vars;
};

const appsettingsHosts = (root) => {
  const files = walkFiles(root, { maxDepth: 4, max: 20000, filter: (f) => /[\\/]appsettings(\.Development)?\.json$/i.test(f) });
  const hosts = [];
  for (const file of files) {
    try {
      const json = JSON.parse(readText(file).replace(/^﻿/, ''));
      for (const value of Object.values(json?.ConnectionStrings ?? {})) {
        const host = hostOf(value);
        if (host) hosts.push(host);
      }
    } catch {
      // comments or invalid JSON: nothing to learn
    }
  }

  return hosts;
};

// Env files named in the command or the scripts it runs (dotenv -e .env.production, --env-file=.env.staging, ...).
const referencedEnvFiles = (text) => [...String(text).matchAll(/(?:^|[\s='"])((?:[\w.-]+\/)*\.env(?:\.[\w-]+)*)(?=$|[\s'"])/g)].map((m) => m[1]);

// Returns the database hosts the command would use (empty when none could be determined).
// An inline VAR=... prefix overrides only that variable: the ORM may read others too (Prisma's directUrl, for one).
// process.env, the dev env files, env files the command/scripts name (`scriptText`) and (for dotnet ef) appsettings all count.
export const dbHosts = (root, command, { dotnet = false, scriptText = '' } = {}) => {
  const names = [...new Set([...DEFAULT_VARS, ...configVars(root)])];
  const inline = inlineVars(command);
  const fromEnv = names.filter((n) => !(n in inline));
  const pick = (vars, keys) => keys.map((n) => hostOf(vars[n])).filter(Boolean);
  const hosts = [...pick(inline, names.filter((n) => n in inline)), ...pick(process.env, fromEnv)];
  const files = new Set([...ENV_FILES, ...referencedEnvFiles(`${command} ${scriptText}`)]);
  for (const dir of ENV_DIRS) for (const file of files) hosts.push(...pick(parseEnv(readText(join(root, dir, file))), fromEnv));
  if (dotnet) hosts.push(...appsettingsHosts(root));

  return [...new Set(hosts)];
};
