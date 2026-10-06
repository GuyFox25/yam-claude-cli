#!/usr/bin/env node
// Notification(permission_prompt|idle_prompt): ring the terminal bell and send an OSC 9 desktop notification when
// Claude is waiting on the user. Claude Code emits the sequence (only BEL and OSC 0/1/2/9/99/777 are allowed).
// Turn off with CLAUDE_HOOK_BELL=off in .claude/settings.local.json "env".
import { readInput } from '../lib/hook-io.mjs';

const MAX_MESSAGE = 80;
const BEL = '\u0007';
const OSC = '\u001b]';

const input = await readInput();
if (String(process.env.CLAUDE_HOOK_BELL ?? '').toLowerCase() === 'off') process.exit(0);

// No control characters inside the OSC body.
const message = String(input?.message || 'waiting for your input')
  .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_MESSAGE);
// The body starts with "Claude Code:", never a digit (OSC 9;<digit> means something else).
process.stdout.write(JSON.stringify({ terminalSequence: `${BEL}${OSC}9;Claude Code: ${message}${BEL}` }));
process.exit(0);
