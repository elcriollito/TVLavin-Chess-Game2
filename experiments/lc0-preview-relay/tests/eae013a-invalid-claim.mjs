// Opt-in protected Preview failure probe. Credentials stay in process env.
import assert from 'node:assert/strict';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE013A_INVALID_CLAIM !== '1' || !process.env.EAE013_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') ||
    !process.env.EAE013_MAIN_ORIGIN || !process.env.EAE013_ENGINE_ORIGIN)
  throw new Error('EAE013A_INVALID_CLAIM_CONFIG_REQUIRED');
const main = process.env.EAE013_MAIN_ORIGIN;
const engine = process.env.EAE013_ENGINE_ORIGIN;
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
let user, clerkSession, sessionId;

async function request(origin, action, { token, body, session = sessionId } = {}) {
  const url = new URL('/api/eae011', origin);
  url.searchParams.set('action', action);
  if (session) url.searchParams.set('sessionId', session);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: { Origin: origin, 'x-vercel-protection-bypass': process.env.EAE013_BYPASS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}

try {
  user = await clerk.users.createUser({
    emailAddress: [`eae013a-invalid-claim-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  clerkSession = await clerk.sessions.createSession({ userId: user.id });
  const token = (await clerk.sessions.getToken(clerkSession.id)).jwt;
  const created = await request(main, 'create', { token, session: null,
    body: { competitionId: `invalidclaim_${crypto.randomUUID().replaceAll('-', '').slice(0, 22)}`,
      participantRole: 'white' } });
  assert.equal(created.status, 201);
  sessionId = created.body.sessionId;
  const rejected = await request(engine, 'claim', { session: null,
    body: { sessionId, claimToken: 'invalid-claim-token' } });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.error, 'CLAIM_INVALID');
  const inspected = await request(main, 'inspect', { token });
  assert.equal(inspected.status, 200);
  assert.equal(inspected.body.state.phase, 'UNCLAIMED');
  const terminated = await request(main, 'terminate', { token, body: {} });
  assert.equal(terminated.status, 200);
  assert.equal((await request(main, 'inspect', { token })).status, 410);
  console.log(`EAE013A_INVALID_CLAIM ${JSON.stringify({ rejected: rejected.body.error,
    retainedAfterRejection: inspected.body.state.phase, terminated: true })}`);
} finally {
  if (sessionId && clerkSession) {
    const token = (await clerk.sessions.getToken(clerkSession.id)).jwt;
    await request(main, 'terminate', { token, body: {} }).catch(() => {});
  }
  if (user) await clerk.users.deleteUser(user.id);
}
