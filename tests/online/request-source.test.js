import assert from 'node:assert/strict';
import test from 'node:test';
import { trustedOnlineSourceKey } from '../../api/_lib/online-request-source.js';

test('Vercel trusted IPv4 and IPv6 sources become bounded pseudonymous keys', () => {
    const env = { VERCEL: '1' };
    const first = trustedOnlineSourceKey({ headers: { 'x-vercel-forwarded-for': '198.51.100.20' } }, env);
    const again = trustedOnlineSourceKey({ headers: { 'x-vercel-forwarded-for': '198.51.100.20' } }, env);
    const ipv6 = trustedOnlineSourceKey({ headers: { 'x-vercel-forwarded-for': '2001:db8::1' } }, env);
    assert.match(first, /^online-source:[0-9a-f]{64}$/);
    assert.equal(first.length, 78);
    assert.equal(first, again);
    assert.notEqual(first, ipv6);
});

test('untrusted, ambiguous, and malformed sources fail closed', () => {
    const invalid = [
        [{ headers: { 'x-vercel-forwarded-for': '198.51.100.20' } }, {}],
        [{ headers: { 'x-forwarded-for': '198.51.100.20' } }, { VERCEL: '1' }],
        [{ headers: { 'x-vercel-forwarded-for': '198.51.100.20, 203.0.113.4' } }, { VERCEL: '1' }],
        [{ headers: { 'x-vercel-forwarded-for': ' 198.51.100.20' } }, { VERCEL: '1' }],
        [{ headers: { 'x-vercel-forwarded-for': ['198.51.100.20'] } }, { VERCEL: '1' }],
        [{ headers: { 'x-vercel-forwarded-for': 'client.example.test' } }, { VERCEL: '1' }]
    ];
    for (const [req, env] of invalid) assert.equal(trustedOnlineSourceKey(req, env), '');
});
