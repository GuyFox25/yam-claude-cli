import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHook } from './helpers.mjs';

const notify = (message, env = {}) => runHook('notify-bell.mjs', { hook_event_name: 'Notification', notification_type: 'permission_prompt', message }, process.cwd(), { CLAUDE_HOOK_BELL: '', ...env });

test('rings the bell and sends an OSC 9 notification with the message', () => {
  const res = notify('Claude needs your permission to use Bash');
  const { terminalSequence } = JSON.parse(res.stdout);

  assert.equal(res.code, 0);
  assert.ok(terminalSequence.startsWith('\u0007\u001b]9;Claude Code: Claude needs your permission to use Bash'));
  assert.ok(terminalSequence.endsWith('\u0007'));
});

test('strips control characters and caps the length', () => {
  const { terminalSequence } = JSON.parse(notify(`evil\u001b]52;c;payload\u0007${'x'.repeat(200)}`).stdout);
  const body = terminalSequence.slice('\u0007\u001b]9;'.length, -1);

  assert.doesNotMatch(body, /[\u0000-\u001f]/);
  assert.ok(body.length <= 'Claude Code: '.length + 80);
});

test('CLAUDE_HOOK_BELL=off silences it', () => {
  const res = notify('waiting', { CLAUDE_HOOK_BELL: 'off' });

  assert.equal(res.code, 0);
  assert.equal(res.stdout, '');
});
