import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGE_BANDS,
  AGE_ELIGIBILITY_REASONS,
  evaluateRegistrationEligibility
} from '../js/auth/age-eligibility.js';

test('registration remains fail-closed while the release gate is disabled', () => {
  assert.deepEqual(
    evaluateRegistrationEligibility({ ageBand: AGE_BANDS.AGE_16_PLUS }),
    { eligible: false, reason: AGE_ELIGIBILITY_REASONS.REGISTRATION_PAUSED }
  );
});

test('the conservative candidate accepts only the 16-plus age band', () => {
  for (const ageBand of [AGE_BANDS.UNDER_13, AGE_BANDS.AGE_13_TO_15]) {
    assert.deepEqual(
      evaluateRegistrationEligibility({ ageBand, registrationEnabled: true }),
      { eligible: false, reason: AGE_ELIGIBILITY_REASONS.BELOW_CANDIDATE_MINIMUM }
    );
  }

  assert.deepEqual(
    evaluateRegistrationEligibility({
      ageBand: AGE_BANDS.AGE_16_PLUS,
      registrationEnabled: true
    }),
    { eligible: true, reason: AGE_ELIGIBILITY_REASONS.ELIGIBLE }
  );
});

test('missing and unrecognized answers fail closed without collecting a birth date', () => {
  for (const ageBand of [undefined, null, '', '2001-01-01', '18']) {
    assert.deepEqual(
      evaluateRegistrationEligibility({ ageBand, registrationEnabled: true }),
      { eligible: false, reason: AGE_ELIGIBILITY_REASONS.ANSWER_REQUIRED }
    );
  }
});

test('eligibility responses expose no input age value or date field', () => {
  const result = evaluateRegistrationEligibility({
    ageBand: AGE_BANDS.AGE_16_PLUS,
    registrationEnabled: true
  });

  assert.deepEqual(Object.keys(result).sort(), ['eligible', 'reason']);
  assert.ok(Object.isFrozen(result));
  assert.equal(JSON.stringify(result).includes('16_plus'), false);
});
