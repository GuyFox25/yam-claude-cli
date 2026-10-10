---
name: upgrade-lib
description: Upgrade an in-house (or any) library to a new version - read its changes and breaking changes, find every usage in the repo, bump the dependency (with the user's approval), apply the code changes and run the checks. Use when the user asks to upgrade, bump or update a library, or to migrate to a new major version.
argument-hint: "<package> [target version]  e.g. @acme/ui 3.0.0"
allowed-tools: Read, Grep, Glob, Edit, Write, Agent, Bash(node .claude/scripts/lib-info.mjs:*), Bash(node .claude/scripts/check.mjs:*), Bash(git status:*), Bash(git diff:*), Bash(npm install:*), Bash(pnpm --filter * add:*), Bash(pnpm add:*)
---

# Upgrade library: $ARGUMENTS

The network is closed. The new version must already be available (a linked checkout, a local registry mirror, or the user installs it). Installing always needs the user's approval.

1. **Where it is used.**
   - `node .claude/scripts/lib-info.mjs show <lib>`: installed version, linked path, `claude-lib.md`.
   - `node .claude/scripts/lib-info.mjs usage <lib>`: the files that import it. Note which packages (`client`, `server`…) depend on it in their `package.json`.
2. **What changed.**
   - `node .claude/scripts/lib-info.mjs changes <lib>`: the breaking-changes section of `claude-lib.md` and the changelog.
   - For an in-house library, ask its `lib-<name>` agent (or `library-expert`): "What changed between <current> and <target>, and how is each change migrated?"
   - If the target version's docs aren't available locally yet, stop after step 3 and ask the user to install it first.
3. **Plan.** Build a table: breaking change → affected files (`file:line`) → the migration. Include deprecations that still work but warn. Show it to the user before touching code. A major-version jump across several majors is done one major at a time.
4. **Bump** the version in each affected `package.json` through the package manager (`npm install <lib>@<version> -w <pkg>` or `pnpm --filter <pkg> add <lib>@<version>`). This asks for approval; never edit lockfiles by hand.
5. **Migrate** each affected file, following the library's documented pattern. Keep the changes mechanical: don't refactor unrelated code. Class components stay classes.
6. **Check.** Run `node .claude/scripts/check.mjs typecheck <pkgs>`, then `lint <pkgs>`, then `test <pkgs>`. Fix what the upgrade broke. If a failure comes from a library bug, report it and say it must be fixed in the library's repo (never in `node_modules`).
7. **Report** the old → new version, the files changed per breaking change, the check results, and anything left for the user (manual QA, other projects on the old version). Suggest `/commit` with `build(<pkg>): upgrade <lib> to <version>`.
