import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('js/signin-page.js', 'utf8');
const validKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';
const uiCdn = 'https://cdn.jsdelivr.net/npm/@clerk/ui@1.30.1/dist/ui.browser.js';
const uiFallback = 'https://synthetic.clerk.accounts.dev/npm/@clerk/ui@1.30.1/dist/ui.browser.js';
const clerkCdn = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';

function bootstrapWithFirstUiSourceUnavailable() {
    const attempts = [];
    const container = { innerHTML: '' };
    let loadOptions;
    let mountOptions;

    const Clerk = {
        user: null,
        async load(options) { loadOptions = options; },
        mountSignIn(_container, options) { mountOptions = options; }
    };

    const window = {
        location: { search: '', href: '', origin: 'https://www.caissa-chess.org', pathname: '/signin' },
        CAISSA_AUTH_CONFIG: { CLERK_PUBLISHABLE_KEY: validKey, IDENTITY_OWNER_HANDOFF: null },
        CAISSA_AUTH_CONFIG_READY: Promise.resolve(),
        CAISSA_REDIRECTS: { sanitizeInternalRedirect: () => '/' }
    };

    const document = {
        readyState: 'complete',
        getElementById: id => id === 'clerk-sign-in' ? container : null,
        createElement: () => ({
            async: false,
            crossOrigin: '',
            attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; }
        }),
        head: {
            appendChild(script) {
                attempts.push({ src: script.src, attributes: { ...script.attributes }, crossOrigin: script.crossOrigin });
                queueMicrotask(() => {
                    if (script.src === uiCdn) {
                        script.onerror();
                    } else if (script.src === uiFallback) {
                        window.__internal_ClerkUICtor = function ClerkUI() {};
                        script.onload();
                    } else if (script.src === clerkCdn) {
                        window.Clerk = Clerk;
                        script.onload();
                    } else {
                        script.onerror();
                    }
                });
            }
        }
    };

    vm.runInContext(source, vm.createContext({
        window,
        document,
        URL,
        URLSearchParams,
        Promise,
        console,
        queueMicrotask,
        atob: value => Buffer.from(value, 'base64').toString('utf8')
    }));

    return {
        attempts,
        result: () => ({ container, loadOptions, mountOptions })
    };
}

test('sign-in pins reviewed Clerk UI and ClerkJS versions without runtime ranges', () => {
    assert.match(source, /@clerk\/ui@\$\{CLERK_UI_VERSION\}/);
    assert.match(source, /@clerk\/clerk-js@\$\{CLERK_JS_VERSION\}/);
    assert.doesNotMatch(source, /@clerk\/clerk-js@6\/dist|@clerk\/ui@1\/dist|@latest|@next/);
    assert.match(source, /CLERK_UI_INTEGRITY = 'sha384-/);
    assert.match(source, /CLERK_JS_INTEGRITY = 'sha384-/);
});

test('sign-in falls back to the exact custom-domain asset after a CDN load failure', async () => {
    const run = bootstrapWithFirstUiSourceUnavailable();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(run.attempts.map(item => item.src), [uiCdn, uiFallback, clerkCdn]);
    assert.ok(run.attempts.every(item => item.crossOrigin === 'anonymous'));
    assert.match(run.attempts[0].attributes.integrity, /^sha384-/);
    assert.match(run.attempts[2].attributes.integrity, /^sha384-/);
    assert.equal(run.attempts[2].attributes['data-clerk-publishable-key'], validKey);

    const { container, loadOptions, mountOptions } = run.result();
    assert.equal(typeof loadOptions.ui.ClerkUI, 'function');
    assert.equal(mountOptions.withSignUp, false);
    assert.equal(mountOptions.transferable, false);
    assert.equal(mountOptions.signUpUrl, '/signup');
    assert.doesNotMatch(container.innerHTML, /Authentication error/);
});
