# client hook test template

Mock the API module, not `fetch`. Use the project's existing render wrapper or providers if it has one.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as api from '../api/matches';
import { useUserMatches } from './useUserMatches';

vi.mock('../api/matches');

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

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
```
