import { test, expect } from '@playwright/test';

const validKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';

async function installClerk(page) {
    await page.addInitScript(() => {
        window.__internal_ClerkUICtor = function ClerkUI() {};
        window.Clerk = {
            user: null,
            session: null,
            load: async () => {},
            mountSignUp(container, options) {
                window.__CAISSA_SIGNUP_OPTIONS__ = options;
                container.innerHTML = '<label>Email address<input aria-label="Email address"></label><button>Create account</button>';
            },
            mountSignIn(container, options) {
                window.__CAISSA_SIGNIN_OPTIONS__ = options;
                container.innerHTML = '<label>Email address<input aria-label="Email address"></label><button>Continue</button>';
            },
            addListener() { return () => {}; }
        };
    });
}

test('closed gate never mounts SignUp and keeps the page fail-closed', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: validKey, registrationOpen: false })
    }));
    await installClerk(page);
    await page.goto('/signup.html', { waitUntil: 'networkidle' });
    await expect(page.getByText('New registration is currently closed.')).toBeVisible();
    await expect(page.locator('#clerk-sign-up')).toBeHidden();
    expect(await page.evaluate(() => window.__CAISSA_SIGNUP_OPTIONS__ || null)).toBeNull();
});

test('open gate mounts exact SignUp flow and redirects through auth completion', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: validKey, registrationOpen: true })
    }));
    await installClerk(page);
    await page.goto('/signup.html?redirect_url=%2Fpuzzles', { waitUntil: 'networkidle' });
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await expect(page.getByText('New registration is currently closed.')).toBeHidden();
    expect(await page.evaluate(() => ({
        transferable: window.__CAISSA_SIGNUP_OPTIONS__.transferable,
        signInUrl: window.__CAISSA_SIGNUP_OPTIONS__.signInUrl,
        signUpRedirect: window.__CAISSA_SIGNUP_OPTIONS__.signUpForceRedirectUrl,
        signInRedirect: window.__CAISSA_SIGNUP_OPTIONS__.signInForceRedirectUrl
    }))).toEqual({
        transferable: false,
        signInUrl: '/signin',
        signUpRedirect: '/auth/complete?redirect_url=%2Fpuzzles',
        signInRedirect: '/auth/complete?redirect_url=%2Fpuzzles'
    });
});

test('open gate exposes Create account from Sign In and Home only for anonymous visitors', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: validKey, registrationOpen: true })
    }));
    await installClerk(page);

    await page.goto('/signin.html', { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
    expect(await page.evaluate(() => window.__CAISSA_SIGNIN_OPTIONS__.withSignUp)).toBe(true);

    await page.goto('/', { waitUntil: 'networkidle' });
    const topbar = page.locator('#topbar-account');
    await expect(topbar.getByRole('link', { name: 'Create account' })).toBeVisible();
    await expect(page.locator('#account-content').getByRole('link', { name: 'Create account' })).toBeVisible();
});

test('registration surfaces remain responsive without horizontal overflow', async ({ page }) => {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: validKey, registrationOpen: true })
    }));
    await installClerk(page);
    for (const width of [1440, 885, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/signup.html', { waitUntil: 'networkidle' });
        await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
});
