import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGE_POLICY_VERSION,
  MINIMUM_ACCOUNT_AGE,
  evaluateRegistrationEligibility
} from '../js/auth/age-eligibility.js';
import {
  REGISTRATION_AGE_POLICY,
  evaluateNeutralAge,
  issueRegistrationAgeState,
  registrationReleaseReady,
  verifyRegistrationAgeState
} from '../api/_lib/registration-age-policy.js';

const fixed = new Date('2026-10-27T12:00:00.000Z');

test('approved policy is versioned and requires 16 for new accounts', () => {
  assert.equal(MINIMUM_ACCOUNT_AGE, 16);
  assert.equal(REGISTRATION_AGE_POLICY.minimumAge, 16);
  assert.equal(AGE_POLICY_VERSION, REGISTRATION_AGE_POLICY.version);
});

test('neutral month/year decision is conservative at the sixteenth-birthday month', () => {
  for (const evaluate of [evaluateRegistrationEligibility, evaluateNeutralAge]) {
    assert.equal(evaluate({ birthMonth: 9, birthYear: 2010, now: fixed }).eligible, true);
    assert.equal(evaluate({ birthMonth: 10, birthYear: 2010, now: fixed }).eligible, false);
    assert.equal(evaluate({ birthMonth: 11, birthYear: 2010, now: fixed }).eligible, false);
    assert.equal(evaluate({ birthMonth: 1, birthYear: 2011, now: fixed }).eligible, false);
  }
});

test('missing, malformed, future and implausible answers fail closed', () => {
  for (const input of [
    {}, { birthMonth: 0, birthYear: 2000 }, { birthMonth: 13, birthYear: 2000 },
    { birthMonth: 'January', birthYear: 2000 }, { birthMonth: 1, birthYear: 2027 },
    { birthMonth: 1, birthYear: 1900 }, { birthMonth: 1, birthYear: '2000-01-01' }
  ]) assert.equal(evaluateNeutralAge({ ...input, now: fixed }).eligible, false);
});

test('signed state contains a decision and nonce but no submitted age data', () => {
  const env = { CAISSA_REGISTRATION_GATE_SECRET: 's'.repeat(64) };
  const state = issueRegistrationAgeState({ eligible: true, env, now: () => fixed.getTime(), nonce: 'n'.repeat(32) });
  const decoded = JSON.parse(Buffer.from(state.value.split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(decoded).sort(), ['exp', 'iat', 'n', 's', 'v']);
  assert.equal(JSON.stringify(decoded).includes('birth'), false);
  assert.equal(verifyRegistrationAgeState(state.value, { env, now: () => fixed.getTime() }).eligible, true);
  assert.equal(verifyRegistrationAgeState(`${state.value}x`, { env, now: () => fixed.getTime() }).ok, false);
  assert.equal(verifyRegistrationAgeState(state.value, { env, now: () => fixed.getTime() + 700_000 }).ok, false);
});

test('release readiness requires every human-gated production prerequisite', () => {
  const ready = {
    CAISSA_REGISTRATION_RELEASE: 'approved',
    CAISSA_CLERK_RESTRICTED_INVITATIONS: 'confirmed',
    CAISSA_REGISTRATION_DURABLE_LIMITER: 'confirmed',
    CAISSA_REGISTRATION_GATE_SECRET: 's'.repeat(64),
    CLERK_SECRET_KEY: 'sk_live_synthetic',
    SUPABASE_URL: 'https://synthetic.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role'
  };
  assert.equal(registrationReleaseReady(ready), true);
  for (const key of Object.keys(ready)) assert.equal(registrationReleaseReady({ ...ready, [key]: '' }), false, key);
});
