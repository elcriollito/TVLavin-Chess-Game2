/**
 * Exact-version Clerk UI + ClerkJS loader shared by Sign In and Sign Up.
 */
(function createClerkAuthPageLoader(global) {
    'use strict';

    const UI_VERSION = '1.30.1';
    const JS_VERSION = '6.28.1';
    const UI_INTEGRITY = 'sha384-BX9kdfAv6/55jYgfyaZcddR1/MJYO/idlamutUDyTEv0YUL56a9Wx7IHgfEnbL82';
    const JS_INTEGRITY = 'sha384-hDYzybzZL06dXvUhFHr0WXKf/sBfpbnhOwxF4xa/m4/hOYAAgZrNpO1n6eJ5np47';
    let loadPromise = null;

    function clerkDomain(publishableKey) {
        try {
            const encoded = String(publishableKey || '').replace(/^pk_(?:test|live)_/, '');
            const host = atob(encoded.replace(/-/g, '+').replace(/_/g, '/')).replace(/\$$/, '');
            if (!/^[A-Za-z0-9.-]+$/u.test(host)) throw new Error('Invalid host');
            return host;
        } catch {
            throw new Error('Invalid Clerk publishable key');
        }
    }

    function loadScript(src, attributes, assetName) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.src = src;
            script.dataset.caissaClerkAsset = assetName;
            Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
            script.onload = () => resolve();
            script.onerror = () => {
                script.remove();
                reject(new Error(`Failed to load approved Clerk ${assetName} asset`));
            };
            document.head.appendChild(script);
        });
    }

    async function loadWithFallback(sources, attributes, assetName, validate) {
        if (validate()) return;
        let lastError;
        for (const src of sources) {
            try {
                await loadScript(src, attributes, assetName);
                if (!validate()) throw new Error(`Invalid Clerk ${assetName} bundle`);
                return;
            } catch (error) {
                lastError = error;
                document.querySelectorAll(`script[data-caissa-clerk-asset="${assetName}"]`)
                    .forEach(script => script.remove());
                console.warn(`Clerk ${assetName} unavailable at ${new URL(src).origin}; trying the next approved source`);
            }
        }
        throw lastError || new Error(`No approved Clerk ${assetName} source is available`);
    }

    function load(publishableKey) {
        if (global.Clerk && typeof global.Clerk.load === 'function'
            && typeof global.__internal_ClerkUICtor === 'function') {
            return Promise.resolve(global.Clerk);
        }
        if (loadPromise) return loadPromise;

        const attempt = (async () => {
            global.process = global.process || {};
            global.process.env = global.process.env || {};
            global.process.env.CLERK_TELEMETRY_DISABLED = '1';
            const domain = clerkDomain(publishableKey);

            await loadWithFallback([
                `https://cdn.jsdelivr.net/npm/@clerk/ui@${UI_VERSION}/dist/ui.browser.js`,
                `https://${domain}/npm/@clerk/ui@${UI_VERSION}/dist/ui.browser.js`
            ], { integrity: UI_INTEGRITY }, 'ui', () => typeof global.__internal_ClerkUICtor === 'function');

            await loadWithFallback([
                `https://cdn.jsdelivr.net/npm/@clerk/clerk-js@${JS_VERSION}/dist/clerk.browser.js`,
                `https://${domain}/npm/@clerk/clerk-js@${JS_VERSION}/dist/clerk.browser.js`
            ], {
                integrity: JS_INTEGRITY,
                'data-clerk-publishable-key': publishableKey
            }, 'js', () => Boolean(global.Clerk && typeof global.Clerk.load === 'function'));
            return global.Clerk;
        })();

        loadPromise = attempt;
        attempt.catch(() => {
            if (loadPromise === attempt) loadPromise = null;
        });
        return attempt;
    }

    global.CAISSA_CLERK_PAGE_LOADER = Object.freeze({
        load,
        versions: Object.freeze({ ui: UI_VERSION, clerkJs: JS_VERSION })
    });
})(window);
