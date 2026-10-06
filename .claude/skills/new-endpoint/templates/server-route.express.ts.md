# Express router and service template

There are **no ORM imports here**. The router handles HTTP only and calls the service. There is always a service, even when it only delegates to db. Express has no DI container, so the service imports the db package's functions directly.

Reuse the project's existing `validate`, `requireAuth`, `asyncHandler` and `HttpError` helpers if they exist. The versions below show the expected shape. `HttpError` here takes `(status, code, message, details?)`, and the central error middleware sends `{ code, message, details? }`. If the project's `HttpError` has a different signature, adapt the call to it (or extend it to carry a `code`); don't pass a code where it expects the message.

```ts
// server/src/routes/matches.ts
import { Router, type Request, type Response } from 'express';
import { listUserMatchesQuerySchema, userIdParamsSchema } from '<utils package name>';
import { asyncHandler } from '../middleware/async-handler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { listMatchesForUser } from '../services/matches.service';

export const matchesRouter = Router();

matchesRouter.get(
  '/users/:id/matches',
  requireAuth,
  validate({ params: userIdParamsSchema, query: listUserMatchesQuerySchema }),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamsSchema.parse(req.params);
    const query = listUserMatchesQuerySchema.parse(req.query);

    res.json(await listMatchesForUser(id, query));
  }),
);
```

```ts
// server/src/services/matches.service.ts
import type { ListUserMatchesQuery, ListUserMatchesResponse } from '<utils package name>';
import { getUserById, listUserMatches } from '<db package name>';
import { HttpError } from '../errors';

export const listMatchesForUser = async (
  userId: string,
  query: ListUserMatchesQuery,
): Promise<ListUserMatchesResponse> => {
  const user = await getUserById(userId);
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', `User ${userId} not found`);

  return listUserMatches(userId, query);
};
```

Mount the router in the app entry point next to the existing routers.
