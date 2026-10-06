// The file text an Edit/Write/MultiEdit would produce, computed in memory before the tool runs.
// Returns { before, after } (before is '' for a new file), or null when the edit can't be applied.
import { existsSync, readFileSync } from 'node:fs';

const applyOne = (text, { old_string: from, new_string: to, replace_all: all } = {}) => {
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (from === '') return text === '' ? to : null;
  if (!text.includes(from)) return null;

  return all ? text.split(from).join(to) : text.replace(from, () => to);
};

export const resultAfterEdit = (abs, toolName, toolInput) => {
  try {
    const before = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    if (toolName === 'Write') return typeof toolInput.content === 'string' ? { before, after: toolInput.content } : null;
    const edits = toolName === 'MultiEdit' ? (toolInput.edits ?? []) : [toolInput];
    let after = before;
    for (const edit of edits) {
      after = applyOne(after, edit);
      if (after === null) return null;
    }

    return { before, after };
  } catch {
    return null;
  }
};
