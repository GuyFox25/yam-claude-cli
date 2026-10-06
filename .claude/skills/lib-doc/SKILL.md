---
name: lib-doc
description: Create or refresh claude-lib.md, the prompt file an in-house library ships so that projects using it get an expert agent (lib-<name>). Run it inside the library's own repo after changing its API or releasing a version. Use when the user asks to document a library for Claude, add or update claude-lib.md, or prepare a library release.
argument-hint: "[path to the library package, default: current repo root]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git log:*), Bash(git diff:*), Bash(git tag:*), Bash(git status:*)
---

# Library prompt file: $ARGUMENTS

`claude-lib.md` is how every project learns to use this library. It ships inside the published package, so its content always matches the version a project has installed. Projects discover it automatically: their session hook creates an agent named `lib-<scope>-<name>`, whose description comes from the `summary` line.

## 1. Read the library
- `package.json`: `name`, `version`, `main`/`module`/`types`/`exports`, `peerDependencies`, `files`.
- The public entry point (`src/index.*` or whatever `exports` points to). The public API is **exactly** what that entry point exports. Internal modules are not part of it.
- The README, the CHANGELOG, and `git log` since the last tag (`git tag --sort=-creatordate`, then `git log <tag>..HEAD --oneline`). Note anything that breaks compatibility.
- 2–3 real usage examples: tests, stories and the examples folder.
- The existing `claude-lib.md`, if there is one. Update it in place and keep the sections that are still correct.

## 2. Write `claude-lib.md` at the package root
Start from `.claude/skills/lib-doc/claude-lib.template.md`. Rules:
- The `summary` is one line saying what the library is for. It becomes the agent description, so make it specific: "React table, form and layout components of the company design system", not "UI library".
- `whenToUse` says when the agent should be consulted, for example "building tables or forms in the client, or upgrading @acme/ui".
- Document **only the public API** and **real** signatures, taken from the source or types. Show each main export with a minimal, correct example, in both TS and JS when the library supports both, plus any class-component caveats if it exposes hooks.
- **Gotchas** cover what a developer would get wrong: required providers or setup, peer versions, SSR, styling imports, async behavior, error shapes, OData or CSRF handling.
- The **breaking changes** section is listed per major or minor version, with the before→after code needed to migrate. It's what `lib-info changes` and the agents use during upgrades.
- Aim for 80–250 lines. Link to the README for anything longer. No marketing text.

## 3. Ship it
- Make sure `claude-lib.md` is included when the package is published:
  - add it to `files` in package.json, if `files` exists
  - or check that `.npmignore` doesn't exclude it
- Bump nothing and publish nothing yourself. Tell the user the file must be in the next release, and point out whether the version bump needs to be major or minor because of the breaking changes you documented.
- Summarize what changed in `claude-lib.md` compared with the previous version.
