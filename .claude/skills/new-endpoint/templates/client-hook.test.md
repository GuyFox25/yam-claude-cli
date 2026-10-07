# client hook test template

Mock the API module, not `fetch` (`.claude/rules/testing.md`). Use the project's existing render wrapper or providers if it has one; with yam-lib / `mador-yam-*`, that's usually their query provider rather than a bare `QueryClientProvider`. Vitest is shown. For Jest, use `jest.mock` / `jest.mocked` and drop the `vitest` import.

## TS client (`useUserMatches.test.tsx`)
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as api from '../api/matches';
import { useCreateMatch, useUserMatches } from './useUserMatches';

vi.mock('../api/matches');

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUserMatches', () => {
  it('returns matches', async () => {
    vi.mocked(api.fetchUserMatches).mockResolvedValue({ items: [], nextCursor: null });

    const { result } = renderHook(() => useUserMatches('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toEqual([]);
  });

  it('exposes errors', async () => {
    vi.mocked(api.fetchUserMatches).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useUserMatches('u1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// Only when the endpoint has a write route and you scaffolded useCreateMatch.
describe('useCreateMatch', () => {
  it('creates a match', async () => {
    const match = { id: 'm1' } as Awaited<ReturnType<typeof api.createMatch>>;
    vi.mocked(api.createMatch).mockResolvedValue(match);

    const { result } = renderHook(() => useCreateMatch('u1'), { wrapper });
    await act(() => result.current.mutateAsync({} as Parameters<typeof api.createMatch>[0]));

    expect(result.current.data).toEqual(match);
  });

  it('exposes errors', async () => {
    vi.mocked(api.createMatch).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useCreateMatch('u1'), { wrapper });
    act(() => result.current.mutate({} as Parameters<typeof api.createMatch>[0]));

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

## JS client (`useUserMatches.test.jsx`)
No type annotations. The assertions follow the hook you wrote. The block below tests the `useEffect` fallback (`loading` / `error`, no wrapper). For the React Query hook, pass this wrapper to every `renderHook`, assert `isSuccess` / `isError`, and test `useCreateMatch` the same way as in the TS block:
```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);
```

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as api from '../api/matches';
import { useUserMatches } from './useUserMatches';

vi.mock('../api/matches');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUserMatches', () => {
  it('returns matches', async () => {
    vi.mocked(api.fetchUserMatches).mockResolvedValue({ items: [], nextCursor: null });

    const { result } = renderHook(() => useUserMatches('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ items: [], nextCursor: null });
  });

  it('exposes errors', async () => {
    vi.mocked(api.fetchUserMatches).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useUserMatches('u1'));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it('does not fetch without a user id', () => {
    const { result } = renderHook(() => useUserMatches(''));

    expect(result.current.loading).toBe(false);
    expect(api.fetchUserMatches).not.toHaveBeenCalled();
  });
});
```
