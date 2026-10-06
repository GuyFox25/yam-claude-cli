# utils schema template

Path: mirror the existing layout, for example `utils/src/schemas/<feature>.ts`. Export it from the utils entry point.

```ts
import { z } from 'zod';

export const userIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listUserMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const matchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  startsAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export const listUserMatchesResponseSchema = z.object({
  items: z.array(matchSchema),
  nextCursor: z.string().nullable(),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
export type ListUserMatchesQuery = z.infer<typeof listUserMatchesQuerySchema>;
export type Match = z.infer<typeof matchSchema>;
export type ListUserMatchesResponse = z.infer<typeof listUserMatchesResponseSchema>;
```

Notes: the API surface uses camelCase and the DB uses snake_case, and db does the mapping. Use `z.coerce.date()` for anything that crosses JSON.
