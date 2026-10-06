# server test template

Mock the db package and test HTTP behavior. Use supertest if it's installed; otherwise use the framework's testing module or call the handler directly. Use `vi` for Vitest and `jest` for Jest.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as dbApi from '<db package name>';
import { createApp } from '../app'; // NestJS: build via Test.createTestingModule + app.init()

vi.mock('<db package name>');

const USER_ID = '7d0f0c8e-1b8a-4b8e-9f3e-2f7f5f0d9a11';

describe('GET /users/:id/matches', () => {
  beforeEach(() => vi.resetAllMocks());

  it('200 with the user\'s matches', async () => {
    vi.mocked(dbApi.getUserById).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(dbApi.listUserMatches).mockResolvedValue({ items: [], nextCursor: null });

    const res = await request(createApp()).get(`/users/${USER_ID}/matches`).set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('400 on invalid id', async () => {
    const res = await request(createApp()).get('/users/not-a-uuid/matches').set('Authorization', 'Bearer test');

    expect(res.status).toBe(400);
  });

  it('401 without auth', async () => {
    const res = await request(createApp()).get(`/users/${USER_ID}/matches`);

    expect(res.status).toBe(401);
  });

  it('404 when the user does not exist', async () => {
    vi.mocked(dbApi.getUserById).mockResolvedValue(null);

    const res = await request(createApp()).get(`/users/${USER_ID}/matches`).set('Authorization', 'Bearer test');

    expect(res.status).toBe(404);
  });
});
```
