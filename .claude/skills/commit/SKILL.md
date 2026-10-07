---
name: commit
description: Write a Conventional Commit message for the current changes and commit only after the user confirms. Use when the user asks to commit, or says the work is ready to commit.
argument-hint: "[optional hint for the message or scope]"
disable-model-invocation: true
allowed-tools: Read, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git branch:*), Bash(git switch:*), Bash(node .claude/scripts/check.mjs:*)
---

# Commit

Hint from the user: $ARGUMENTS

1. **Inspect.** Run `git status`, `git diff --staged` and `git diff`, then `git log --oneline -10` to see this repo's message style.
   - If the current branch is `main` (or the default branch), propose a branch named `<type>/<package>-<short-desc>` (CLAUDE.md § Branches and commits) and create it with `git switch -c` once the user agrees. The uncommitted changes move with it.
2. **Check the scope.**
   - If nothing is staged, propose which files to stage. Never stage `.env*`, secrets, build output or unrelated changes.
   - If the changes span unrelated concerns, propose splitting them into several commits.
   - A migration must be committed together with its schema change.
3. **Verify** with `node .claude/scripts/check.mjs typecheck --changed`, then `lint --changed`, then `test --changed`. If any of them fails, report it and stop unless the user says to commit anyway.
4. **Write the message:**
   ```
   <type>(<scope>): <imperative summary, lowercase, ≤72 chars, no period>

   <body: why the change was made and any notable decisions, wrapped at 72>

   <footer: BREAKING CHANGE: ..., Refs: #123>
   ```
   - `type`: `feat` | `fix` | `refactor` | `perf` | `test` | `docs` | `chore` | `build` | `ci`
   - `scope`: `client` | `server` | `db` | `utils`, or the feature name. If several packages are involved, use the feature name.
   - Add `BREAKING CHANGE:` whenever a utils schema or API contract changes incompatibly.
5. **Ask.** Show the files to be committed and the full message, then ask the user to confirm or edit. **Do not commit without an explicit yes.**
6. **Commit** after confirmation, using `git add <specific files>`, then `git commit -F -` with the message passed through a heredoc. Never use `--no-verify`, `--amend` (unless asked) or `push`.
7. **Report** the commit hash and summary. Pushing is left to the user.
