---
name: review-guide
description: Write review/<branch>.md, a guide for the PR reviewer with manual QA test cases and ranked review pointers (file:line and why), built from the branch diff (git diff main...HEAD). Use when the user asks for test cases for a PR, a reviewer guide, or review pointers, or when preparing a branch for review.
argument-hint: "[base branch, default main]"
allowed-tools: Read, Grep, Glob, Write, Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(git rev-parse:*)
---

# Review guide

The base is `$ARGUMENTS`, or `main` if no argument was given. The only output is the file `review/<branch>.md`. Nothing is committed, pushed or created remotely.

1. **Gather**
   - `git rev-parse --abbrev-ref HEAD`. If you're on the base branch, stop and ask the user to switch to the feature branch.
   - `git status`: warn about uncommitted changes, because they won't be in the PR.
   - `git log --oneline <base>..HEAD`
   - `git diff --stat <base>...HEAD`
   - `git diff <base>...HEAD`
2. **Understand the change.** Read the changed files and enough of the surrounding code (callers, routes, components, the utils schemas they use) to know which behavior a user or an API client can see. Classify the change the way `/pr-description` does:
   - by package (client, server, db, utils)
   - API contract changes (utils schemas)
   - migrations
   - new env vars (names only)
   - breaking changes

   With a SAP backend, name the OData services and entity sets that are touched, using only names found in the repo. Never invent services, fields or function imports.
3. **Write the manual QA test cases.** Write one case per user-visible behavior. Each case gets an ID (`TC-1`, `TC-2`…), a title, a priority (`P1` must pass before merge, `P2` should, `P3` nice to check), preconditions (user/role, data, env flags), numbered steps, and the expected result. Cover:
   - the happy path
   - validation and errors: invalid input, a server or OData error, empty states
   - edge cases: boundary values, long or RTL (Hebrew) text, roles and permissions, double submit or concurrency where it matters
   - regression: adjacent screens, endpoints or features that use the changed code (put these under **Regression checks**)

   Derive steps from the code: real routes, button labels, field names and messages. When you have to guess (a menu path, a test user), prefix that line with `verify:`. Don't write cases for changes nobody can observe (pure refactors, types): list them under **Safe to skim** instead.
4. **Write the review pointers**, most risky first. Each pointer is `file:line` plus one line on why it deserves attention. Look for:
   - the core logic change and its tricky branches
   - boundary rules from CLAUDE.md: server with ORM/SQL, client importing db/server, a utils change not followed through
   - security: auth and authorization checks, unvalidated input, raw SQL or unescaped `$filter`, missing `x-csrf-token` on OData writes, secrets
   - migrations: reversibility, locks on big tables, backfills, destructive steps
   - breaking API or schema changes and who consumes them
   - changed logic with no automated test
   - anything surprising that the author should explain (put these under **Open questions for the author**)

   Keep it to what really matters, usually 3 to 10 pointers. Don't repeat what ESLint or the type checker already enforces.
5. **Write the file.** The path is `review/<branch>.md`, with every `/` in the branch name replaced by `-` (for example `feat/client-orders-table` → `review/feat-client-orders-table.md`). Fill in `.claude/skills/review-guide/review-guide-template.md`, and delete the sections that don't apply instead of writing "N/A". If the file already exists, read it first, keep any block marked `<!-- manual -->` as it is, and tell the user that the rest was regenerated.
6. **Report** the file path, the number of test cases (per priority) and the number of pointers, plus the top 1–2 pointers. Tell the user that `/pr-description` will link the file. Whether to commit it with the PR is the user's choice.
