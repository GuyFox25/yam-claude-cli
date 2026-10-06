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
- **Arrow functions, never `function`**, for standalone functions, callbacks and React components: `export const getUser = async (id) => { ... };`. Exception: class methods stay regular methods (NestJS decorators and inheritance need them, and so do legacy React class components).
- **Blank line before every `return`** unless the `return` is the first statement of its block.
- **Match the file you are in.** In an existing file, follow its module style (ESM `import` or CommonJS `require`), naming and patterns, even when they differ from new-code conventions.
- **The project's ESLint config wins.** Where it sets a rule that differs from this file (for example `import/order`, `func-style`, `max-params`, `max-lines-per-function`), follow ESLint. Prettier and ESLint decide everything else; the format-on-write hook runs them after each edit.

```ts
export const toDto = (row: UserRow): UserDto => {
  const { passwordHash, ...rest } = row;

  return rest;
};
```

## Imports order
1. External packages (`react`, `zod`, `@nestjs/common`, `drizzle-orm`)
2. Internal libraries: yam-lib, `mm-*`, `mador-yam-*`, and other in-house packages
3. Project aliases and workspace packages (`@/…`, the utils and db packages)
4. Relative imports (`./`, `../`)
5. Stylesheets (`*.scss`, `*.css`, `*.module.scss`), always last

Separate the groups with a blank line if the file already does.

## Functions
- One function does one thing. Keep it under ~30 lines; split it if it grows past that.
- At most 3 parameters. Past that, take one typed options object: `({ userId, limit, cursor }: ListOptions)`.
- Return early (guard clauses) instead of nesting `if`/`else`.

## Drizzle schemas
- Import a table from its own file, **never** from the schema index barrel (`../schema`, `schema/index.ts`):
  - tables in db: the relative file (`../schema/users`)
  - tables in utils: the subpath export (`<utils package>/schema/users`); add the entry to utils' `exports` if it's missing

## Comments
- Only for complex calculations, algorithms and non-obvious business rules. Explain **why**, not what.
- No commented-out code. Delete it; git keeps the history.

## Libraries before new code
Before you write a helper or add a dependency, look in this order:
1. Libraries inside this project (utils, shared folders, existing helpers)
2. yam-lib
3. `mm-*` packages
4. `mador-yam-*` packages
5. Other installed packages

Check them with `node .claude/scripts/lib-info.mjs list` or the `lib-*` agents. **Ask before adding any new dependency.**

## TypeScript only (`.ts`, `.tsx`, `.mts`, `.cts`)
- **No `any`.** Use precise types, generics, or `unknown` + narrowing (Zod `parse` counts as narrowing). No `as any`, no `// @ts-ignore`; if a cast is truly needed use `// @ts-expect-error <reason>`.
- **Explicit return types on every exported function**, including exported arrow functions and React components (`(): JSX.Element`, `Promise<User[]>`, ...).
- Prefer `type` imports for type-only symbols: `import type { User } from '<utils package>'`.
- Shared types/schemas are imported from `utils`, never redefined locally.

## JavaScript only (`.js`, `.jsx`, `.mjs`, `.cjs`)
- **Never add TypeScript syntax** (type annotations, `interface`, `as`, generics) to a JS file, and don't convert a JS file to TS unless asked.
- Document non-obvious shapes with JSDoc (`/** @param {{ id: string }} props */`) when the surrounding code does.
