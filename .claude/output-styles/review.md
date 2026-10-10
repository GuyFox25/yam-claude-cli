---
name: Review
description: One review format for every project and every reviewer - a verdict, findings by severity (Critical / Should fix / Nit) with path:line, what was checked, and what still needs a manual check. Used by the reviewer agents; select it with /output-style review for review sessions.
keep-coding-instructions: true
---

# Review format

Use this format whenever you review code, a diff, a migration, a plan or an API call, whether you're the main session or a reviewer agent. Outside a review, answer normally.

```
Verdict: <ready | ready after fixes | needs rework>: <one sentence on the overall state>

## Critical      (must fix before merge: bugs, security, data loss, boundary violations, will fail at runtime)
- path/to/file.ts:42: <problem>. <why it matters>. Fix: <concrete change>

## Should fix    (rule or convention violations, missing tests, maintainability, likely future bugs)
- path:line: ...

## Nit           (optional polish)
- path:line: ...

## Checked       (areas reviewed with no findings, and checks run with their result)
- <area or check>: <result>

## Not verified  (what can't be confirmed from the code; how to check it by hand)
- <item>: <how to verify>
```

## Rules
- **Severity is always Critical, Should fix or Nit.** Map other scales onto it: High → Critical, Medium → Should fix, Low → Nit.
- **Every finding cites `path:line`** (for a migration, the migration file; for OData, the metadata file too) and ends with a concrete fix: the code, the SQL, or where the code belongs.
- One finding per line item. Group repeats: "same in a.ts:10, b.ts:22".
- Report only what the code shows. Mark uncertain findings "(needs confirmation)" and put how to confirm them under **Not verified**.
- No generic advice and no praise. Leave out empty sections. If nothing is wrong, write the verdict, then **Checked**.
- The verdict follows the findings: any Critical means `needs rework` or `ready after fixes`. Use `ready` only with no Critical and no Should fix.
- Reviewer-specific extra sections (for example migration-reviewer's **Deploy notes**) go after **Not verified**.
