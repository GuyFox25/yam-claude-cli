#!/usr/bin/env node
// Library understanding tools for in-house libraries (and any installed package). Node built-ins only.
// Usage: node .claude/scripts/lib-info.mjs <list | show <lib> | api <lib> | usage <lib> | changes <lib> [fromVersion] | sync-agents>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { projectRoot, toPosix, walkFiles, git } from '../lib/detect.mjs';
import { discoverLibs, describeLib, syncAgents, agentName, LIB_PROMPT } from '../lib/libs.mjs';

const root = projectRoot();
const [cmd, name, arg] = process.argv.slice(2);
const out = (text = '') => process.stdout.write(`${text}\n`);
const fail = (text) => {
  process.stderr.write(`${text}\n`);
  process.exit(1);
};

const rel = (p) => {
  const r = toPosix(relative(root, p));

  return r.startsWith('..') ? toPosix(p) : r;
};

const requireLib = () => {
  if (!name) fail(`Usage: lib-info.mjs ${cmd} <library-name>`);
  const lib = describeLib(root, name);
  if (!lib) fail(`${name} is not installed in this repo (looked in node_modules of the root and each package). Run the install first (needs approval).`);

  return lib;
};

const list = () => {
  const libs = discoverLibs(root);
  if (!libs.length) {
    out(`No in-house libraries found (no installed dependency ships ${LIB_PROMPT}).`);

    return;
  }
  for (const lib of libs) {
    const users = lib.users.map((u) => `${u.owner === '.' ? 'root' : u.owner}@${u.range}`).join(', ');
    out(`${lib.name} ${lib.version}  used by: ${users || '-'}  agent: ${agentName(lib.name)}${lib.linked ? `  linked -> ${toPosix(lib.real)}` : ''}`);
    if (lib.meta.summary) out(`  ${lib.meta.summary}`);
  }
};

const show = () => {
  const lib = requireLib();
  const { json } = lib;
  out(`# ${lib.name} ${lib.version}`);
  out(`path: ${rel(lib.dir)}${lib.linked ? `  (linked local checkout: ${toPosix(lib.real)}; source is editable there, not here)` : ''}`);
  out(`used by: ${lib.users.map((u) => `${u.owner === '.' ? 'root' : u.owner} (${u.range})`).join(', ') || '-'}`);
  out(`entry: main=${json.main ?? '-'} module=${json.module ?? '-'} types=${json.types ?? json.typings ?? '-'}`);
  if (json.exports) out(`exports: ${typeof json.exports === 'string' ? json.exports : Object.keys(json.exports).join(', ')}`);
  if (json.peerDependencies) out(`peerDependencies: ${Object.entries(json.peerDependencies).map(([k, v]) => `${k}@${v}`).join(', ')}`);
  out();
  if (lib.prompt) {
    out(`## ${LIB_PROMPT}`);
    out(lib.prompt.trim());

    return;
  }
  out(`(no ${LIB_PROMPT} in this library; falling back to README. Add one with /lib-doc in the library repo.)`);
  const readme = readdirSync(lib.dir).find((f) => /^readme(\.md)?$/i.test(f));
  if (readme) out(readFileSync(join(lib.dir, readme), 'utf8').split('\n').slice(0, 120).join('\n'));
};

const typesEntry = (lib) => {
  const { json, dir } = lib;
  const dot = typeof json.exports === 'object' ? (json.exports['.'] ?? json.exports) : null;
  const fromExports = dot && typeof dot === 'object' ? (dot.types ?? dot.import?.types ?? dot.require?.types) : null;
  const candidates = [json.types, json.typings, fromExports, json.main?.replace(/\.(c|m)?js$/, '.d.ts'), 'index.d.ts', 'dist/index.d.ts'];
  const hit = candidates.find((c) => typeof c === 'string' && existsSync(join(dir, c)));

  return hit ? join(dir, hit) : null;
};

const resolveDts = (from, spec) => {
  const base = resolve(dirname(from), spec.replace(/\.(c|m)?js$/, ''));
  const hit = [`${base}.d.ts`, `${base}.d.mts`, `${base}.d.cts`, join(base, 'index.d.ts'), base].find((p) => existsSync(p) && p.endsWith('.ts'));

  return hit ?? null;
};

const DECL_RE = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(const|let|function|class|interface|type|enum|namespace)\s+([\w$]+)/;

const api = () => {
  const lib = requireLib();
  const entry = typesEntry(lib);
  if (!entry) fail(`${lib.name}: no type declarations found (types/typings/exports). Read its source or README instead: ${rel(lib.dir)}`);
  const seen = new Set();
  const visit = (file, depth) => {
    if (seen.has(file) || depth > 3) return;
    seen.add(file);
    const symbols = [];
    const follow = [];
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      const decl = line.match(DECL_RE);
      if (decl) symbols.push(`${decl[1]} ${decl[2]}`);
      const named = line.match(/^export\s+(?:type\s+)?\{([^}]*)\}/);
      if (named) named[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((s) => symbols.push(s));
      const star = line.match(/^export\s+\*\s+(?:as\s+(\w+)\s+)?from\s+['"]([^'"]+)['"]/);
      if (star?.[1]) symbols.push(`namespace ${star[1]}`);
      else if (star && star[2].startsWith('.')) follow.push(star[2]);
      if (/^export\s+default\b/.test(line) && !decl) symbols.push('default');
    }
    out(`## ${rel(file)}`);
    out(symbols.length ? symbols.map((s) => `- ${s}`).join('\n') : '- (no direct exports)');
    for (const spec of follow) {
      const next = resolveDts(file, spec);
      if (next) visit(next, depth + 1);
    }
  };
  out(`# ${lib.name} ${lib.version} public API (from type declarations)`);
  visit(entry, 0);
};

const CODE_RE = /\.(m|c)?(j|t)sx?$/;

const usage = () => {
  if (!name) fail('Usage: lib-info.mjs usage <library-name>');
  const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*|^\\s*import\\s+)['"]${esc}(?:/[^'"]*)?['"]`);
  const hits = [];
  for (const file of walkFiles(root, { max: 20_000, filter: (f) => CODE_RE.test(f) })) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
      });
  }
  out(hits.length ? hits.slice(0, 200).join('\n') : `No imports of ${name} in this repo.`);
  if (hits.length > 200) out(`... and ${hits.length - 200} more`);
};

const cmpVersion = (a, b) => {
  const pa = String(a).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];

  return 0;
};

// Version recorded in the committed npm lockfile, to compare against what is installed now.
const committedVersion = (libName) => {
  const lock = git(root, ['show', 'HEAD:package-lock.json']);
  if (!lock) return null;
  try {
    const pkgs = JSON.parse(lock).packages ?? {};
    const key = Object.keys(pkgs).find((k) => k === `node_modules/${libName}` || k.endsWith(`/node_modules/${libName}`));

    return key ? pkgs[key].version : null;
  } catch {
    return null;
  }
};

const changes = () => {
  const lib = requireLib();
  const file = readdirSync(lib.dir).find((f) => /^changelog(\.md)?$/i.test(f));
  if (!file) fail(`${lib.name}: no CHANGELOG in ${rel(lib.dir)}. Check its claude-lib.md "breaking changes" section (lib-info show).`);
  const from = arg ?? committedVersion(lib.name);
  const sections = readFileSync(join(lib.dir, file), 'utf8').split(/\n(?=#{1,3}\s)/);
  const versioned = sections.map((s) => ({ s, v: s.match(/^#{1,3}\s.*?(\d+\.\d+\.\d+)/)?.[1] })).filter((x) => x.v);
  const picked = from && from !== lib.version
    ? versioned.filter((x) => cmpVersion(x.v, from) > 0 && cmpVersion(x.v, lib.version) <= 0)
    : versioned.slice(0, 3);
  out(`# ${lib.name} changelog: ${from && from !== lib.version ? `${from} -> ${lib.version}` : `latest entries (installed ${lib.version})`}`);
  out(picked.length ? picked.map((x) => x.s.trim()).join('\n\n') : '(no matching entries)');
};

const sync = () => {
  const { written, removed } = syncAgents(root);
  if (!written.length && !removed.length) out('Library agents up to date.');
  written.forEach((f) => out(`wrote ${f}`));
  removed.forEach((f) => out(`removed ${f}`));
};

const commands = { list, show, api, usage, changes, 'sync-agents': sync };
if (!commands[cmd]) fail('Usage: lib-info.mjs <list | show <lib> | api <lib> | usage <lib> | changes <lib> [fromVersion] | sync-agents>');
commands[cmd]();
