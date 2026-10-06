# db query test template

Follow the package's existing DB test setup: a test database with transactions rolled back per test, testcontainers, or a mocked client. Don't invent a new setup. If none exists, ask the user.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { listUserMatches } from './matches.repo';
import { resetDb, seedUser, seedMatch } from '../test/helpers'; // use the package's existing helpers

describe('listUserMatches', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns only the user\'s matches, newest first', async () => {
    const user = await seedUser();
    const older = await seedMatch({ players: [user.id], startsAt: new Date('2024-01-01') });
    const newer = await seedMatch({ players: [user.id], startsAt: new Date('2024-02-01') });
    await seedMatch({ players: [] });

    const res = await listUserMatches(user.id, { limit: 20 });

    expect(res.items.map((m) => m.id)).toEqual([newer.id, older.id]);
    expect(res.nextCursor).toBeNull();
  });

  it('paginates with a cursor', async () => {
    const user = await seedUser();
    await seedMatch({ players: [user.id] });
    await seedMatch({ players: [user.id] });

    const page1 = await listUserMatches(user.id, { limit: 1 });

    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
  });
});
```
