#!/usr/bin/env node
// PreCompact(manual|auto): save the task and decisions to .claude/scratch/compact-<session>.md before the conversation
// is summarized: the user's prompts, AskUserQuestion answers, the last approved plan, the latest todos, and the files
// edited. session-context prints it again after compaction, so nothing important is lost to the summary.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInput } from '../lib/hook-io.mjs';
import { projectRoot, git } from '../lib/detect.mjs';
import { readEdits } from '../lib/edits.mjs';
import { snapshotPath } from '../lib/snapshot.mjs';

const MAX_PROMPTS = 15;
const MAX_PROMPT = 500;
const MAX_PLAN = 4000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const textOf = (content) =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : '';

const readTranscript = (path) => {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const summarize = (entries) => {
  const prompts = [];
  const asked = new Map();
  const answers = [];
  let plan = null;
  let todos = null;
  for (const e of entries) {
    const content = e?.message?.content;
    if (e.type === 'user' && !e.isMeta && !e.isCompactSummary) {
      const text = textOf(content).trim();
      // Skip slash-command echoes, caveats and reminders: they start with a tag.
      if (text && !text.startsWith('<') && !(Array.isArray(content) && content.some((c) => c?.type === 'tool_result'))) prompts.push(clip(text, MAX_PROMPT));
      for (const c of Array.isArray(content) ? content : []) {
        if (c?.type === 'tool_result' && asked.has(c.tool_use_id)) answers.push(clip(textOf(c.content), MAX_PROMPT * 2));
      }
    }
    if (e.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (c?.type !== 'tool_use') continue;
        if (c.name === 'AskUserQuestion') asked.set(c.id, true);
        if (c.name === 'ExitPlanMode' && typeof c.input?.plan === 'string') plan = c.input.plan;
        if (c.name === 'TodoWrite' && Array.isArray(c.input?.todos)) todos = c.input.todos;
      }
    }
  }

  return { prompts: prompts.slice(-MAX_PROMPTS), answers, plan, todos };
};

try {
  const input = await readInput();
  const root = projectRoot();
  const { prompts, answers, plan, todos } = summarize(readTranscript(String(input?.transcript_path ?? '')));
  const edited = readEdits(root, input?.session_id);
  const status = git(root, ['status', '--short', '-uall']).trim();
  const lines = [
    `# Pre-compaction snapshot (${new Date().toISOString()}, trigger: ${input?.trigger ?? 'unknown'})`,
    ...(input?.custom_instructions ? ['', `Compaction instructions: ${input.custom_instructions}`] : []),
    '',
    '## User prompts (oldest first)',
    ...(prompts.length ? prompts.map((p) => `- ${p.replace(/\n+/g, ' ')}`) : ['- (none found)']),
    '',
    '## Decisions (AskUserQuestion answers)',
    ...(answers.length ? answers.map((a) => `- ${a.replace(/\n+/g, ' ')}`) : ['- (none)']),
    ...(plan ? ['', '## Last approved plan', clip(plan, MAX_PLAN)] : []),
    ...(todos ? ['', '## Todos', ...todos.map((t) => `- [${t.status ?? '?'}] ${t.content ?? ''}`)] : []),
    '',
    '## Files edited this session',
    ...(edited.length ? edited.map((f) => `- ${f}`) : ['- (none)']),
    '',
    '## git status --short',
    status || '(clean)',
    '',
  ];
  const file = snapshotPath(root, input?.session_id);
  const dir = join(root, '.claude', 'scratch');
  mkdirSync(dir, { recursive: true });
  for (const old of readdirSync(dir)) {
    const p = join(dir, old);
    if (/^compact-.*\.md$/.test(old) && Date.now() - statSync(p).mtimeMs > MAX_AGE_MS) rmSync(p, { force: true });
  }
  writeFileSync(file, lines.join('\n'));
} catch {
  // a failed snapshot must never block compaction
}
process.exit(0);
