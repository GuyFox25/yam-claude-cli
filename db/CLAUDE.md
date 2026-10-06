# db/: data-access API (the only ORM consumer)

Only projects with a **Node backend** have this package. SAP projects don't have one, because the database belongs to SAP. A .NET backend keeps its data access (EF Core migrations included) inside its solution; see `.claude/rules/csharp.md`.

## Role
- This is the **only** package that imports the ORM or ODM (Drizzle, Prisma, Mongoose; see `orm=` in the `Stack:` line) or a DB driver (`pg`, `mongodb`, ...).
- It exposes typed functions such as `getUserById` and `createMatch` (or a service class) that server calls. It never exposes the raw ORM client or a Mongoose model.
- Inputs and outputs use **utils** types and Zod schemas. Table definitions live in utils if the project shares them there; otherwise they live here.

## Engine
The `db=` value in the `Stack:` line tells you the engine: **PostgreSQL** today (Express + Drizzle), and possibly **MongoDB** in future projects. The conventions for each engine are in `.claude/rules/db.md`:
- PostgreSQL: snake_case, the `idx_`/`uq_`/`fk_`/`chk_` prefixes, `timestamptz`, indexed FKs.
- MongoDB: camelCase, a schema per collection, named ESR indexes, `_id` mapped to `id`.

## Inspecting the database (pgAdmin / Compass)
You never connect. When you need data, a plan or the indexes:
1. Write the query, for example `EXPLAIN (ANALYZE, BUFFERS) <query>;` or `\d`-style catalog queries, or `db.coll.find(...).explain("executionStats")` for Mongo.
2. Ask the user to run it in the pgAdmin 4 Query Tool, or Compass/mongosh, against their **local** database, and paste the output back.

## Migration workflow
1. Change the schema: Drizzle tables, `schema.prisma`, or the Mongoose schema.
2. Generate the migration. Check `db/package.json` for a wrapping script first.
   - Drizzle: `drizzle-kit generate --name <snake_case_name>`
   - Prisma (SQL): `prisma migrate dev --create-only --name <snake_case_name>`
   - Mongo: a new **migrate-mongo** script (`migrate-mongo create <name>`) with idempotent `up`/`down`. Prisma-Mongo uses `prisma db push` instead (asks for approval).
3. **Read the generated SQL or script.** Check for unintended drops or renames, the naming, and the indexes.
4. Apply it locally with the migrate script (needs approval). Update seeds if needed.
5. Commit the schema change, the migration and the meta/journal files together. Never edit a committed migration (the hook blocks it).

## Queries
- Parameterized only. Never build SQL by string concatenation; use the ORM's `sql` tag or `$queryRaw` templates. In Mongo, never pass request objects straight into filters.
- Wrap multi-statement writes in a transaction. In Postgres, use `for update` for race-prone read-modify-write. In Mongo, transactions need a replica set.
- Paginate list queries and select only the columns or fields you need.

## Commands
```bash
node .claude/scripts/check.mjs typecheck db
node .claude/scripts/check.mjs test db
```
Migrate and seed: use the scripts in `db/package.json`, and ask first.

## Project-specific
<!-- Add project-specific notes below. Everything above is shared template content. -->
<!-- Suggested: DB engine/version, local DB name (as registered in pgAdmin), migration folder, how the test DB is provisioned. -->
