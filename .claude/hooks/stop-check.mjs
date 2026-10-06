#!/usr/bin/env node
// Stop: lint and typecheck the files Claude edited this session (recorded by track-edits), never the user's own
// uncommitted work, and run the full test suites of their packages (related tests when there's no test script). Blocks the stop with the failures; clears the ledger on success.
import { readInput } from '../lib/hook-io.mjs';
import { projectRoot } from '../lib/detect.mjs';
import { readEdits, clearEdits } from '../lib/edits.mjs';
import { scopedChecks } from '../lib/scoped.mjs';

const MAX_REASON = 8000;
const PRE_EXISTING = '\n(Full suite: a failure in a test you did not touch may be pre-existing. Fix it if your change caused it; otherwise tell the user.)';

const input = await readInput();
// Re-entry after a block: let Claude stop; the ledger is kept, so the next stop checks again.
if (input?.stop_hook_active) process.exit(0);

const root = projectRoot();
const edited = readEdits(root, input?.session_id);
if (!edited.length) process.exit(0);

// Stay inside the 600s hook timeout (settings.json).
const results = scopedChecks(root, edited, ['lint', 'typecheck', 'test'], { deadline: Date.now() + 580_000, testScope: 'package' });
const failures = results.filter((r) => r.status === 'fail');

if (!failures.length) {
  clearEdits(root, input?.session_id);
  process.exit(0);
}

const notes = results.filter((r) => r.note).map((r) => `- ${r.pkg} ${r.kind}: ${r.note}`);
let reason = [
  'Checks failed for the files you changed. Fix these before finishing:',
  ...failures.map((f) => `\n## ${f.pkg} ${f.kind} (${f.label})\n${f.output}${f.full ? PRE_EXISTING : ''}`),
  ...(notes.length ? ['\nNotes:', ...notes] : []),
].join('\n');
if (reason.length > MAX_REASON) reason = `${reason.slice(0, MAX_REASON)}\n... (truncated)`;
process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
