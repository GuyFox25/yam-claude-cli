#!/usr/bin/env node
// Stop: lint and typecheck the files Claude edited this session (recorded by track-edits), never the user's own
// uncommitted work, and run the full test suites of their packages. Only failures in those files or their related
// tests block the stop; failures elsewhere (pre-existing, or the user's) are shown to the user as a non-blocking
// message. Clears the ledger on success.
import { readInput } from '../lib/hook-io.mjs';
import { projectRoot } from '../lib/detect.mjs';
import { readEdits, clearEdits } from '../lib/edits.mjs';
import { scopedChecks } from '../lib/scoped.mjs';

const MAX_REASON = 8000;

const input = await readInput();
// Re-entry after a block: let Claude stop; the ledger is kept, so the next stop checks again.
if (input?.stop_hook_active) process.exit(0);

const root = projectRoot();
const edited = readEdits(root, input?.session_id);
if (!edited.length) process.exit(0);

// Stay inside the 600s hook timeout (settings.json).
const results = scopedChecks(root, edited, ['lint', 'typecheck', 'test'], { deadline: Date.now() + 580_000, testScope: 'package' });
const failures = results.filter((r) => r.status === 'fail');
const notes = results.filter((r) => r.note).map((r) => `- ${r.pkg} ${r.kind}: ${r.note}`);
const clipped = (text) => (text.length > MAX_REASON ? `${text.slice(0, MAX_REASON)}\n... (truncated)` : text);

if (!failures.length) {
  clearEdits(root, input?.session_id);
  if (notes.length) process.stdout.write(JSON.stringify({ systemMessage: clipped(['Stop checks passed for Claude\'s changes. Notes:', ...notes].join('\n')) }));
  process.exit(0);
}

const reason = [
  'Checks failed for the files you changed. Fix these before finishing:',
  ...failures.map((f) => `\n## ${f.pkg} ${f.kind} (${f.label})\n${f.output}`),
  ...(notes.length ? ['\nNotes:', ...notes] : []),
].join('\n');
process.stdout.write(JSON.stringify({ decision: 'block', reason: clipped(reason) }));
process.exit(0);
