import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {
  clerkPublishableKeyFrontendHost,
  isClerkRequestOriginCompatible,
  publicClerkProxyUrl
} from '../api/public-auth-config.js';

const liveKey = 'pk_live_Y2xlcmsuY2Fpc3NhLWNoZXNzLm9yZyQ';
const devKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';

function responseRecorder() {
  return {
    statusCode: 0,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('production publishable key resolves its configured Clerk frontend host', () => {
  assert.equal(clerkPublishableKeyFrontendHost(liveKey), 'clerk.caissa-chess.org');
});

test('production Clerk accepts the root domain and same-site certification subdomains', () => {
  for (const host of ['caissa-chess.org', 'www.caissa-chess.org', 's002-cert.caissa-chess.org']) {
    assert.equal(isClerkRequestOriginCompatible({ headers: { host } }, liveKey), true, host);
  }
  assert.equal(isClerkRequestOriginCompatible({ headers: { host: 'candidate.vercel.app' } }, liveKey), false);
  assert.equal(isClerkRequestOriginCompatible({ headers: { host: 'caissa-chess.org.attacker.test' } }, liveKey), false);
  assert.equal(isClerkRequestOriginCompatible({ headers: { host: 'candidate.vercel.app' } }, devKey), true);
});

test('proxy URL must stay on the request origin and have no query or fragment', () => {
  const req = { headers: { host: 'candidate.vercel.app' } };
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: '/__clerk/' }), '/__clerk');
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: 'https://candidate.vercel.app/__clerk/' }), 'https://candidate.vercel.app/__clerk');
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: 'https://clerk.caissa-chess.org' }), '');
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: '/__clerk?destination=external' }), '');
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: '/%2f%2fevil.example' }), '');
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: '/../__clerk' }), '');
  assert.equal(publicClerkProxyUrl(req, { CAISSA_CLERK_PROXY_URL: '/' }), '');
});

test('public config fails closed for a production key on an unsupported deployment hostname', () => {
  const previous = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const previousProxy = process.env.CAISSA_CLERK_PROXY_URL;
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = liveKey;
  delete process.env.CAISSA_CLERK_PROXY_URL;
  try {
    const res = responseRecorder();
    handler({ method: 'GET', headers: { host: 'candidate.vercel.app' } }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'AUTH_ORIGIN_INCOMPATIBLE' });
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previous;
    if (previousProxy === undefined) delete process.env.CAISSA_CLERK_PROXY_URL;
    else process.env.CAISSA_CLERK_PROXY_URL = previousProxy;
  }
});

test('public config serves the production key on a compatible same-site certification hostname', () => {
  const previous = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const previousProxy = process.env.CAISSA_CLERK_PROXY_URL;
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = liveKey;
  delete process.env.CAISSA_CLERK_PROXY_URL;
  try {
    const res = responseRecorder();
    handler({ method: 'GET', headers: { host: 's002-cert.caissa-chess.org' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.clerkPublishableKey, liveKey);
    assert.equal(res.body.clerkProxyUrl, '');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previous;
    if (previousProxy === undefined) delete process.env.CAISSA_CLERK_PROXY_URL;
    else process.env.CAISSA_CLERK_PROXY_URL = previousProxy;
  }
});

test('public config exposes only a validated same-origin proxy path', () => {
  const previous = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const previousProxy = process.env.CAISSA_CLERK_PROXY_URL;
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = liveKey;
  process.env.CAISSA_CLERK_PROXY_URL = '/__clerk';
  try {
    const res = responseRecorder();
    handler({ method: 'GET', headers: { host: 'candidate.vercel.app' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.clerkProxyUrl, '/__clerk');
    assert.equal(res.body.clerkPublishableKey, liveKey);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previous;
    if (previousProxy === undefined) delete process.env.CAISSA_CLERK_PROXY_URL;
    else process.env.CAISSA_CLERK_PROXY_URL = previousProxy;
  }
});
