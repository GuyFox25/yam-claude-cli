# Roadmap

What's been built so far, what's next, and a pool of ideas. Usage docs are in [README.md](README.md).

Last updated: 2026-10-10 (after PR #3)

## Status at a glance

| Area | Status | Notes |
|------|--------|-------|
| Stack detection + session context | ✅ Done | npm/pnpm, react-ts/js, express/nest/dotnet/external, ORM, DB, test runner, in-house libs |
| Package boundaries + protected files | ✅ Done | hooks + agents + rules |
| Destructive / network / remote-DB guards | ✅ Done | |
| Format, style advice, ripple, Stop checks | ✅ Done | Stop blocks only on Claude's own failures |
| Context helpers (rule injection, compaction snapshot) | ✅ Done | |
| In-house library experts | ✅ Done | `claude-lib.md` → `lib-*` agents |
| Rules, skills, agents | ✅ Done (v1) | 6 rules, 8 skills, 6 agents |
| Export / update into projects | ✅ Done | manifest-based |
| Docs (README, ROADMAP) | ✅ Done | this file |
| Pilot in real projects | ⏳ Next | one project per stack |
| CI for the template itself | ⏳ Next | |
| Template versioning | ⏳ Next | |
| Stack-specific scaffolding gaps (OData, Prisma, Mongoose, .NET) | 📋 Planned | |
| New skills/agents/hooks | 💡 Ideas | see below |

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
- **Skills**: `/new-endpoint`, `/db-migration`, `/write-tests`, `/commit`, `/pr-description`, `/fix-ci`, `/onboard`, `/lib-doc`.
- **Agents**: `code-reviewer`, `security-reviewer`, `architecture-guard`, `db-expert`, `library-expert`, `test-runner`.
- Per-package `CLAUDE.md` guides, `settings.json` permissions (allow/ask/deny), `CODEOWNERS`, `.gitignore`.

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

### 2. Fill in `CODEOWNERS`
Replace the `@OWNER` placeholder with the owning user or team so changes to `.claude/` and `CLAUDE.md` need review.

### 3. CI for the template
**Why:** 248 tests protect the hooks, but nothing runs them automatically.
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

### 4. Template versioning + changelog
**Why:** with several projects, you need to know which one runs which template version.
- Add `version` and `exportedAt` to `template-manifest.json` on export.
- Add `CHANGELOG.md` (generated from Conventional Commits).
- `session-context` prints `Template: v1.4.0 (exported 2026-10-12)`.
- Optional: compare with a version the user points to and say "template is 3 versions behind".

### 5. `export-template --check`
Report drift without writing anything: files that differ, a missing `Project-specific` section, files deleted in the template, and `.gitignore` lines that are missing. It works like `--dry-run` but exits non-zero, so it can run in project CI.

### 6. Scaffolding gaps in `/new-endpoint`
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

### New skills
| Skill | Idea | Example |
|-------|------|---------|
| `/new-component` | Component folder + styles + test (+ story if Storybook is detected), following `react.md` | `/new-component OrderCard in features/orders` |
| `/odata-call` | Generate typed API function + hook from a saved `$metadata` file, never inventing fields | `/odata-call ZORDERS_SRV OrderSet read+update` |
| `/sql-for-pgadmin` | Write a query for the user to run in pgAdmin (read-only by default, wrapped in `BEGIN … ROLLBACK` for writes) | `/sql-for-pgadmin orders without lines last 30 days` |
| `/upgrade-lib` | Bump an in-house lib: `lib-info changes`, find usages, apply breaking changes, run checks | `/upgrade-lib @acme/ui 3.0.0` |
| `/explain-error` | Paste a stack trace or SAP error message, find the cause in the repo | |
| `/release-notes` | Notes for users (not devs) from commits between two tags | `/release-notes v1.3.0..HEAD` |
| `/refactor-safe` | Refactor with a test-first safety net: write characterization tests, then refactor | |

### New agents
| Agent | Purpose |
|-------|---------|
| `odata-expert` | Reads saved `$metadata`, answers "which entity set has X", checks API calls against it |
| `a11y-reviewer` | Labels, roles, keyboard focus, contrast hints, RTL issues |
| `migration-reviewer` | Reviews generated SQL: locks, backfills, destructive steps, expand/contract |
| `perf-reviewer` | React re-renders, missing memo/keys, N+1 queries, missing indexes |

### New hooks / hook improvements
- **Secret scanner** (PreToolUse Edit/Write): block tokens, private keys and connection strings with passwords in written content.
- **Debug leftovers** (advisory): `console.log`, `debugger`, `.only(` in tests.
- **Missing test nudge** (advisory): a new source file with no matching test file.
- **Hard-coded UI strings** (advisory, opt-in): for projects with i18n, and RTL checks for Hebrew UIs (`margin-left` → `margin-inline-start`).
- **Hook timing budget:** record each hook's duration in the audit log and warn when one is slow.
- **`style-advice` on .NET:** a few C# heuristics (`async void`, missing `Async` suffix, string-concatenated SQL).

### Measuring and tuning
- `audit-report.mjs`: summarize `audit.jsonl` (most-blocked commands, most-edited packages, how often Stop blocked, hook latency). Use it to tune rules after the pilot.
  ```
  Blocks (last 7 days): guard-boundaries 14 (env read 6, barrel import 5, lockfile 3), guard-bash 4
  Stop blocked: 9 sessions (lint 5, types 3, tests 1)
  ```

### Testing the template end to end
- Fixture projects under `test-fixtures/` (sap-client, legacy-jsx, dotnet, express-drizzle, nest-prisma, mongo).
- Smoke test: export into a temp copy of each fixture, run `session-context` and assert on the `Stack:` line, then run `check.mjs --changed`.

---

## 💡 Long term / brainstorming

Open ideas, not commitments.

- **Plugin packaging:** ship the template as a Claude Code plugin from a local/internal marketplace instead of copying files. Updates become a version bump. Check the minimum Claude Code version against 2.1.47 first.
- **Shared status line:** `client · feat/client-orders · react-ts · 3 edited · template v1.4`.
- **Output style for reviews:** a consistent review format across all projects.
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

- Who owns the template (`CODEOWNERS`) and reviews changes?
- Should projects pin a template version, or always take latest?
- When does the npm → pnpm move happen, and in which projects first?
- Is NestJS + Prisma confirmed for an upcoming project? That sets the priority of the Prisma templates.
- Which projects use i18n/RTL? That decides whether the UI-strings hook is worth it.

---

## Maintaining this roadmap

- When an item merges, move it to **Done** under its PR number and update the status table.
- New ideas go to **Brainstorming** first. Promote them to **Next up** once there's a concrete why and an example.
- Pilot feedback becomes items here, with a link to the feedback entry.
