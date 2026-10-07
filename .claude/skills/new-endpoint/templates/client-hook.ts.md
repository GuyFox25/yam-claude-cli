# client API function and hook template

Use the react-query extensions from yam-lib or `mador-yam-*` when they cover this case (see `data=` in the `Client libs:` session line, and ask their `lib-*` agent for the hook names). They replace `useQuery`/`useMutation` below; the feature-hook shape stays the same. Plain React Query is shown here as the fallback. If an older client uses another library, use that instead (`.claude/rules/react.md`). Reuse the existing HTTP helper (such as `apiFetch` or an axios instance).

`createMatch` / `useCreateMatch` are for endpoints with a write route only. Scaffold them together with their server route, db function and tests; for a read-only endpoint, leave them out.

```ts
// client/src/api/matches.ts
import {
  listUserMatchesResponseSchema,
  matchSchema,
  type CreateMatchInput,
  type ListUserMatchesQuery,
  type ListUserMatchesResponse,
  type Match,
} from '<utils package name>';
import { apiFetch } from './http';

export const fetchUserMatches = async (userId: string, query: Partial<ListUserMatchesQuery> = {}): Promise<ListUserMatchesResponse> => {
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const json = await apiFetch(`/users/${encodeURIComponent(userId)}/matches?${params}`);

  return listUserMatchesResponseSchema.parse(json);
};

export const createMatch = async (input: CreateMatchInput): Promise<Match> => {
  const json = await apiFetch('/matches', { method: 'POST', body: JSON.stringify(input) });

  return matchSchema.parse(json);
};
```

```ts
// client/src/hooks/useUserMatches.ts
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { CreateMatchInput, ListUserMatchesResponse, Match } from '<utils package name>';
import { createMatch, fetchUserMatches } from '../api/matches';

export const userMatchesKey = (userId: string): readonly unknown[] => ['users', userId, 'matches'] as const;

export const useUserMatches = (userId: string): UseQueryResult<ListUserMatchesResponse> =>
  useQuery({ queryKey: userMatchesKey(userId), queryFn: () => fetchUserMatches(userId), enabled: Boolean(userId) });

export const useCreateMatch = (userId: string): UseMutationResult<Match, Error, CreateMatchInput> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userMatchesKey(userId) }),
  });
};
```

A form that calls `useCreateMatch` uses react-hook-form with the resolver from the `Client libs:` line, and with Zod it reuses the utils `createMatchSchema` (`.claude/rules/react.md` § Forms).
