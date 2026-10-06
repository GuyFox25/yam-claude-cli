import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runHook } from './helpers.mjs';

const { blocked, allowed } = fixture('guard-bash.json');

for (const event of blocked) {
  test(`blocks: ${event.tool_input.command}`, () => {
    const res = runHook('guard-bash.mjs', event);

    assert.equal(res.code, 2, res.stderr);
    assert.match(res.stderr, /Blocked by/);
  });
}

for (const event of allowed) {
  test(`allows: ${event.tool_input.command}`, () => {
    const res = runHook('guard-bash.mjs', event);

    assert.equal(res.code, 0, res.stderr);
  });
}

test('empty input is allowed', () => {
  assert.equal(runHook('guard-bash.mjs', {}).code, 0);
});
