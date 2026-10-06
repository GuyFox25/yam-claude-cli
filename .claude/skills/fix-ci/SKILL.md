---
name: fix-ci
description: Diagnose and fix a CI failure from a CI log the user pastes, then reproduce the failing check locally. There is no network access, so CI can't be fetched. Use when the user pastes CI output or says CI, a pipeline, or a GitHub Actions run failed.
argument-hint: "(paste the failing CI log, or the relevant part)"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node .claude/scripts/check.mjs:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

# Fix CI from a pasted log

There is **no network access**. Work only from the pasted log and the local repo. If no log was pasted, ask for one, starting from the first error and including the step name.

1. **Parse the log.**
   - Find the **first** failing step. Later errors are often knock-on failures.
   - Classify it:
     - install/lockfile (npm/pnpm, or NuGet restore)
     - typecheck (`TS\d+`) or C# compile (`CS\d+`)
     - lint, or `dotnet format`
     - test assertion (Vitest/Jest, or xUnit/NUnit/MSTest)
     - build or migration
     - environment: a missing env var, service, or Node/.NET SDK version
   - Extract the file:line references, the failing test names and the package.
2. **Reproduce locally** with the same check:
   ```bash
   node .claude/scripts/check.mjs <typecheck|lint|test> <pkg> [-- <file or -t "test name">]
   ```
   - For .NET the package is the solution's check target (usually `server`). If the dotnet SDK isn't installed locally, the check is skipped: say so, and reason from the log and the code instead.
   - If it passes locally, compare the environments. Look for the Node version in the log vs. `.nvmrc`/`engines`, OS or path-case differences, env vars in the log vs. what the code reads, timezone or date-dependent tests, test ordering, and files that are uncommitted locally (`git status`) but missing in CI.
3. **Find the root cause.** Read the failing code and its recent changes (`git log -p -5 -- <file>`). Fix the cause, not the symptom.
4. **Fix**, within these limits:
   - Don't edit lockfiles. If the failure is a lockfile mismatch, tell the user which install command to run.
   - Don't skip or delete tests, and don't loosen lint or type rules, to get green.
   - Don't edit applied migrations.
   - If the fix needs a dependency, a secret or a CI config change, explain exactly what is needed and stop.
5. **Verify.** Rerun the failing check, then `node .claude/scripts/check.mjs typecheck --changed`.
6. **Report:**
   - the root cause, in one or two sentences
   - the files changed
   - the local verification output
   - anything the user must do in CI (a secret, cache or Node version)
