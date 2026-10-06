---
paths:
  - "**/*.cs"
  - "**/*.csproj"
  - "**/*.cshtml"
  - "**/*.razor"
---

# C# / .NET

The session `Stack:` line shows `backend=dotnet (<solution>)` when the repo has a .NET backend. Run checks with `node .claude/scripts/check.mjs <typecheck|lint|test> <target>`, where the target is the one shown in the Stack line (usually `server`). They run dotnet build / format / test with `--no-restore`, since the network is closed.

## Follow the existing solution
- Match the solution's structure (projects, folders, namespaces, file-scoped or block namespaces), naming, DI registration and patterns. Find the closest existing controller/service and mirror it.
- Target the existing framework version and language features; don't add packages (`dotnet add package` needs approval and the network is closed).

## Conventions
- PascalCase for types, methods and properties; `_camelCase` private fields; `I` prefix for interfaces.
- Async all the way: `async Task<T>` methods named `...Async`, accept and pass a `CancellationToken`. Never `.Result` / `.Wait()`.
- Respect nullable reference types if `<Nullable>enable</Nullable>` is on; no `!` to silence warnings without a reason.
- Constructor injection; no `new` of services, no service locator.

## Boundaries
- Controllers stay thin: bind and validate input (data annotations / FluentValidation, as the project does), call a service, map to a response DTO. No queries in controllers.
- Data access (EF Core `DbContext`, Dapper, ADO.NET) stays in its existing data layer/project. Never return EF entities from API endpoints; map to DTOs.
- Every non-public endpoint has `[Authorize]` (or the project's policy); check ownership for `{id}` routes.

## Data
- SQL is always parameterized: LINQ, `FromSqlInterpolated`, Dapper parameters, `SqlParameter`. Never `FromSqlRaw` / `SqlCommand` with concatenated or interpolated user input.
- EF Core migrations: create with `dotnet ef migrations add <PascalCaseName>` (asks for approval) and review the generated `Up`/`Down`. **Never edit an applied (committed) migration, its `.Designer.cs`, or the `ModelSnapshot`**; the guard-boundaries hook blocks it. Add a new migration instead.
