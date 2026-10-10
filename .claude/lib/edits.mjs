// Per-session ledger of the files Claude edited (written by the track-edits hook, read by stop-check).
// Lives in the OS temp dir, keyed by project and session, so it never shows up in git status.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stateDir = () => process.env.CLAUDE_HOOK_STATE_DIR || join(tmpdir(), 'claude-hooks');

const projectKey = (root) => createHash('sha1').update(root.toLowerCase()).digest('hex').slice(0, 12);

export const ledgerPath = (root, sessionId) => {
  const session = String(sessionId || 'default').replace(/[^\w-]/g, '_');

  return join(stateDir(), `edits-${projectKey(root)}-${session}.json`);
};

// Per-project (not per-session) state next to the ledgers, e.g. the stack cache: <stateDir>/<name>-<project>.json.
export const statePath = (root, name) => join(stateDir(), `${name}-${projectKey(root)}.json`);

// Posix paths relative to root, in edit order, without duplicates.
export const readEdits = (root, sessionId) => {
  try {
    const list = JSON.parse(readFileSync(ledgerPath(root, sessionId), 'utf8'));

    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const recordEdit = (root, sessionId, rel) => {
  const list = readEdits(root, sessionId);
  if (list.includes(rel)) return;
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(ledgerPath(root, sessionId), JSON.stringify([...list, rel]));
};

export const clearEdits = (root, sessionId) => rmSync(ledgerPath(root, sessionId), { force: true });

// True the first time `key` is seen in this session, false afterwards (one-time notes: ripple, rule injection).
export const markOnce = (root, sessionId, key) => {
  const path = ledgerPath(root, sessionId).replace(/edits-([^/\\]+)\.json$/, 'seen-$1.json');
  let seen = [];
  try {
    seen = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // first note of the session
  }
  if (seen.includes(key)) return false;
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(path, JSON.stringify([...seen, key]));

  return true;
};
