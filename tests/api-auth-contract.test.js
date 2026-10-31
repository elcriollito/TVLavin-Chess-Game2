import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { TokenVerificationError } from '@clerk/backend/errors';
import { createAuthenticateRequest, respondAuthFailure } from '../api/_lib/auth.js';
import walletHandler from '../api/wallet.js';
import pullHandler from '../api/library/pull.js';
import pushHandler from '../api/library/push.js';
import deleteHandler from '../api/library/delete.js';

function response() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

const request = (method, authorization, body = {}) => ({
  method, headers: authorization === undefined ? {} : { authorization }, body, query: {}
});

const signingKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const localJwtKey = signingKeys.publicKey.export({ type: 'spki', format: 'pem' });
const localIssuer = 'https://synthetic-development.example.test';

function signedToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'synthetic-user', sid: 'session-a', jti: 'token-a',
    iss: localIssuer, azp: 'https://www.caissa-chess.org',
    iat: now, nbf: now - 1, exp: now + 120, fva: [0, -1],
    ...overrides
  })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), signingKeys.privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

function localVerifier() {
  return createAuthenticateRequest({ env: {
    CLERK_JWT_KEY: localJwtKey,
    CAISSA_CLERK_AUTHORITY: 'legacy_development',
    CAISSA_CLERK_ISSUER: localIssuer
  }, log() {} });
}

test('missing and malformed authorization fail with stable 401 responses', async () => {
  const authenticate = createAuthenticateRequest({ env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => assert.fail() });
  for (const header of [undefined, 'Basic abc', 'Bearer ', 'Bearer    ']) {
    const result = await authenticate(request('GET', header));
    assert.deepEqual(result, {
      authenticated: false, ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Authentication required.'
    });
  }
});

test('invalid, expired, and stale-key Clerk tokens are controlled 401 without leaking verifier errors', async () => {
  for (const reason of ['token-invalid', 'token-expired', 'token-invalid-signature', 'jwk-kid-mismatch']) {
    const authenticate = createAuthenticateRequest({
      env: { CLERK_SECRET_KEY: 'test' },
      verifyToken: async () => { throw new TokenVerificationError({ reason, message: 'sensitive verifier detail' }); }
    });
    const result = await authenticate(request('GET', 'Bearer synthetic.invalid.token'));
    assert.equal(result.status, 401);
    assert.equal(result.code, 'INVALID_TOKEN');
    assert.doesNotMatch(JSON.stringify(result), /sensitive|synthetic/);
  }
});

test('invalid-token reasons remain 401 across SDK bundle or realm boundaries', async () => {
  const foreignError = new Error('sensitive foreign verifier detail');
  foreignError.reason = 'jwk-kid-mismatch';
  const authenticate = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' },
    verifyToken: async () => { throw foreignError; },
    log() {}
  });
  const result = await authenticate(request('GET', `Bearer ${signedToken()}`));
  assert.equal(result.status, 401);
  assert.equal(result.code, 'INVALID_TOKEN');
  assert.doesNotMatch(JSON.stringify(result), /sensitive|foreign/);
});

test('malformed compact JWT parse failures remain controlled 401', async () => {
  const authenticate = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' },
    verifyToken: async () => { throw new SyntaxError('sensitive JWT parse detail'); },
    log() {}
  });
  const result = await authenticate(request('GET', 'Bearer malformed.jwt.value'));
  assert.equal(result.status, 401);
  assert.equal(result.code, 'INVALID_TOKEN');
  assert.doesNotMatch(JSON.stringify(result), /sensitive|parse/);
});

test('a stale key rejection does not poison a later request after JWKS refresh', async () => {
  let attempts = 0;
  const stale = new Error('stale cached key detail');
  stale.reason = 'jwk-kid-mismatch';
  const rotatedToken = signedToken();
  const authenticate = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' },
    verifyToken: async () => {
      attempts += 1;
      if (attempts === 1) throw stale;
      return { sub: 'synthetic-user', email: null };
    },
    log() {}
  });
  const first = await authenticate(request('GET', `Bearer ${rotatedToken}`));
  const refreshed = await authenticate(request('GET', `Bearer ${rotatedToken}`));
  assert.equal(first.status, 401);
  assert.equal(first.code, 'INVALID_TOKEN');
  assert.equal(refreshed.authenticated, true);
  assert.equal(refreshed.userId, 'synthetic-user');
  assert.equal(attempts, 2);
});

test('real Clerk verification classifies malformed compact JWT input as sanitized 401', async () => {
  const authenticate = localVerifier();
  const valid = signedToken();
  const [header, payload, signature] = valid.split('.');
  const malformed = [
    'synthetic', 'a.b.c', '..',
    `!.${payload}.${signature}`,
    `${header}.!.${signature}`,
    `${header}.${payload}.!`,
    `${Buffer.from('[]').toString('base64url')}.${payload}.${signature}`
  ];
  for (const [index, token] of malformed.entries()) {
    const result = await authenticate(request('GET', `Bearer ${token}`));
    assert.equal(result.status, 401, `malformed token case ${index}`);
    assert.equal(result.code, 'INVALID_TOKEN');
    assert.doesNotMatch(JSON.stringify(result), /SyntaxError|Unexpected|padding|JSON/iu);
  }
});

test('configuration and unexpected verifier failures are controlled 503', async () => {
  const missingConfig = createAuthenticateRequest({ env: {}, log() {} });
  assert.equal((await missingConfig(request('GET', 'Bearer synthetic'))).status, 503);
  const unavailable = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => { throw new Error('network detail'); }, log() {}
  });
  const result = await unavailable(request('GET', `Bearer ${signedToken()}`));
  assert.equal(result.status, 503);
  assert.equal(result.code, 'AUTH_SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /network detail/);
});

test('configuration and JWKS verifier reasons remain sanitized 503', async () => {
  const reasons = [
    'secret-key-invalid', 'jwk-local-missing', 'jwk-remote-failed-to-load',
    'jwk-remote-invalid', 'jwk-remote-missing', 'jwk-failed-to-resolve'
  ];
  for (const reason of reasons) {
    const error = new TokenVerificationError({ reason, message: 'sensitive infrastructure detail' });
    const authenticate = createAuthenticateRequest({
      env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => { throw error; }, log() {}
    });
    const result = await authenticate(request('GET', `Bearer ${signedToken()}`));
    assert.equal(result.status, 503, reason);
    assert.equal(result.code, 'AUTH_SERVICE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result), /sensitive|infrastructure/);
  }
});

test('successful verification preserves the authenticated identity contract', async () => {
  const authenticate = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => ({ sub: 'synthetic-user', email: 'synthetic@example.test' })
  });
  assert.deepEqual(await authenticate(request('GET', 'Bearer synthetic')), {
    authenticated: true, ok: true, userId: 'synthetic-user', email: 'synthetic@example.test',
    authority: null, issuer: null, sessionId: null, issuedAt: null,
    tokenId: null, factorVerificationAge: null
  });
});

test('Clerk instance authority and issuer are fixed by server configuration', async () => {
  const publishable = `pk_test_${Buffer.from('development.example.test$').toString('base64url')}`;
  const authenticate = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'sk_test_synthetic', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishable },
    verifyToken: async () => ({
      sub: 'synthetic-user', iss: 'https://development.example.test', sid: 'session', iat: 42,
      jti: 'token-id', fva: [2, -1]
    })
  });
  const result = await authenticate(request('GET', 'Bearer synthetic'));
  assert.equal(result.authenticated, true);
  assert.equal(result.authority, 'legacy_development');
  assert.equal(result.issuer, 'https://development.example.test');
  assert.equal(result.sessionId, 'session');
  assert.equal(result.issuedAt, 42);
  assert.equal(result.tokenId, 'token-id');
  assert.deepEqual(result.factorVerificationAge, [2, -1]);

  const crossed = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'sk_test_synthetic', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishable },
    verifyToken: async () => ({ sub: 'synthetic-user', iss: 'https://production.example.test' })
  });
  assert.equal((await crossed(request('GET', 'Bearer synthetic'))).code, 'INVALID_TOKEN');
});

test('enforced ownership fails closed when Clerk authority or issuer cannot be fixed', async () => {
  let verificationCalls = 0;
  const verify = async () => { verificationCalls += 1; return { sub: 'synthetic-user' }; };
  for (const env of [
    { CLERK_SECRET_KEY: 'test', CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced' },
    {
      CLERK_SECRET_KEY: 'sk_test_synthetic',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_not-valid-base64-host',
      CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced'
    },
    {
      CLERK_SECRET_KEY: 'sk_test_synthetic',
      CAISSA_CLERK_AUTHORITY: 'legacy_development',
      CAISSA_CLERK_ISSUER: 'not a URL',
      CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced'
    },
    {
      CLERK_SECRET_KEY: 'sk_test_synthetic',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('development.example.test$').toString('base64url')}`,
      CAISSA_CLERK_AUTHORITY: 'production',
      CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced'
    },
    {
      CLERK_SECRET_KEY: 'sk_live_synthetic',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('development.example.test$').toString('base64url')}`,
      CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced'
    }
  ]) {
    const authenticate = createAuthenticateRequest({ env, verifyToken: verify, log() {} });
    const result = await authenticate(request('GET', 'Bearer synthetic'));
    assert.equal(result.status, 503);
    assert.equal(result.code, 'AUTH_SERVICE_UNAVAILABLE');
  }
  assert.equal(verificationCalls, 0);
});

test('local Clerk JWT verification can use the instance public key without a backend API request', async () => {
  let options;
  const authenticate = createAuthenticateRequest({
    env: { CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----\nsynthetic\n-----END PUBLIC KEY-----' },
    verifyToken: async (_token, received) => {
      options = received;
      return { sub: 'synthetic-user' };
    }
  });
  const result = await authenticate(request('GET', 'Bearer synthetic'));
  assert.equal(result.authenticated, true);
  assert.equal(options.jwtKey, '-----BEGIN PUBLIC KEY-----\nsynthetic\n-----END PUBLIC KEY-----');
  assert.equal('secretKey' in options, false);
  assert.deepEqual(options.authorizedParties, ['https://www.caissa-chess.org']);
});

test('real local Clerk verification accepts only intact, current, issuer-bound and party-bound JWT evidence', async () => {
  const authenticate = localVerifier();
  const valid = await authenticate(request('GET', `Bearer ${signedToken()}`));
  assert.equal(valid.authenticated, true);
  assert.equal(valid.userId, 'synthetic-user');
  assert.equal(valid.sessionId, 'session-a');
  assert.equal(valid.tokenId, 'token-a');
  assert.deepEqual(valid.factorVerificationAge, [0, -1]);

  const now = Math.floor(Date.now() / 1000);
  const invalidTokens = [
    signedToken({ exp: now - 600, iat: now - 900 }),
    signedToken({ iss: 'https://wrong-issuer.example.test' }),
    signedToken({ azp: 'https://wrong-party.example.test' })
  ];
  const intact = signedToken();
  const [header, payload, signature] = intact.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({
    ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    sub: 'tampered-user'
  })).toString('base64url');
  invalidTokens.push(`${header}.${tamperedPayload}.${signature}`);
  for (const [index, token] of invalidTokens.entries()) {
    const result = await authenticate(request('GET', `Bearer ${token}`));
    assert.equal(result.authenticated, false);
    assert.equal(result.status, 401, `invalid token case ${index}`);
    assert.equal(result.code, 'INVALID_TOKEN');
  }
});

test('Clerk verification binds tokens to canonical and explicitly configured frontend parties', async () => {
  let options;
  const authenticate = createAuthenticateRequest({
    env: {
      CLERK_SECRET_KEY: 'test',
      CAISSA_CLERK_AUTHORIZED_PARTIES: 'https://preview.example, http://127.0.0.1:8000'
    },
    verifyToken: async (_token, received) => { options = received; return { sub: 'synthetic-user' }; }
  });
  assert.equal((await authenticate(request('GET', 'Bearer synthetic'))).authenticated, true);
  assert.deepEqual(options.authorizedParties, [
    'https://www.caissa-chess.org', 'https://preview.example', 'http://127.0.0.1:8000'
  ]);
});

test('auth responder fails closed when a legacy failure omits status', () => {
  const res = response();
  respondAuthFailure(res, { authenticated: false, error: 'legacy detail' });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { code: 'AUTH_REQUIRED', error: 'Authentication required.' });
});

test('wallet and library routes deny auth failures before database access', async () => {
  for (const [handler, method, body] of [
    [walletHandler, 'GET', {}], [pullHandler, 'GET', {}], [pushHandler, 'POST', {}],
    [deleteHandler, 'POST', { items: [{ local_id: 'synthetic', type: 'position' }] }]
  ]) {
    let dbAccessed = false;
    const res = response();
    await handler(request(method, undefined, body), res, {
      verifyAuth: async () => ({ authenticated: false }),
      getSupabase: () => { dbAccessed = true; throw new Error('must not run'); }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(dbAccessed, false);
  }
});

test('wallet valid mocked identity preserves successful database behavior', async () => {
  const res = response();
  const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { credits: 9, is_premium: false, role: 'member' }, error: null }) }) }) }) };
  await walletHandler(request('GET', 'Bearer synthetic'), res, {
    verifyAuth: async () => ({ authenticated: true, userId: 'synthetic-user' }), getSupabase: () => db
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { credits: 9, isPremium: false, role: 'member' });
});

test('library valid mocked identity reaches ownership-scoped database paths', async () => {
  const userResult = { data: { id: '00000000-0000-4000-8000-000000000001' }, error: null };
  const list = { gte() { return this; }, order() { return this; }, limit: async () => ({ data: [], error: null }) };
  const db = {
    from(name) {
      if (name === 'users') return { select: () => ({ eq: () => ({ single: async () => userResult }) }) };
      return {
        select: () => ({ eq: () => list }),
        upsert: async () => ({ error: null }), insert: async () => ({ error: null }),
        delete: () => ({ eq() { return this; }, then(resolve) { resolve({ error: null }); } })
      };
    }
  };
  const deps = { verifyAuth: async () => ({ authenticated: true, userId: 'synthetic-user' }), getSupabase: () => db };
  for (const [handler, method, body] of [[pullHandler, 'GET', {}], [pushHandler, 'POST', {}], [deleteHandler, 'POST', { items: [{ local_id: 'synthetic', type: 'position' }] }]]) {
    const res = response();
    await handler(request(method, 'Bearer synthetic', body), res, deps);
    assert.equal(res.statusCode, 200);
  }
});

test('every direct verifyAuth consumer uses the shared fail-closed responder', () => {
  for (const file of [
    'api/wallet.js', 'api/user/sync.js', 'api/credits/consume.js', 'api/checkout/session.js',
    'api/library/pull.js', 'api/library/push.js', 'api/library/delete.js'
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /respondAuthFailure\(res, auth\)/, file);
    assert.doesNotMatch(source, /res\.status\(auth\.status/, file);
  }
});
