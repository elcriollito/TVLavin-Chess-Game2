import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createRegistrationAgeGateService, publicRegistrationCandidate } from '../api/_lib/registration-age-gate-service.js';
import { REGISTRATION_AGE_POLICY } from '../api/_lib/registration-age-policy.js';

const now = Date.parse('2026-10-27T12:00:00.000Z');
const readyEnv = Object.freeze({
  CAISSA_REGISTRATION_RELEASE: 'approved',
  CAISSA_CLERK_RESTRICTED_INVITATIONS: 'confirmed',
  CAISSA_REGISTRATION_DURABLE_LIMITER: 'confirmed',
  CAISSA_REGISTRATION_GATE_SECRET: 'g'.repeat(64),
  CLERK_SECRET_KEY: 'sk_live_synthetic',
  SUPABASE_URL: 'https://synthetic.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
  CAISSA_BROWSER_ORIGINS: 'https://preview.example.test'
});

const allowingStore = Object.freeze({
  async claim() { return true; },
  async consume() { return true; }
});

function request(body, { cookie = '', origin = 'https://preview.example.test', method = 'POST', type = 'application/json' } = {}) {
  return { method, body, headers: { origin, cookie, 'content-type': type, 'content-length': String(JSON.stringify(body || {}).length) } };
}

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function cookieFrom(res) {
  const pair = String(res.headers['Set-Cookie']).split(';')[0];
  return pair;
}

test('production remains paused without the complete Human Release Gate flags', async () => {
  const service = createRegistrationAgeGateService({ env: {}, now: () => now, invite: async () => assert.fail('Clerk called') });
  const res = response();
  await service.eligibility(request({ birthMonth: 1, birthYear: 1990 }, { origin: 'https://www.caissa-chess.org' }), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { code: 'REGISTRATION_PAUSED' });
  assert.equal(publicRegistrationCandidate({}).enabled, false);
});

test('under-16 response sends no email or age value and installs a bounded retry cookie', async () => {
  const service = createRegistrationAgeGateService({ env: readyEnv, now: () => now, store: allowingStore, invite: async () => assert.fail('Clerk called') });
  const res = response();
  await service.eligibility(request({ birthMonth: 12, birthYear: 2011 }), res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'REGISTRATION_UNAVAILABLE' });
  assert.match(res.headers['Set-Cookie'], /^__Host-caissa_registration_age=/);
  assert.match(res.headers['Set-Cookie'], /Secure; HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(JSON.stringify(res.body) + res.headers['Set-Cookie'], /2011|birth|under.?16/i);
});

test('eligible month/year is discarded before a single-use restricted invitation', async () => {
  const invitations = [];
  const consumed = [];
  const service = createRegistrationAgeGateService({
    env: readyEnv, now: () => now,
    store: { async claim() { return true; }, async consume(value) { consumed.push(value); return true; } },
    invite: async value => { invitations.push(value); }
  });
  const age = response();
  await service.eligibility(request({ birthMonth: 9, birthYear: 2010 }), age);
  assert.equal(age.statusCode, 200);
  assert.deepEqual(age.body, { eligible: true, policyVersion: REGISTRATION_AGE_POLICY.version });

  const invitation = response();
  await service.invitation(request({ emailAddress: 'adult@example.test' }, { cookie: cookieFrom(age) }), invitation);
  assert.equal(invitation.statusCode, 202);
  assert.equal(consumed.length, 1);
  assert.match(consumed[0].nonceHash, /^[0-9a-f]{64}$/);
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0].emailAddress, 'adult@example.test');
  assert.equal(invitations[0].notify, true);
  assert.equal(invitations[0].expiresInDays, 1);
  assert.deepEqual(Object.keys(invitations[0].publicMetadata.caissaRegistrationEligibility).sort(), ['method', 'policyVersion', 'screenedAt']);
  assert.doesNotMatch(JSON.stringify(invitations[0]), /birthMonth|birthYear|2010|\"age\"/i);
  assert.match(invitation.headers['Set-Cookie'], /Max-Age=0/);
});

test('direct API, cross-origin, malformed and replayed attempts fail closed before Clerk', async () => {
  let inviteCalls = 0;
  const service = createRegistrationAgeGateService({
    env: readyEnv, now: () => now,
    store: { async claim() { return true; }, async consume() { return false; } },
    invite: async () => { inviteCalls += 1; }
  });
  for (const [req, status] of [
    [request({ emailAddress: 'x@example.test' }), 403],
    [request({ emailAddress: 'x@example.test' }, { origin: 'https://evil.example' }), 403],
    [request({ emailAddress: 'not-an-email' }), 400],
    [request({ birthMonth: 1, birthYear: 1990, emailAddress: 'x@example.test' }), 400]
  ]) {
    const res = response();
    const method = Object.hasOwn(req.body, 'birthMonth') ? service.eligibility : service.invitation;
    await method(req, res);
    assert.equal(res.statusCode, status);
  }

  const age = response();
  await service.eligibility(request({ birthMonth: 1, birthYear: 1990 }), age);
  const replay = response();
  await service.invitation(request({ emailAddress: 'x@example.test' }, { cookie: cookieFrom(age) }), replay);
  assert.equal(replay.statusCode, 409);
  assert.equal(inviteCalls, 0);
});

test('durable source and recipient limits fail closed before Clerk and retain no raw identifiers', async () => {
  const claims = [];
  let inviteCalls = 0;
  const store = {
    async claim(value) { claims.push(value); return claims.length < 3; },
    async consume() { assert.fail('nonce must not be consumed after limiter denial'); }
  };
  const service = createRegistrationAgeGateService({
    env: readyEnv, now: () => now, store,
    invite: async () => { inviteCalls += 1; }
  });
  const age = response();
  await service.eligibility(request({ birthMonth: 1, birthYear: 1990 }), age);
  assert.equal(age.statusCode, 200);

  const invitation = response();
  await service.invitation(request({ emailAddress: 'Adult@Example.test' }, { cookie: cookieFrom(age) }), invitation);
  assert.equal(invitation.statusCode, 429);
  assert.equal(invitation.headers['Retry-After'], String(24 * 60 * 60));
  assert.equal(inviteCalls, 0);
  assert.deepEqual(claims.map(value => value.bucket), ['eligibility-source', 'invitation-source', 'invitation-recipient']);
  assert.match(claims[0].scopeHash, /^[0-9a-f]{64}$/);
  assert.match(claims[2].scopeHash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(claims), /adult@example|127\.0\.0\.1|birth/i);

  const unavailable = createRegistrationAgeGateService({
    env: readyEnv, now: () => now,
    store: { async claim() { throw new Error('offline'); }, async consume() { return true; } },
    invite: async () => assert.fail('Clerk called')
  });
  const failed = response();
  await unavailable.eligibility(request({ birthMonth: 1, birthYear: 1990 }), failed);
  assert.equal(failed.statusCode, 503);
  assert.deepEqual(failed.body, { code: 'REGISTRATION_UNAVAILABLE' });
});

test('static boundaries remove direct Clerk sign-up and preserve existing-user sign-in', () => {
  const signup = fs.readFileSync('js/signup-page.js', 'utf8');
  const signin = fs.readFileSync('js/signin-page.js', 'utf8');
  const html = fs.readFileSync('signup.html', 'utf8');
  assert.doesNotMatch(signup + html, /mountSignUp|Clerk\.load|clerk-sign-up/);
  assert.match(signup, /\/api\/auth\/registration\/eligibility/);
  assert.match(signup, /\/api\/auth\/registration\/invitation/);
  assert.match(signin, /withSignUp:\s*false/);
  assert.match(signin, /transferable:\s*false/);
  const apiFiles = fs.readdirSync('api', { recursive: true }).filter(file => String(file).endsWith('.js'));
  for (const file of apiFiles) assert.doesNotMatch(fs.readFileSync(`api/${file}`, 'utf8'), /users\.createUser\s*\(/, file);
});

test('prepared migration stores only one-way nonce metadata and is not a user-data migration', () => {
  const sql = fs.readFileSync('supabase/migrations/20261027120000_registration_age_gate.sql', 'utf8');
  assert.match(sql, /nonce_hash text primary key/);
  assert.match(sql, /on conflict \(nonce_hash\) do nothing/);
  assert.match(sql, /grant execute .* to service_role/i);
  assert.match(sql, /claim_registration_age_gate_capacity/);
  assert.match(sql, /on conflict \(scope_hash, bucket, window_start\) do update/);
  assert.match(sql, /HMAC digests; contains no raw IP address, email, or birth data/i);
  const table = sql.slice(sql.indexOf('create table'), sql.indexOf(');', sql.indexOf('create table')) + 2);
  assert.doesNotMatch(table, /birth|email|clerk_id|user_id/i);
});
