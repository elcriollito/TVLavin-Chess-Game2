import assert from 'node:assert/strict';
import test from 'node:test';

import { consumeMentorCredit } from '../api/mentor/chat.js';

function atomicCreditStore(initialUsers) {
  const users = new Map(Object.entries(initialUsers).map(([id, value]) => [id, { ...value }]));
  let queue = Promise.resolve();

  return {
    users,
    async rpc(name, params) {
      assert.equal(name, 'consume_credits');
      assert.deepEqual(Object.keys(params).sort(), ['p_action', 'p_clerk_id', 'p_cost']);

      const operation = queue.then(() => {
        const user = users.get(params.p_clerk_id);
        if (!user) {
          return { data: [{ success: false, new_balance: 0, message: 'User not found' }], error: null };
        }
        if (user.isPremium) {
          return {
            data: [{ success: true, new_balance: user.credits, message: 'Premium user - no deduction' }],
            error: null
          };
        }
        if (user.credits < params.p_cost) {
          return {
            data: [{ success: false, new_balance: user.credits, message: 'Insufficient credits' }],
            error: null
          };
        }
        user.credits -= params.p_cost;
        return { data: [{ success: true, new_balance: user.credits, message: 'Credits consumed' }], error: null };
      });

      queue = operation.then(() => undefined, () => undefined);
      return operation;
    }
  };
}

async function authorizeAndInvoke(store, authenticatedUserId, provider) {
  const decision = await consumeMentorCredit(store, authenticatedUserId);
  if (!decision.authorized) return decision;
  await provider();
  return decision;
}

test('one credit authorizes one paid Mentor operation and leaves zero', async () => {
  const store = atomicCreditStore({ user_a: { credits: 1, isPremium: false } });
  let providerCalls = 0;
  const decision = await authorizeAndInvoke(store, 'user_a', async () => { providerCalls += 1; });
  assert.equal(decision.authorized, true);
  assert.equal(providerCalls, 1);
  assert.equal(store.users.get('user_a').credits, 0);
});

test('one credit and two concurrent requests authorize exactly one provider call', async () => {
  const store = atomicCreditStore({ user_a: { credits: 1, isPremium: false } });
  let providerCalls = 0;
  const decisions = await Promise.all(Array.from({ length: 2 }, () =>
    authorizeAndInvoke(store, 'user_a', async () => { providerCalls += 1; })
  ));
  assert.equal(decisions.filter((item) => item.authorized).length, 1);
  assert.equal(decisions.filter((item) => item.reason === 'insufficient_credits').length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(store.users.get('user_a').credits, 0);
});

test('two credits and two concurrent requests both succeed and leave zero', async () => {
  const store = atomicCreditStore({ user_a: { credits: 2, isPremium: false } });
  let providerCalls = 0;
  const decisions = await Promise.all(Array.from({ length: 2 }, () =>
    authorizeAndInvoke(store, 'user_a', async () => { providerCalls += 1; })
  ));
  assert.equal(decisions.filter((item) => item.authorized).length, 2);
  assert.equal(providerCalls, 2);
  assert.equal(store.users.get('user_a').credits, 0);
});

test('zero credits denies before provider invocation', async () => {
  const store = atomicCreditStore({ user_a: { credits: 0, isPremium: false } });
  let providerCalls = 0;
  const decision = await authorizeAndInvoke(store, 'user_a', async () => { providerCalls += 1; });
  assert.equal(decision.reason, 'insufficient_credits');
  assert.equal(providerCalls, 0);
});

test('three credits and ten concurrent requests authorize exactly three', async () => {
  const store = atomicCreditStore({ user_a: { credits: 3, isPremium: false } });
  let providerCalls = 0;
  const decisions = await Promise.all(Array.from({ length: 10 }, () =>
    authorizeAndInvoke(store, 'user_a', async () => { providerCalls += 1; })
  ));
  assert.equal(decisions.filter((item) => item.authorized).length, 3);
  assert.equal(decisions.filter((item) => item.reason === 'insufficient_credits').length, 7);
  assert.equal(providerCalls, 3);
  assert.equal(store.users.get('user_a').credits, 0);
});

test('forged client credits and premium fields have no authorization effect', async () => {
  const store = atomicCreditStore({ user_a: { credits: 0, isPremium: false } });
  const forgedBody = { credits: 999999, isPremium: true };
  const decision = await consumeMentorCredit(store, 'user_a', forgedBody);
  assert.equal(decision.authorized, false);
  assert.equal(store.users.get('user_a').credits, 0);
});

test('authenticated identity cannot consume another user balance', async () => {
  const store = atomicCreditStore({
    user_a: { credits: 0, isPremium: false },
    victim: { credits: 5, isPremium: false }
  });
  const forgedBody = { userId: 'victim' };
  const decision = await consumeMentorCredit(store, 'user_a', forgedBody);
  assert.equal(decision.authorized, false);
  assert.equal(store.users.get('victim').credits, 5);
});

test('trusted premium entitlement bypasses deduction', async () => {
  const store = atomicCreditStore({ premium_user: { credits: 0, isPremium: true } });
  const decision = await consumeMentorCredit(store, 'premium_user');
  assert.equal(decision.authorized, true);
  assert.equal(decision.premium, true);
  assert.equal(store.users.get('premium_user').credits, 0);
});

test('database failure fails closed before provider invocation', async () => {
  const store = { async rpc() { return { data: null, error: new Error('unavailable') }; } };
  let providerCalls = 0;
  const decision = await authorizeAndInvoke(store, 'user_a', async () => { providerCalls += 1; });
  assert.equal(decision.reason, 'service_error');
  assert.equal(providerCalls, 0);
});

test('provider failure consumes once and performs no unsafe refund', async () => {
  const store = atomicCreditStore({ user_a: { credits: 1, isPremium: false } });
  await assert.rejects(
    authorizeAndInvoke(store, 'user_a', async () => { throw new Error('provider failed'); }),
    /provider failed/
  );
  assert.equal(store.users.get('user_a').credits, 0);
});
