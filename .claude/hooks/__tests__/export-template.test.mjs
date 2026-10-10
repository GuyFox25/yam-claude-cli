import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cleanup, runHook, HOOKS_DIR } from './helpers.mjs';

const EXPORT = join(HOOKS_DIR, '..', 'scripts', 'export-template.mjs');
const exportTo = (dest, ...flags) => spawnSync(process.execPath, [EXPORT, dest, ...flags], { encoding: 'utf8' });
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

test('exports .claude/ without the marker, tests or local files, and merges CLAUDE.md files', () => {
  const dest = makeRepo({
    committed: {
      'client/package.json': { name: 'client' },
      'db/package.json': { name: 'db' },
      'CLAUDE.md': '# Old shared part\n\n## Project-specific\nOur app sells tickets.\n',
      'db/CLAUDE.md': 'Postgres 16, local DB app_dev.\n',
      '.gitignore': 'dist/\n.env\n',
    },
  });
  const res = exportTo(dest);

  assert.equal(res.status, 0, res.stderr);
  assert.ok(existsSync(join(dest, '.claude/settings.json')));
  assert.ok(existsSync(join(dest, '.claude/hooks/guard-bash.mjs')));
  assert.ok(existsSync(join(dest, '.claude/output-styles/review.md')), 'the shared review format ships with the template');
  assert.ok(existsSync(join(dest, '.claude/scripts/statusline.mjs')));
  assert.ok(!existsSync(join(dest, '.claude/template-source.md')), 'marker must not be exported');
  assert.ok(!existsSync(join(dest, '.claude/hooks/__tests__')), 'hook tests stay in the template');
  assert.ok(!existsSync(join(dest, '.claude/scripts/export-template.mjs')));

  const root = read(dest, 'CLAUDE.md');
  assert.match(root, /# Project guide for Claude/);
  assert.doesNotMatch(root, /Old shared part/);
  assert.match(root, /## Project-specific\nOur app sells tickets\.\n$/);
  assert.match(read(dest, 'db/CLAUDE.md'), /## Project-specific\n\nPostgres 16, local DB app_dev\.\n$/);
  assert.ok(existsSync(join(dest, 'client/CLAUDE.md')));
  assert.ok(!existsSync(join(dest, 'server/CLAUDE.md')), 'no server/ folder in the project');
  assert.match(res.stdout, /db\/CLAUDE\.md: existing content had no/);

  const ignore = read(dest, '.gitignore');
  assert.match(ignore, /^dist\/\n\.env\n/);
  assert.match(ignore, /\.claude\/settings\.local\.json/);
  assert.equal(ignore.match(/^\.env$/gm).length, 1, 'existing lines are not duplicated');
  cleanup(dest);
});

test('re-export keeps Project-specific edits and deletes files removed from the template', () => {
  const dest = makeRepo({ committed: { 'client/package.json': { name: 'client' } } });
  exportTo(dest);
  writeFileSync(join(dest, 'client/CLAUDE.md'), `${read(dest, 'client/CLAUDE.md')}Uses SWR.\n`);
  const manifest = JSON.parse(read(dest, '.claude/template-manifest.json'));
  manifest.files.push('.claude/rules/obsolete.md');
  writeFileSync(join(dest, '.claude/template-manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dest, '.claude/rules/obsolete.md'), 'old rule');
  writeFileSync(join(dest, '.claude/settings.local.json'), '{"mine":true}');

  const res = exportTo(dest);

  assert.equal(res.status, 0, res.stderr);
  assert.match(read(dest, 'client/CLAUDE.md'), /Uses SWR\.\n$/);
  assert.ok(!existsSync(join(dest, '.claude/rules/obsolete.md')));
  assert.equal(read(dest, '.claude/settings.local.json'), '{"mine":true}', 'local settings untouched');
  cleanup(dest);
});

test('--dry-run writes nothing', () => {
  const dest = makeRepo();
  const res = exportTo(dest, '--dry-run');

  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /DRY RUN/);
  assert.ok(!existsSync(join(dest, '.claude')));
  cleanup(dest);
});

test('.claude/ is protected in an exported project but editable in the template repo', () => {
  const edit = (root, rel) => runHook('guard-boundaries.mjs', { tool_name: 'Edit', tool_input: { file_path: join(root, rel), old_string: 'a', new_string: 'b' } }, root);
  const project = makeRepo({ committed: { 'client/package.json': { name: 'client' } } });
  exportTo(project);
  const template = makeRepo({ committed: { '.claude/template-source.md': 'marker', '.claude/hooks/x.mjs': 'a' } });

  assert.equal(edit(project, '.claude/hooks/guard-bash.mjs').code, 2);
  assert.equal(edit(project, '.claude/rules/db.md').code, 2);
  assert.equal(edit(project, '.claude/settings.local.json').code, 0);
  assert.equal(edit(project, 'client/CLAUDE.md').code, 0);
  assert.equal(edit(template, '.claude/hooks/x.mjs').code, 0);
  assert.equal(edit(template, '.claude/settings.json').code, 2, 'settings.json stays user-managed everywhere');
  cleanup(project);
  cleanup(template);
});
