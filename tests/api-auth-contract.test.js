import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('missing and malformed authorization fail with stable 401 responses', async () => {
  const authenticate = createAuthenticateRequest({ env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => assert.fail() });
  for (const header of [undefined, 'Basic abc', 'Bearer ', 'Bearer    ']) {
    const result = await authenticate(request('GET', header));
    assert.deepEqual(result, {
      authenticated: false, ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Authentication required.'
    });
  }
});

test('invalid and expired Clerk tokens are controlled 401 without leaking verifier errors', async () => {
  for (const reason of ['token-invalid', 'token-expired', 'token-invalid-signature']) {
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

test('configuration and unexpected verifier failures are controlled 503', async () => {
  const missingConfig = createAuthenticateRequest({ env: {}, log() {} });
  assert.equal((await missingConfig(request('GET', 'Bearer synthetic'))).status, 503);
  const unavailable = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => { throw new Error('network detail'); }, log() {}
  });
  const result = await unavailable(request('GET', 'Bearer synthetic'));
  assert.equal(result.status, 503);
  assert.equal(result.code, 'AUTH_SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /network detail/);
});

test('successful verification preserves the authenticated identity contract', async () => {
  const authenticate = createAuthenticateRequest({
    env: { CLERK_SECRET_KEY: 'test' }, verifyToken: async () => ({ sub: 'synthetic-user', email: 'synthetic@example.test' })
  });
  assert.deepEqual(await authenticate(request('GET', 'Bearer synthetic')), {
    authenticated: true, ok: true, userId: 'synthetic-user', email: 'synthetic@example.test'
  });
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
