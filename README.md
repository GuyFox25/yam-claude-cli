# yam-claude-cli: Claude Code project template

One shared Claude Code setup for all of our React projects, whatever their backend: SAP ABAP (OData), C# .NET, or Node (Express/NestJS + Drizzle/Prisma/Mongoose). The template holds the `CLAUDE.md` guides, hooks, skills, agents, rules and scripts. It's developed in this repo and **exported** into each project. A project changes only the `## Project-specific` section of its `CLAUDE.md` files. Everything else comes from here.

```
yam-claude-cli (this repo)                              your project
├── CLAUDE.md, client|server|db|utils/CLAUDE.md   ──►   template part replaced, "## Project-specific" kept
├── .claude/ (hooks, skills, agents, rules...)    ──►   copied; protected from edits in the project
├── .gitignore                                    ──►   missing lines appended
└── CODEOWNERS                                    ──►   copied only if the project has none
          node .claude/scripts/export-template.mjs <project-dir>
```

Nothing is hard-coded to one stack. At session start the template **detects** the package manager, client flavor, backend, ORM, database, test runner and in-house libraries, and tells Claude what it found.

See [ROADMAP.md](ROADMAP.md) for what's done and what's next.

---

## Contents

- [What it provides](#what-it-provides)
- [Supported stacks](#supported-stacks)
- [Requirements](#requirements)
- [Installing into a project](#installing-into-a-project)
- [Updating a project](#updating-a-project)
- [Daily use](#daily-use)
- [In-house libraries](#in-house-libraries)
- [Per-developer settings](#per-developer-settings)
- [What gets blocked, and why](#what-gets-blocked-and-why)
- [Troubleshooting](#troubleshooting)
- [Developing the template](#developing-the-template)

---

## What it provides

### Guides (`CLAUDE.md`)
| File | Purpose |
|------|---------|
| [CLAUDE.md](CLAUDE.md) | Repo map, boundary rules, protected files, commands, code style summary, branch/commit rules, workflow. |
| [client/CLAUDE.md](client/CLAUDE.md) | React (TSX or legacy JSX/class), API layer, SAP OData rules, forms and server state. |
| [server/CLAUDE.md](server/CLAUDE.md) | Node API (Express/NestJS) or .NET: controller → service → db, validation, errors. |
| [db/CLAUDE.md](db/CLAUDE.md) | The only package that touches the ORM: queries, migrations, seeds. |
| [utils/CLAUDE.md](utils/CLAUDE.md) | Shared Zod schemas, types and DTOs, and DB schema definitions. |

Packages that don't exist in a project (for example `server/` and `db/` in an SAP project) are simply skipped.

### Hooks (`.claude/hooks/`, wired in [`.claude/settings.json`](.claude/settings.json))
| Hook | Event | What it does | Effect |
|------|-------|--------------|--------|
| `session-context` | SessionStart | Prints branch, uncommitted files, likely package, the `Stack:` line, client form/data libraries, ESLint configs and in-house libraries. Regenerates `lib-*` agents and restores the compaction snapshot. | context |
| `prompt-context` | UserPromptSubmit | When a prompt is about migrations, endpoints, tests or components, adds the key points of the matching rule file (once per session). | context |
| `guard-bash` | PreToolUse (Bash/PowerShell) | Blocks destructive commands (`rm -rf`, `git push`, `reset --hard`, `--force`, `DROP`/`TRUNCATE`...), network commands (`curl`, `wget`), and migrate/seed commands aimed at a non-local DB. | **blocks** / asks |
| `guard-boundaries` | PreToolUse (Read/Edit/Write) | Protects `.env*`, lockfiles, applied migrations, `node_modules`, settings and the template's `.claude/`. Enforces package import boundaries. Blocks whole-file reads of lockfiles, build output and huge files. Asks before adding a dependency or converting a class component. | **blocks** / asks |
| `track-edits` | PostToolUse | Records which files Claude edited this session. | internal |
| `format-on-write` | PostToolUse | `prettier` + `eslint --fix` on the edited file (`dotnet format whitespace` for C#). | auto-fix |
| `style-advice` | PostToolUse | Notes on the lines just added: `function` declarations, `any`, >3 params, commented-out code, raw `req.body`, vague errors, `fetch` in components... | advisory |
| `ripple-advice` | PostToolUse | After a `utils` edit, lists the db/server/client files that import it. | advisory |
| `audit-log` | PostToolUse (async) | Appends tool + file/command + time to `.claude/logs/audit.jsonl`. Never logs contents; secrets are redacted. | log |
| `precompact-snapshot` | PreCompact | Saves prompts, decisions, the last plan, todos and edited files to `.claude/scratch/`. | context |
| `stop-check` | Stop | Lints and typechecks only the files Claude edited and runs the test suites of their packages. Only failures in those files or their related tests block. | **blocks** on own failures |
| `notify-bell` | Notification | Terminal bell + desktop notification when Claude is waiting for you. | notify |

### Skills (slash commands, `.claude/skills/`)
| Skill | Use it to... | Example prompt |
|-------|--------------|----------------|
| `/new-endpoint` | Scaffold a feature end to end: utils → db → server → client (Node), controller/service/data → client (.NET), or client API + hook against an existing OData service (SAP). Tests included. | `/new-endpoint GET /orders/:id returning the order with its lines` |
| `/db-migration` | Change the schema, generate a new migration, review the SQL, apply locally, update seeds. | `/db-migration add a nullable cancelled_at to orders` |
| `/write-tests` | Write and run tests for a file with the detected runner. | `/write-tests client/src/components/OrderCard/OrderCard.tsx` |
| `/commit` | Write a Conventional Commit message; commits only after you confirm. | `/commit` |
| `/review-guide` | Write `review/<branch>.md` for the reviewer: manual QA test cases (P1–P3) and ranked review pointers with `file:line`, from the branch diff. | `/review-guide` |
| `/pr-description` | Run code-reviewer + test-runner, then fill the PR template from `git diff main...HEAD`. | `/pr-description` |
| `/fix-ci` | Diagnose a pasted CI log and reproduce the failure locally. | `/fix-ci` + paste the log |
| `/onboard` | Explain the repo, stack, boundaries and how to run everything. | `/onboard` |
| `/lib-doc` | Create or refresh `claude-lib.md` inside an in-house library's repo. | `/lib-doc` (run in the library repo) |

### Agents (`.claude/agents/`)
| Agent | Model | When to use |
|-------|-------|-------------|
| `code-reviewer` | opus | After meaningful changes, before a commit/PR. Critical / Should fix / Nit with file:line. Never edits. |
| `security-reviewer` | opus | Changes to auth, endpoints, queries, file handling, config. |
| `architecture-guard` | sonnet | Changes spanning packages, or "where does this belong?" |
| `db-expert` | sonnet | Schema design, indexes, query performance, risky migration plans. Read-only. |
| `library-expert` | sonnet | Any installed library: API, how this repo uses it, what changed between versions. |
| `lib-<name>` | — | Generated per in-house library from its `claude-lib.md`. Preferred over `library-expert`. |
| `test-runner` | haiku | Runs typecheck/lint/tests and returns only failures with likely causes. |

### Rules (`.claude/rules/`)
`code-style.md`, `react.md`, `backend.md`, `db.md`, `csharp.md`, `testing.md`. They hold the detailed conventions. Claude loads them when it works on matching files, and `prompt-context` injects their key points early.

### Scripts (`.claude/scripts/`)
| Script | Purpose |
|--------|---------|
| `check.mjs` | One command for typecheck/lint/test in any package. It resolves npm/pnpm, script names and the dotnet CLI. |
| `lib-info.mjs` | `list`, `show`, `api`, `usage`, `changes`, `sync-agents` for installed (in-house) libraries. |
| `export-template.mjs` | Export or update the template into a project (template repo only). |

### Permissions ([`.claude/settings.json`](.claude/settings.json))
- **Allowed without asking:** the check runner, test/lint/typecheck scripts (npm and pnpm), `git status/diff/log`, `lib-info`, `dotnet build/test/format`.
- **Ask first:** `git commit`, installs, migrations and seeds, `psql`/`mongosh` and dump/restore, `npm link`, exporting the template.
- **Denied:** `WebFetch`, `WebSearch`, MCP servers, `git push`, `curl`/`wget`, reading `.env*` and `secrets/`.
- Env: auto-updater and non-essential traffic are off (the network is closed).

---

## Supported stacks

| Part | Variants |
|------|----------|
| Client | React: TSX + function components, or legacy JSX + class components (classes are never converted unless you ask). |
| Backend | SAP ABAP via OData (no backend in the repo), Node in `server/` (Express or NestJS), or a C# .NET solution. |
| ORM / DB | Drizzle or Prisma on PostgreSQL; Mongoose/Prisma on MongoDB. Claude never connects to a DB; it gives you queries for pgAdmin or Compass. |
| Package manager | npm or pnpm (from the lockfile or workspace file). |
| Tests | Vitest, Jest, or xUnit/NUnit/MSTest. |

At session start you'll see a line like this:

```
Stack: pm=npm, client=react-ts, backend=express, orm=drizzle, db=postgresql, tests=vitest, packages=client,server,db,utils
```

If the detection is wrong, fix it in [`.claude/lib/detect.mjs`](.claude/lib/detect.mjs) (in this repo), not in the project.

---

## Requirements

- **Claude Code 2.1.47** or newer
- **Node 18+** (hooks and scripts use Node built-ins only)
- **Windows:** Git for Windows. Hooks run through Git Bash.

---

## Installing into a project

Run these from this repo:

```bash
# 1. See what would change
node .claude/scripts/export-template.mjs ../my-project --dry-run

# 2. Export
node .claude/scripts/export-template.mjs ../my-project
```

What happens:
- **`.claude/`** is copied, except `template-source.md`, `settings.local.json`, generated `lib-*` agents, hook tests and the export script itself. A `template-manifest.json` records what was copied.
- **`CLAUDE.md`** (root, plus `client/`, `server/`, `db/`, `utils/` if those folders exist) gets the template content. An existing `## Project-specific` section is kept. Any other existing content is moved under it.
- **`.gitignore`**: missing template lines are appended.
- **`CODEOWNERS`** is copied only if the project has none.

Then, in the project:
1. Fill in each `## Project-specific` section: OData service names and the helper used, data-fetching library, in-house UI library, special scripts, anything unusual.
2. Start `claude` and check that the `Stack:` line is correct.
3. Commit on a branch, e.g. `chore/claude-code-setup`.

Because `template-source.md` is not exported, the project's `.claude/` is **read-only for Claude**. Only `.claude/settings.local.json` can be changed there.

## Updating a project

Make the change here, merge it, and export again with the same command. Template files deleted since the last export are removed (tracked via the manifest), and `## Project-specific` sections are kept. Review the diff in the project and commit it.

---

## Daily use

Work normally. The hooks run by themselves. A few habits help:

```bash
# Checks (also what Claude runs before saying it's done)
node .claude/scripts/check.mjs typecheck --changed
node .claude/scripts/check.mjs lint --changed
node .claude/scripts/check.mjs test --changed
node .claude/scripts/check.mjs test client -- src/components/OrderCard.test.tsx
node .claude/scripts/check.mjs lint --files client/src/api/orders.ts
```

- **Starting a feature:** branch as `<type>/<package>-<short-desc>` (e.g. `feat/client-order-search`). The session hook uses the package in the name.
- **Adding data flow:** `/new-endpoint`. **Schema change:** `/db-migration`. **Tests:** `/write-tests`.
- **Before a PR:** ask for the `code-reviewer` (and `security-reviewer` when relevant), then run `/review-guide` and `/pr-description` (it links the guide).
- **Committing:** `/commit`. Claude asks before every commit and never pushes.
- **When Claude stops:** the Stop hook checks only what Claude edited. If its own changes break lint, types or related tests, it keeps working. Failures that were already there are shown to you as a note.
- **SAP projects:** Claude never invents OData services, entity sets or fields. Put saved `$metadata` or service constants in the repo, or tell it. If something needs an ABAP change, it describes the change for the SAP team.

---

## In-house libraries

1. **In the library's repo**, run `/lib-doc`. It writes `claude-lib.md` (purpose, API map, usage patterns, gotchas, breaking changes) from [the template](.claude/skills/lib-doc/claude-lib.template.md). Ship the file in the package.
2. **In any project** that installs (or `npm link`s) the library, the session hook finds `claude-lib.md` and generates a `lib-<name>` agent, e.g. `lib-acme-ui` for `@acme/ui`.
3. Claude looks in the repo first (utils, `global/`, `shared/`, `common/`). Only when nothing fits does it ask the `lib-*` agent, and it does that before writing code against the library.

```bash
node .claude/scripts/lib-info.mjs list
node .claude/scripts/lib-info.mjs show @acme/ui      # summary + path of a linked checkout
node .claude/scripts/lib-info.mjs api @acme/ui
node .claude/scripts/lib-info.mjs usage @acme/ui     # where this repo uses it
node .claude/scripts/lib-info.mjs changes @acme/ui 2.0.0
```

Generated `lib-*.md` agents are gitignored. To commit a hand-written expert, give it a different name (e.g. `acme-ui-expert.md`).

---

## Per-developer settings

Personal settings go in `.claude/settings.local.json` (gitignored) and `CLAUDE.local.md` (gitignored).

```json
{
  "env": {
    "CLAUDE_HOOK_BELL": "off",
    "CLAUDE_LOCAL_DB_HOSTS": "postgres,db,host.docker.internal"
  }
}
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLAUDE_HOOK_BELL` | on | `off` disables the bell and desktop notification. |
| `CLAUDE_LOCAL_DB_HOSTS` | — | Extra hostnames (comma-separated) the migration guard treats as local, e.g. docker service names. |
| `CLAUDE_AUDIT_MAX_BYTES` | 5 MB | Size at which `.claude/logs/audit.jsonl` rotates. |
| `CLAUDE_HOOK_STATE_DIR` | `<tmp>/claude-hooks` | Where the per-session edit ledger is kept. |

---

## What gets blocked, and why

| You'll see a block when Claude tries to... | Why | What to do |
|---------------------------------------------|-----|------------|
| read or edit `.env*` | secrets | Tell Claude the variable names it needs, or edit `.env.example`. |
| edit a lockfile | must match the package manager | Install through npm/pnpm (Claude asks first). |
| edit an applied migration | it already ran somewhere | Add a new migration (`/db-migration`). |
| import the ORM in `server/`, `db/` in a controller, or `server`/`db` in `client` | package boundaries | Go through a service → db function, or through utils types + HTTP. |
| run a migration against a non-local DB | protects shared databases | Run it yourself, or add the docker host to `CLAUDE_LOCAL_DB_HOSTS`. |
| `git push`, `rm -rf`, `reset --hard`, `curl` | irreversible / network closed | Do it yourself if you really mean it. |
| edit `.claude/` in a project | shared template | Change it in this repo and re-export. |
| read a whole lockfile, `dist/`, or a >256 KB file | context waste | Claude uses Grep or a partial Read instead. |

---

## Troubleshooting

- **Hooks don't run on Windows:** install Git for Windows and make sure `bash` and `node` are on `PATH`. Restart Claude Code.
- **No `Stack:` line at start:** run `node .claude/hooks/session-context.mjs < /dev/null` to see errors.
- **Stop hook is slow:** it runs the full test suites of the touched packages (600s timeout). Make sure the package `test` script runs once (not watch mode).
- **A block looks wrong:** check `.claude/logs/audit.jsonl` for the exact command or path. Report it here with an example so a test fixture can be added.
- **Context lost after compaction:** the snapshot is in `.claude/scratch/compact-<session>.md` and is printed again automatically.

---

## Developing the template

This repo contains `.claude/template-source.md`. While that marker exists, `.claude/` is editable here. Never delete it, and never copy it into a project.

```
.claude/
├── hooks/        # one .mjs per hook + __tests__/ (node:test, fixtures/*.json)
├── lib/          # shared code: detect, hook-io, edits ledger, imports, libs, db-target, read-guard, scoped checks, snapshot
├── scripts/      # check, lib-info, export-template
├── rules/        # detailed conventions per area
├── skills/       # SKILL.md + templates
├── agents/       # reviewer/expert subagents
└── settings.json # permissions + hook wiring
```

```bash
# Run all hook tests (use the glob; the bare directory form fails on newer Node)
node --test .claude/hooks/__tests__/*.test.mjs
```

Guidelines:
- **Stay generic.** Never hard-code a package manager, framework, ORM or script name. Detect it (`lib/detect.mjs`) and handle every stack variant: TSX and legacy JSX, SAP/.NET/Node, npm/pnpm.
- **Node built-ins only** in hooks and scripts. Projects have a closed network.
- **Claude Code 2.1.47 compatibility:** use the shell-form hook command `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/x.mjs`. Check newer features against the changelog before using them.
- **New hook:** add `hooks/<name>.mjs` (header comment: event + behavior), wire it in `settings.json`, add `__tests__/<name>.test.mjs` with fixtures, and document it in `CLAUDE.md` and this README.
- **Commits:** Conventional Commits, scoped e.g. `feat(hooks): ...`, `docs(rules): ...`. Branch from `main`, open a PR.
- **Release:** merge, then re-export into each project.
