---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "**/*.cts"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
---

# JavaScript / TypeScript code style

## All JS and TS files
- **Arrow functions over `function` declarations**: `export const getUser = async (id) => { ... };`. Exceptions: class methods (NestJS controllers/services, legacy React class components) stay methods.
- **Blank line before every `return`** unless the `return` is the first statement of its block.
- **Match the file you are in.** In an existing file, follow its module style (ESM `import` or CommonJS `require`), naming and patterns, even when they differ from new-code conventions.
- Let the formatter (prettier) and linter decide everything else; the format-on-write hook runs them after each edit.

```ts
export const toDto = (row: UserRow): UserDto => {
  const { passwordHash, ...rest } = row;

  return rest;
};
```

## TypeScript only (`.ts`, `.tsx`, `.mts`, `.cts`)
- **No `any`.** Use precise types, generics, or `unknown` + narrowing (Zod `parse` counts as narrowing). No `as any`, no `// @ts-ignore`; if a cast is truly needed use `// @ts-expect-error <reason>`.
- **Explicit return types on every exported function**, including exported arrow functions and React components (`(): JSX.Element`, `Promise<User[]>`, ...).
- Prefer `type` imports for type-only symbols: `import type { User } from '<utils package>'`.
- Shared types/schemas are imported from `utils`, never redefined locally.

## JavaScript only (`.js`, `.jsx`, `.mjs`, `.cjs`)
- **Never add TypeScript syntax** (type annotations, `interface`, `as`, generics) to a JS file, and don't convert a JS file to TS unless asked.
- Document non-obvious shapes with JSDoc (`/** @param {{ id: string }} props */`) when the surrounding code does.
