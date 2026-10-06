# Express router template

There are **no ORM imports here**. Reuse the project's existing `validate`, `requireAuth`, `asyncHandler` and `HttpError` helpers if they exist. The versions below show the expected shape.

```ts
// server/src/routes/matches.ts
import { Router, type Request, type Response } from 'express';
import { listUserMatchesQuerySchema, userIdParamsSchema } from '<utils package name>';
import { getUserById, listUserMatches } from '<db package name>';
import { asyncHandler } from '../middleware/async-handler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { HttpError } from '../errors';

export const matchesRouter = Router();

matchesRouter.get(
  '/users/:id/matches',
  requireAuth,
  validate({ params: userIdParamsSchema, query: listUserMatchesQuerySchema }),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamsSchema.parse(req.params);
    const query = listUserMatchesQuerySchema.parse(req.query);
    const user = await getUserById(id);
    if (!user) throw new HttpError(404, 'User not found');

    res.json(await listUserMatches(id, query));
  }),
);
```

Mount the router in the app entry point next to the existing routers.
