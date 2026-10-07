# utils schema test template

Use the runner the package already uses: Vitest (`import { describe, it, expect, expectTypeOf } from 'vitest'`) or Jest (globals; drop the `expectTypeOf` case, or use `tsd`/`expect-type` if the package already has one).

```ts
import { describe, it, expect, expectTypeOf } from 'vitest';
import { createMatchSchema, listUserMatchesQuerySchema, userIdParamsSchema, type ListUserMatchesQuery } from './matches';

describe('listUserMatchesQuerySchema', () => {
  it('applies the default limit', () => {
    expect(listUserMatchesQuerySchema.parse({}).limit).toBe(20);
  });

  it('coerces a numeric string', () => {
    expect(listUserMatchesQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it.each([0, 101, -1, 'abc'])('rejects limit=%s', (limit) => {
    expect(listUserMatchesQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('infers the query type', () => {
    expectTypeOf<ListUserMatchesQuery>().toEqualTypeOf<{ limit: number; cursor?: string | undefined }>();
  });
});

describe('userIdParamsSchema', () => {
  it('accepts a uuid', () => {
    expect(userIdParamsSchema.parse({ id: '7d0f0c8e-1b8a-4b8e-9f3e-2f7f5f0d9a11' }).id).toBe('7d0f0c8e-1b8a-4b8e-9f3e-2f7f5f0d9a11');
  });

  it('rejects a non-uuid id', () => {
    expect(userIdParamsSchema.safeParse({ id: '123' }).success).toBe(false);
  });
});

describe('createMatchSchema', () => {
  it('accepts a title and a start time', () => {
    expect(createMatchSchema.parse({ title: 'Friday 5v5', startsAt: '2024-02-01T18:00:00Z' }).startsAt).toBeInstanceOf(Date);
  });

  it('rejects an empty title', () => {
    expect(createMatchSchema.safeParse({ title: '', startsAt: '2024-02-01T18:00:00Z' }).success).toBe(false);
  });
});
```
