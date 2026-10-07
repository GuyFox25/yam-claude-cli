# client API function and hook template (plain JS / JSX clients)

For legacy JS clients: no TypeScript syntax (`.claude/rules/code-style.md`), and new hooks and components are function components (`.claude/rules/react.md`). Reuse the existing HTTP or OData helper.

Which hook to write depends on the `Client libs:` session line (`data=`):
- yam-lib / `mador-yam-*`: use their react-query extensions (ask their `lib-*` agent for the hook names) in the same feature-hook shape as below.
- `@tanstack/react-query` only: the React Query hook below.
- Another library (SWR, RTK Query, Redux thunks): follow the existing hooks that use it. Don't add a second one.
- `none`: the `useEffect` fallback at the end. Adding a data library is a new dependency and needs the user's approval.

`createMatch` / `useCreateMatch` are for endpoints with a write route only. Scaffold them together with their server route, db function and tests; for a read-only endpoint, leave them out.

## REST backend (Node / .NET)
```js
// client/src/api/matches.js
import { apiFetch } from './http';

export const fetchUserMatches = async (userId, query = {}) => {
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null));
  const json = await apiFetch(`/users/${encodeURIComponent(userId)}/matches?${params}`);
  if (!Array.isArray(json?.items)) throw new Error('Unexpected response from /users/:id/matches');

  return json;
};

export const createMatch = async (input) => apiFetch('/matches', { method: 'POST', body: JSON.stringify(input) });
```

## SAP OData backend
Use the existing OData helper or in-house OData library (ask its `lib-*` agent). Take the service, entity set and field names from the code or the user, never invent them. Map SAP fields to the UI model here.
```js
// client/src/api/orders.js
import { odataGet } from './odata';

const SERVICE = '<ZSERVICE_SRV from the user / existing code>';
// Double the quotes (OData escaping), then URL-encode so &, # or + cannot end the value or add query options.
const filterValue = (value) => encodeURIComponent(String(value).replace(/'/g, "''"));

export const fetchOrders = async (customerId) => {
  const json = await odataGet(`${SERVICE}/<EntitySet>?$filter=<Field> eq '${filterValue(customerId)}'&$format=json`);
  const rows = json?.d?.results ?? json?.value ?? [];

  return rows.map((row) => ({ id: row.<KeyField>, status: row.<StatusField> }));
};
```

## Hooks (React Query)
```js
// client/src/hooks/useUserMatches.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMatch, fetchUserMatches } from '../api/matches';

export const userMatchesKey = (userId) => ['users', userId, 'matches'];

export const useUserMatches = (userId) =>
  useQuery({ queryKey: userMatchesKey(userId), queryFn: () => fetchUserMatches(userId), enabled: Boolean(userId) });

export const useCreateMatch = (userId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userMatchesKey(userId) }),
  });
};
```

## Using it from an existing class component
Hooks can't be called inside a class. Don't convert the class; render a small function child, or pass the data in as props:
```jsx
// client/src/components/UserMatchesLoader.jsx
import { useUserMatches } from '../hooks/useUserMatches';

export const UserMatchesLoader = ({ userId, children }) => children(useUserMatches(userId));

// inside the class component's render():
// <UserMatchesLoader userId={this.props.userId}>{({ data, isLoading, error }) => ...}</UserMatchesLoader>
```

## Fallback: no data library (`data=none`)
```js
// client/src/hooks/useUserMatches.js
import { useEffect, useState } from 'react';
import { fetchUserMatches } from '../api/matches';

export const useUserMatches = (userId) => {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(userId) });

  useEffect(() => {
    if (!userId) {
      setState({ data: null, error: null, loading: false });

      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchUserMatches(userId)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }));

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
};
```
This hook returns `{ data, error, loading }` instead of React Query's `{ data, error, isLoading }`. Match the loader and the tests to it.
