#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): advisory notes on the code style rules (.claude/rules/code-style.md, react.md, backend.md)
// for the text Claude just added to a JS/TS file. Line-based heuristics, so it never blocks; the project's ESLint config wins.
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { readInput, advise, allow } from '../lib/hook-io.mjs';
import { projectRoot, resolveInRoot, walkFiles } from '../lib/detect.mjs';

const MAX_SNIPPETS = 3;
const MAX_SNIPPET = 120;

const input = await readInput();
const ti = input?.tool_input ?? {};
const filePath = String(ti.file_path ?? '');
if (!filePath) allow();

const root = projectRoot();
const { abs, rel } = resolveInRoot(root, filePath);
const ext = extname(rel).toLowerCase();
if (!/^\.(m|c)?(j|t)sx?$/.test(ext) || rel.endsWith('.d.ts') || rel.startsWith('..') || rel.startsWith('.claude/') || rel.includes('node_modules/')) allow();

const added = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e?.new_string)].filter((s) => typeof s === 'string').join('\n');
if (!added.trim()) allow();

const pkg = rel.split('/')[0];
const isTs = /^\.(m|c)?tsx?$/.test(ext);
const isTest = /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) || /(^|\/)(__tests__|test|tests|e2e)\//.test(rel);
const isComponentFile = pkg === 'client' && /\.(jsx|tsx)$/.test(ext) && !/\/(api|services|hooks|lib|utils)\//.test(rel);

// Code with string literals blanked out, so `'function'` or `'req.body'` in a message doesn't count.
const codeOf = (line) => line.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
const isComment = (line) => /^\s*(\/\/|\/?\*)/.test(line);

// Top-level parameters in a single-line parameter list (commas inside {}, [], () and <> don't count).
const paramCount = (list) => {
  if (!list.trim()) return 0;
  let depth = 0;
  let count = 1;
  for (const ch of list) {
    if ('([{<'.includes(ch)) depth++;
    else if (')]}>'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) count++;
  }

  return list.trim().endsWith(',') ? count - 1 : count;
};
const PARAM_LISTS = [
  /\(([^()]*)\)\s*(?::\s*[^=;{]+)?=>/g, // arrow
  /\bfunction\b\s*\*?\s*\w*\s*(?:<[^>]*>)?\s*\(([^()]*)\)/g, // function
  /^\s*(?:(?:public|private|protected|static|async|readonly)\s+)*(?!(?:if|for|while|switch|catch|return|constructor)\b)\w+\s*(?:<[^>]*>)?\s*\(([^()]*)\)\s*(?::\s*[^{]+)?\{/g, // method
];
const tooManyParams = (code) => PARAM_LISTS.some((re) => [...code.matchAll(re)].some((m) => paramCount(m[1]) > 3));

// A generic message with nothing about the resource or id: 'Not found', "Error", `Something went wrong`.
const VAGUE = `['"\`](not found|bad request|conflict|forbidden|unauthorized|something went wrong|error|invalid input)['"\`]`;
const COMMENTED_CODE = /^\s*\/\/\s*(?!@ts-|eslint|prettier|TODO|FIXME|NOTE|#region|#endregion)((const|let|var|return|import|export|await|if\s*\(|for\s*\(|console\.)\b.*|.*[;{}]\s*$|[\w.]+\(.*\);?\s*$)/;

// [rule, applies, test(line, code)]
const CHECKS = [
  ['`function` keyword: use arrow functions (class methods stay methods)', true, (_, code) => /(^|[^\w$.])function\b(?!\s*\*)/.test(code)],
  ['more than 3 parameters: take one typed options object instead', true, (_, code) => tooManyParams(code)],
  ['commented-out code: delete it, git keeps the history', true, (line) => COMMENTED_CODE.test(line)],
  ['component imported through its own file: import the folder (`./Button`), not `./Button/Button`', true, (line) => /['"]\.{1,2}\/(?:[^'"]*\/)?([A-Z]\w*)\/\1['"]/.test(line)],
  ['`any`: use a precise type, a generic, or `unknown` + narrowing', isTs, (_, code) => !isComment(code) && /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(code)],
  ['`@ts-ignore`: use `@ts-expect-error <reason>` if a suppression is truly needed', isTs, (line) => /@ts-ignore\b/.test(line)],
  [
    'raw `req.body` / `req.query` / `req.params`: parse with the utils Zod schema and pass only the parsed value on (unless validate() middleware already replaced it)',
    pkg === 'server' && !isTest,
    (_, code) => /\breq\.(body|query|params)\b/.test(code) && !/\.(safeParse|parse|parseAsync|safeParseAsync)\s*\(/.test(code),
  ],
  [
    'vague error: name the resource and the id (`Order 123 not found`)',
    pkg === 'server' && !isTest,
    (line) =>
      /\bnew\s+(NotFound|BadRequest|Conflict|Forbidden|Unauthorized|UnprocessableEntity|InternalServerError)Exception\s*\(\s*\)/.test(line) ||
      new RegExp(`(Error|Exception)\\s*\\(\\s*${VAGUE}|message\\s*:\\s*${VAGUE}`, 'i').test(line),
  ],
  ['stack trace sent to the client: log it on the server, send `{ code, message }`', pkg === 'server' && !isTest, (_, code) => /\b(json|send)\s*\(.*\.stack\b/.test(code)],
  ['`new` on a service/repository: inject it through the constructor (dependency inversion)', pkg === 'server' && !isTest, (_, code) => /\bnew\s+[A-Z]\w*(Service|Repository|Repo)\s*\(/.test(code)],
  ['component calls the HTTP client directly: wrap the call in a feature hook (`useOrders`) built on the yam-lib / mador-yam-* query hooks', isComponentFile && !isTest, (_, code) => /(^|[^\w$.])fetch\s*\(|\baxios(\.\w+)?\s*\(/.test(code)],
];

const findings = new Map();
for (const line of added.split(/\r?\n/)) {
  const code = codeOf(line);
  for (const [rule, applies, check] of CHECKS) {
    if (!applies || !check(line, code)) continue;
    const list = findings.get(rule) ?? [];
    if (list.length < MAX_SNIPPETS) list.push(line.trim().slice(0, MAX_SNIPPET));
    findings.set(rule, list);
  }
}

// Forms keep the schema library the existing forms use (react.md): never mix Zod and Yup resolvers.
const mixedResolver = () => {
  if (pkg !== 'client') return null;
  const usesYup = /['"](yup|@hookform\/resolvers\/yup)['"]|\byupResolver\b/.test(added);
  const usesZod = /['"]@hookform\/resolvers\/zod['"]|\bzodResolver\b/.test(added);
  if (usesYup === usesZod) return null;
  const others = walkFiles(join(root, 'client', 'src'), { max: 400, filter: (f) => /\.(jsx?|tsx?)$/.test(f) && basename(f) !== basename(abs) });
  const existing = others.map((f) => readFileSync(f, 'utf8')).join('\n');
  const hasYup = /\byupResolver\b/.test(existing);
  const hasZod = /\bzodResolver\b/.test(existing);
  if (usesYup && hasZod && !hasYup) return 'Yup in a client whose forms use zodResolver: keep Zod (reuse the utils schema when there is one)';
  if (usesZod && hasYup && !hasZod) return 'Zod resolver in a client whose forms use yupResolver: keep Yup';

  return null;
};
const mixed = mixedResolver();
if (mixed) findings.set(mixed, []);

if (!findings.size) allow();

const body = [...findings].map(([rule, snippets]) => [`- ${rule}`, ...snippets.map((s) => `    ${s}`)].join('\n'));
advise(
  'PostToolUse',
  [`Style notes for ${rel} (advisory, from .claude/rules):`, ...body, "Fix them if they apply. The project's ESLint config wins where it differs."].join('\n'),
);
