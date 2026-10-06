# client/: React UI

## Which client is this?
The `Stack:` line says `client=react-ts` (TSX, function components) or `client=react-js` (legacy plain JS/JSX, often with class components). Rules for both are in `.claude/rules/react.md`. In short:
- New components are **function components with hooks**, in the package's language (`.tsx` or `.jsx`).
- **Existing class components stay classes.** Edit them in their own style and never convert one unless asked.
- In a JS package, never add TypeScript syntax and never rename files to `.ts` or `.tsx`.

## Role and boundaries
- Renders the UI and calls the backend **over HTTP only**: the Node/.NET REST API, or **SAP Gateway OData** services when the backend is SAP. It never touches a database.
- Imports types and Zod schemas **only from utils** (when a utils package exists), plus in-house libraries. Never import from `db/` or `server/` (blocked by a hook).
- Don't redefine an API type that utils already exports. If one is missing, add it to utils first.

## API layer
- All backend calls go through one place: the existing `src/api/`, `src/services/` or per-feature `api.js`/`api.ts`. Components don't call `fetch`/`axios`/the OData client directly.
- TS with zod: parse responses with the utils schema at the API boundary (`schema.parse(json)`) so contract drift fails loudly. JS without zod: validate the fields you rely on, or follow what the API layer already does.
- **SAP OData:**
  - Use the existing OData helper or in-house OData library (ask its `lib-*` agent).
  - Never invent service paths, entity sets or field names. Take them from the code, saved `$metadata`, or the user.
  - Fetch the `x-csrf-token` before writes, and escape `$filter` values (double the single quotes, then `encodeURIComponent`).
  - Map SAP field names (often UPPER_CASE or with SAP prefixes) to UI models in the API layer, not in components.
- Server state: the standard is the react-query extensions in yam-lib and `mador-yam-*` (ask their `lib-*` agent), with plain React Query for anything they don't cover. In an older client that uses something else (SWR, RTK Query, Redux thunks), keep that and don't add a second one.
- Forms: react-hook-form, with the existing schema library (Zod or Yup) through its resolver.

## In-house libraries
UI kits and helpers from the company libraries come first. Before using one, ask its `lib-<name>` agent, or run `node .claude/scripts/lib-info.mjs show <lib>`.

## Commands
```bash
node .claude/scripts/check.mjs typecheck client   # skipped for plain-JS clients
node .claude/scripts/check.mjs lint client
node .claude/scripts/check.mjs test client -- src/components/UserCard.test.tsx
```
The dev server is the `dev` or `start` script in `client/package.json`.

## Tests
- Use Testing Library: assert what the user sees, not implementation details. Test class components the same way, and never through `instance()` or `state`.
- Mock the API layer, not `fetch` internals. Name test files after the component in its language (`*.test.tsx` or `*.test.jsx`).

## Project-specific
<!-- Add project-specific notes below. Everything above is shared template content. -->
<!-- Suggested: TS or legacy JS; data-fetching/state library; OData service names and the helper used; in-house UI library. -->
