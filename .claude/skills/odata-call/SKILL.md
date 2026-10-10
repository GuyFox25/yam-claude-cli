---
name: odata-call
description: Generate a typed client API function and data hook for an existing SAP Gateway OData entity set or function import, from a $metadata file saved in the repo. Never invents services, entity sets or fields. Handles the CSRF token for writes, $filter escaping and SAP-field-to-UI-model mapping, with tests. Use when the user asks to call, read or update SAP/OData data from the client.
argument-hint: "<SERVICE> <EntitySet|FunctionImport> <read|create|update|delete...>  e.g. ZORDERS_SRV OrderSet read+update"
allowed-tools: Read, Grep, Glob, Edit, Write, Agent, Bash(node .claude/scripts/check.mjs:*), Bash(node .claude/scripts/lib-info.mjs:*), Bash(git status:*)
---

# OData call: $ARGUMENTS

The SAP backend is outside this repo and the network is closed, so `$metadata` can't be fetched. Everything comes from files already in the repo.

1. **Find the metadata.**
   - Look for saved metadata: `Glob **/*metadata*.xml`, `**/odata/**/*.xml`, `**/*.edmx` (skip `node_modules`), plus the paths named in the `## Project-specific` section of `CLAUDE.md` or `client/CLAUDE.md`.
   - Find the service constants and the existing OData helper: `Grep` for the service name, `/sap/opu/odata`, `x-csrf-token`, `$filter`.
   - **Stop** if the service, the entity set / function import, or a field the user needs isn't in the metadata. Tell the user which file you searched and ask for an updated `$metadata` export. Never guess names. The `odata-expert` agent can answer "which entity set has X" from the metadata.
2. **Read the contract** from the metadata: the entity type's keys, properties (`Edm.*` types, `Nullable`, `MaxLength`), navigation properties, and for function imports the HTTP method, parameters and return type. Note the OData version (V2 `d.results` wrapper vs V4 `value`).
3. **Repo first.** Reuse the existing OData client or helper, its `escapeOData`-style helper, the CSRF handling and the type/mapping conventions from utils or `global/`. If nothing exists, check the in-house OData library (`lib-info.mjs list`, then its `lib-*` agent) before writing a new helper.
4. **Write the API function** in the client's API layer, next to the existing ones:
   - typed request params and response (TS types, or JSDoc in JS clients)
   - reads: `$select` only the needed fields, `$filter` values escaped (single quotes doubled, then URL-encoded), never raw concatenation; `$top`/`$skip` for paging
   - writes (POST/PUT/PATCH/MERGE/DELETE): fetch the `x-csrf-token` first (or use the helper that does), and send it with the session cookies
   - map SAP fields to a UI model in one `map<Entity>` function (`Matnr` → `materialId`, `Edm.DateTime` `/Date(…)/` → `Date`, `Edm.Decimal` strings → number only where safe)
   - surface SAP errors (`error.message.value`, `innererror.errordetails`) as a readable error
5. **Write the hook** with the data library the client already uses (the yam-lib / mador-yam-* query extensions; ask their `lib-*` agent). Use query keys that include the params, and invalidate the read after a write.
6. **Test** with the API module or HTTP layer mocked: the mapping (including null and date fields), the escaping of a value with `'`, the CSRF fetch before a write, and an SAP error. Run `node .claude/scripts/check.mjs typecheck client` and `node .claude/scripts/check.mjs test client`.
7. **Report** the files, the entity set and fields used (and the metadata file they came from), and anything the SAP team would need to add.
