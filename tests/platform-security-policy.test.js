import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setCorsHeaders } from '../api/_lib/auth.js';

function responseHarness() {
    const headers = new Map();
    return {
        statusCode: 200,
        body: undefined,
        setHeader(name, value) { headers.set(name.toLowerCase(), value); },
        getHeader(name) { return headers.get(name.toLowerCase()); },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

function cors(method, headers = {}, methods = ['POST']) {
    const res = responseHarness();
    const allowed = setCorsHeaders({ method, headers }, res, methods);
    return { allowed, res };
}

test('server and same-origin requests without Origin receive no CORS authorization', () => {
    const { allowed, res } = cors('POST');
    assert.equal(allowed, true);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), undefined);
});

test('canonical production origin receives exact non-credentialed authorization', () => {
    const { allowed, res } = cors('POST', { origin: 'https://www.caissa-chess.org' });
    assert.equal(allowed, true);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://www.caissa-chess.org');
    assert.equal(res.getHeader('Access-Control-Allow-Credentials'), undefined);
    assert.equal(res.getHeader('Vary'), 'Origin');
});

for (const origin of ['https://evil.example', 'null', 'https://www.caissa-chess.org.evil.example', 'https://api.caissa-chess.org']) {
    test(`rejects untrusted origin ${origin}`, () => {
        const { allowed, res } = cors('POST', { origin });
        assert.equal(allowed, false);
        assert.equal(res.statusCode, 403);
        assert.deepEqual(res.body, { error: 'Request rejected' });
        assert.equal(res.getHeader('Access-Control-Allow-Origin'), undefined);
    });
}

test('server-controlled development origin is compared exactly', () => {
    const previous = process.env.CAISSA_BROWSER_ORIGINS;
    process.env.CAISSA_BROWSER_ORIGINS = 'http://127.0.0.1:8000';
    try {
        assert.equal(cors('POST', { origin: 'http://127.0.0.1:8000' }).allowed, true);
        assert.equal(cors('POST', { origin: 'http://127.0.0.1:8000.evil.example' }).allowed, false);
    } finally {
        if (previous === undefined) delete process.env.CAISSA_BROWSER_ORIGINS;
        else process.env.CAISSA_BROWSER_ORIGINS = previous;
    }
});

test('allowed preflight advertises only route methods and required headers', () => {
    const { allowed, res } = cors('OPTIONS', {
        origin: 'https://www.caissa-chess.org',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type'
    });
    assert.equal(allowed, true);
    assert.equal(res.getHeader('Access-Control-Allow-Methods'), 'POST, OPTIONS');
    assert.equal(res.getHeader('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
});

test('preflight rejects forbidden methods', () => {
    const { allowed, res } = cors('OPTIONS', {
        origin: 'https://www.caissa-chess.org',
        'access-control-request-method': 'DELETE'
    });
    assert.equal(allowed, false);
    assert.equal(res.statusCode, 403);
});

test('preflight rejects unexpected headers', () => {
    const { allowed, res } = cors('OPTIONS', {
        origin: 'https://www.caissa-chess.org',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-internal-secret'
    });
    assert.equal(allowed, false);
    assert.equal(res.statusCode, 403);
});

test('global headers establish the platform browser-security baseline', () => {
    const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const global = config.headers.find(entry => entry.source === '/(.*)');
    assert.ok(global);
    const headers = Object.fromEntries(global.headers.map(({ key, value }) => [key, value]));
    const csp = headers['Content-Security-Policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /worker-src 'self'/);
    assert.doesNotMatch(csp, /'unsafe-eval'/);
    assert.doesNotMatch(csp, /worker-src[^;]*blob:/);
    assert.doesNotMatch(csp, /(?:script|connect|frame)-src[^;]*\s\*(?:\s|;|$)/);
    assert.doesNotMatch(csp, /evil\.example/);
    assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
    assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-site');
    assert.equal(headers['Cross-Origin-Embedder-Policy'], undefined);
    assert.match(headers['Permissions-Policy'], /camera=\(\)/);
});

test('Play retains its stricter route-scoped CSP', () => {
    const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    for (const source of ['/play', '/play/:path*']) {
        const route = config.headers.find(entry => entry.source === source);
        const csp = route.headers.find(header => header.key === 'Content-Security-Policy').value;
        assert.match(csp, /script-src 'self'/);
        assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
        assert.match(csp, /worker-src 'self'/);
        assert.match(csp, /connect-src 'self'/);
        assert.match(csp, /frame-ancestors 'none'/);
    }
});

test('API policy has no wildcard CORS and keeps webhook server-to-server', () => {
    const apiFiles = fs.readdirSync('api', { recursive: true })
        .filter(name => String(name).endsWith('.js'))
        .map(name => `api/${String(name).replaceAll('\\', '/')}`);
    const apiSource = apiFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(apiSource, /Access-Control-Allow-Origin['"],\s*['"]\*['"]/);
    assert.doesNotMatch(fs.readFileSync('api/stripe/webhook.js', 'utf8'), /setCorsHeaders|Access-Control-Allow-Origin/);
    assert.match(fs.readFileSync('api/mentor/chat.js', 'utf8'), /setCorsHeaders\(req, res, \['POST'\]\)/);
    assert.match(fs.readFileSync('api/user/identity-migration/challenge.js', 'utf8'), /setCorsHeaders\(req, res, \['POST'\]\)/);
    assert.match(fs.readFileSync('api/user/identity-migration/activate.js', 'utf8'), /setCorsHeaders\(req, res, \['POST'\]\)/);
});

test('each CORS route advertises the method enforced by its handler', () => {
    const routes = [
        'api/wallet.js', 'api/polyglot/build.js', 'api/credits/consume.js',
        'api/checkout/session.js', 'api/credits/add.js', 'api/library/push.js',
        'api/library/delete.js', 'api/library/pull.js', 'api/user/sync.js',
        'api/mentor/chat.js', 'api/user/identity-migration/challenge.js',
        'api/user/identity-migration/activate.js'
    ];
    for (const route of routes) {
        const source = fs.readFileSync(route, 'utf8');
        const corsMethod = source.match(/setCorsHeaders\(req, res, \['([A-Z]+)'\]\)/)?.[1];
        const enforcedMethod = source.match(/req\.method !== '([A-Z]+)'/)?.[1]
            || (source.includes('prepareSensitiveJsonRoute') ? 'POST' : undefined);
        assert.equal(corsMethod, enforcedMethod, route);
    }
});
