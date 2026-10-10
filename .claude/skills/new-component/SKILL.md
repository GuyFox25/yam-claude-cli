---
name: new-component
description: Create a React component in its own folder (component, index re-export, styles, test, and a story if Storybook is installed), following react.md and the conventions of the nearest existing component. Works in TSX and legacy JSX clients. Use when the user asks for a new component, widget, page section or UI element.
argument-hint: "<ComponentName> [in <folder>] [short description]  e.g. OrderCard in features/orders"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node .claude/scripts/check.mjs:*), Bash(node .claude/scripts/lib-info.mjs:*), Bash(git status:*)
---

# New component: $ARGUMENTS

Follow `.claude/rules/react.md` and `.claude/rules/code-style.md`.

1. **Discover.**
   - Read the `Stack:` and `Client libs:` lines: `client=react-ts` means `.tsx`/`.ts`, `client=react-js` means `.jsx`/`.js` with no TS syntax.
   - Find 1–2 components near the target folder (`Glob client/src/<folder>/**/index.*`) and copy their layout: file names, style kind (`.module.scss`, `.scss`, styled-components, the in-house UI lib), test location and imports.
   - **Repo first:** search the utils package, `global/`, `shared/` and `common/` folders and the existing components for something that already does this (or most of it). Extend or compose it instead of duplicating. Only then check the in-house UI libraries (`lib-info.mjs list`) and ask their `lib-*` agent for the right building blocks.
   - If the name, location, props or behavior are unclear, ask before writing.
2. **Create the folder** `<folder>/<Name>/`:
   - `<Name>.tsx` (or `.jsx`): an arrow function component, with an explicit `type <Name>Props` in TS (no `any`, no `React.FC`). In JS, add `propTypes` only if the project already uses `prop-types`.
   - `index.ts` (or `index.js`): `export { <Name> } from './<Name>';`
   - the stylesheet in the kind the neighbors use. Use logical CSS properties (`margin-inline-start`) if the UI is RTL.
   - `<Name>.test.tsx` (or `.test.jsx`): render, the main interaction, and the loading, empty and error states if it shows data. Use Testing Library and assert on what the user sees.
   - `<Name>.stories.tsx` (or `.jsx`) **only** if `@storybook/*` is in the client's dependencies: copy the story format of an existing story.
3. **Keep it SOLID.** The component renders. Data and logic go in a feature hook (`use<Thing>`) built on the yam-lib / mador-yam-* query extensions, never `fetch` or the API client inside the component. Use minimal, specific props, and `children` or composition instead of type flags. Forms use react-hook-form with the schema library the existing forms use.
4. **Class components stay classes.** If the new component is used by an existing class component, don't convert the parent. Pass the data in as props.
5. **Check.** Run `node .claude/scripts/check.mjs typecheck client` (skipped for JS), then `node .claude/scripts/check.mjs test client -- <path to the test, relative to client/>`, then `node .claude/scripts/check.mjs lint client`.
6. **Report** the files created and how to import and use the component (`import { <Name> } from '<folder>/<Name>'`).
