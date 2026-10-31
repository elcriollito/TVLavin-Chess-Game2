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
    await expect(page.getByText('New sign-ups are paused during maintenance.')).toBeVisible();
    await expect(page.locator('#clerk-sign-in')).not.toContainText('Authentication error');

    expect(await page.evaluate(() => ({
        withSignUp: window.__CAISSA_SIGNIN_OPTIONS__.withSignUp,
        transferable: window.__CAISSA_SIGNIN_OPTIONS__.transferable,
        signUpUrl: window.__CAISSA_SIGNIN_OPTIONS__.signUpUrl
    }))).toEqual({ withSignUp: false, transferable: false, signUpUrl: '/signup' });

    const signup = await page.request.get('/signup.html');
    expect(signup.status()).toBe(200);
    expect(await signup.text()).not.toMatch(/mountSignUp|signup-page\.js|id="clerk-sign-up"/i);
});
