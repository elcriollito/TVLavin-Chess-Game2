import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isValidClerkPublishableKey } from '../api/public-auth-config.js';

const source = fs.readFileSync('js/caissa-auth.js', 'utf8');
const validKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';
const uiCdn = 'https://cdn.jsdelivr.net/npm/@clerk/ui@1.30.1/dist/ui.browser.js';
const uiFallback = 'https://synthetic.clerk.accounts.dev/npm/@clerk/ui@1.30.1/dist/ui.browser.js';
const jsCdn = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';
const jsFallback = 'https://synthetic.clerk.accounts.dev/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';
const uiIntegrity = 'sha384-BX9kdfAv6/55jYgfyaZcddR1/MJYO/idlamutUDyTEv0YUL56a9Wx7IHgfEnbL82';
const jsIntegrity = 'sha384-hDYzybzZL06dXvUhFHr0WXKf/sBfpbnhOwxF4xa/m4/hOYAAgZrNpO1n6eJ5np47';

function createHarness({ appendScript, setTimeout }) {
    const attempts = [];
    let loadCalls = 0;
    let listenerCalls = 0;
    const user = {
        id: 'synthetic-user',
        fullName: 'Synthetic Existing User',
        firstName: 'Synthetic',
        imageUrl: null,
        primaryEmailAddress: { emailAddress: 'synthetic@example.invalid' }
    };
    const Clerk = {
        user,
        session: { id: 'synthetic-session' },
        async load() { loadCalls += 1; },
        addListener() { listenerCalls += 1; }
    };
    const window = {
        CAISSA_AUTH_CONFIG: {
            CLERK_PUBLISHABLE_KEY: validKey,
            DEFAULT_FREE_CREDITS: 5,
            STORAGE_KEYS: { USER_PROFILE: 'profiles', AUTH_STATE: 'state' }
        },
        CAISSA_AUTH_CONFIG_UTILS: { isValidClerkPublishableKey },
        CAISSA_AUTH_CONFIG_READY: Promise.resolve(),
        CAISSA_REDIRECTS: { sanitizeInternalRedirect: value => value || '/' },
        location: { pathname: '/', search: '', hash: '', href: '' },
        dispatchEvent() {},
        atob: value => Buffer.from(value, 'base64').toString('utf8')
    };
    if (setTimeout) window.setTimeout = setTimeout;
    const document = {
        readyState: 'complete',
        documentElement: { hasAttribute: name => name === 'data-caissa-clerk-ui' },
        createElement: () => ({
            dataset: {},
            remove() { this.removed = true; }
        }),
        head: {
            appendChild(script) {
                attempts.push({
                    src: script.src,
                    integrity: script.integrity,
                    crossOrigin: script.crossOrigin,
                    referrerPolicy: script.referrerPolicy,
                    publishableKey: script.dataset.clerkPublishableKey || null,
                    script
                });
                appendScript({ script, window, Clerk, attempts });
            }
        }
    };
    const storage = new Map();
    const localStorage = {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value)
    };
    vm.runInContext(source, vm.createContext({
        window,
        document,
        localStorage,
        CustomEvent: class CustomEvent {},
        Promise,
        console,
        queueMicrotask
    }));
    return {
        window,
        attempts,
        counts: () => ({ loadCalls, listenerCalls })
    };
}

test('shared loader pins reviewed versions and SRI on both approved sources', async () => {
    const run = createHarness({
        appendScript({ script, window, Clerk }) {
            queueMicrotask(() => {
                if (script.src === uiCdn || script.src === jsCdn) {
                    script.onerror();
                } else if (script.src === uiFallback) {
                    window.__internal_ClerkUICtor = function ClerkUI() {};
                    script.onload();
                } else if (script.src === jsFallback) {
                    window.Clerk = Clerk;
                    script.onload();
                }
            });
        }
    });

    await run.window.CAISSA_AUTH.init();

    assert.deepEqual(run.attempts.map(item => item.src), [uiCdn, uiFallback, jsCdn, jsFallback]);
    assert.deepEqual(run.attempts.map(item => item.integrity), [uiIntegrity, uiIntegrity, jsIntegrity, jsIntegrity]);
    assert.ok(run.attempts.every(item => item.crossOrigin === 'anonymous'));
    assert.ok(run.attempts.every(item => item.referrerPolicy === 'no-referrer'));
    assert.equal(run.attempts[2].publishableKey, validKey);
    assert.equal(run.attempts[3].publishableKey, validKey);
    assert.equal(run.window.CAISSA_AUTH.status, 'authenticated');
    assert.equal(run.window.CAISSA_AUTH.userId, 'synthetic-user');
    assert.deepEqual(run.counts(), { loadCalls: 1, listenerCalls: 1 });
});

test('a rejected ClerkJS attempt is not cached and a later init preserves the session', async () => {
    let jsFailuresRemaining = 2;
    const run = createHarness({
        appendScript({ script, window, Clerk }) {
            queueMicrotask(() => {
                if (script.src === uiCdn) {
                    window.__internal_ClerkUICtor = function ClerkUI() {};
                    script.onload();
                } else if ((script.src === jsCdn || script.src === jsFallback) && jsFailuresRemaining > 0) {
                    jsFailuresRemaining -= 1;
                    script.onerror();
                } else if (script.src === jsCdn) {
                    window.Clerk = Clerk;
                    script.onload();
                }
            });
        }
    });

    await run.window.CAISSA_AUTH.init();
    assert.equal(run.window.CAISSA_AUTH.status, 'unavailable');
    assert.equal(run.counts().loadCalls, 0);

    await run.window.CAISSA_AUTH.init();
    assert.equal(run.window.CAISSA_AUTH.status, 'authenticated');
    assert.equal(run.window.CAISSA_AUTH.userId, 'synthetic-user');
    assert.deepEqual(run.attempts.map(item => item.src), [uiCdn, jsCdn, jsFallback, jsCdn]);
    assert.equal(run.attempts.filter(item => item.script.removed).length, 2);
    assert.deepEqual(run.counts(), { loadCalls: 1, listenerCalls: 1 });
});

test('concurrent init calls share one SDK initialization and one session listener', async () => {
    const run = createHarness({
        appendScript({ script, window, Clerk }) {
            queueMicrotask(() => {
                if (script.src === uiCdn) window.__internal_ClerkUICtor = function ClerkUI() {};
                if (script.src === jsCdn) window.Clerk = Clerk;
                script.onload();
            });
        }
    });

    await Promise.all([
        run.window.CAISSA_AUTH.init(),
        run.window.CAISSA_AUTH.init(),
        run.window.CAISSA_AUTH.init()
    ]);

    assert.deepEqual(run.attempts.map(item => item.src), [uiCdn, jsCdn]);
    assert.deepEqual(run.counts(), { loadCalls: 1, listenerCalls: 1 });
    assert.equal(run.window.CAISSA_AUTH.status, 'authenticated');
});

test('one bounded automatic retry recovers a clean page without consumer intervention', async () => {
    let scheduled;
    let jsFailuresRemaining = 2;
    const run = createHarness({
        setTimeout(callback, delay) { scheduled = { callback, delay }; },
        appendScript({ script, window, Clerk }) {
            queueMicrotask(() => {
                if (script.src === uiCdn) {
                    window.__internal_ClerkUICtor = function ClerkUI() {};
                    script.onload();
                } else if (jsFailuresRemaining > 0) {
                    jsFailuresRemaining -= 1;
                    script.onerror();
                } else {
                    window.Clerk = Clerk;
                    script.onload();
                }
            });
        }
    });

    await run.window.CAISSA_AUTH.init();
    assert.equal(run.window.CAISSA_AUTH.status, 'unavailable');
    assert.equal(scheduled.delay, 1_000);

    scheduled.callback();
    await run.window.CAISSA_AUTH.init();

    assert.equal(run.window.CAISSA_AUTH.status, 'authenticated');
    assert.deepEqual(run.counts(), { loadCalls: 1, listenerCalls: 1 });
});
