---
name: refactor-safe
description: Refactor code behind a test-first safety net - first pin the current behavior with characterization tests (including its quirks), then refactor in small steps with the tests run after each one, never changing assertions. Use when the user asks to refactor, clean up, split or restructure code without changing what it does, especially code with few tests.
argument-hint: "<file or symbol> [goal]  e.g. client/src/features/orders/OrdersTable.tsx split into smaller components"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node .claude/scripts/check.mjs:*), Bash(git diff:*), Bash(git status:*), Bash(git stash list:*)
---

# Safe refactor: $ARGUMENTS

Behavior must not change. If the user also wants a behavior change, do it as a separate step after the refactor, with its own tests.

1. **Scope.**
   - Read the target and find every caller (`Grep` the exported names).
   - Write down the public surface that must stay the same: exports, props, return values, thrown errors, HTTP responses, rendered output.
   - Agree on the goal with the user if it's vague. Respect the rules: class components stay classes unless the user asks, and package boundaries don't move.
   - Warn if there are uncommitted changes in the target files, because the refactor will be hard to review on top of them.
2. **Safety net first.**
   - Find the existing tests for the target. Run them: `node .claude/scripts/check.mjs test <pkg> -- <test file>`.
   - Where the public surface isn't covered, write **characterization tests**: assert on what the code does today, quirks included (odd rounding, an empty-string default, the order of results), following `.claude/rules/testing.md` and the `/write-tests` conventions. Name suspicious quirks in the test name (`keeps current behavior: returns '' for null`) and tell the user about them, but don't fix them now.
   - All tests must be green before any refactoring. If one fails on the current code, the test is wrong: fix the test, not the code.
3. **Refactor in small steps.** One mechanical change per step: extract a function, hook or component; rename; move; inline; replace conditionals with a lookup. After each step, run the related tests (`check.mjs test <pkg> -- <file>`) and typecheck. If a test fails, undo or fix that step. **Never edit an assertion to make it pass.**
4. **Finish.**
   - Run `node .claude/scripts/check.mjs typecheck --changed`, then `lint --changed`, then `test --changed`.
   - Check `git diff`: there should be no behavior changes, no unrelated edits, and no leftover debug code.
5. **Report**:
   - the characterization tests added
   - the steps taken
   - before vs after (file sizes or line counts, functions extracted)
   - the quirks the tests now pin, which the user may want to fix separately

   Suggest `/commit` with `test(<scope>): …` for the safety net and `refactor(<scope>): …` for the change, as two commits.
