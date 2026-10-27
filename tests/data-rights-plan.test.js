import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDataRightsPlan } from '../tools/data-rights/plan-request.mjs';

const fixture = Object.freeze({
  requestId: 'request_fixture_0001',
  clerkUserId: 'user_fixture_0001',
  supabaseUserId: '00000000-0000-4000-8000-000000000001'
});

test('deletion plan is non-executing and orders inventory before prepared actions', () => {
  const plan = buildDataRightsPlan({ ...fixture, requestType: 'deletion' });
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.destructive, true);
  assert.equal(plan.disposition, 'ready_for_human_review');
  assert.ok(plan.steps.every(item => item.mode !== 'execute'));
  assert.deepEqual(plan.steps[6].dependencies, [5]);
  assert.deepEqual(plan.steps[8].dependencies, [3, 5]);
});

test('legal holds preserve a human decision instead of promising complete deletion', () => {
  const plan = buildDataRightsPlan({ ...fixture, requestType: 'account_closure', legalHold: true });
  assert.equal(plan.disposition, 'partial_retention_requires_counsel_review');
  assert.ok(plan.steps.some(item => item.action === 'classify_retention_exceptions_and_legal_hold'));
});

test('access and export include private delivery after complete inventory', () => {
  for (const requestType of ['access', 'export']) {
    const plan = buildDataRightsPlan({ ...fixture, requestType });
    assert.equal(plan.destructive, false);
    assert.match(plan.steps.at(-1).action, /deliver_through_verified_private_channel/);
    assert.deepEqual(plan.steps.at(-1).dependencies, [5]);
  }
});

test('correction remains owner-scoped and dry-run only', () => {
  const plan = buildDataRightsPlan({ ...fixture, requestType: 'correction' });
  const correction = plan.steps.at(-1);
  assert.equal(correction.system, 'supabase');
  assert.equal(correction.mode, 'dry_run_only');
  assert.match(correction.action, /00000000-0000-4000-8000-000000000001/);
});

test('invalid request types and identifier-shaped PII fail closed', () => {
  assert.throws(() => buildDataRightsPlan({ ...fixture, requestType: 'erase_everything' }), /REQUEST_TYPE_INVALID/);
  assert.throws(() => buildDataRightsPlan({ ...fixture, requestType: 'access', clerkUserId: 'person@example.com' }), /CLERK_USER_ID_INVALID/);
});
