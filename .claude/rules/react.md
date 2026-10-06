---
paths:
  - "client/**/*.jsx"
  - "client/**/*.tsx"
  - "client/**/*.js"
  - "client/**/*.ts"
---

# React

The client is always React. Two styles exist across projects; the session `Stack:` line says which one this repo has (`client=react-ts` or `client=react-js`, and whether class components are present).

## New code: function components with hooks
- Every **new** component is a function component written as an arrow function, with hooks for state and effects. This applies to JS projects too (`.jsx`, no types).
- TS: `export const UserCard = ({ user }: Props): JSX.Element => { ... };`
- JS: `export const UserCard = ({ user }) => { ... };`, plus `UserCard.propTypes` **only** if the project already uses `prop-types`.
- New files use the extension the package already uses (`.tsx` in TS packages, `.jsx` or `.js` in JS packages).

## Existing class components: keep them
- **Never convert a class component to a function component unless the user asks.** Edit it in its own style: `this.state` / `this.setState`, lifecycle methods (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`), bound handlers or class-field arrows, as the file already does.
- Don't add hooks to a class component (they don't work there). To reuse hook-based logic from a class, wrap it: a small function component or an HOC that passes values as props.
- A new child component used by a class component is still a function component.
- If a change would be much simpler after converting, say so and ask; don't do it silently.

## Both styles
- Components don't call `fetch` or the OData/HTTP client directly; they go through the package's API layer (see `client/CLAUDE.md`).
- Keys on list items are stable ids, never array indexes for reorderable lists.
- Handle loading, empty and error states in every view that fetches data.
- Use the state, routing, styling and UI libraries the package already has (including in-house component libraries; ask their `lib-*` agent). Never add a second one.
