// Shared stdin/exit helpers for hooks. Exit 2 = block (stderr goes to Claude); exit 1 does NOT block.
// Every hook that imports this file also logs its decision and duration to .claude/logs/hooks.jsonl on exit (local,
// gitignored): blocks, asks and advice always, plain allows only when slow. CLAUDE_HOOK_LOG=off turns it off.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { SLOW_MS } from './hook-log.mjs';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_REASON = 200;
const HOOK_LOG = join('.claude', 'logs', 'hooks.jsonl');

let decision = 'allow';
let reason = '';

// Hooks that answer through stdout JSON (Stop's { decision: 'block' }) record their decision here.
export const recordDecision = (kind, text = '') => {
  decision = kind;
  reason = String(text).split('\n')[0].slice(0, MAX_REASON);
};

const writeLog = () => {
  if (String(process.env.CLAUDE_HOOK_LOG ?? '').toLowerCase() === 'off') return;
  const ms = Math.round(performance.now());
  if (decision === 'allow' && ms < SLOW_MS) return;
  try {
    const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
    const log = join(root, HOOK_LOG);
    mkdirSync(join(root, '.claude', 'logs'), { recursive: true });
    try {
      if (statSync(log).size > MAX_LOG_BYTES) renameSync(log, log.replace(/\.jsonl$/, '.1.jsonl'));
    } catch {
      // no log yet
    }
    const hook = basename(process.argv[1] ?? 'unknown').replace(/\.mjs$/, '');
    appendFileSync(log, `${JSON.stringify({ ts: new Date().toISOString(), hook, decision, ms, ...(reason ? { reason } : {}) })}\n`);
  } catch {
    // logging must never get in the way of a hook
  }
};
process.on('exit', writeLog);

export const block = (message) => {
  recordDecision('block', message);
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

export const allow = () => process.exit(0);

// PreToolUse: let the user confirm the action instead of blocking it.
export const ask = (why) => {
  recordDecision('ask', why);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: why } }));
  process.exit(0);
};

// Non-blocking note added to Claude's context (PostToolUse, SessionStart, ...).
export const advise = (event, text) => {
  recordDecision('advise', text);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
  process.exit(0);
};

// strict: guard hooks fail closed (block) on unparseable input instead of silently allowing.
export const readInput = async ({ strict = false } = {}) => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    if (strict) block('Blocked: the hook could not parse its input JSON, so the action could not be checked.');

    return {};
  }
};
