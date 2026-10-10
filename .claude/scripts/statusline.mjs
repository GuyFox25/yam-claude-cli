#!/usr/bin/env node
// Claude Code status line (settings.json "statusLine"). Reads the status JSON on stdin and prints one line:
//   <model> · <package> · <branch> · <stack> · <N> edited · template <version>
// package: from the branch name (lib/branch.mjs). stack: cached by session-context (lib/stack-cache.mjs). edited: files
// Claude changed that the Stop check hasn't cleared yet (lib/edits.mjs). template: the exported version, or "(source)"
// in the template repo. Empty parts are dropped. Never fails: on any error it prints what it has.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git, readJson, detectBackend, detectClient } from '../lib/detect.mjs';
import { packageFromBranch } from '../lib/branch.mjs';
import { readEdits } from '../lib/edits.mjs';
import { detectShortStack, formatStack, readStackCache } from '../lib/stack-cache.mjs';

const SEP = ' · ';

const readStdin = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

// Each part is computed on its own, so one failure (no git, unreadable manifest) only drops that part.
const safe = (fn) => {
  try {
    return fn() || null;
  } catch {
    return null;
  }
};

const input = await readStdin();
const root = resolve(input?.workspace?.project_dir || process.env.CLAUDE_PROJECT_DIR || input?.workspace?.current_dir || process.cwd());

const branch = safe(() => git(root, ['branch', '--show-current']).trim());
const template = safe(() => {
  if (existsSync(join(root, '.claude', 'template-source.md'))) return 'template (source)';
  const version = readJson(join(root, '.claude', 'template-manifest.json'))?.template;

  return version ? `template ${version}` : null;
});
const edited = safe(() => {
  const count = readEdits(root, input?.session_id).length;

  return count ? `${count} edited` : null;
});
const stack = safe(() => formatStack(readStackCache(root) ?? detectShortStack(root, detectClient(root), detectBackend(root))));

const parts = [safe(() => input?.model?.display_name), safe(() => packageFromBranch(branch)), branch, stack, edited, template].filter(Boolean);
process.stdout.write(`${parts.join(SEP)}\n`);
