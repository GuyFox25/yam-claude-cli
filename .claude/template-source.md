# Template source marker

This file marks **the template repo itself**. While it exists, everything under `.claude/` can be edited, because this is where the template is developed.

`node .claude/scripts/export-template.mjs <project-dir>` never copies this file. In an exported project, the guard-boundaries hook therefore blocks edits to `.claude/` (except `settings.local.json`). Projects change only the `## Project-specific` sections of their CLAUDE.md files. Template changes are made here and re-exported.

Don't delete this file in the template repo, and don't copy it into a project.
