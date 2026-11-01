import { test, expect } from '@playwright/test';

const validKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';

test('shared loader recovers in a real browser after both ClerkJS sources fail once', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: validKey })
    }));
    await page.addInitScript(() => {
        const originalAppendChild = Node.prototype.appendChild;
        let jsFailuresRemaining = 2;
        window.__CAISSA_CLERK_ATTEMPTS__ = [];
        window.__CAISSA_CLERK_LISTENERS__ = 0;
        Node.prototype.appendChild = function appendChild(node) {
            if (node?.tagName === 'SCRIPT' && node.src.includes('/@clerk/')) {
                window.__CAISSA_CLERK_ATTEMPTS__.push({
                    src: node.src,
                    integrity: node.integrity,
                    crossOrigin: node.crossOrigin
                });
                queueMicrotask(() => {
                    if (node.src.includes('/@clerk/ui@')) {
                        window.__internal_ClerkUICtor = function ClerkUI() {};
                        node.onload();
                    } else if (jsFailuresRemaining > 0) {
                        jsFailuresRemaining -= 1;
                        node.onerror();
                    } else {
                        window.Clerk = {
                            user: {
                                id: 'browser-existing-user',
                                fullName: 'Browser Existing User',
                                primaryEmailAddress: { emailAddress: 'browser@example.invalid' }
                            },
                            session: { id: 'browser-existing-session' },
                            async load() {},
                            addListener() { window.__CAISSA_CLERK_LISTENERS__ += 1; }
                        };
                        node.onload();
                    }
                });
                return node;
            }
            return originalAppendChild.call(this, node);
        };
    });

    await page.goto('/home.html', { waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toBe('unavailable');

    await page.evaluate(() => window.CAISSA_AUTH.init());
    await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toBe('authenticated');

    const evidence = await page.evaluate(() => ({
        attempts: window.__CAISSA_CLERK_ATTEMPTS__,
        listeners: window.__CAISSA_CLERK_LISTENERS__,
        isSignedIn: window.CAISSA_AUTH.isSignedIn,
        userId: window.CAISSA_AUTH.userId
    }));
    expect(evidence.attempts.map(item => item.src)).toEqual([
        'https://cdn.jsdelivr.net/npm/@clerk/ui@1.30.1/dist/ui.browser.js',
        'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js',
        'https://synthetic.clerk.accounts.dev/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js',
        'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js'
    ]);
    expect(evidence.attempts.every(item => /^sha384-/.test(item.integrity))).toBe(true);
    expect(evidence.attempts.every(item => item.crossOrigin === 'anonymous')).toBe(true);
    expect(evidence.listeners).toBe(1);
    expect(evidence.isSignedIn).toBe(true);
    expect(evidence.userId).toBe('browser-existing-user');
});
