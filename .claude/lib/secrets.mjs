// Secret detection for text Claude is about to write (guard-boundaries). Returns the kind and line of each hit,
// never the value. Placeholders (***, <token>, ${VAR}, process.env.X, changeme, example...) are not secrets.

// A value that is clearly not a real secret.
const PLACEHOLDER = /^(\*+|x+|\.+|-+)$|[<>{}$]|process\.env|import\.meta\.env|configuration\[|change[-_]?me|example|placeholder|your[-_]|dummy|fake|redacted|sample|test|todo/i;
// Well-known local defaults (postgres:postgres, sa/admin) are not secrets either.
const DEFAULTS = /^(pass|password|passwd|postgres|root|admin|sa|secret|user|guest|mongo|dev|local)$/i;
const isPlaceholder = (value) => !value || PLACEHOLDER.test(value) || DEFAULTS.test(value) || /^(.)\1+$/.test(value);
// A connection string to the developer's own machine (or a docker host) only works locally.
const LOCAL_HOST = /(@|server\s*=\s*|host\s*=\s*|data source\s*=\s*)(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|\.|\(local\))([:;,/'"`\s]|$)/i;

// [kind, regex, index of the value group to check against placeholders (0 = no check)]
const PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/, 0],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 0],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/, 0],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/, 0],
  ['API key (sk-…)', /\bsk-(?:ant-|proj-|live_)?[A-Za-z0-9_-]{24,}/, 0],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 0],
  ['connection string with a password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:([^\s@'"`]+)@/i, 1],
  ['connection string with a password', /(?:^|[;'"`\s])(?:password|pwd)\s*=\s*([^;'"`\s]+)\s*(?:;|['"`]|$)/i, 1],
  [
    'hard-coded credential',
    // The name must end with the credential word (dbPassword, CLIENT_SECRET), so tokenStorageKey or passwordLabel don't count.
    /\b\w*(?:api[_-]?key|secret|access[_-]?key|token|password|passwd)['"]?\s*[:=]\s*['"`]([^'"`\s]{8,})['"`]/i,
    1,
  ],
];

export const findSecrets = (text) => {
  const hits = [];
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const [kind, re, group] of PATTERNS) {
        const m = line.match(re);
        if (!m || (group && isPlaceholder(m[group])) || (kind.startsWith('connection string') && LOCAL_HOST.test(line))) continue;
        hits.push({ kind, line: i + 1 });
        break;
      }
    });

  return hits;
};
