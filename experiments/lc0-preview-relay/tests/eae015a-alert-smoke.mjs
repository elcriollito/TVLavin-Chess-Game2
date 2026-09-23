import assert from 'node:assert/strict';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE015A_ALERT_SMOKE !== '1') throw new Error('ALERT_SMOKE_REQUIRED');
const relay = process.env.EAE015A_RELAY_ORIGIN;
const main = process.env.EAE013_MAIN_ORIGIN;
const jwt = process.env.EAE015A_RELAY_VERCEL_JWT;
const supabase = process.env.EAE011_SUPABASE_URL;
const service = process.env.EAE015A_SUPABASE_SERVICE_ROLE_KEY;
if (!relay || !main || !jwt || !supabase || !service?.startsWith('sb_secret_') ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) throw new Error('ALERT_SMOKE_ENV_REQUIRED');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
let user;
try {
  user = await clerk.users.createUser({
    emailAddress: [`eae015a-alert-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  const session = await clerk.sessions.createSession({ userId: user.id });
  const token = (await clerk.sessions.getToken(session.id)).jwt;
  const url = new URL('/api/eae011', relay);
  url.searchParams.set('action', 'inspect');
  url.searchParams.set('sessionId', 'eae015a_missing_alert_probe01');
  const response = await fetch(url, { headers: { Origin: main,
    Authorization: `Bearer ${token}`, cookie: `_vercel_jwt=${jwt}` } });
  const body = await response.json();
  assert.equal(response.status, 410);
  assert.equal(body.error, 'SESSION_GONE');
  await new Promise(resolve => setTimeout(resolve, 1_000));
  const metrics = await fetch(`${supabase}/rest/v1/rpc/eae015a_metrics_snapshot`, {
    method: 'POST', headers: { apikey: service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_minutes: 5 })
  });
  assert.equal(metrics.status, 200);
  const sessionGone = (await metrics.json()).find(row => row.metric === 'session_gone');
  assert.equal(Number(sessionGone?.counter_value || 0), 0);
  console.log('EAE015A_ALERT_SMOKE PASS expected inspect SESSION_GONE excluded');
} finally {
  if (user) await clerk.users.deleteUser(user.id);
}
