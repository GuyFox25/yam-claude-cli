# Roadmap

What's been built so far, what's next, and a pool of ideas. Usage docs are in [README.md](README.md).

Last updated: 2026-10-10 (medium-term batch)

## Status at a glance

| Area | Status | Notes |
|------|--------|-------|
| Stack detection + session context | ✅ Done | npm/pnpm, react-ts/js, express/nest/dotnet/external, ORM, DB, test runner, in-house libs |
| Package boundaries + protected files | ✅ Done | hooks + agents + rules |
| Destructive / network / remote-DB guards | ✅ Done | |
| Format, style advice, ripple, Stop checks | ✅ Done | Stop blocks only on Claude's own failures |
| Context helpers (rule injection, compaction snapshot) | ✅ Done | |
| In-house library experts | ✅ Done | `claude-lib.md` → `lib-*` agents |
| Rules, skills, agents | ✅ Done (v2) | 6 rules, 16 skills, 10 agents |
| Export / update into projects | ✅ Done | manifest-based |
| Docs (README, ROADMAP) | ✅ Done | this file |
| Pilot in real projects | ⏳ Next | one project per stack |
| CI for the template itself | ⏳ Next | |
| Template versioning | ⏳ Next | |
| Stack-specific scaffolding gaps (OData, Prisma, Mongoose, .NET) | 📋 Planned | |
| Medium-term skills, agents, hooks, audit report, smoke test | ✅ Done | see Done |
| CLI UI: status line + review output style | ✅ Done | `settings.json` wiring by hand |
| Measuring with real data (audit-report after the pilot) | ⏳ Next | |

---

## ✅ Done

### Initial template (`4d5d4ba`)
The foundation: one config for every stack, detected at runtime instead of assumed.
- **Stack detection**: [`.claude/lib/detect.mjs`](.claude/lib/detect.mjs) (package manager, client flavor, backend, ORM, DB, test runner, packages).
- **Check runner**: [`.claude/scripts/check.mjs`](.claude/scripts/check.mjs). Typecheck/lint/test per package or `--changed`, with npm/pnpm/dotnet resolved automatically.
- **Export/update**: [`.claude/scripts/export-template.mjs`](.claude/scripts/export-template.mjs). Keeps each project's `## Project-specific` section and tracks files in a manifest. [`.claude/template-source.md`](.claude/template-source.md) marks this repo as editable; in projects `.claude/` is protected.
- **Guards**: `guard-bash` (destructive and network commands) and `guard-boundaries` (`.env*`, lockfiles, applied migrations, `node_modules`, package imports).
- **Feedback**: `format-on-write` (prettier/eslint/dotnet format), `track-edits` + `stop-check`.
- **In-house libraries**: `claude-lib.md` discovery, [`lib-info.mjs`](.claude/scripts/lib-info.mjs), generated `lib-*` agents, `/lib-doc`.
- **Skills**: `/new-endpoint`, `/db-migration`, `/write-tests`, `/commit`, `/review-guide`, `/pr-description`, `/fix-ci`, `/onboard`, `/lib-doc`.
- **Agents**: `code-reviewer`, `security-reviewer`, `architecture-guard`, `db-expert`, `library-expert`, `test-runner`.
- Per-package `CLAUDE.md` guides, `settings.json` permissions (allow/ask/deny), `.gitignore`.

### PR #1: Rules for code style, React and backend
- [`code-style.md`](.claude/rules/code-style.md): arrow functions, import order, small functions, comments, lookup order.
- [`react.md`](.claude/rules/react.md): function components, component folders, SOLID, **react-hook-form**, server data through the **yam-lib / mador-yam-\*** react-query extensions.
- [`backend.md`](.claude/rules/backend.md): Zod at every boundary, one error shape, controller → service → db, DI.
- Aligned the `new-endpoint` templates (always a service, injected repository in NestJS, not-found errors include the id).

### PR #2: Hooks enforce the rules
- **Enforced (blocking):** Drizzle schema-barrel imports, controllers/routers importing db, utils importing other packages, db importing server/client. Imports are resolved by path, not text.
- **Ask first:** adding a dependency to `package.json`, converting a class component to a function.
- **Advisory `style-advice`:** `function` keyword, `any`, >3 params, commented-out code, raw `req.body`, vague errors, `fetch` in components, mixed Zod/Yup resolvers.
- **Migration guard:** blocks migrate/seed on non-local DB URLs (reads env files itself, never prints values) and handles `VAR=` prefixes, `--env-file`, `dotenv -e`, SQL Server `.`/`(local)`. `CLAUDE_LOCAL_DB_HOSTS` covers docker.
- **Read guard:** no whole-file reads of lockfiles, build output, minified files or files over 256 KB.
- **`ripple-advice`**, **`prompt-context`**, **`audit-log`** (with redaction), **`precompact-snapshot`**, **`notify-bell`**.
- **Stop check:** runs full suites, but only failures related to Claude's edits block. Other failures are shown to the user as a note.
- Session context now prints client form/data libraries and ESLint configs.
- 248 hook tests (`node --test .claude/hooks/__tests__/*.test.mjs`).

### PR #3: Repo-first lookup
- Claude searches the repo (utils, `global/`, `shared/`, `common/`) **before** asking a `lib-*` agent, and this is stated everywhere libraries are mentioned.

### PR #5: `/review-guide`
- Writes `review/<branch>.md` for the reviewer: manual QA test cases (P1–P3) and ranked review pointers with `file:line`. `/pr-description` links it.

### Medium-term batch
- **Skills:** `/new-component`, `/odata-call`, `/sql-for-pgadmin`, `/upgrade-lib`, `/explain-error`, `/release-notes`, `/refactor-safe`.
- **Agents:** `odata-expert`, `a11y-reviewer`, `migration-reviewer`, `perf-reviewer` (read-only, sonnet).
- **Secret scanner** in `guard-boundaries`: private keys, provider tokens, connection strings with a password, hard-coded credentials. Names the kind and line, never the value. Placeholders and localhost defaults pass.
- **`style-advice` additions:** debug leftovers (`console.log`, `debugger`, `.only(`), missing-test nudge for new source files, hard-coded UI text (auto when the client has an i18n library, `CLAUDE_HOOK_I18N`), RTL physical directions (`CLAUDE_HOOK_RTL=on`), C# heuristics (`async void`, `Async` suffix, SQL built from strings).
- **Hook log + timing budget:** `hook-io` logs blocks, asks, advice and slow runs with their duration to `.claude/logs/hooks.jsonl`; session start warns about hooks over `CLAUDE_HOOK_SLOW_MS`.
- **`audit-report.mjs`:** blocks/asks/advice per hook with normalized reasons, Stop blocks per check, hook latency, edits per package, failed tool calls; `--days`, `--json`.
- **Smoke test:** six fixture projects (`.claude/hooks/__tests__/fixtures/projects/`) exported into temp repos; asserts the `Stack:` line, `check.mjs --changed` and the `.claude/` protection. They live under `.claude/` so the template's own detection never sees them.
- New checks went into the already-registered hooks because `settings.json` is protected; no hook wiring changed.

### CLI UI: status line and review output style
- **Status line** (`scripts/statusline.mjs`): model · package · branch · stack · edited files · template version. The stack is cached by session-context so the line stays fast. Wiring goes in `settings.json` by hand (protected).
- **Review output style** (`output-styles/review.md`): one verdict + Critical / Should fix / Nit format; all seven reviewer agents use it, and `/output-style review` brings it to the main session.

### Docs
- [README.md](README.md) and this roadmap.

---

## ⏳ Next up (short term)

Small, concrete items, roughly in priority order.

### 1. Pilot in real projects
**Why:** everything so far was built against the template, not real code. Real repos will expose false positives and missing detection.
- Export into one project of each kind: **SAP client**, **legacy JSX/class**, **.NET**, **Express + Drizzle**.
- Fill in each `## Project-specific` section. Suggested content:
  ```markdown
  ## Project-specific
  - OData services: ZORDERS_SRV (src/api/odata/services.ts), helper: `odataClient` from @yam/odata
  - $metadata snapshots: docs/odata/*.xml
  - Server state: mador-yam-query; forms: react-hook-form + zod
  - Don't touch: src/legacy/reports/ (being replaced)
  ```
- Keep a feedback log (in this repo, e.g. `docs/pilot-feedback.md`): wrong blocks, noisy advice, missing rules, slow hooks.
- Use `.claude/logs/audit.jsonl` from each pilot to see what Claude actually does.

### 2. CI for the template
**Why:** 298 tests (including the export smoke test) protect the hooks, but nothing runs them automatically.
```yaml
# .github/workflows/template-tests.yml
on: [pull_request]
jobs:
  test:
    strategy: { matrix: { os: [ubuntu-latest, windows-latest], node: [18, 22] } }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: node --test .claude/hooks/__tests__/*.test.mjs
        shell: bash
```
(Node 18 is the minimum supported version and Windows is the main dev OS, so both belong in the matrix.)

### 3. Template versioning + changelog
**Why:** with several projects, you need to know which one runs which template version.
- Add `version` and `exportedAt` to `template-manifest.json` on export.
- Add `CHANGELOG.md` (generated from Conventional Commits).
- `session-context` prints `Template: v1.4.0 (exported 2026-10-12)`.
- Optional: compare with a version the user points to and say "template is 3 versions behind".

### 4. `export-template --check`
Report drift without writing anything: files that differ, a missing `Project-specific` section, files deleted in the template, and `.gitignore` lines that are missing. It works like `--dry-run` but exits non-zero, so it can run in project CI.

### 5. Scaffolding gaps in `/new-endpoint`
The templates cover TS Express/Nest + a Drizzle-style repo and a JS client hook. Missing:
| Template | For |
|----------|-----|
| `client-odata.ts.md` / `.js.md` | SAP: csrf fetch before writes, `$filter` escaping, SAP field → UI model mapping |
| `db-repo.prisma.ts.md` | NestJS + Prisma projects |
| `db-repo.mongoose.ts.md` | MongoDB projects |
| `dotnet-controller.cs.md`, `dotnet-service.cs.md` | .NET backend |
| `client-hook.class-safe.jsx.md` | Legacy client: HOC/render-prop wrapper so class components can use the hook |

Example SAP snippet the template should produce:
```ts
const escapeOData = (value: string) => encodeURIComponent(value.replace(/'/g, "''"));

export const fetchOrders = (customer: string) =>
  odataClient.get(`${ORDERS_SRV}/OrderSet?$filter=Customer eq '${escapeOData(customer)}'`);
```

---

## 📋 Medium term

The previous batch is done (see **Done → Medium-term batch**). Promote items from Brainstorming here once there's a concrete why and an example.

---

## 💡 Long term / brainstorming

Open ideas, not commitments.

- **Plugin packaging:** ship the template as a Claude Code plugin from a local/internal marketplace instead of copying files. Updates become a version bump. Check the minimum Claude Code version against 2.1.47 first.
- **Leaner root CLAUDE.md:** it's about 13 KB and loaded every session. Move details into rules that load on demand and keep the root as a map.
- **lib-doc in library CI:** fail a library release if `claude-lib.md` is older than the API changes (compare exported symbols).
- **Org-level dashboard:** aggregate anonymized audit stats from all projects to see which rules matter.
- **PowerShell parity:** today hooks need Git Bash. Consider a fallback for developers without it.
- **Onboarding mode:** `/onboard` plus a guided first task for new team members.
- **Ticket integration (offline):** paste a ticket text, and a skill turns it into a plan + branch name.
- **Per-project rule overrides:** a sanctioned way (e.g. `.claude/rules.local/`) for a project to add rules without editing the template.
- **SAP knowledge pack:** common Gateway error codes, `$batch` patterns, date/number formats, to be documented once and reused.

---

## ❓ Open questions

- Who owns the template and reviews changes?
- Should projects pin a template version, or always take latest?
- When does the npm → pnpm move happen, and in which projects first?
- Is NestJS + Prisma confirmed for an upcoming project? That sets the priority of the Prisma templates.
- Which projects are RTL (turn on `CLAUDE_HOOK_RTL`) and which use i18n (the UI-text notes turn on by themselves)?

---

## Maintaining this roadmap

- When an item merges, move it to **Done** under its PR number and update the status table.
- New ideas go to **Brainstorming** first. Promote them to **Next up** once there's a concrete why and an example.
- Pilot feedback becomes items here, with a link to the feedback entry.
