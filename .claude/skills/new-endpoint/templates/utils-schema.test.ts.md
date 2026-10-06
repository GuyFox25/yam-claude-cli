# utils schema test template

Use the runner the package already uses: Vitest (`import { describe, it, expect } from 'vitest'`) or Jest (globals).

```ts
import { describe, it, expect } from 'vitest';
import { listUserMatchesQuerySchema, userIdParamsSchema } from './matches';

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
});

describe('userIdParamsSchema', () => {
  it('rejects a non-uuid id', () => {
    expect(userIdParamsSchema.safeParse({ id: '123' }).success).toBe(false);
  });
});
```
