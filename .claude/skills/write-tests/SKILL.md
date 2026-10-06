---
name: write-tests
description: Write and run tests for a given source file, using the detected test runner (Vitest or Jest for JS/TS including legacy class components, xUnit/NUnit/MSTest for .NET) and existing conventions. Use when the user asks to add, improve, or fix tests for a file, or after implementing new code that has no tests.
argument-hint: "<path/to/file.(ts|tsx|js|jsx|cs)>"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node .claude/scripts/check.mjs:*), Bash(git diff:*), Bash(git status:*)
---

# Write tests for: $ARGUMENTS

Follow `.claude/rules/testing.md` and `.claude/rules/code-style.md`.

1. **Locate.** Read the target file. Its package is the first path segment (`client`, `server`, `db` or `utils`). A `.cs` file belongs to the .NET solution, whose check target is shown in the `Stack:` line (usually `server`).
2. **Detect the runner.**
   - JS/TS: check for `vitest` or `jest` in `<pkg>/package.json`, and look for config files (`vitest.config.*`, `jest.config.*`) and setup files.
   - .NET: find the test project (`*.Tests.csproj`). Read its `PackageReference`s for the framework (xUnit/NUnit/MSTest) and the mocking library (Moq/NSubstitute/FakeItEasy).
3. **Copy the conventions.** Find 1–2 existing tests in the same package (`Glob <pkg>/**/*.{test,spec}.{ts,tsx,js,jsx}` or `**/*Tests.cs`). Match their location, naming, imports, helpers, factories and mocking style. If a test file for the target already exists, extend it rather than creating a new one.
   - In a **plain-JS** package, tests are JS too: `.test.js`/`.test.jsx`, with no TS syntax.
   - **Class components** are tested like any component: render, interact, and assert on visible output. Never use `instance()`, `state()` or lifecycle spies.
4. **Design the cases.** For each exported symbol, cover:
   - the happy path
   - boundary values
   - invalid input or error paths
   - branches (each `if`, `switch` arm and early return)
   - async failure

   Apply the per-package focus:
   - utils: valid and invalid schema inputs
   - db: real queries or the existing test DB setup
   - server: the db API mocked, with status codes and auth checked
   - client: Testing Library and user-visible behavior
   - client with a SAP backend: mock the OData API module and cover the mapping of SAP fields to UI models
   - .NET: services with their dependencies mocked, and controllers for status codes and auth
5. **Write** `<name>.test.<ext>` next to the source (or `<Class>Tests.cs` in the test project), or wherever the existing convention puts it. In TS, don't use `any` (use `as never` or typed factories for partial mocks). Keep tests deterministic.
6. **Run** only that file:
   ```bash
   node .claude/scripts/check.mjs test <pkg> -- <path relative to the package>
   node .claude/scripts/check.mjs test server -- --filter "FullyQualifiedName~<Class>Tests"   # .NET
   ```
7. **Iterate.** If a test fails, decide whether the test or the code is wrong. Fix the test when it is wrong. When the code looks wrong, **report it to the user** rather than silently changing the behavior. Never skip tests or weaken assertions to get green.
8. **Finish.** Run `node .claude/scripts/check.mjs typecheck <pkg>`, then report the cases you added and the final pass/fail output.
