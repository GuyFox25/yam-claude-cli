---
name: onboard
description: Explain this repo to a newcomer, covering the package map, boundary rules, detected stack, and how to install, run, test and migrate everything. Use when someone is new to the repo or asks how the project is structured, how to run it, or where something belongs.
argument-hint: "[optional focus, e.g. client | db | testing]"
allowed-tools: Read, Grep, Glob, Bash(git log:*), Bash(git status:*), Bash(node .claude/scripts/lib-info.mjs:*)
---

# Onboard

Focus: $ARGUMENTS, or the whole repo if none was given. Base everything on the files actually present; don't recite the template blindly.

1. **Read** the root `CLAUDE.md` (especially `## Project-specific`), each `client|server|db|utils/CLAUDE.md`, the root `package.json`, and each package's `package.json`.
2. **Detect and state the stack:**
   - package manager (from the lockfile)
   - client: React with TSX and function components, or legacy JS with class components (`client/tsconfig.json`, `extends React.Component`)
   - backend variant:
     - **Node** (`server/package.json`: `@nestjs/core` or `express`, with the ORM `drizzle-orm` or `prisma` in db)
     - **.NET** (`*.sln`: target framework, EF Core or not, test framework)
     - **SAP ABAP** (no backend in the repo: list the OData services the client calls, from its API layer)
   - test runner per package
   - Node version (`.nvmrc` or `engines`)
   - in-house libraries (`node .claude/scripts/lib-info.mjs list`): what each one is for, and its `lib-*` agent
3. **Explain the map:**
   - one line per package with its role and what it may import
   - the main entry points (`Glob` for `main.ts`, `app.ts`, `index.ts`, `App.tsx`)
   - the env vars, from `.env.example` or the config module. **Never read `.env`.**
4. **Explain the boundaries** that apply to this variant, and why they exist:
   - Node: the server has no ORM, only db touches the database, utils is the contract, and utils changes ripple to the other packages
   - .NET: thin controllers, data access in its own layer, DTOs rather than entities
   - SAP: the client is the only code in the repo, all OData calls go through its API layer, and ABAP changes go to the SAP team
   - everywhere: existing class components stay classes, and in-house libraries are changed in their own repo, never in `node_modules`
   - the hooks enforce these rules: they block boundary breaks (including controller → db imports and Drizzle schema-barrel imports), ask before adding a dependency or converting a class component, and send advisory style notes after each edit. They also block migrations against non-local databases and whole reads of lockfiles and build output, flag the files affected by a utils change, and keep a local audit log in `.claude/logs/`
   - the conventions live in `.claude/rules/` (code-style, react, backend, db, testing, csharp): name the ones that apply to this stack and the few that surprise newcomers most (for example react-hook-form forms, yam-lib / mador-yam-* query hooks, controller → service → db, one error shape). Point to the session `Client libs:` and `ESLint:` lines for this repo's form, data and lint setup.
   - the rest of the loop: rule key points are injected when a prompt mentions migrations, endpoints, tests or components, and when Claude stops, the files it changed are linted and typechecked and their related tests run
5. **List the real commands** for this repo, using its script names:
   - install, dev/start per package, build
   - typecheck, lint and test, via `node .claude/scripts/check.mjs …` and the raw form
   - migrate and seed
6. **Show the feature-change workflow**, either `/new-endpoint` or utils → db → server → client by hand, followed by `/write-tests`, `/commit` and `/pr-description`.
7. **Point to an example.** Name one existing feature that's good to read end to end, with the file path in each layer.
8. If you need to show a request flow, keep it short and use a small diagram. End with any gaps you noticed: missing scripts, no tests in a package, or an empty Project-specific section.
