#!/usr/bin/env node
// Usage: node .claude/scripts/export-template.mjs <project-dir> [--dry-run]
// Copies this template into a project, or updates a project exported earlier:
// - .claude/: replaced with the template's files. Not copied: template-source.md (so .claude/ is protected in the
//   project), settings.local.json, generated lib-* agents, hook tests, this script. Template files removed since the
//   last export are deleted again (tracked in .claude/template-manifest.json).
// - CLAUDE.md (root, plus client/server/db/utils if that folder exists in the project): template part replaced,
//   the project's "## Project-specific" section kept. Existing content without that heading is moved under it.
// - .gitignore: missing template lines appended. CODEOWNERS: copied only if the project has none.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGES, toPosix, git } from '../lib/detect.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKER = '.claude/template-source.md';
const MANIFEST = '.claude/template-manifest.json';
const SECTION = /^## Project-specific[^\n]*$/m;
const EXCLUDE = [
  /^\.claude\/template-source\.md$/,
  /^\.claude\/template-manifest\.json$/,
  /^\.claude\/settings\.local\.json$/,
  /^\.claude\/agents\/lib-[^/]*\.md$/,
  /(^|\/)__tests__\//,
  /^\.claude\/scripts\/export-template\.mjs$/,
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const target = args.find((a) => !a.startsWith('--'));

const fail = (message) => {
  process.stderr.write(`[export] ${message}\n`);
  process.exit(1);
};

if (!target) fail('Usage: export-template.mjs <project-dir> [--dry-run]');
if (!existsSync(join(SRC, MARKER))) fail(`${SRC} is not the template repo (no ${MARKER}).`);
const DEST = resolve(target);
if (!existsSync(DEST) || !statSync(DEST).isDirectory()) fail(`${DEST} is not a directory.`);
if (DEST === SRC) fail('The target is the template repo itself.');
if (existsSync(join(DEST, MARKER))) fail(`${DEST} has ${MARKER}; it looks like a template repo, not a project.`);

const actions = [];
const write = (rel, content) => {
  actions.push(`write  ${rel}`);
  if (dryRun) return;
  mkdirSync(dirname(join(DEST, rel)), { recursive: true });
  writeFileSync(join(DEST, rel), content);
};

// Template files under .claude/ (posix, relative to the template root).
const listFiles = (dir) =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;

    return e.isDirectory() ? listFiles(rel) : [rel];
  });
const claudeFiles = listFiles('.claude').filter((rel) => !EXCLUDE.some((re) => re.test(rel)));

// 1. .claude/
for (const rel of claudeFiles) {
  actions.push(`copy   ${rel}`);
  if (dryRun) continue;
  mkdirSync(dirname(join(DEST, rel)), { recursive: true });
  copyFileSync(join(SRC, rel), join(DEST, rel));
}
let previous = [];
try {
  previous = JSON.parse(readFileSync(join(DEST, MANIFEST), 'utf8')).files ?? [];
} catch {
  // first export
}
for (const rel of previous.filter((f) => !claudeFiles.includes(f) && f.startsWith('.claude/'))) {
  actions.push(`delete ${rel} (removed from the template)`);
  if (!dryRun) rmSync(join(DEST, rel), { force: true });
}
const version = git(SRC, ['rev-parse', '--short', 'HEAD']).trim() || 'uncommitted';
write(MANIFEST, `${JSON.stringify({ template: version, exportedAt: new Date().toISOString(), files: claudeFiles }, null, 2)}\n`);

// 2. CLAUDE.md files
const notes = [];
const mergeClaudeMd = (rel) => {
  const template = readFileSync(join(SRC, rel), 'utf8');
  const cut = template.search(SECTION);
  if (cut === -1) fail(`${rel} in the template has no "## Project-specific" heading.`);
  const destPath = join(DEST, rel);
  if (!existsSync(destPath)) return write(rel, template);
  const existing = readFileSync(destPath, 'utf8');
  const at = existing.search(SECTION);
  if (at !== -1) return write(rel, template.slice(0, cut) + existing.slice(at));
  notes.push(`${rel}: existing content had no "## Project-specific" heading; it was moved under it. Review it.`);

  return write(rel, `${template.slice(0, cut)}## Project-specific\n\n${existing.trim()}\n`);
};
mergeClaudeMd('CLAUDE.md');
for (const pkg of PACKAGES) {
  if (existsSync(join(DEST, pkg))) mergeClaudeMd(`${pkg}/CLAUDE.md`);
  else notes.push(`${pkg}/ does not exist in the project: ${pkg}/CLAUDE.md skipped.`);
}

// 3. .gitignore (append missing lines) and CODEOWNERS (only if absent)
const templateIgnore = readFileSync(join(SRC, '.gitignore'), 'utf8').split(/\r?\n/);
const destIgnore = existsSync(join(DEST, '.gitignore')) ? readFileSync(join(DEST, '.gitignore'), 'utf8') : '';
const have = new Set(destIgnore.split(/\r?\n/).map((l) => l.trim()));
const missing = templateIgnore.filter((l) => l.trim() && !l.startsWith('#') && !have.has(l.trim()));
if (missing.length) write('.gitignore', `${destIgnore.replace(/\s*$/, '\n')}\n# Claude Code template\n${missing.join('\n')}\n`);
const owners = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
if (!owners.some((f) => existsSync(join(DEST, f)))) write('CODEOWNERS', readFileSync(join(SRC, 'CODEOWNERS'), 'utf8'));
else notes.push('CODEOWNERS exists: add the .claude/ and CLAUDE.md owners to it yourself if needed.');

process.stdout.write(
  `${dryRun ? '[export] DRY RUN, nothing written\n' : ''}[export] template ${version} -> ${toPosix(DEST)}\n` +
    `${actions.filter((a) => !a.startsWith('copy')).map((a) => `  ${a}`).join('\n')}\n` +
    `  copied ${claudeFiles.length} files into .claude/\n` +
    `${notes.map((n) => `  note: ${n}`).join('\n')}\n` +
    '[export] Review with git diff in the project, fill in the Project-specific sections, and commit there.\n',
);
process.exit(0);
