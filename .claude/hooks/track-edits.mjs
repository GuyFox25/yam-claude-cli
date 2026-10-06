#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): remember which files Claude changed this session, so the Stop hook
// checks only those (never the user's own uncommitted work).
import { readInput, allow } from '../lib/hook-io.mjs';
import { projectRoot, resolveInRoot } from '../lib/detect.mjs';
import { recordEdit } from '../lib/edits.mjs';

const input = await readInput();
const filePath = String(input?.tool_input?.file_path ?? '');
if (!filePath) allow();

const root = projectRoot();
const { rel } = resolveInRoot(root, filePath);
if (!rel.startsWith('..') && !rel.includes('node_modules/')) recordEdit(root, input.session_id, rel);
allow();
