#!/usr/bin/env node
// UserPromptSubmit: when the prompt is about migrations, endpoints, tests or components, add the key points of the
// matching .claude/rules file before Claude starts (rules otherwise load only once a matching file is read).
// Key points are extracted from the rule files themselves, so they never drift. Each file is added once per session.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, advise, allow } from '../lib/hook-io.mjs';
import { projectRoot, detectBackend } from '../lib/detect.mjs';
import { markOnce } from '../lib/edits.mjs';

const MAX_PER_FILE = 1500;
const BULLETS_PER_SECTION = 2;
const TOPICS = [
  ['db.md', /\b(migrations?|migrate|schemas?|tables?|columns?|index(es)?|seeds?)\b/i],
  ['backend.md', /\b(endpoints?|routes?|controllers?|services?|api)\b/i],
  ['testing.md', /\b(tests?|specs?|coverage|testing)\b/i],
  // Not "hooks": in this repo that usually means Claude Code hooks.
  ['react.md', /\b([Cc]omponents?|[Ff]orms?|[Pp]ages?|use[A-Z]\w+)\b/],
];

const input = await readInput();
const prompt = String(input?.prompt ?? '');
if (!prompt.trim() || prompt.trim().startsWith('/')) allow();

const root = projectRoot();
const rulesDir = join(root, '.claude', 'rules');
const files = TOPICS.filter(([, re]) => re.test(prompt)).map(([file]) => file);
if (files.includes('backend.md') && detectBackend(root) === 'dotnet') files.push('csharp.md');

// Every "## " heading with its first bullets (continuation lines dropped), capped per file.
const keyPoints = (text) => {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const out = [];
  let bullets = 0;
  for (const line of body.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      out.push(line.replace(/^##\s+/, '').trim() + ':');
      bullets = 0;
    } else if (/^- /.test(line) && out.length && bullets < BULLETS_PER_SECTION) {
      out.push(`  ${line}`);
      bullets += 1;
    }
  }
  const joined = out.join('\n');

  return joined.length > MAX_PER_FILE ? `${joined.slice(0, MAX_PER_FILE)}…` : joined;
};

const sections = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(rulesDir, file), 'utf8');
  } catch {
    continue;
  }
  if (!markOnce(root, input?.session_id, `rules:${file}`)) continue;
  sections.push(`### .claude/rules/${file} (key points; full rules in that file)\n${keyPoints(text)}`);
}
if (!sections.length) allow();

advise('UserPromptSubmit', `Project rules that apply to this request:\n\n${sections.join('\n\n')}`);
