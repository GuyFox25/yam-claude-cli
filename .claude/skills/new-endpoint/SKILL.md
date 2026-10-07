---
name: new-endpoint
description: Scaffold a new API feature end to end. Node backend - utils (Zod schema/types) → db (query function) → server (route/controller) → client (API call + hook). .NET backend - controller/service/data layer → client. SAP backend - client API function + hook against an existing OData service. Includes tests per layer. Use when the user asks to add an endpoint, a new resource, or a feature that needs new data flowing from the backend to the UI.
argument-hint: "<METHOD> <path> <short description>  e.g. GET /users/:id/matches list a user's matches"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node .claude/scripts/check.mjs:*), Bash(node .claude/scripts/lib-info.mjs:*), Bash(git status:*), Bash(git diff:*)
---

# New endpoint: $ARGUMENTS

Work strictly in layer order. Finish and check each layer before starting the next. The templates are in `.claude/skills/new-endpoint/templates/`. Copy the closest existing feature's style before following a template.

## 0. Discover
1. Read the `Stack:` line from session context. If it's missing, detect it yourself:
   - **backend**:
     - `server/package.json` means Node, with `@nestjs/core` → NestJS and `express` → Express
     - a `*.sln`/`*.csproj` means .NET
     - neither means SAP (external)
   - **client**: TS or plain JS, and whether class components are present
   - **ORM** and the **test runner** for each package
2. Find the most similar existing feature (`Grep` for a sibling resource name) and note its file locations in each layer. Mirror them.
3. Check whether an in-house library covers part of this, such as an HTTP/OData client or UI table (`lib-info.mjs list`). If one does, ask its `lib-*` agent how to use it.
4. If any part of the contract is ambiguous, confirm it with the user: method, path, request and response shapes, auth, pagination. **For SAP, also get the OData service, entity set and fields from the user or the existing code; never invent them.**

Then follow the section for the backend variant.

## A. Node backend (Express/NestJS + Drizzle/Prisma)
1. **utils: contract first.**
   - Add the request and response Zod schemas plus their inferred types (`templates/utils-schema.ts.md`), and export them from the entry point.
   - Test them (`templates/utils-schema.test.ts.md`).
   - Run `check.mjs typecheck utils` and `check.mjs test utils`.
2. **db: data access.**
   - Add a query function that takes and returns utils types (`templates/db-repo.ts.md`; Drizzle, Prisma and Mongoose variants).
   - If a table or column is missing, stop and run `/db-migration` first.
   - Export it from the db public API, and test it (`templates/db-repo.test.ts.md`).
3. **server: HTTP layer (no ORM imports!).**
   - Use the NestJS template (`templates/server-controller.nest.ts.md`) or the Express one (`templates/server-route.express.ts.md`).
   - Validate params, query and body with the utils schema, enforce auth, and map errors to 400/401/403/404/409/422 with the `{ code, message, details? }` shape. Not-found messages include the id (`User 123 not found`).
   - Always add a service, even if it only delegates: controller/router → service → the db function from step 2. NestJS injects the db API through a repository provider; Express services import it directly.
   - Test with the db API mocked (`templates/server.test.ts.md`): the happy path, a 400, and a 401 or 404.
4. **client.** See section D.

## B. .NET backend
1. Mirror the nearest existing controller → service → data access (EF Core `DbContext` or repository / Dapper) in the solution, following `.claude/rules/csharp.md`:
   - request and response DTOs
   - validation, the way the project does it
   - `[Authorize]`
   - async methods with a CancellationToken
   - parameterized queries
2. If an entity or column is missing, stop and run `/db-migration`, which has an EF Core branch.
3. Add tests in the existing test project, using its mocking library: the happy path, validation failure, not found, and unauthorized.
4. Run `node .claude/scripts/check.mjs typecheck server` and `node .claude/scripts/check.mjs test server`. Both are skipped with a message if the dotnet SDK is missing.
5. **client.** See section D. Without utils, mirror the C# response DTO as a client type or JSDoc in the API layer.

## C. SAP ABAP backend (no backend code in this repo)
- The OData service must already exist in SAP. If it doesn't, stop. Write up what the SAP team needs to build (entity set, fields, operations) and don't build anything that depends on it.
- Go straight to section D. Use the existing OData helper or in-house library, the CSRF handshake for writes, and escaped `$filter` values.

## D. client: consume it
- TS client: add the API function, which parses the response with the utils schema when zod is available, and a hook (`templates/client-hook.ts.md`).
- JS client: follow `templates/client-hook.js.md`, which has REST and OData variants. Don't use TS syntax.
- Use the data-fetching library the client already uses. Wire it into the UI only if the user asked, and handle the loading, empty and error states.
  - New components are function components.
  - When the consumer is an existing class component, keep it a class and pass the data in, using the loader pattern in the JS template.
- Add a test (`templates/client-hook.test.md`: the TSX section for TS clients, the JSX section for JS clients).
- Run `check.mjs typecheck client` (skipped for JS) and `check.mjs test client`.

## Finish
- Run `node .claude/scripts/check.mjs lint --changed`.
- Summarize the files created per layer and how to call the endpoint. Suggest `/commit`.
