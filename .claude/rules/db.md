---
paths:
  - "db/**"
  - "prisma/**"
  - "drizzle/**"
  - "utils/**/db/**"
  - "utils/**/schema*/**"
  - "utils/**/schema*"
  - "**/*.prisma"
  - "**/drizzle.config.*"
  - "**/migrate-mongo-config.*"
  - "**/Migrations/**"
---

# Database conventions

The engine is detected: see `db=` in the session `Stack:` line (`postgresql`, `mongodb`, `mysql`, `sqlite`, `mssql`). It comes from the Drizzle `dialect`, the Prisma `provider`, the installed drivers, or the .NET provider package. Apply the section for that engine.

## All engines
- Only `db/` imports the ORM, ODM or DB drivers (in .NET, only the data layer).
- **Never connect to a database yourself.** The connection string lives in `.env`, which is off limits, and the network is closed. When you need to see data, a plan or the indexes, write the query for the user to run in their GUI (**pgAdmin 4** Query Tool for PostgreSQL, **Compass** or `mongosh` for MongoDB), and ask them to paste the result.
- Schema and data changes go through migrations or migration scripts, never through manual changes in the GUI. Applying them needs approval.
- **Never edit an applied (committed) migration.** The guard-boundaries hook enforces this. Add a new one.
- Destructive commands (`dropdb`, `DROP …`, `TRUNCATE`, `dropDatabase()`, `deleteMany({})`, `prisma migrate reset`) are blocked by the guard-bash hook. Ask the user to run them if they're really needed.
- Destructive changes (dropping or renaming, narrowing a type) go through expand → migrate data → contract, spread over separate migrations.

## PostgreSQL
- **snake_case** for every table, column, enum and constraint name. Tables are plural (`users`, `match_players`).
- Prefixes: `idx_<table>_<cols>` index, `uq_<table>_<cols>` unique, `fk_<table>_<col>_<ref_table>` foreign key, `chk_<table>_<rule>` check, and `pk_<table>` when named explicitly.
- Timestamps are **`timestamptz`**, never `timestamp` without a time zone. Standard columns are `created_at` and `updated_at`, both `timestamptz not null default now()`.
  - Drizzle: `timestamp('created_at', { withTimezone: true })`.
  - Prisma: `@db.Timestamptz(6)` with `@map("created_at")` and `@@map("table_name")`.
- Ids: `uuid` (`gen_random_uuid()`) or `bigint generated always as identity`, whichever the project already uses. `jsonb`, never `json`. Prefer `text` with a check constraint over `varchar(n)`.
- Every foreign key column gets an index. Choose `on delete` deliberately (`cascade`, `restrict` or `set null`).
- Indexes on big tables: `CREATE INDEX CONCURRENTLY` in its own migration, because it can't run inside a transaction. Consider partial and GIN (jsonb/arrays/trigram) indexes where they fit.
- Migrations are generated from the schema (`drizzle-kit generate`, `prisma migrate dev --create-only`). Review the SQL every time.

## MongoDB
- Collections are plural camelCase (`users`, `matchPlayers`), and fields are camelCase. Follow the existing names if they differ.
- Every collection has a schema: Mongoose `new Schema({...}, { timestamps: true })`, or Prisma models with `@id @default(auto()) @map("_id") @db.ObjectId`. No schemaless writes.
- Indexes are declared in the schema with explicit names (`schema.index({ userId: 1, startsAt: -1 }, { name: 'idx_matches_userId_startsAt' })`). Order compound index fields by **ESR**: equality, then sort, then range.
- Modeling: embed data that's read together and bounded; reference data that's unbounded, shared or updated independently. Avoid unbounded arrays.
- Queries:
  - Use `.lean()` for reads, and project only the needed fields.
  - Paginate with a range on an indexed field, not a large `skip`.
  - Never pass request objects straight into a filter (operator injection). Build filters from parsed, typed values.
- Multi-document writes need a transaction (`session.withTransaction`), which only works on a replica set. Say so when it matters.
- Schema and data changes:
  - Use **migrate-mongo** scripts when the project has them: idempotent `up` and `down`, in the configured `migrationsDir`.
  - Prisma with MongoDB has no migrations; `prisma db push` syncs the indexes and needs approval.
  - Mongoose `autoIndex` should be off in production if the project says so.
- Map `_id` to `id` in DTOs, and never expose `__v`.
