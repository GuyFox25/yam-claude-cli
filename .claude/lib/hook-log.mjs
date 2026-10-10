// Readers for the local JSONL logs in .claude/logs/: hooks.jsonl (written by hook-io on every hook exit) and
// audit.jsonl (audit-log). Used by session-context (slow-hook warning) and scripts/audit-report.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A hook run slower than this (ms) is logged even when it allows, and counts as slow.
export const SLOW_MS = Number(process.env.CLAUDE_HOOK_SLOW_MS) || 2000;

// The rotated file (<name>.1.jsonl) first, so entries come out oldest to newest.
export const readJsonl = (root, name, { tail = Infinity } = {}) => {
  const files = [`${name}.1.jsonl`, `${name}.jsonl`].map((f) => join(root, '.claude', 'logs', f)).filter((f) => existsSync(f));
  const lines = files.flatMap((f) => readFileSync(f, 'utf8').split('\n')).filter(Boolean);
  const entries = [];
  for (const line of lines.slice(-tail)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // a line cut off by a crash or rotation
    }
  }

  return entries;
};

export const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

// Hooks whose p95 is over the budget. Stop runs whole test suites, so it is expected to be slow.
export const slowHooks = (entries, budget = SLOW_MS) => {
  const byHook = new Map();
  for (const e of entries) {
    if (typeof e?.ms !== 'number' || !e.hook || e.hook === 'stop-check') continue;
    byHook.set(e.hook, [...(byHook.get(e.hook) ?? []), e.ms]);
  }

  return [...byHook]
    .map(([hook, ms]) => ({ hook, runs: ms.length, p95: percentile(ms, 95) }))
    .filter((h) => h.p95 > budget)
    .sort((a, b) => b.p95 - a.p95);
};
