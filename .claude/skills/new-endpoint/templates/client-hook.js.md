# client API function and hook template (plain JS / JSX clients)

For legacy JS clients: no TypeScript syntax, and new hooks and components are function components. Reuse the existing HTTP or OData helper and the data-fetching approach the client already has. A plain `useEffect` hook is shown here; use React Query, Redux thunks or similar if that's what the project uses.

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

## Hook
```js
// client/src/hooks/useUserMatches.js
import { useEffect, useState } from 'react';
import { fetchUserMatches } from '../api/matches';

export const useUserMatches = (userId) => {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(userId) });

  useEffect(() => {
    if (!userId) return undefined;
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

## Using it from an existing class component
Hooks can't be called inside a class. Don't convert the class; render a small function child, or pass the data in as props:
```jsx
const UserMatchesLoader = ({ userId, children }) => children(useUserMatches(userId));

// inside the class component's render():
// <UserMatchesLoader userId={this.props.userId}>{({ data, loading, error }) => ...}</UserMatchesLoader>
```
