import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicConfig = (overrides = {}) => ({
    clerkPublishableKey: 'pk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA',
    registrationTracking: false,
    identityOwnerHandoff: null,
    accountSystem: { mode: 'clean_start', registrationOpen: true, resetNotice: false },
    ...overrides
});

async function routeConfig(context, value) {
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(value)
    }));
}

async function installSignedInFixture(context, state) {
    await routeConfig(context, publicConfig());
    await context.route('**/js/caissa-auth.js*', route => route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'synthetic-clean-start',getToken:async()=> 'synthetic-token',signOut:async()=>{window.__signedOut=true;}};`
    }));
    await context.route('**/api/user/sync', route => {
        state.syncCalls += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await context.route('**/api/user/public-identity', route => {
        const method = route.request().method();
        if (method === 'GET') return route.fulfill({ json: { identity: state.identity } });
        const body = route.request().postDataJSON();
        if (method === 'POST') {
            state.availabilityCalls.push(body);
            return route.fulfill({ json: { available: body.nickname !== 'AlreadyTaken' } });
        }
        state.updateCalls.push(body);
        state.identity = {
            ...state.identity,
            displayName: body.nickname,
            nickname: body.nickname,
            hasCustomNickname: true,
            version: state.identity.version + 1
        };
        return route.fulfill({ json: { identity: state.identity } });
    });
}

test('maintenance blocks sign-up and sign-in before any Clerk SDK request', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await routeConfig(context, publicConfig({
        accountSystem: { mode: 'maintenance', registrationOpen: false, resetNotice: false }
    }));
    const clerkRequests = [];
    context.on('request', request => {
        if (/clerk/i.test(new URL(request.url()).hostname)) clerkRequests.push(request.url());
    });
    const page = await context.newPage();
    await page.goto('/signup.html');
    await expect(page.getByText('Account registration is temporarily paused')).toBeVisible();
    await page.goto('/signin.html');
    await expect(page.getByText('Account access is temporarily paused')).toBeVisible();
    expect(clerkRequests).toEqual([]);
    await context.close();
});

test('the post-reset notice is server-gated, localized, accessible, and responsive', async ({ browser }) => {
    for (const fixture of [
        { locale: 'en', title: 'Important CAISSA Chess Update', action: 'Create a new account' },
        { locale: 'es', title: 'Aviso importante de CAISSA Chess', action: 'Crear cuenta nueva' }
    ]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: fixture.locale });
        await context.addInitScript(locale => localStorage.setItem('caissa.locale', locale), fixture.locale);
        await routeConfig(context, publicConfig({
            accountSystem: { mode: 'clean_start', registrationOpen: true, resetNotice: true }
        }));
        await context.route('**/js/caissa-auth.js*', route => route.fulfill({
            status: 200, contentType: 'application/javascript', body: ''
        }));
        await context.route('**/js/signin-page.js*', route => route.fulfill({
            status: 200, contentType: 'application/javascript', body: ''
        }));
        const page = await context.newPage();
        await page.goto('/signin.html');
        const notice = page.locator('.caissa-account-reset-notice');
        await expect(notice.getByText(fixture.title)).toBeVisible();
        await expect(notice.getByRole('link', { name: fixture.action })).toHaveAttribute('href', '/signup');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const serious = (await new AxeBuilder({ page }).include('.caissa-account-reset-notice').analyze())
            .violations.filter(item => ['critical', 'serious'].includes(item.impact));
        expect(serious).toEqual([]);
        if (fixture.locale === 'es' && test.info().project.name === 'chromium') {
            await page.screenshot({ path: 'test-results/clean-start/reset-notice-mobile-es.png', fullPage: true });
        }
        await context.close();
    }
});

test('fresh registration saves a unique public nickname without exposing private identity', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const state = {
        syncCalls: 0,
        availabilityCalls: [],
        updateCalls: [],
        identity: {
            displayName: 'Player-ABCDEF0123456789',
            nickname: null,
            fallbackAlias: 'Player-ABCDEF0123456789',
            hasCustomNickname: false,
            version: 1
        }
    };
    await installSignedInFixture(context, state);
    const page = await context.newPage();
    await page.goto('/auth-complete.html?redirect_url=%2Fpuzzles');
    await expect(page.getByRole('heading', { name: 'How should other players see you?' })).toBeVisible();
    const input = page.getByLabel('Choose your chess name');
    await expect(input).toBeFocused();
    await expect(page.locator('body')).not.toContainText('private@example.test');
    await input.fill('AlreadyTaken');
    await page.getByRole('button', { name: 'Continue to CAISSA' }).click();
    await expect(page.getByText('That nickname is unavailable.')).toBeVisible();
    expect(state.updateCalls).toHaveLength(0);
    await input.fill('elcriollito');
    await page.getByRole('button', { name: 'Continue to CAISSA' }).click();
    await expect(page).toHaveURL(/\/puzzles$/);
    expect(state.syncCalls).toBe(1);
    expect(state.availabilityCalls).toEqual([
        { action: 'availability', nickname: 'AlreadyTaken' },
        { action: 'availability', nickname: 'elcriollito' }
    ]);
    expect(state.updateCalls).toEqual([{ nickname: 'elcriollito', expectedVersion: 1 }]);
    await context.close();
});

test('mobile registration may keep the safe alias and choose a nickname later', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const state = {
        syncCalls: 0,
        availabilityCalls: [],
        updateCalls: [],
        identity: {
            displayName: 'Player-0123456789ABCDEF',
            nickname: null,
            fallbackAlias: 'Player-0123456789ABCDEF',
            hasCustomNickname: false,
            version: 1
        }
    };
    await installSignedInFixture(context, state);
    const page = await context.newPage();
    await page.goto('/auth-complete.html?redirect_url=%2Fpuzzles');
    await expect(page.getByRole('button', { name: 'Choose later' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (test.info().project.name === 'chromium') {
        await page.screenshot({ path: 'test-results/clean-start/nickname-mobile-390x844.png', fullPage: true });
    }
    await page.getByRole('button', { name: 'Choose later' }).click();
    await expect(page).toHaveURL(/\/puzzles$/);
    expect(state.updateCalls).toHaveLength(0);
    await context.close();
});
