# utils/: shared schemas and types

Present in Node-backend projects, and optionally in client-only (SAP) projects for shared OData models. A .NET backend can't import it; there the C# DTOs are the contract, so keep the client's types in sync with them by hand.

## Role
- This is the single source of truth for **Zod schemas**, **TypeScript types and DTOs**, shared enums and constants, and (if the project shares them) **DB schema definitions**.
- It has no imports from client, server or db. Keep runtime dependencies minimal: Zod, plus the ORM's schema-builder only if table definitions live here.

## Patterns
- Define each schema once and derive its type: `export const createUserSchema = z.object({ ... }); export type CreateUserInput = z.infer<typeof createUserSchema>;`
- Name things `<entity><Action>Schema` / `<Entity><Action>Input` for requests and `<entity>Schema` / `<Entity>` for responses.
- Export everything through the package entry point (`src/index.ts` or the `exports` field). Consumers never deep-import. Exception: Drizzle table definitions are imported from each table's own file (`.claude/rules/code-style.md`), so expose them as subpath exports (`<utils>/schema/users`) rather than through a schema barrel.
- Ids follow the DB engine. PostgreSQL uses `z.string().uuid()` or `z.coerce.number().int()`. MongoDB uses one shared `objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i)`. DTOs expose `id`, never `_id` or `__v`.
- Keep schemas pure, with no I/O. Put refinements that need the DB in server or db.

## Changes ripple
A change here affects **server, db and client**:
- After editing, run `node .claude/scripts/check.mjs typecheck --changed`, which typechecks all consumers when utils changes. The Stop hook does this too.
- Renaming or removing a field is a breaking API change. Update the db queries, server handlers and client usage in the same change.
- If the DB schema changes here, it needs a migration in `db/` (`/db-migration`).
- If utils is built (has a `build` script or `dist/` in `exports`), rebuild it before consumers typecheck.

## Commands
```bash
node .claude/scripts/check.mjs typecheck utils
node .claude/scripts/check.mjs test utils
```

## Tests
- Test each schema's valid and invalid inputs and its boundary values.

## Project-specific
<!-- Add project-specific notes below. Everything above is shared template content. -->
