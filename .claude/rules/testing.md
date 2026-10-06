---
paths:
  - "client/**"
  - "server/**"
  - "db/**"
  - "utils/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/*.cs"
---

# Testing

The test runner is **detected per package**: Vitest or Jest for JS/TS packages, xUnit, NUnit or MSTest for a .NET backend (see the `Stack:` line printed at session start, the package's `devDependencies`, or the test project's `PackageReference`s). Use that runner's API, don't mix them.

## File naming
- JS/TS unit tests sit next to the code: `foo.ts` → `foo.test.ts`, `Foo.tsx` → `Foo.test.tsx`, `Foo.jsx` → `Foo.test.jsx`. Tests in JS packages are JS too.
- If the package already uses `*.spec.ts` (NestJS default) or a `__tests__/` / `test/` folder, follow the existing convention in that package.
- Integration/e2e tests: `*.e2e.test.ts` / `*.e2e-spec.ts` or the package's existing e2e folder.
- .NET: tests live in the existing test project (`<Project>.Tests`), one class per class under test (`UsersServiceTests`), method names like `Method_State_Expected`.

## Running
Always go through the check runner (it resolves npm/pnpm, the script name, or the dotnet CLI):

```bash
node .claude/scripts/check.mjs test <pkg>                              # whole package
node .claude/scripts/check.mjs test <pkg> -- src/users/users.test.ts   # single file
node .claude/scripts/check.mjs test <pkg> -- -t "creates a user"       # single test by name (Vitest & Jest)
node .claude/scripts/check.mjs test server -- --filter "FullyQualifiedName~UsersServiceTests"   # .NET
node .claude/scripts/check.mjs test --changed                          # packages with uncommitted changes
node .claude/scripts/check.mjs test --files server/src/users/users.service.ts   # only tests related to these files (paths from the repo root)
```

## What to test per package
- **utils**: Zod schemas, valid and invalid inputs, edge values, and the inferred types (`expectTypeOf` in Vitest).
- **db**: repository/query functions against the project's test database setup or mocks, following the existing pattern. Constraint and naming violations should fail.
- **server** (Node): route/controller behavior with the db API **mocked**: status codes, validation errors (400), auth (401/403), and happy paths.
- **server** (.NET): services with their dependencies mocked (the mocking library the tests already use), controllers for status codes and auth; EF queries with the project's existing approach (in-memory/SQLite provider or test DB).
- **client**: components with Testing Library (render, user interaction, visible output), plus hooks with the API layer mocked. **Class components are tested the same way**, through what the user sees; never assert on `instance()`, `state` or lifecycle calls. For SAP backends, mock the OData API module, not `fetch`.

## Rules
- Every new exported function, endpoint, or component gets at least one happy path test and one failure test.
- Tests must be deterministic: no real network, no wall-clock dependence (use fake timers), and no ordering between tests.
- Don't delete or skip failing tests just to get green. Fix the code, or ask.
