#!/usr/bin/env node
// PostToolUse(*), async: append what Claude touched to .claude/logs/audit.jsonl (local, gitignored): time, session,
// tool, file / command / pattern, and whether it errored. Never file contents. Rotates at 5 MB. Never fails.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readInput } from '../lib/hook-io.mjs';
import { projectRoot, resolveInRoot } from '../lib/detect.mjs';

const MAX_LOG_BYTES = Number(process.env.CLAUDE_AUDIT_MAX_BYTES) || 5 * 1024 * 1024;
const MAX_COMMAND = 300;

// Commands and URLs may carry credentials (DATABASE_URL=postgres://user:pass@host ..., Password=... in a connection string).
const redact = (s) =>
  s
    .slice(0, MAX_COMMAND)
    .replace(/([a-z][\w+.-]*:\/\/)[^\s/@'"]+@/gi, '$1***@')
    .replace(/\b(password|pwd|token|secret|api[_-]?key)(\s*[=:]\s*)[^\s;&'"]+/gi, '$1$2***');

try {
  const input = await readInput();
  const ti = input?.tool_input ?? {};
  const root = projectRoot();
  const path = ti.file_path ?? ti.notebook_path ?? (input?.tool_name === 'Grep' || input?.tool_name === 'Glob' ? ti.path : undefined);
  const res = input?.tool_response;
  const entry = {
    ts: new Date().toISOString(),
    session: input?.session_id ?? null,
    tool: input?.tool_name ?? null,
    ...(path ? { file: resolveInRoot(root, String(path)).rel } : {}),
    ...(typeof ti.command === 'string' ? { command: redact(ti.command) } : {}),
    ...(typeof ti.pattern === 'string' ? { pattern: ti.pattern.slice(0, MAX_COMMAND) } : {}),
    ...(typeof ti.url === 'string' ? { url: redact(ti.url) } : {}),
    ok: !(res && typeof res === 'object' && (res.error || res.is_error || res.success === false)),
  };
  const dir = join(root, '.claude', 'logs');
  const log = join(dir, 'audit.jsonl');
  mkdirSync(dir, { recursive: true });
  try {
    if (statSync(log).size > MAX_LOG_BYTES) renameSync(log, join(dir, 'audit.1.jsonl'));
  } catch {
    // no log yet
  }
  appendFileSync(log, `${JSON.stringify(entry)}\n`);
} catch {
  // auditing must never get in the way
}
process.exit(0);
