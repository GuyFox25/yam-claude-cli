---
name: "@scope/library-name"
summary: One line on what this library is for (becomes the expert agent's description).
whenToUse: building forms in the client, or upgrading @scope/library-name   # completes "Use proactively when ..."; don't start with "when"
---

# @scope/library-name

## Purpose
Two or three sentences: what problem it solves, and what it deliberately does not do.

## Setup
- Install: `npm install @scope/library-name` (peer deps: `react >= 18`, ...)
- Required providers, global CSS imports or init calls, with a minimal example.

## Public API
| Export | Kind | What it does |
|--------|------|--------------|
| `createClient(options)` | function | ... |
| `<DataTable />` | component | ... |
| `useThing(id)` | hook | Function components only; for class components, see Gotchas |

### `createClient(options)`
```ts
import { createClient } from '@scope/library-name';

const client = createClient({ baseUrl: '/sap/opu/odata/sap/ZSERVICE_SRV' });
```
Options, return value, and errors thrown.

## Usage patterns
The recommended way to do the 2–4 most common tasks, as complete short examples (TS, plus JS if the library is used from legacy JS projects).

## Gotchas
- Things developers get wrong: required wrappers, async or caching behavior, error shapes, CSRF/OData specifics, styling.
- Hooks can't be used inside class components; use `<ThingLoader>` or the `withThing` HOC instead.

## Do not
- Deep-import internal paths (`@scope/library-name/dist/...`).
- ...

## Breaking changes
### 3.0.0
- `Grid` was renamed to `DataTable`; the `rows` prop became `data`.
  ```diff
  - <Grid rows={rows} />
  + <DataTable data={rows} />
  ```
### 2.4.0
- ...
