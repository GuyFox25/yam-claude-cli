---
paths:
  - "server/**"
  - "db/**"
---

# Backend (server and db)

## Validation
- Validate every external input with Zod at the boundary: body, params, query, any headers you read, and inter-service messages.
- Use the shared schemas from utils and their `z.infer` types. Never redefine a schema in server or db.
- Pass only the parsed values onward, never `req.body` / `req.query` themselves.

## Errors
- Messages are precise and informative: `Order 123 not found`, not `Not found`. Every not-found error names the resource and the id that was looked up.
- More detail is better, as long as it's safe. Include the ids and field names the caller sent, and which rule failed. Never include secrets, tokens, password hashes, other users' data, internal hostnames or file paths.
- Status codes:

  | Code | When |
  |------|------|
  | 400 | invalid input (schema validation failed) |
  | 401 | not authenticated |
  | 403 | authenticated but not allowed |
  | 404 | resource doesn't exist |
  | 409 | conflict (duplicate, stale version) |
  | 422 | valid input that breaks a business rule |
  | 500 | unexpected failures only |

- One shared error shape for the whole API: `{ code, message, details? }` (for example `{ code: 'ORDER_NOT_FOUND', message: 'Order 123 not found' }`).
- Never send stack traces, SQL or internal error messages to clients. Log them on the server.

## SOLID for classes and services
- **Single responsibility:** controllers handle HTTP only, services hold business logic, and data access lives only in db (repositories).
- **Every controller or router gets a service**, even when the service only delegates to db. The service is the single place to add checks, logging or orchestration later.
- **Open/closed:** add behavior with new classes or strategies, not growing `switch` / `if` chains.
- **Liskov:** an implementation honors the full interface contract. No "not supported" throws.
- **Interface segregation:** small focused interfaces (`OrderReader`, `OrderWriter`) over one large one.
- **Dependency inversion:** inject dependencies through the constructor (NestJS DI), typed as interfaces or abstract classes. Never `new` a dependency or import a singleton inside a class.
  - NestJS: wrap the db functions a feature needs in an abstract-class provider (`MatchesRepository`) and inject it into the service.
  - Express: there is no DI container, so services import the db package's functions directly.

## Composition over inheritance
- Prefer composition. At most one level of inheritance.
