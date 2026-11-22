import { test, expect } from '@playwright/test';

const validKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';

test('existing-user sign-in mounts in the browser while registration stays paused', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: validKey })
    }));
    await page.addInitScript(() => {
        window.__internal_ClerkUICtor = function ClerkUI() {};
        window.Clerk = {
                user: null,
                load: async function (options) {
                    if (typeof options.ui.ClerkUI !== 'function') throw new Error('missing Clerk UI');
                    window.__CAISSA_CLERK_LOAD_OPTIONS__ = options;
                },
                mountSignIn: function (container, options) {
                    window.__CAISSA_SIGNIN_OPTIONS__ = options;
                    container.innerHTML = '<label>Email address<input aria-label="Email address"></label><label>Password<input aria-label="Password" type="password"></label><button>Continue</button>';
                }
            };
    });

    await page.goto('/signin.html?redirect_url=%2F', { waitUntil: 'networkidle' });

    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeHidden();
    await expect(page.locator('#clerk-sign-in')).not.toContainText('Authentication error');

    expect(await page.evaluate(() => ({
        withSignUp: window.__CAISSA_SIGNIN_OPTIONS__.withSignUp,
        transferable: window.__CAISSA_SIGNIN_OPTIONS__.transferable,
        signUpUrl: window.__CAISSA_SIGNIN_OPTIONS__.signUpUrl,
        forceRedirectUrl: window.__CAISSA_SIGNIN_OPTIONS__.forceRedirectUrl,
        fallbackRedirectUrl: window.__CAISSA_SIGNIN_OPTIONS__.fallbackRedirectUrl,
        loadFallback: window.__CAISSA_CLERK_LOAD_OPTIONS__.signInFallbackRedirectUrl
    }))).toEqual({
        withSignUp: false,
        transferable: false,
        signUpUrl: '/signup',
        forceRedirectUrl: '/auth/complete?redirect_url=%2F',
        fallbackRedirectUrl: '/auth/complete?redirect_url=%2F',
        loadFallback: '/auth/complete?redirect_url=%2F'
    });

    const signup = await page.request.get('/signup.html');
    expect(signup.status()).toBe(200);
    expect(await signup.text()).toMatch(/signup-page\.js|id="clerk-sign-up"[^>]*hidden/i);
});

test('beta default and an explicit safe return are both preserved without an external redirect', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            clerkPublishableKey: validKey,
            authDefaultDestination: '/online/tournaments?directory=1'
        })
    }));
    await page.addInitScript(() => {
        window.__internal_ClerkUICtor = function ClerkUI() {};
        window.Clerk = {
            user: null,
            load: async () => {},
            mountSignIn(_container, options) { window.__CAISSA_SIGNIN_OPTIONS__ = options; }
        };
    });

    await page.goto('/signin.html', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => window.__CAISSA_SIGNIN_OPTIONS__.forceRedirectUrl))
        .toBe('/auth/complete?redirect_url=%2Fonline%2Ftournaments%3Fdirectory%3D1');

    await page.goto('/signin.html?redirect_url=%2Faccount', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => window.__CAISSA_SIGNIN_OPTIONS__.forceRedirectUrl))
        .toBe('/auth/complete?redirect_url=%2Faccount');
});
