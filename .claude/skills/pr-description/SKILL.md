---
name: pr-description
description: Build a pull request description from the branch diff (git diff main...HEAD) using the repo's PR template, after running the code-reviewer and test-runner agents. Use when the user asks for a PR description, PR body, or to prepare a branch for review.
argument-hint: "[base branch, default main]"
allowed-tools: Read, Grep, Glob, Agent, Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(node .claude/scripts/check.mjs:*)
---

# PR description

The base is `$ARGUMENTS`, or `main` if no argument was given. Nothing is pushed or created remotely. The output is the markdown body only.

1. **Gather**
   - `git status` (warn if there are uncommitted changes, since they won't be in the PR)
   - `git log --oneline <base>..HEAD`
   - `git diff --stat <base>...HEAD`
   - `git diff <base>...HEAD`
   - the reviewer guide `review/<branch>.md` (branch name with `/` → `-`), if `/review-guide` was run
2. **Run the agents in parallel** (one message, two Agent calls):
   - `code-reviewer`: "Review the diff <base>...HEAD."
   - `test-runner`: "Run typecheck, lint and tests for: <packages>." List the packages explicitly, from the top folders in `git diff --name-only <base>...HEAD` (client, server, db, utils; a .NET change is `server`, or `dotnet` if `server/` is a Node package; a utils change adds every Node package). `--changed` only sees uncommitted files, so it would report nothing on a committed branch.
3. **Classify the changes**:
   - by package (client, server, db, utils)
   - API contract changes (utils schemas)
   - migrations (new files in the migration dir)
   - new env vars (names only)
   - breaking changes
4. **Fill in** `.claude/skills/pr-description/pr-template.md`:
   - Title in Conventional Commit form, for example `feat(server): add user matches endpoint`.
   - Summarize the *why*. Use the commit messages and the branch name for context.
   - **How to test**: if the reviewer guide exists, list its P1 test cases (title plus expected result) and add `Full reviewer guide: review/<branch>.md`. If it doesn't exist, write the steps from the diff and suggest running `/review-guide` first.
   - Keep it factual and draw only from the diff. Delete template sections that don't apply instead of writing "N/A".
   - Put the agents' outcomes in **Checks**: test-runner's pass/fail per package, and code-reviewer's Critical and Should-fix items. If there are Critical findings, say so at the top and recommend fixing them before opening the PR.
5. **Output** the final markdown in a fenced block, ready to paste.
