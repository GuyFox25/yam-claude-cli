---
name: release-notes
description: Write release notes for end users (not developers) from the Conventional Commits between two tags or refs - grouped into what's new, what's fixed and what users must do, in plain language with no file names. Use when the user asks for release notes, a changelog for users, or "what's in this release".
argument-hint: "<from>..<to>  e.g. v1.3.0..HEAD (default: last tag..HEAD)"
allowed-tools: Read, Grep, Glob, Bash(git log:*), Bash(git describe:*), Bash(git tag:*), Bash(git diff:*), Bash(git show:*)
---

# Release notes: $ARGUMENTS

1. **Range.** Use `$ARGUMENTS` if it was given. Otherwise use `<last tag>..HEAD`, with the last tag from `git describe --tags --abbrev=0`. If there are no tags, ask for the range.
2. **Collect** with `git log --no-merges --format='%h%x09%s%x09%b%x1e' <range>`. For squash-merged PRs the subject carries the type. Read the body for the *why* and for `BREAKING CHANGE:` footers.
3. **Classify** by Conventional Commit type:
   - `feat` → **New**
   - `fix`, `perf` → **Improved and fixed**
   - `BREAKING CHANGE:` or `!` → **Action needed** (always first if there are any)
   - `chore`, `ci`, `build`, `test`, `refactor`, `docs`, `style` → leave out, unless the body says users will notice (then put it under Improved)
   - Commits that don't follow the convention: read the diff stat (`git show --stat <hash>`) and decide, or list them under "Other" if unclear.
4. **Rewrite for users.** One line per change, in the users' language: what they can do now, or what works better. No file names, packages, PR numbers, or jargon like "endpoint", "hook" or "refactor". Merge commits that describe the same user-facing change. Use the screen and feature names the UI uses (`Grep` the client for the visible labels when a commit only names a component).
5. **Output** markdown, ready to paste:
   ```markdown
   # Release <to> (<date of the last commit>)

   ## Action needed
   - ...
   ## New
   - ...
   ## Improved and fixed
   - ...
   ```
   Drop the empty sections. Below the notes, add a short "Left out" list for the developer (hash + subject of the skipped commits), so they can check nothing important was dropped.
