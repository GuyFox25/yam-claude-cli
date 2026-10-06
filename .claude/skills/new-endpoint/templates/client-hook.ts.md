# client API function and hook template

Use the react-query extensions from yam-lib or `mador-yam-*` when they cover this case (ask their `lib-*` agent for the hook names). Plain React Query is shown here as the fallback; if an older client uses another library, use that instead. Reuse the existing HTTP helper (such as `apiFetch` or an axios instance).

```ts
// client/src/api/matches.ts
import { listUserMatchesResponseSchema, type ListUserMatchesQuery, type ListUserMatchesResponse } from '<utils package name>';
import { apiFetch } from './http';

export const fetchUserMatches = async (userId: string, query: Partial<ListUserMatchesQuery> = {}): Promise<ListUserMatchesResponse> => {
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const json = await apiFetch(`/users/${encodeURIComponent(userId)}/matches?${params}`);

  return listUserMatchesResponseSchema.parse(json);
};
```

```ts
// client/src/hooks/useUserMatches.ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ListUserMatchesResponse } from '<utils package name>';
import { fetchUserMatches } from '../api/matches';

export const userMatchesKey = (userId: string): readonly unknown[] => ['users', userId, 'matches'] as const;

export const useUserMatches = (userId: string): UseQueryResult<ListUserMatchesResponse> =>
  useQuery({ queryKey: userMatchesKey(userId), queryFn: () => fetchUserMatches(userId), enabled: Boolean(userId) });
```
