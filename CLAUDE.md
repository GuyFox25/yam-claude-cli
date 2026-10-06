# Project guide for Claude

This is a React web project with a client and, depending on the project, a Node, .NET or SAP backend. Everything in this file down to `## Project-specific` is shared template content, reused unchanged across projects. Put this project's details in the last section.

## Stack variants (detected, never assumed)

At session start a hook prints a `Stack:` line: package manager, `client=react-ts|react-js`, `backend=express|nestjs|dotnet|external`, ORM, `db=postgresql|mongodb|...` and test runner, plus the in-house libraries. Trust it over the examples below.

| Part | Variants across projects |
|------|--------------------------|
| Client | Always React. **TSX + function components** (current projects) or **legacy JSX + class components** (plain JS, no tsconfig). |
| Backend | **SAP ABAP** (most projects: no backend in this repo, the client calls SAP Gateway OData), **Node** in `server/` (Express + Drizzle now, NestJS + Prisma possible later), or **C# .NET** (a solution somewhere in the repo). |
| Database (Node backends) | **PostgreSQL** today (managed with pgAdmin 4), **MongoDB** possible later (Mongoose or Prisma). Detected as `db=` in the Stack line. Rules: `.claude/rules/db.md`. You never connect to a DB; you give the user queries to run in pgAdmin or Compass. |
| Package manager | npm today, pnpm possible later (`pnpm-lock.yaml` / `pnpm-workspace.yaml` → pnpm, `package-lock.json` → npm). |
| In-house libraries | npm packages (sometimes a linked local checkout) that ship a `claude-lib.md` prompt file. See "In-house libraries". |

## Repo map

Packages live at fixed root folders; any of them may be missing (hooks and scripts skip missing ones).

| Package   | Role | May import |
|-----------|------|------------|
| `client/` | React UI. Talks to the backend **only over HTTP** (REST API or SAP OData). | `utils`, in-house libs |
| `server/` | Node HTTP API (Express or NestJS): auth, validation, business logic. **No SQL, no ORM, no DB drivers.** Or a .NET solution (see `server/CLAUDE.md`). | `utils`, `db` (public API only) |
| `db/`     | Node data-access API. **The only package that uses the ORM/ODM** (Drizzle, Prisma or Mongoose) or a DB driver. Owns migrations and seeds. | `utils` |
| `utils/`  | Shared Zod schemas, TS types/DTOs, DB schema definitions. No dependencies on other packages. | nothing internal |

There's more detail in each package's own `CLAUDE.md`. Shared rules live in `.claude/rules/` (code style, React, backend, C#, DB, testing).

### SAP ABAP backends
- The backend is ABAP on SAP, outside this repo. You can't see, run or change it; only the client and its API layer are in scope.
- **Never invent OData service names, entity sets, fields or function imports.** Use the types, service constants or saved `$metadata` already in the repo, or ask. The network is closed, so `$metadata` can't be fetched.
- Write calls (POST/PUT/PATCH/DELETE/MERGE) need the `x-csrf-token` fetch first; `$filter` values must be escaped (quotes doubled), never concatenated raw. Prefer the in-house OData library if there is one.
- If something needs an ABAP change, say so and describe the change for the SAP team.

## Commands

Prefer the check runner. It resolves the package manager, script names, and the dotnet CLI for you:

```bash
node .claude/scripts/check.mjs typecheck [client|server|db|utils|--changed]
node .claude/scripts/check.mjs lint      [pkg...|--changed]
node .claude/scripts/check.mjs test      [pkg...|--changed] [-- <file or -t "name">]
node .claude/scripts/check.mjs <kind> --files <file...>   # only those files: lint them, their type errors, related tests
```

Plain-JS packages have no typecheck (skipped). A .NET backend is the `server` target (or `dotnet` if `server/` is a Node package) and runs `dotnet build|format|test --no-restore`.

| Task | npm workspaces | pnpm |
|------|----------------|------|
| Install | `npm install` | `pnpm install` |
| Build all | `npm run build --workspaces` | `pnpm -r build` |
| Run in one package | `npm run <script> -w <pkg>` | `pnpm --filter <pkg> <script>` |
| Add a dependency | `npm install <dep> -w <pkg>` | `pnpm --filter <pkg> add <dep>` |
| Migrate / seed | `npm run <migrate script> -w db` | `pnpm --filter db <migrate script>` |

`<pkg>` is the package's `name` from its `package.json`, which may differ from the folder name. Never guess script names; read `scripts`. Installing dependencies, running migrations and committing all need approval. The network is closed, so only use packages that are already installed.

## In-house libraries

- Each in-house library ships `claude-lib.md` (purpose, API map, usage patterns, gotchas, breaking changes) at its package root. Any installed dependency with that file is discovered automatically.
- Each one gets a generated expert agent, `lib-<name>` (for example `lib-acme-ui` for `@acme/ui`), refreshed at session start. Use that agent, or `library-expert` for any library, **before** writing code against a library. Don't guess its API.
- Tools: `node .claude/scripts/lib-info.mjs list | show <lib> | api <lib> | usage <lib> | changes <lib>`.
- Never edit `node_modules/` (blocked). Fix library bugs in the library's repo; for a linked checkout, `lib-info show` prints its path. Keep `claude-lib.md` current with `/lib-doc` in the library repo.

## Boundary rules (enforced by hooks and the reviewers)

1. **server has no SQL or ORM** (Node). No `drizzle-orm`, `@prisma/client`, `pg`, `mongoose`, `mongodb`, `knex` or similar, and no raw SQL strings or Mongo filters. It calls db's exported functions or service. In .NET, data access stays in its data layer and controllers never query directly.
2. **Only db uses the ORM.** Queries, transactions, migrations and seeds all live in `db/` (Node).
3. **Shared types and schemas live in utils.** Request and response DTOs, Zod schemas, enums and DB schema definitions are defined there once. Never duplicate a type in server or client.
4. **client never imports db or server code.** It only uses HTTP/OData calls plus types from utils. **db imports only utils**, and **utils imports no other package** of the repo.
   - In server, **controllers and routers never import db**; they call a service, and the service calls db.
   - Drizzle tables are imported from their own file, never from the schema barrel (`../schema`, `<utils>/schema`).
5. **Changes to utils ripple.** After changing a schema or type in utils, typecheck server, db and client (`check.mjs typecheck --changed` does this automatically).
6. Validate all external input at the server edge (utils Zod schemas in Node; the project's validation in .NET).

## Protected files (blocked by hooks)

The hooks guard the Edit/Write tools. Never work around them with shell commands (`cat`, `sed -i`, `>` redirects, `cp`, `mv`): the same rules apply.

- `.env*`: never read or edit these. Ask the user about anything secret. Only `.env.example` (variable names, no values) may be edited.
- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, NuGet `packages.lock.json`): change them only through the package manager.
- Applied (committed) migrations: Drizzle/Prisma files and EF Core migrations, `.Designer.cs` and `ModelSnapshot`. Never edit them; add a new migration instead.
- `node_modules/`: installed libraries are never edited in place.
- `.claude/settings.json`: propose changes, or use `.claude/settings.local.json`.
- The rest of `.claude/` is shared template content: edit it only in the template repo (marked by `.claude/template-source.md`), then re-export with `export-template.mjs`. In projects, put details in `## Project-specific`.
- Commands that are blocked:
  - `rm -rf`, `git push`, `git reset --hard`, `--force`
  - `curl`/`wget`, and installs from URLs
  - destructive DB commands: `dropdb`, `DROP`/`TRUNCATE` run through `psql`, `dropDatabase()`, `deleteMany({})`, `prisma migrate reset`
  - migrate and seed commands (drizzle-kit, prisma, migrate-mongo, `dotnet ef database update`, and package scripts that run them) when the database URL or connection string points at a non-local host. The hook reads the env files itself and never prints the values. A docker host can be allowed with `CLAUDE_LOCAL_DB_HOSTS` in `settings.local.json` `env`. If no URL is found, the hook asks.
- Whole-file reads of lockfiles, build output (`dist/`, `build/`, `coverage/`...), minified or generated files, and files over 256 KB are blocked. Use Grep, or Read with `offset`/`limit`.
- These edits ask the user first:
  - adding a dependency to any `package.json`
  - turning an existing class component into a function component

## Code style

The full rules are in `.claude/rules/`:
- JS/TS (`code-style.md`): arrow functions, import order, small functions, comments, library lookup order. The project's ESLint config wins where it differs.
- React (`react.md`): function components with hooks, component folders, SOLID, react-hook-form forms, API data through the yam-lib / mador-yam-* react-query extensions. **Existing class components stay classes** unless the user asks to convert them.
- Backend (`backend.md`): Zod at every boundary, precise errors in one shape, controller → service → db, dependency injection.
- C# (`csharp.md`): follow the existing solution; async with `Async` suffix; parameterized SQL only.

Prettier and ESLint (or `dotnet format whitespace` for C#) run automatically after every edit. A style hook then checks the lines you added and sends advisory notes, for example `function` declarations, `any`, more than 3 params, commented-out code, unparsed `req.body`, vague errors, or `fetch` inside a component. Fix the notes that apply; ESLint wins where it differs. The session `Client libs:` and `ESLint:` lines tell you which form, data and lint setup to follow. When you stop, the files **you** changed this session are linted and typechecked (only their errors count), and the full test suite of each package you touched runs (only the related tests if a package has no test script). Failures block the stop.

Other hooks:
- **utils ripple**: after you edit a utils module, a note lists the db, server and client files that import it. Follow the change through them.
- **rule injection**: a prompt about migrations, endpoints, tests or components gets the key points of the matching `.claude/rules` file, once per session.
- **audit log**: every tool call (tool, file or command, time, session; never file contents) is appended to `.claude/logs/audit.jsonl` (local, gitignored).
- **compaction snapshot**: before compaction, the prompts, decisions, last plan, todos and edited files are saved to `.claude/scratch/` and printed again afterwards. Trust it over the summary for details.
- **bell**: a terminal bell and desktop notification fire when Claude waits for you. Turn them off with `CLAUDE_HOOK_BELL=off` in `settings.local.json` `env`.

Requirements: Claude Code 2.1.47 or newer, Node 18+, and on Windows Git for Windows (hooks run through Git Bash).

## Branches and commits

- Branch from `main` as `<type>/<package>-<short-desc>`, for example `feat/server-user-search` or `fix/client-orders-table`. Putting the package in the name lets the session hook detect it.
- Use **Conventional Commits**: `<type>(<scope>): <imperative summary>`, at most 72 characters, lowercase, no period.
  - types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`
  - scope: `client`, `server`, `db`, `utils`, or a feature name. Body: explain *why*. Use `BREAKING CHANGE:` in the footer when needed.
- Keep each commit to one logical change. A migration and the schema change that produced it go in the same commit.
- Never commit or push without asking. Pushing is always left to the user.

## Workflow

- Skills: `/new-endpoint`, `/db-migration`, `/write-tests`, `/commit`, `/pr-description`, `/fix-ci`, `/onboard`, `/lib-doc`
- Agents: `code-reviewer`, `architecture-guard`, `test-runner`, `security-reviewer`, `db-expert`, `library-expert`, plus the generated `lib-*` agents
- Before you say you're done, run `check.mjs typecheck --changed`, then `lint --changed`, then `test --changed`.

## Project-specific
<!-- Add project-specific notes below. Everything above is shared template content. -->
<!-- Suggested: product summary; backend (SAP ABAP + OData service names / Node / .NET); package names (for --filter / -w);
     DB engine/version and local DB setup (e.g. "PostgreSQL 16, local DB app_dev in pgAdmin");
     env var names only; in-house libraries used and what for; auth approach; deploy notes. -->
