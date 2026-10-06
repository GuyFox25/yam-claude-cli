// Where precompact-snapshot saves a session's snapshot, and how session-context reads it back after compaction.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_RESTORE = 6000;

export const snapshotPath = (root, sessionId) => join(root, '.claude', 'scratch', `compact-${String(sessionId || 'default').replace(/[^\w-]/g, '_')}.md`);

export const readSnapshot = (root, sessionId) => {
  try {
    const text = readFileSync(snapshotPath(root, sessionId), 'utf8');

    return text.length > MAX_RESTORE ? `${text.slice(0, MAX_RESTORE)}\n... (truncated; full file: .claude/scratch/)` : text;
  } catch {
    return null;
  }
};
