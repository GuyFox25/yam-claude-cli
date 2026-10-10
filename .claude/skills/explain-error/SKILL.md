---
name: explain-error
description: Explain a pasted error - a JS/TS stack trace, a browser console error, a .NET exception, a failed HTTP response, or an SAP Gateway/OData error message - by tracing it to the code in this repo and ranking the likely causes with file:line. Proposes a fix but doesn't edit until the user agrees. Use when the user pastes an error, stack trace or SAP message and asks what it means or why it happens.
argument-hint: "(paste the error or stack trace)"
allowed-tools: Read, Grep, Glob, Agent, Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(node .claude/scripts/lib-info.mjs:*)
---

# Explain error

The error is in the user's message ($ARGUMENTS, or the text pasted after the command). If nothing was pasted, ask for the full error, including the stack trace or the response body.

1. **Classify** it:
   - **JS/TS runtime or console:** error type, message, and the frames.
   - **Build or type error:** the tool (tsc, eslint, vite, webpack) and the file:line.
   - **.NET:** exception type, message, inner exceptions, and the `at Namespace.Class.Method() in File.cs:line` frames.
   - **HTTP:** status code, URL, and the response body (`{ code, message }` from the server, or an SAP body).
   - **SAP Gateway/OData:** `error.code` (for example `/IWBEP/CM_MGW_RT/020`, `SY/530`, `CX_SY_…`), `error.message.value`, `innererror.errordetails[]`, `innererror.transactionid`. Common ones: a 403 with `CSRF token validation failed`, a 400 `Invalid key predicate` or `Property … not found` (a field name or type mismatch), a 404 `Resource not found for segment` (a wrong entity set or key), and 500s from ABAP (`CX_…`), which are backend bugs.
2. **Map it to the repo.**
   - Map the stack frames to files in this repo. Skip `node_modules` frames, but note which library they came from.
   - Read the frames that are in the repo, plus the code that calls them.
   - For HTTP and OData errors, find the API function that builds the failing URL (`Grep` the entity set or the path).
   - `git log -5 -- <file>` and `git diff` show whether a recent change is involved.
   - If a library is involved, ask its `lib-*` agent or `library-expert` what the error means for that library.
3. **Rank the causes.** Give 1–3 likely causes, most likely first. For each, include the `file:line`, the evidence from the code, and how to confirm it (a log line to add, a value to check, a query for pgAdmin, a request to replay).
4. **Propose the fix** as a short diff or description. **Don't edit any file until the user agrees.**
   - If the cause is in ABAP (a backend `CX_…` dump, missing authorization, a field the service doesn't expose), say so plainly and write what the SAP team should check or change, including the `transactionid` if there is one.
   - If the cause is environmental (an env var, a DB that isn't running, a port), say which one by name, without reading `.env` files.
