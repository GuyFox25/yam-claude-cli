# db query template

Path: mirror the existing layout, for example `db/src/repositories/<feature>.repo.ts`. Export it from the db entry point. This is the **only** layer that imports the ORM.

## Drizzle

```ts
import { and, desc, eq, lt } from 'drizzle-orm';
import type { ListUserMatchesQuery, ListUserMatchesResponse, Match } from '<utils package name>';
import { db } from '../client';
import { matches, matchPlayers } from '../schema';

const toMatch = (row: typeof matches.$inferSelect): Match => ({
  id: row.id,
  title: row.title,
  startsAt: row.startsAt,
  createdAt: row.createdAt,
});

export const listUserMatches = async (userId: string, query: ListUserMatchesQuery): Promise<ListUserMatchesResponse> => {
  const rows = await db
    .select({ match: matches })
    .from(matches)
    .innerJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
    .where(and(eq(matchPlayers.userId, userId), query.cursor ? lt(matches.startsAt, new Date(query.cursor)) : undefined))
    .orderBy(desc(matches.startsAt))
    .limit(query.limit + 1);

  const items = rows.slice(0, query.limit).map((r) => toMatch(r.match));
  const nextCursor = rows.length > query.limit ? items[items.length - 1].startsAt.toISOString() : null;

  return { items, nextCursor };
};
```

## Prisma

```ts
import type { ListUserMatchesQuery, ListUserMatchesResponse } from '<utils package name>';
import { prisma } from '../client';

export const listUserMatches = async (userId: string, query: ListUserMatchesQuery): Promise<ListUserMatchesResponse> => {
  const rows = await prisma.match.findMany({
    where: { players: { some: { userId } }, ...(query.cursor ? { startsAt: { lt: new Date(query.cursor) } } : {}) },
    orderBy: { startsAt: 'desc' },
    take: query.limit + 1,
    select: { id: true, title: true, startsAt: true, createdAt: true },
  });

  const items = rows.slice(0, query.limit);
  const nextCursor = rows.length > query.limit ? items[items.length - 1].startsAt.toISOString() : null;

  return { items, nextCursor };
};
```

## Mongoose (MongoDB)

```ts
import { Types } from 'mongoose';
import type { ListUserMatchesQuery, ListUserMatchesResponse, Match } from '<utils package name>';
import { MatchModel, type MatchDoc } from '../models/match.model';

// Model (db/src/models/match.model.ts): new Schema({ title: String, startsAt: Date, playerIds: [Schema.Types.ObjectId] }, { timestamps: true })
// plus matchSchema.index({ playerIds: 1, startsAt: -1 }, { name: 'idx_matches_playerIds_startsAt' })  // ESR: equality, then sort/range

const toMatch = (doc: MatchDoc & { _id: Types.ObjectId }): Match => ({
  id: doc._id.toString(),
  title: doc.title,
  startsAt: doc.startsAt,
  createdAt: doc.createdAt,
});

export const listUserMatches = async (userId: string, query: ListUserMatchesQuery): Promise<ListUserMatchesResponse> => {
  // userId was validated with the utils objectIdSchema; build the filter from typed values only.
  const filter = {
    playerIds: new Types.ObjectId(userId),
    ...(query.cursor ? { startsAt: { $lt: new Date(query.cursor) } } : {}),
  };
  const docs = await MatchModel.find(filter)
    .select({ title: 1, startsAt: 1, createdAt: 1 })
    .sort({ startsAt: -1 })
    .limit(query.limit + 1)
    .lean<(MatchDoc & { _id: Types.ObjectId })[]>();

  const items = docs.slice(0, query.limit).map(toMatch);
  const nextCursor = docs.length > query.limit ? items[items.length - 1].startsAt.toISOString() : null;

  return { items, nextCursor };
};
```

Checklist:
- All engines: select only the columns or fields you need, use cursor pagination for lists, and use transactions for multi-write operations (MongoDB transactions need a replica set).
- PostgreSQL: index the filter and order columns (`idx_...`).
- MongoDB: a named ESR index for the query shape, `.lean()`, `_id` mapped to `id`, and filters built only from parsed values.
