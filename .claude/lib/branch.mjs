// The package a branch most likely concerns, from its name (<type>/<package>-<short-desc>). Shared by session-context
// and the status line.
const BRANCH_KEYWORDS = [
  ['client', /\b(client|ui|web|frontend|fe|front)\b/],
  ['server', /\b(server|api|backend|be|endpoint|route)s?\b/],
  ['db', /\b(db|database|migration|schema|seed|sql|orm)s?\b/],
  ['utils', /\b(utils?|shared|common|types?|zod)\b/],
];

// The earliest keyword wins: in <type>/<package>-<desc> the package comes first (fix/server-ui-bug -> server). Null if none.
export const packageFromBranch = (branch) => {
  const words = String(branch ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const hit = BRANCH_KEYWORDS.map(([pkg, re]) => [pkg, words.search(re)])
    .filter(([, at]) => at !== -1)
    .sort((a, b) => a[1] - b[1])[0];

  return hit ? hit[0] : null;
};
