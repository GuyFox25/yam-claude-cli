---
name: sql-for-pgadmin
description: Write a PostgreSQL query for the user to run themselves in pgAdmin 4, using the real table and column names from the repo's schema. Read-only by default; any write is wrapped in BEGIN ... ROLLBACK so the user can check it before committing. Never runs anything. Use when the user asks for SQL, a query, a report or a data check to run in pgAdmin.
argument-hint: "<what you want to find or change>  e.g. orders without lines in the last 30 days"
allowed-tools: Read, Grep, Glob
---

# SQL for pgAdmin: $ARGUMENTS

You never connect to the database and never run SQL. You hand the user a query for the pgAdmin Query Tool. For MongoDB projects (`db=mongodb`), write an equivalent `mongosh` / Compass query instead, following the same rules.

1. **Read the schema.** Find the real names in:
   - Drizzle table files (`pgTable('…')`) in `db/` or `utils/`, Prisma `schema.prisma` (`@@map`/`@map` give the SQL names), or the latest migrations
   - `.claude/rules/db.md` for the naming conventions
   Use the SQL names (snake_case), not the TS property names. If a table or column the request needs doesn't exist, say so instead of guessing.
2. **Write the query.**
   - SELECT by default. List the columns explicitly (no `SELECT *`), qualify columns when joining, and add `ORDER BY` and `LIMIT 100` unless the user wants everything.
   - Use `timestamptz` arithmetic (`now() - interval '30 days'`) and `COALESCE` for nullable aggregates.
   - Put parameters the user must fill in at the top as clearly marked literals (`-- change me: customer id`), never as string concatenation advice.
   - Comment every non-obvious line.
3. **Writes** (UPDATE/INSERT/DELETE) are only written when the user explicitly asks, always in this shape:
   ```sql
   BEGIN;
   -- 1. what will change (run first, check the count)
   SELECT count(*) FROM … WHERE …;
   -- 2. the change
   UPDATE … SET … WHERE … RETURNING id;
   -- 3. verify
   SELECT … WHERE …;
   ROLLBACK;  -- replace with COMMIT only after checking the output above
   ```
   Never write `DROP`, `TRUNCATE`, or a DELETE/UPDATE without a `WHERE`. Schema changes go through `/db-migration`, not ad-hoc SQL.
4. **Performance.** For queries on big tables, mention the index it relies on, and offer an `EXPLAIN (ANALYZE, BUFFERS)` version for SELECTs. For writes, use plain `EXPLAIN`, because `ANALYZE` executes the statement.
5. **Output** one fenced `sql` block ready to paste, then 2–3 lines on what the result means and what to look for (expected row count, columns to check).
