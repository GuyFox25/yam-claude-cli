#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): advisory notes on the code style rules (.claude/rules/code-style.md, react.md, backend.md,
// csharp.md, testing.md) for the text Claude just added. Line-based heuristics, so it never blocks; the project's ESLint config
// (or the .NET analyzers) wins. JS/TS: style, debug leftovers, a new source file without a test, and hard-coded UI text when
// the client uses i18n. C#: async void, the Async suffix, SQL built from strings. With CLAUDE_HOOK_RTL=on: physical CSS
// directions in RTL UIs.
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { readInput, advise, allow } from '../lib/hook-io.mjs';
import { projectRoot, resolveInRoot, walkFiles, pkgJson, allDeps, isTracked, PACKAGES } from '../lib/detect.mjs';

const MAX_SNIPPETS = 3;
const MAX_SNIPPET = 120;

const input = await readInput();
const ti = input?.tool_input ?? {};
const filePath = String(ti.file_path ?? '');
if (!filePath) allow();

const root = projectRoot();
const { abs, rel } = resolveInRoot(root, filePath);
const ext = extname(rel).toLowerCase();
const flag = (name) => String(process.env[name] ?? '').toLowerCase();
const rtl = flag('CLAUDE_HOOK_RTL') === 'on';
const isJs = /^\.(m|c)?(j|t)sx?$/.test(ext) && !rel.endsWith('.d.ts');
const isCs = ext === '.cs' && !/(^|\/)Migrations\//.test(rel) && !/\.(Designer|g)\.cs$/.test(rel);
const isStyle = rtl && /^\.(css|scss|sass|less)$/.test(ext);
if (!(isJs || isCs || isStyle) || rel.startsWith('..') || rel.startsWith('.claude/') || rel.includes('node_modules/')) allow();

const added = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e?.new_string)].filter((s) => typeof s === 'string').join('\n');
if (!added.trim()) allow();

const pkg = rel.split('/')[0];
const isTs = /^\.(m|c)?tsx?$/.test(ext);
const isTest = /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) || /(^|\/)(__tests__|test|tests|e2e)\//.test(rel) || /Tests?\.cs$|\.Tests?\//.test(rel);
const isJsx = /\.(jsx|tsx)$/.test(ext);
const isComponentFile = pkg === 'client' && isJsx && !/\/(api|services|hooks|lib|utils)\//.test(rel);
const isController = /Controller\.cs$/.test(rel);

// Hard-coded UI text only matters when the client translates its UI: detected from its dependencies, or forced with
// CLAUDE_HOOK_I18N=on|off.
const I18N_LIBS = /^(i18next|react-i18next|react-intl|next-intl|@lingui\/.+|@formatjs\/.+)$/;
const i18n = (() => {
  if (flag('CLAUDE_HOOK_I18N') === 'on') return true;
  if (flag('CLAUDE_HOOK_I18N') === 'off' || pkg !== 'client') return false;

  return Object.keys(allDeps(pkgJson(root, 'client') ?? {})).some((dep) => I18N_LIBS.test(dep));
})();

// An unreadable file (locked, deleted mid-walk) must not crash an advisory hook.
const readOrEmpty = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

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

// Visible text between JSX tags (`>Save<`) or in user-facing attributes, in Latin or Hebrew letters.
const LETTERS = '[A-Za-z\\u0590-\\u05FF]';
const UI_TEXT = new RegExp(`>[^<>{}]*${LETTERS}{2,}[^<>{}]*</`);
const UI_ATTR = new RegExp(`\\b(placeholder|title|aria-label|alt|label)=["'][^"']*${LETTERS}{2,}[^"']*["']`);
const RTL_JS = /\b(margin|padding|border)(Left|Right)\b\s*:|\b(textAlign|float)\s*:\s*['"](left|right)['"]/;
const RTL_CSS = /^\s*(margin|padding|border)-(left|right)\b|^\s*(left|right)\s*:|\b(text-align|float)\s*:\s*(left|right)\b/;
// C#: an interpolated or concatenated string that starts with SQL, or a raw-SQL API called with one.
const CS_SQL =
  /(\$@?"|@\$")\s*(SELECT|INSERT|UPDATE|DELETE|MERGE|EXEC)\b[^"]*\{|"\s*(SELECT|INSERT|UPDATE|DELETE|MERGE|EXEC)\b[^"]*"\s*\+|\b(FromSqlRaw|ExecuteSqlRaw|ExecuteSqlRawAsync|SqlCommand)\s*\(\s*(\$|[^")]*\+)/i;
// EF Core turns the interpolation holes of these APIs into parameters, so an interpolated string is safe there.
const CS_SAFE_INTERPOLATION = /\b(FromSql|FromSqlInterpolated|ExecuteSqlInterpolated|ExecuteSqlInterpolatedAsync|ExecuteSql|ExecuteSqlAsync|SqlQuery)\s*\(\s*\$/;
const asyncWithoutSuffix = (code) => {
  const m = code.match(/\basync\s+(?:Task|ValueTask)(?:<.+>)?\s+(\w+)\s*(?:<[^>]*>)?\s*\(/);

  return Boolean(m && !m[1].endsWith('Async') && m[1] !== 'Main');
};

// [rule, applies, test(line, code)]
const CHECKS = [
  ['`function` keyword: use arrow functions (class methods stay methods)', isJs, (_, code) => /(^|[^\w$.])function\b(?!\s*\*)/.test(code)],
  ['more than 3 parameters: take one typed options object instead', isJs, (_, code) => tooManyParams(code)],
  ['commented-out code: delete it, git keeps the history', isJs, (line) => COMMENTED_CODE.test(line)],
  ['component imported through its own file: import the folder (`./Button`), not `./Button/Button`', isJs, (line) => /['"]\.{1,2}\/(?:[^'"]*\/)?([A-Z]\w*)\/\1['"]/.test(line)],
  ['`any`: use a precise type, a generic, or `unknown` + narrowing', isTs, (_, code) => !isComment(code) && /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(code)],
  ['`@ts-ignore`: use `@ts-expect-error <reason>` if a suppression is truly needed', isTs, (line) => /@ts-ignore\b/.test(line)],
  [
    'raw `req.body` / `req.query` / `req.params`: parse with the utils Zod schema and pass only the parsed value on (unless validate() middleware already replaced it)',
    isJs && pkg === 'server' && !isTest,
    (_, code) => /\breq\.(body|query|params)\b/.test(code) && !/\.(safeParse|parse|parseAsync|safeParseAsync)\s*\(/.test(code),
  ],
  [
    'vague error: name the resource and the id (`Order 123 not found`)',
    isJs && pkg === 'server' && !isTest,
    (line) =>
      /\bnew\s+(NotFound|BadRequest|Conflict|Forbidden|Unauthorized|UnprocessableEntity|InternalServerError)Exception\s*\(\s*\)/.test(line) ||
      new RegExp(`(Error|Exception)\\s*\\(\\s*${VAGUE}|message\\s*:\\s*${VAGUE}`, 'i').test(line),
  ],
  ['stack trace sent to the client: log it on the server, send `{ code, message }`', isJs && pkg === 'server' && !isTest, (_, code) => /\b(json|send)\s*\(.*\.stack\b/.test(code)],
  ['`new` on a service/repository: inject it through the constructor (dependency inversion)', isJs && pkg === 'server' && !isTest, (_, code) => /\bnew\s+[A-Z]\w*(Service|Repository|Repo)\s*\(/.test(code)],
  ['component calls the HTTP client directly: wrap the call in a feature hook (`useOrders`) built on the yam-lib / mador-yam-* query hooks', isComponentFile && !isTest, (_, code) => /(^|[^\w$.])fetch\s*\(|\baxios(\.\w+)?\s*\(/.test(code)],
  ['debug leftover: remove `console.log` / `console.debug` (use the project logger if it should stay)', isJs && !isTest, (_, code) => !isComment(code) && /\bconsole\.(log|debug)\s*\(/.test(code)],
  ['debug leftover: remove `debugger`', isJs, (_, code) => /^\s*debugger\s*;?\s*$/.test(code)],
  ['focused test: remove `.only` so the whole suite runs', isJs && isTest, (_, code) => /\b(it|test|describe|context)\.only\s*\(/.test(code)],
  ["hard-coded UI text: use the client's translation function (`t('orders.save')`)", isJsx && i18n && !isTest, (line) => !isComment(line) && (UI_TEXT.test(line) || UI_ATTR.test(line))],
  ['physical direction in an RTL UI: use logical properties (`marginInlineStart`, `paddingInlineEnd`, `textAlign: \'start\'`)', isJsx && rtl, (_, code) => RTL_JS.test(code)],
  ['physical direction in an RTL UI: use logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`)', isStyle, (line) => RTL_CSS.test(line)],
  ['`async void`: return `Task` (only event handlers may be `async void`)', isCs, (_, code) => /\basync\s+void\s+\w+\s*\(/.test(code) && !/object\??\s+sender/.test(code)],
  ['async method without the `Async` suffix (csharp.md): rename it `...Async`', isCs && !isTest && !isController, (_, code) => asyncWithoutSuffix(code)],
  ['SQL built from strings: use parameters (`FromSqlInterpolated`, Dapper parameters, `SqlParameter`)', isCs, (line) => CS_SQL.test(line) && !CS_SAFE_INTERPOLATION.test(line)],
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
  if (pkg !== 'client' || !isJs) return null;
  const usesYup = /['"](yup|@hookform\/resolvers\/yup)['"]|\byupResolver\b/.test(added);
  const usesZod = /['"]@hookform\/resolvers\/zod['"]|\bzodResolver\b/.test(added);
  if (usesYup === usesZod) return null;
  // Every other file: comparing basenames would also skip each other index.tsx.
  const others = walkFiles(join(root, 'client', 'src'), { max: 400, filter: (f) => /\.(jsx?|tsx?)$/.test(f) && f !== abs });
  const existing = others.map(readOrEmpty).join('\n');
  const hasYup = /\byupResolver\b/.test(existing);
  const hasZod = /\bzodResolver\b/.test(existing);
  if (usesYup && hasZod && !hasYup) return 'Yup in a client whose forms use zodResolver: keep Zod (reuse the utils schema when there is one)';
  if (usesZod && hasYup && !hasZod) return 'Zod resolver in a client whose forms use yupResolver: keep Yup';

  return null;
};
const mixed = mixedResolver();
if (mixed) findings.set(mixed, []);

// A new JS/TS source file with no test for it anywhere in its package (testing.md: every new export gets tests).
const NO_TEST_NEEDED =
  /(^|\/)(index|main|types?|constants?|setupTests|vite-env)\.[^/]+$|\.(d|types|stories|config|styles?)\.[cm]?[jt]sx?$|(^|\/)(types|migrations|drizzle|prisma|schema|__mocks__)\//;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const missingTest = () => {
  if (!isJs || isTest || input?.tool_name !== 'Write' || !PACKAGES.includes(pkg) || NO_TEST_NEEDED.test(rel)) return null;
  const created = input?.tool_response?.type ? input.tool_response.type === 'create' : !isTracked(root, rel);
  if (!created) return null;
  const base = basename(rel).replace(/\.[^.]+$/, '');
  const testName = new RegExp(`^${escapeRe(base)}\\.(test|spec)\\.[cm]?[jt]sx?$`);
  if (walkFiles(join(root, pkg), { max: 1, filter: (f) => testName.test(basename(f)) }).length) return null;

  return `new file without a test: add \`${base}.test${ext}\` with a happy path and a failure case (\`/write-tests ${rel}\`)`;
};
const noTest = missingTest();
if (noTest) findings.set(noTest, []);

if (!findings.size) allow();

const wins = isCs ? "The solution's analyzers and .editorconfig win where they differ." : "The project's ESLint config wins where it differs.";
const body = [...findings].map(([rule, snippets]) => [`- ${rule}`, ...snippets.map((s) => `    ${s}`)].join('\n'));
advise('PostToolUse', [`Style notes for ${rel} (advisory, from .claude/rules):`, ...body, `Fix them if they apply. ${wins}`].join('\n'));
