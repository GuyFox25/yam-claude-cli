#!/usr/bin/env node
// Usage: node .claude/scripts/audit-report.mjs [--days N] [--json]
// Summarizes the local logs in .claude/logs/ (gitignored) to tune the rules after a pilot:
// - hooks.jsonl (hook-io): blocks, asks and advice per hook with their top reasons, Stop blocks by check, hook latency
// - audit.jsonl (audit-log): tool calls, failed calls per tool, most-edited packages
// Read-only. Paths and values never appear: reasons are normalized (file names become <file>).
import { projectRoot, PACKAGES } from '../lib/detect.mjs';
import { readJsonl, percentile, SLOW_MS } from '../lib/hook-log.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 3;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const args = process.argv.slice(2);
const daysArg = args.indexOf('--days');
const days = daysArg !== -1 ? Number(args[daysArg + 1]) : 7;
if (!Number.isFinite(days) || days <= 0) {
  process.stderr.write('Usage: node .claude/scripts/audit-report.mjs [--days N] [--json]\n');
  process.exit(1);
}
const asJson = args.includes('--json');

const root = projectRoot();
const since = Date.now() - days * DAY_MS;
const recent = (entries) => entries.filter((e) => Date.parse(e?.ts) >= since);
const hooks = recent(readJsonl(root, 'hooks'));
const audit = recent(readJsonl(root, 'audit'));

// "Blocked: client/.env.local is an env file. Never ..." -> "<file> is an env file"
const normalizeReason = (reason = '') =>
  reason
    .replace(/^(Blocked|Asked|Checks failed)\s*:\s*/i, '')
    .replace(/[\w@~.-]*[\\/][\w@~./\\-]*|\.\S+|\b\S+\.(json|ya?ml|lock|md|[cm]?[jt]sx?|cs|sql)\b/g, '<file>')
    .split(/[.:(]/)[0]
    .trim()
    .slice(0, 70) || '(no reason)';

const countBy = (items, key) => {
  const counts = new Map();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return [...counts].sort((a, b) => b[1] - a[1]);
};

const decisions = (decision) =>
  countBy(
    hooks.filter((e) => e.decision === decision && e.hook !== 'stop-check'),
    (e) => e.hook,
  ).map(([hook, count]) => ({
    hook,
    count,
    top: countBy(
      hooks.filter((e) => e.decision === decision && e.hook === hook),
      (e) => normalizeReason(e.reason),
    ).slice(0, TOP),
  }));

// "Stop checks failed: client lint, server test" -> lint, test
const stopBlocks = hooks.filter((e) => e.hook === 'stop-check' && e.decision === 'block');
const stopKinds = countBy(
  stopBlocks.flatMap((e) => (e.reason ?? '').replace(/^.*?:/, '').split(',')),
  (part) => part.trim().split(/\s+/)[1],
);

const latency = [...new Set(hooks.map((e) => e.hook))]
  .map((hook) => {
    const ms = hooks.filter((e) => e.hook === hook && typeof e.ms === 'number').map((e) => e.ms);

    return { hook, runs: ms.length, p50: percentile(ms, 50), p95: percentile(ms, 95) };
  })
  .filter((h) => h.runs)
  .sort((a, b) => b.p95 - a.p95);

const packageOfFile = (file) => {
  const top = String(file).split('/')[0];
  if (PACKAGES.includes(top)) return top;

  return top === '.claude' ? '.claude' : '(other)';
};
const edits = countBy(
  audit.filter((e) => EDIT_TOOLS.has(e.tool) && e.file),
  (e) => packageOfFile(e.file),
);
const failures = countBy(
  audit.filter((e) => e.ok === false),
  (e) => e.tool,
).map(([tool, failed]) => ({ tool, failed, total: audit.filter((e) => e.tool === tool).length }));

const report = {
  days,
  since: new Date(since).toISOString(),
  blocks: decisions('block'),
  asks: decisions('ask'),
  advice: decisions('advise'),
  stop: { blocked: stopBlocks.length, byCheck: Object.fromEntries(stopKinds) },
  latency,
  toolCalls: audit.length,
  sessions: new Set(audit.map((e) => e.session).filter(Boolean)).size,
  edits: Object.fromEntries(edits),
  failures,
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

const list = (pairs) => pairs.map(([k, n]) => `${k} ${n}`).join(', ');
const decisionLine = (label, rows) =>
  `${label}: ${rows.length ? rows.map((r) => `${r.hook} ${r.count} (${r.top.map(([k, n]) => `${k} ${n}`).join('; ')})`).join(', ') : 'none'}`;
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

const lines = [
  `Audit report: last ${days} day(s), since ${report.since.slice(0, 10)}`,
  `Tool calls: ${report.toolCalls} in ${report.sessions} session(s)`,
  '',
  decisionLine('Blocks', report.blocks),
  decisionLine('Asks', report.asks),
  `Advice: ${report.advice.length ? report.advice.map((r) => `${r.hook} ${r.count}`).join(', ') : 'none'}`,
  `Stop blocked: ${stopBlocks.length} time(s)${stopKinds.length ? ` (${list(stopKinds)})` : ''}`,
  '',
  `Hook latency (logged runs: blocks, asks, advice, and allows over ${seconds(SLOW_MS)}):`,
  ...(latency.length ? latency.map((h) => `  ${h.hook}: p50 ${seconds(h.p50)}, p95 ${seconds(h.p95)} (${h.runs} runs)${h.p95 > SLOW_MS && h.hook !== 'stop-check' ? '  <- slow' : ''}`) : ['  no entries']),
  '',
  `Edits by package: ${edits.length ? list(edits) : 'none'}`,
  `Failed tool calls: ${failures.length ? failures.map((f) => `${f.tool} ${f.failed}/${f.total}`).join(', ') : 'none'}`,
];
if (!hooks.length && !audit.length) lines.push('', 'No log entries in this period. Logs are written to .claude/logs/ while Claude Code runs in this repo.');

process.stdout.write(`${lines.join('\n')}\n`);
