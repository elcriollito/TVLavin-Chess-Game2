import test from 'node:test';
import assert from 'node:assert/strict';

import {
  exactTrueEnabled,
  inspectExactBooleanGate,
  sharedMentorGatesEnabled
} from '../api/_lib/mentor-feature-gates.js';

const adversarialValues = [
  ['exact false', 'false'],
  ['missing', undefined],
  ['null', null],
  ['empty', ''],
  ['leading whitespace', ' true'],
  ['trailing whitespace', 'true '],
  ['newline', 'true\n'],
  ['uppercase TRUE', 'TRUE'],
  ['numeric-like 1', '1'],
  ['yes', 'yes'],
  ['random string', 'enabled']
];

test('only exact lowercase ASCII true enables a Mentor boolean gate', () => {
  assert.equal(exactTrueEnabled('true'), true);
  for (const [, value] of adversarialValues) assert.equal(exactTrueEnabled(value), false);
});

for (const gate of ['MENTOR_AI_ENABLED', 'MENTOR_SHARED_AI_ENABLED']) {
  test(`${gate} accepts exact true and fails closed for every adversarial value`, () => {
    assert.equal(sharedMentorGatesEnabled({ MENTOR_AI_ENABLED: 'true', MENTOR_SHARED_AI_ENABLED: 'true' }), true);
    for (const [, value] of adversarialValues) {
      const env = { MENTOR_AI_ENABLED: 'true', MENTOR_SHARED_AI_ENABLED: 'true', [gate]: value };
      assert.equal(sharedMentorGatesEnabled(env), false);
    }
  });
}

test('inventory distinguishes present, valid, and enabled', () => {
  assert.deepEqual(inspectExactBooleanGate(undefined), { present: false, valid: false, enabled: false });
  assert.deepEqual(inspectExactBooleanGate(' true'), { present: true, valid: false, enabled: false });
  assert.deepEqual(inspectExactBooleanGate('false'), { present: true, valid: true, enabled: false });
  assert.deepEqual(inspectExactBooleanGate('true'), { present: true, valid: true, enabled: true });
});
