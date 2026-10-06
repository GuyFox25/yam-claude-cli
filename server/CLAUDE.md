# server/: backend API

This folder holds the project's own backend, when it has one: a **Node** API (Express or NestJS) or a **C# .NET** solution. Check `backend=` in the `Stack:` line. SAP ABAP projects have no `server/`; the client calls OData directly.

## Node: hard rule, no SQL, no ORM
- Never import `drizzle-orm`, `@prisma/client`, `pg`, `postgres`, `mongoose`, `mongodb`, `knex`, `typeorm` or any other DB driver, and never write SQL strings or Mongo filters. The guard-boundaries hook blocks the imports; the reviewers catch SQL and filters.
- Get all data through the **db package's public API**. If the query you need doesn't exist, add it in `db/` first (`/new-endpoint` walks through this).

**NestJS** (`@nestjs/core`):
- One module per feature: `<feature>.module.ts`, `.controller.ts`, `.service.ts`.
- Controllers stay thin. The db API is injected as a provider.
- Validate with a Zod pipe that wraps the utils schema, not class-validator DTOs that duplicate it.

**Express** (`express`):
- A router per feature (`routes/<feature>.ts`), plus `<feature>.service.ts` when there's real logic.
- Validate with `validate(schema)` middleware on body, query and params.
- Wrap async handlers so errors reach the central error middleware.

## .NET (C#)
Full rules are in `.claude/rules/csharp.md`. In short:
- Mirror the nearest existing controller and service.
- Controllers stay thin, and data access stays in its existing data layer (EF Core / Dapper). Never return entities; map them to DTOs.
- Use `[Authorize]` on non-public endpoints, and parameterized SQL only.
- Never edit applied EF migrations.

## Conventions (all backends)
- Validate every input (body, params, query) before using it: the utils Zod schemas in Node, the project's validation in .NET. Pass only the parsed values to the db API, never `req.body`/`req.query` objects (with MongoDB, `{ "$ne": null }` in a body is an injection).
- Response shapes are shared DTOs, mapped from data rows. Never leak internal fields like password hashes.
- Status codes: 400 for validation, 401 for unauthenticated, 403 for forbidden, 404 for not found, 409 for conflict. Use one error format for the whole API.
- Every route that isn't public must check auth. Read config and secrets from env or config providers, never hard-coded.
- If the backend calls SAP (OData/RFC), keep that in one client module, and never invent entity or field names.

## Commands
```bash
node .claude/scripts/check.mjs typecheck server   # tsc, or dotnet build for .NET
node .claude/scripts/check.mjs lint server        # eslint, or dotnet format --verify-no-changes
node .claude/scripts/check.mjs test server -- src/users/users.test.ts
```

## Tests
- Node: mock the db API. Test status codes, validation failures, auth, and the happy path.
- .NET: use the existing test project and mocking library (see `.claude/rules/testing.md`).

## Project-specific
<!-- Add project-specific notes below. Everything above is shared template content. -->
<!-- Suggested: Node or .NET; solution path; auth approach; external systems called (SAP services, etc.). -->
