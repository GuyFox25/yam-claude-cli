---
name: db-migration
description: Make a database schema change end to end (Drizzle or Prisma in db/, or EF Core in a .NET solution). Edit the schema, generate a new migration, review the SQL, apply it locally, and update seeds. Use when the user asks to add or change a table, column, index, constraint or enum.
argument-hint: "<what to change>  e.g. add cancelled_at timestamptz to matches"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node .claude/scripts/check.mjs:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

# DB migration: $ARGUMENTS

Follow `.claude/rules/db.md` and `db/CLAUDE.md`. **Never edit a committed migration.** The guard-boundaries hook blocks it anyway.

## 0. Which database?
- **SAP backend** (no `server/` and no `.sln`/`.csproj`; the Stack line says `backend=external`): the database is in ABAP. Stop here, and describe the change the SAP team needs to make.
- **.NET with EF Core** (a `*.sln`, with `Microsoft.EntityFrameworkCore` in a csproj): follow "EF Core" at the end, not steps 1–8.
- **Node + MongoDB** (`db=mongodb`: Mongoose, the native driver, or Prisma with `provider = "mongodb"`): follow "MongoDB" at the end.
- **Node + SQL** (PostgreSQL today): continue with step 1. You never connect to the DB yourself. To check the result, give the user a query to run in pgAdmin.

## 1. Detect
- ORM: `db/package.json` (Drizzle: `drizzle-orm`/`drizzle-kit`; Prisma: `prisma`/`@prisma/client`).
- Schema location: Drizzle uses the `schema` field in `drizzle.config.*` (it may point into `utils/`); Prisma uses `schema.prisma`.
- Migration folder: Drizzle uses the `out` field in `drizzle.config.*`; Prisma uses `prisma/migrations/`.
- Scripts in `db/package.json`: `generate`/`db:generate`, `migrate`/`db:migrate`, `seed`/`db:seed`, `db:push`.
- Check `git status` so you don't mix this change with unrelated work.

## 2. Plan (show it to the user before editing)
- List the exact tables, columns and types, plus nullability and defaults, and the indexes and constraints with their `idx_`/`uq_`/`fk_`/`chk_` names.
- Use `timestamptz` for time columns, and give every new foreign key an index.
- If the change is destructive (drop, rename, type narrowing, or NOT NULL on existing data), propose expand → backfill → contract over several migrations.
- Name the migration in snake_case, for example `add_cancelled_at_to_matches`.

## 3. Edit the schema
- Drizzle: `timestamp('cancelled_at', { withTimezone: true })`, with indexes declared in the table's extra-config callback using the prefixed names.
- Prisma: `cancelledAt DateTime? @map("cancelled_at") @db.Timestamptz(6)`, `@@index([...], map: "idx_...")`, `@@map("table")`.
- Update the matching **utils** Zod schemas and types (for example by adding the field to the response schema).

## 4. Generate (don't apply yet)
Prefer the db package's script if it has one. Otherwise:
- Drizzle: `npx drizzle-kit generate --name <name>` or `pnpm --filter <db> exec drizzle-kit generate --name <name>`
- Prisma: `npx prisma migrate dev --create-only --name <name>` (run it in `db/`)

## 5. Review the generated SQL
- Check that it contains only the intended statements, with no surprise drops or renames treated as drop+add.
- Check the names follow the conventions, the timestamps are `timestamptz`, and the foreign keys are indexed.
- Large-table concerns: on Postgres, add indexes `CONCURRENTLY` in a separate migration if the project does that, and avoid table rewrites.
- You may adjust the **new, uncommitted** migration file if something is wrong. Prefer fixing the schema and regenerating.

## 6. Apply locally (needs approval)
- Run the db package's migrate script, for example `pnpm --filter <db> db:migrate` or `npm run db:migrate -w db`. Settings make this ask for approval.
- Never use `db:push` or `drizzle-kit push` on shared databases.

## 7. Seeds and code
- Update the seed script or data for any new NOT NULL columns or tables. Ask before running seeds.
- Update the db queries that read or write the changed columns.

## 8. Verify
```bash
node .claude/scripts/check.mjs typecheck --changed
node .claude/scripts/check.mjs test db
```
Finish by summarizing the schema diff, the migration file path and the follow-ups. The schema, migration and meta files go in one commit (`/commit`).

## EF Core (.NET backends)
1. **Detect.**
   - Find the `DbContext`, the entity configurations, and the `Migrations/` folder (the one holding `*ModelSnapshot.cs`).
   - Find the startup project. `dotnet ef` usually needs `--project <data project> --startup-project <api project>`.
2. **Plan.** Show the user the entity and property changes, the Fluent API config (indexes, FKs with `OnDelete`, lengths, nullability), and the migration name in PascalCase, for example `AddCancelledAtToMatches`. Follow the existing naming in the solution.
3. **Edit** the entity classes and configuration. Update the request and response DTOs and the mappings.
4. **Generate:** `dotnet ef migrations add <Name> --project <...> --startup-project <...>`. This asks for approval. It needs the `dotnet-ef` tool to already be installed, and the network is closed.
5. **Review** the generated `Up`/`Down`:
   - no unintended drops or renames
   - correct column types, indexes and FKs
   - a `Down` that really reverses `Up`

   You may fix this **new** migration. Never touch committed migrations, their `.Designer.cs` files, or the `ModelSnapshot` (the hook blocks it). To undo an uncommitted migration, use `dotnet ef migrations remove`.
6. **Apply locally** only if the user asks: `dotnet ef database update` (asks for approval).
7. **Verify:** `node .claude/scripts/check.mjs typecheck server` and `node .claude/scripts/check.mjs test server`. Commit the entity change, the migration, its Designer file and the snapshot together.

## MongoDB (Node backends)
1. **Detect.**
   - The ODM: `mongoose`, the `mongodb` driver, or Prisma with `provider = "mongodb"`.
   - Where the schemas and models live.
   - Whether **migrate-mongo** is set up: `migrate-mongo-config.*` (its `migrationsDir`) and the scripts in `db/package.json`.
2. **Plan** (show the user before editing):
   - the field changes (camelCase), defaults, and whether existing documents need a backfill
   - the indexes, with explicit names and ESR field order
   - whether the change is breaking for readers of old documents, in which case go expand → backfill → contract
3. **Edit the schema.**
   - Mongoose: update the schema (keep `timestamps: true`) and the `schema.index(...)` declarations.
   - Prisma: update the model and its `@@index` entries.
   - Update the utils Zod schemas and DTOs. `_id` maps to `id`.
4. **Write the migration script.**
   - Applies when existing data or indexes change and migrate-mongo exists. Prefer the project's script; otherwise run `npx migrate-mongo create <kebab-name>`, which asks for approval.
   - `up`: idempotent, batched (`updateMany` with a filter that skips documents already migrated), and creates indexes with `createIndex(..., { name })`.
   - `down`: reverses it where possible. Say so if it can't.
   - Never edit a committed migration script (the hook blocks it).
   - Prisma-Mongo has no migration files: indexes are synced with `prisma db push` (asks for approval). Data backfills still need a script.
5. **Apply locally** only with approval, using the project's migrate script (`migrate-mongo up`). Ask the user to check the result in Compass or mongosh.
6. **Verify:** `node .claude/scripts/check.mjs typecheck --changed` and `node .claude/scripts/check.mjs test db`. Commit the schema change and the script together.
