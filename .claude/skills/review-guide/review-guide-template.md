# Review guide: <branch>

Base: `<base>` · Commits: <n> · Packages: <client, server, db, utils>

## Summary
<!-- 2-3 lines: what changed and why. Use the commit messages and the branch name. -->

## Main review pointers
<!-- Most risky first. `file:line`: why it matters. -->
1. `path/to/file.ts:42`: 

## Manual test cases
<!-- One block per case. P1 = must pass before merge, P2 = should, P3 = nice to check. Prefix guessed steps with "verify:". -->

### TC-1 (P1): <title>
- **Preconditions:** <user/role, data, env flags>
- **Steps:**
  1. 
- **Expected:** 

## Regression checks
<!-- Adjacent features that use the changed code; one line each with what to look at. -->
- 

## Setup for testing
<!-- Seed data, env var names (never values), migration to run locally, feature flags, test users. -->

## Safe to skim
<!-- Renames, formatting, generated code, pure type changes. -->
- 

## Open questions for the author
- 
