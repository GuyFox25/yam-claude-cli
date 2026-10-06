---
paths:
  - "client/**"
---

# React

The client is always React. Two styles exist across projects; the session `Stack:` line says which one this repo has (`client=react-ts` or `client=react-js`, and whether class components are present).

## New code: function components with hooks
- Every **new** component is a function component written as an arrow function, with hooks for state and effects. This applies to JS projects too (`.jsx`, no types).
- TS: `export const UserCard = ({ name, avatarUrl }: UserCardProps): JSX.Element => { ... };`
- JS: `export const UserCard = ({ name, avatarUrl }) => { ... };`, plus `UserCard.propTypes` **only** if the project already uses `prop-types`.
- New files use the extension the package already uses (`.tsx` in TS packages, `.jsx` or `.js` in JS packages).

## Component folders
- A component that has a stylesheet, utils, hooks, types or tests gets its own folder with an index re-export:
  ```
  Button/
    index.ts              export { Button } from './Button';
    Button.tsx
    Button.module.scss
    Button.utils.ts
    Button.test.tsx
  ```
- Import it through the folder (`import { Button } from './Button';`), never `./Button/Button`.
- Don't restructure existing flat components unless asked.

## SOLID for components
- **Single responsibility:** data, state and logic live in custom hooks (`useOrders`); components render. Split any component over ~150 lines.
- **Open/closed:** extend through props, `children` and composition. Don't add type flags and `if` branches to shared components.
- **Liskov:** a wrapper component forwards the base component's props (`...rest`) and never changes what they mean.
- **Interface segregation:** minimal, specific props. Pass the fields a component uses, not whole entities. No prop drilling 3+ levels; use context or composition.
- **Dependency inversion:** components never call `fetch` or the API/OData client directly. They use hooks, or services from props or context (see `client/CLAUDE.md`).

## Data from the API
- Fetch server data with the react-query extensions in yam-lib and `mador-yam-*` (ask their `lib-*` agent for the exact hooks). Use plain `@tanstack/react-query` only for what they don't cover.
- Wrap each query or mutation in a feature hook (`useOrders`); components never call the query library directly.

## Forms and user input
- Forms use **react-hook-form** (`useForm`, `Controller` for controlled inputs), plus any form helpers from yam-lib or `mador-yam-*`.
- Validate all user input with the schema library the existing forms use (Zod or Yup), wired in through the hook-form resolver (`zodResolver` / `yupResolver`). Check the existing forms first, and never mix the two.
- When the backend validates the same shape, reuse the shared Zod schema from utils instead of writing a new one.
- Show errors per field, next to the field.

## TypeScript components
- Explicit `type XProps` (`type ButtonProps = { ... }`), no `any`, no `React.FC`.
- Derive values during render (or `useMemo`) instead of syncing state with `useEffect`.

## Existing class components: keep them
- **Never convert a class component to a function component unless the user asks.** Edit it in its own style: `this.state` / `this.setState`, lifecycle methods (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`), bound handlers or class-field arrows, as the file already does.
- Don't add hooks to a class component (they don't work there). To reuse hook-based logic from a class, wrap it: a small function component or an HOC that passes values as props.
- A new child component used by a class component is still a function component.
- If a change would be much simpler after converting, say so and ask; don't do it silently.

## Both styles
- Keys on list items are stable ids, never array indexes.
- Handle loading, empty and error states in every view that fetches data.
- Use the state, routing, styling and UI libraries the package already has (including in-house component libraries; ask their `lib-*` agent). Never add a second one.
