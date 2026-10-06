#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): after a change to a utils module, tell Claude which db/server/client files use it,
// so the change is followed through every package (CLAUDE.md boundary rule 5). Once per file per session; never blocks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, advise, allow } from '../lib/hook-io.mjs';
import { projectRoot, resolveInRoot, existingPackages, pkgJson, walkFiles, toPosix, IS_WIN } from '../lib/detect.mjs';
import { importSpecs, moduleId, resolvesTo } from '../lib/imports.mjs';
import { markOnce } from '../lib/edits.mjs';

const MAX_LISTED = 10;
const CODE_RE = /\.[cm]?[jt]sx?$/i;
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//i;

const input = await readInput();
const filePath = String(input?.tool_input?.file_path ?? '');
if (!filePath) allow();

const root = projectRoot();
const { abs, rel } = resolveInRoot(root, filePath);
if (!rel.startsWith('utils/') || !CODE_RE.test(rel) || TEST_RE.test(rel) || rel.endsWith('.d.ts')) allow();
if (!markOnce(root, input?.session_id, `ripple:${rel}`)) allow();

const utilsDir = join(root, 'utils');
const utilsName = pkgJson(root, 'utils')?.name;
const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

// The edited module as a package subpath: utils/src/schemas/user.ts -> schemas/user (and src/schemas/user).
const target = moduleId(abs);
const inUtils = target.slice(moduleId(utilsDir).length + 1);
const subpaths = new Set([inUtils, inUtils.replace(/^(src|lib)\//, '')]);

// Imports through the package entry count when the entry re-exports this module (one level deep).
const entries = walkFiles(utilsDir, { maxDepth: 1, filter: (f) => /(^|[\\/])index\.[cm]?[jt]s$/.test(f) });
const reExported = entries.some((entry) => importSpecs(read(entry)).some((spec) => resolvesTo(entry, spec, abs)));

const importsTarget = (file, spec) => {
  if (spec.startsWith('.')) return resolvesTo(file, spec, abs);
  if (!utilsName || !(spec === utilsName || spec.startsWith(`${utilsName}/`))) return false;
  const sub = spec.slice(utilsName.length + 1);
  const subId = sub.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '');

  // moduleId case-folds on Windows, so the subpath is folded the same way.
  return sub ? subpaths.has(IS_WIN ? subId.toLowerCase() : subId) : reExported;
};

const dependents = [];
const touched = [];
for (const pkg of existingPackages(root).filter((p) => p !== 'utils')) {
  touched.push(pkg);
  for (const file of walkFiles(join(root, pkg), { filter: (f) => CODE_RE.test(f) })) {
    if (importSpecs(read(file)).some((spec) => importsTarget(file, spec))) dependents.push(toPosix(file.slice(root.length + 1)));
  }
}
if (!touched.length) allow();

const listed = dependents.slice(0, MAX_LISTED).join(', ');
const more = dependents.length > MAX_LISTED ? ` (+${dependents.length - MAX_LISTED} more)` : '';
const users = dependents.length ? `It is imported by: ${listed}${more}.` : `No direct importers found, but ${touched.join(', ')} may use it through the utils entry.`;
advise(
  'PostToolUse',
  `${rel} changed (utils is the shared contract). ${users} Update the db queries, server routes/services and client callers that depend on it, then run \`node .claude/scripts/check.mjs typecheck --changed\`.`,
);
