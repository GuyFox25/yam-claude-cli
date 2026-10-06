#!/usr/bin/env node
// Stop: lint, typecheck and run the related tests for the files Claude edited this session (recorded by
// track-edits), never the user's own uncommitted work. Blocks the stop with the failures; clears the ledger on success.
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

// Stay inside the 180s hook timeout.
const results = scopedChecks(root, edited, ['lint', 'typecheck', 'test'], { deadline: Date.now() + 170_000 });
const failures = results.filter((r) => r.status === 'fail');

if (!failures.length) {
  clearEdits(root, input?.session_id);
  process.exit(0);
}

const notes = results.filter((r) => r.note).map((r) => `- ${r.pkg} ${r.kind}: ${r.note}`);
let reason = [
  'Checks failed for the files you changed. Fix these before finishing:',
  ...failures.map((f) => `\n## ${f.pkg} ${f.kind} (${f.label})\n${f.output}`),
  ...(notes.length ? ['\nNotes:', ...notes] : []),
].join('\n');
if (reason.length > MAX_REASON) reason = `${reason.slice(0, MAX_REASON)}\n... (truncated)`;
process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
