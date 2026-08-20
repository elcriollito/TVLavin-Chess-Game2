import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getCheckoutBaseUrl } from '../api/checkout/session.js';

function loadRedirectValidator() {
    const window = {
        location: { hostname: 'localhost' },
        fetch: async () => ({ ok: false, status: 503 })
    };
    const context = vm.createContext({ window, fetch: window.fetch, URL, console });
    vm.runInContext(fs.readFileSync('js/auth-config.js', 'utf8'), context);
    return window.CAISSA_REDIRECTS.sanitizeInternalRedirect;
}

const sanitize = loadRedirectValidator();

for (const candidate of ['/', '/play', '/analyze', '/account', '/play/bots', '/blog?x=1', '/path#section']) {
    test(`accepts internal redirect ${candidate}`, () => assert.equal(sanitize(candidate, '/play'), candidate));
}

for (const candidate of [
    'https://evil.example', 'http://evil.example', '//evil.example', '///evil.example',
    '\\evil.example', '/\\evil.example', 'javascript:alert(1)', ' JAVASCRIPT:',
    'java%73cript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'ftp://evil.example',
    'https://www.caissa-chess.org.evil.example', 'https://www.caissa-chess.org@evil.example',
    'https:%2F%2Fevil.example', '%2F%2Fevil.example', '%252F%252Fevil.example',
    '/%5Cevil.example', '/%2Fevil.example', '/play\nhttps://evil.example', '/api/user/sync'
]) {
    test(`rejects unsafe redirect ${JSON.stringify(candidate)}`, () => assert.equal(sanitize(candidate, '/play'), '/play'));
}

async function authPageDestination(script, search, signedIn = false) {
    let mounted;
    const container = {};
    const location = { search, href: '' };
    const Clerk = {
        user: signedIn ? { id: 'synthetic_user' } : null,
        load: async () => {},
        mountSignIn: (_node, options) => { mounted = options; },
        mountSignUp: (_node, options) => { mounted = options; }
    };
    const window = {
        location,
        Clerk,
        CAISSA_AUTH_CONFIG: { CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic' },
        CAISSA_AUTH_CONFIG_READY: Promise.resolve(),
        CAISSA_REDIRECTS: { sanitizeInternalRedirect: sanitize }
    };
    const document = { readyState: 'complete', getElementById: () => container, createElement: () => ({}), head: { appendChild() {} } };
    vm.runInContext(fs.readFileSync(script, 'utf8'), vm.createContext({ window, document, URLSearchParams, Promise, console, atob }));
    await new Promise(resolve => setTimeout(resolve, 0));
    return { mounted, href: location.href };
}

test('normal sign-in falls back internally', async () => {
    assert.equal((await authPageDestination('js/signin-page.js', '')).mounted.afterSignInUrl, '/auth/complete?redirect_url=%2F');
});
test('sign-in preserves a valid internal return', async () => {
    assert.equal((await authPageDestination('js/signin-page.js', '?redirect_url=%2Faccount')).mounted.afterSignInUrl, '/auth/complete?redirect_url=%2Faccount');
});
test('sign-in rejects an external return before Clerk', async () => {
    assert.equal((await authPageDestination('js/signin-page.js', '?redirect_url=https%3A%2F%2Fevil.example')).mounted.afterSignInUrl, '/auth/complete?redirect_url=%2F');
});
test('signup preserves a valid premium return', async () => {
    assert.equal((await authPageDestination('js/signup-page.js', '?redirect_url=%2Fpremium')).mounted.afterSignUpUrl, '/auth/complete?redirect_url=%2Fpremium');
});
test('signup rejects a malicious return before Clerk', async () => {
    assert.equal((await authPageDestination('js/signup-page.js', '?redirect_url=%2F%2Fevil.example')).mounted.afterSignUpUrl, '/auth/complete?redirect_url=%2F');
});
test('already authenticated navigation uses the sanitized destination', async () => {
    assert.equal((await authPageDestination('js/signin-page.js', '?redirect_url=https%3A%2F%2Fevil.example', true)).href, '/auth/complete?redirect_url=%2F');
});

test('auth entry helpers sanitize explicit and current-page return state', () => {
    const window = {
        location: { pathname: '/account', search: '?tab=billing', hash: '#plans', href: '' },
        CAISSA_AUTH_CONFIG: { STORAGE_KEYS: {} },
        CAISSA_REDIRECTS: { sanitizeInternalRedirect: sanitize },
        addEventListener() {}, dispatchEvent() {}
    };
    const document = { readyState: 'loading', addEventListener() {}, createElement: () => ({ dataset: {} }), head: { appendChild() {} } };
    const localStorage = { getItem: () => null, setItem() {} };
    vm.runInContext(fs.readFileSync('js/caissa-auth.js', 'utf8'), vm.createContext({ window, document, localStorage, CustomEvent: class {}, Promise, console }));
    window.CAISSA_AUTH.redirectToSignIn('https://evil.example');
    assert.equal(window.location.href, '/signin?redirect_url=%2F');
    window.location.href = '';
    window.CAISSA_AUTH.redirectToSignUp('/premium');
    assert.equal(window.location.href, '/signup?redirect_url=%2Fpremium');
});

test('logout has no attacker-controlled navigation destination', () => {
    const source = fs.readFileSync('js/caissa-auth.js', 'utf8');
    assert.match(source, /async function signOut\(\)[\s\S]+await _clerkInstance\.signOut\(\)/);
    assert.doesNotMatch(source, /signOut\([^)]*(return|redirect|next)/i);
});

test('checkout defaults to the fixed production origin and ignores request headers', () => {
    const previous = process.env.CAISSA_APP_ORIGIN;
    delete process.env.CAISSA_APP_ORIGIN;
    try { assert.equal(getCheckoutBaseUrl(), 'https://www.caissa-chess.org'); }
    finally { if (previous === undefined) delete process.env.CAISSA_APP_ORIGIN; else process.env.CAISSA_APP_ORIGIN = previous; }
    const source = fs.readFileSync('api/checkout/session.js', 'utf8');
    assert.doesNotMatch(source, /x-forwarded-(host|proto)|headers\[['"]host/);
});

test('checkout accepts a controlled development origin', () => {
    const previous = process.env.CAISSA_APP_ORIGIN;
    process.env.CAISSA_APP_ORIGIN = 'http://localhost:3000';
    try { assert.equal(getCheckoutBaseUrl(), 'http://localhost:3000'); }
    finally { if (previous === undefined) delete process.env.CAISSA_APP_ORIGIN; else process.env.CAISSA_APP_ORIGIN = previous; }
});

test('checkout rejects malformed or credential-bearing configured origins', () => {
    const previous = process.env.CAISSA_APP_ORIGIN;
    try {
        for (const value of ['javascript:alert(1)', 'https://user:pass@evil.example', 'https://example.test/path']) {
            process.env.CAISSA_APP_ORIGIN = value;
            assert.throws(() => getCheckoutBaseUrl(), /Invalid CAISSA_APP_ORIGIN|Invalid URL/);
        }
    } finally { if (previous === undefined) delete process.env.CAISSA_APP_ORIGIN; else process.env.CAISSA_APP_ORIGIN = previous; }
});

test('static guards require central validation before auth redirect sinks', () => {
    for (const file of ['js/signin-page.js', 'js/signup-page.js', 'js/caissa-auth.js']) {
        const source = fs.readFileSync(file, 'utf8');
        assert.match(source, /sanitizeInternalRedirect/);
    }
    assert.doesNotMatch(fs.readFileSync('js/signin-page.js', 'utf8'), /return params\.get\(['"]redirect_url/);
    assert.doesNotMatch(fs.readFileSync('js/signup-page.js', 'utf8'), /return params\.get\(['"]redirect_url/);
});
