import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const output = name => `test-results/account-control/${name}.png`;

async function installFixture(context, {
    reauthentication = false, review = false, rejectFreshToken = false, dropFreshToken = false
} = {}) {
    const calls = [];
    await context.addInitScript(() => Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
        configurable: true, get: () => '', set: () => {}
    }));
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: 'pk_test_account_control_fixture', registrationTracking: true })
    }));
    await context.route('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js', route => route.fulfill({
        status: 200, contentType: 'text/javascript',
        body: `window.__accountReauthCalls=[];
        window.Clerk={user:{id:'synthetic-owner',fullName:'Private Synthetic Name',firstName:'Private',imageUrl:null,primaryEmailAddress:{emailAddress:'private.synthetic@example.test'}},session:{
          id:'synthetic-session',
          getToken:async(options)=>{window.__accountReauthCalls.push(['token',options||null]);return options?.skipCache?${dropFreshToken ? 'null' : "'fresh-fixture-token'"}:'fixture-token'},
          startVerification:async(options)=>{window.__accountReauthCalls.push(['start',options]);return {
            status:'needs_first_factor',
            supportedFirstFactors:[{strategy:'email_code',emailAddressId:'email_fixture',safeIdentifier:'p***@example.test',primary:true}],
            prepareFirstFactorVerification:async function(options){window.__accountReauthCalls.push(['prepare',options]);return this},
            attemptFirstFactorVerification:async function(options){window.__accountReauthCalls.push(['attempt',options]);return {status:'complete'}}
          }}
        },load:async()=>{},addListener:()=>{},signOut:async()=>{}};`
    }));
    for (const path of ['**/api/user/sync', '**/api/wallet']) {
        await context.route(path, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    }
    await context.route('**/api/beta/access', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
    await context.route('**/api/user/public-identity', route => route.fulfill({ json: { identity: {
        displayName: 'SafeKnight', nickname: 'SafeKnight', fallbackAlias: 'Player-1122334455667788',
        hasCustomNickname: true, policyVersion: 1, version: 1, updatedAt: '2026-10-18T00:00:00Z'
    } } }));
    await context.route('**/api/account/privacy/summary', route => {
        const fresh = route.request().headers().authorization === 'Bearer fresh-fixture-token';
        return route.fulfill({ json: {
        backendReady: true,
        requiresReauthentication: reauthentication && (!fresh || rejectFreshToken),
        summary: {
            ownership: review ? 'REVIEW_REQUIRED' : 'VERIFIED', accountState: 'ACTIVE',
            counts: { onlineGames: 4, puzzleProgress: 1, puzzleAttempts: 27, activeEntitlements: review ? 1 : 0 },
            capabilities: { export: !review, progressReset: !review, accountDeletion: !review },
            manualReviewRequired: review
        }
    } });
    });
    await context.route('**/api/account/progress-reset/prepare', async route => {
        calls.push({ type: 'prepare', body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
        await route.fulfill({ json: {
            operationId: '30000000-0000-4000-8000-000000000001',
            confirmationToken: 'a'.repeat(43), status: 'PREPARED'
        } });
    });
    await context.route('**/api/account/progress-reset/confirm', async route => {
        calls.push({ type: 'confirm', body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
        await route.fulfill({ json: { status: 'COMPLETED', result: { puzzleAttemptsDeleted: 27 } } });
    });
    await context.route('**/api/account/privacy/export', route => route.fulfill({ json: { schemaVersion: 'caissa.account-export.v1' } }));
    return calls;
}

async function openAccount(page) {
    await page.goto('/endgame-trainer', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toBe('authenticated');
    await page.evaluate(() => window.CaissaUIAuth._openAccountDialog(document.activeElement));
    await expect(page.locator('.caissa-public-identity-dialog')).toBeVisible();
    await expect(page.locator('[data-account-control-status]')).not.toContainText('Checking');
}

test('Data & Privacy exposes only backend-certified controls and performs a double-confirmed reset', async ({ browser, browserName }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const calls = await installFixture(context);
    const page = await context.newPage();
    await openAccount(page);
    await expect(page.getByRole('heading', { name: 'Control your CAISSA account' })).toBeVisible();
    await expect(page.locator('[data-account-games]')).toHaveText('4');
    await expect(page.locator('[data-account-training]')).toHaveText('28');
    await page.locator('[data-account-reset-start]').click();
    const confirm = page.locator('[data-account-reset-confirm]');
    await expect(confirm).toBeVisible();
    await confirm.locator('input').fill('RESET');
    await confirm.getByRole('button', { name: 'Confirm reset' }).click();
    await expect(page.locator('[data-account-control-status]')).toContainText('Training progress reset');
    expect(calls.map(item => item.type)).toEqual(['prepare', 'confirm']);
    expect(calls.some(item => JSON.stringify(item).includes('userId'))).toBe(false);

    const serious = (await new AxeBuilder({ page }).include('.caissa-public-identity-dialog').analyze())
        .violations.filter(item => ['critical', 'serious'].includes(item.impact));
    expect(serious).toEqual([]);
    if (browserName === 'chromium') {
        await page.locator('[data-privacy-section], .data-privacy-section').first().scrollIntoViewIfNeeded();
        await page.locator('.caissa-public-identity-dialog').screenshot({ path: output('desktop-1440x900') });
    }
    await context.close();
});

test('stale authentication and ownership review fail closed without functional destructive buttons', async ({ browser }) => {
    const stale = await browser.newContext({ viewport: { width: 1152, height: 720 } });
    await installFixture(stale, { reauthentication: true });
    const stalePage = await stale.newPage();
    await openAccount(stalePage);
    await expect(stalePage.locator('[data-account-reauth]')).toBeVisible();
    await expect(stalePage.locator('[data-account-controls]')).toBeHidden();
    await stale.close();

    const review = await browser.newContext({ viewport: { width: 1152, height: 720 } });
    await installFixture(review, { review: true });
    const reviewPage = await review.newPage();
    await openAccount(reviewPage);
    await expect(reviewPage.locator('[data-account-delete-review]')).toBeVisible();
    await expect(reviewPage.locator('[data-account-delete-start]')).toBeDisabled();
    await expect(reviewPage.locator('[data-account-reset-start]')).toBeDisabled();
    await review.close();
});

test('stale authentication completes Clerk first-factor step-up before backend unlocks controls', async ({ browser, browserName }) => {
    const context = await browser.newContext({ viewport: { width: 1152, height: 720 } });
    const accountCalls = await installFixture(context, { reauthentication: true });
    const page = await context.newPage();
    await openAccount(page);
    await expect(page.locator('[data-account-controls]')).toBeHidden();
    await page.locator('[data-account-reverify]').click();
    await expect(page.locator('[data-account-reverify-form]')).toBeVisible();
    await expect(page.locator('[data-account-reverify-instructions]')).toContainText('p***@example.test');
    await page.locator('[data-account-reverify-input]').fill('123456');
    await page.locator('[data-account-reverify-submit]').click();
    await expect(page.locator('[data-account-controls]')).toBeVisible();
    await expect(page.locator('[data-account-reauth]')).toBeHidden();
    await expect(page.locator('[data-account-control-status]')).toContainText('Identity verified');
    const calls = await page.evaluate(() => window.__accountReauthCalls);
    expect(calls.slice(-4).map(call => call[0])).toEqual(['start', 'prepare', 'attempt', 'token']);
    expect(calls.at(-1)[1]).toEqual({ skipCache: true });
    await page.locator('[data-account-reset-start]').click();
    await page.locator('[data-account-reset-confirm] input').fill('RESET');
    await page.locator('[data-account-reset-confirm]').getByRole('button', { name: 'Confirm reset' }).click();
    await expect(page.locator('[data-account-control-status]')).toContainText('Training progress reset');
    expect(accountCalls.map(call => call.authorization)).toEqual([
        'Bearer fresh-fixture-token', 'Bearer fresh-fixture-token'
    ]);
    if (browserName === 'chromium') {
        await page.locator('[data-privacy-section], .data-privacy-section').first().scrollIntoViewIfNeeded();
        await page.locator('.caissa-public-identity-dialog').screenshot({ path: output('reauthenticated-1152x720') });
    }
    await context.close();
});

test('fresh Clerk token without backend fva confirmation stays locked and cancel stays safe', async ({ browser, browserName }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installFixture(context, { reauthentication: true, rejectFreshToken: true });
    const page = await context.newPage();
    await openAccount(page);
    await page.locator('[data-account-reverify]').click();
    await page.locator('[data-account-reverify-input]').fill('123456');
    await page.locator('[data-account-reverify-submit]').click();
    await expect(page.locator('[data-account-controls]')).toBeHidden();
    await expect(page.locator('[data-account-control-status]')).toContainText('did not confirm');
    await expect(page.locator('[data-account-reverify-form]')).toBeHidden();
    await page.locator('[data-account-reverify]').click();
    await expect(page.locator('[data-account-reverify-form]')).toBeVisible();
    const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: document.querySelector('.caissa-public-identity-dialog').scrollWidth
            - document.querySelector('.caissa-public-identity-dialog').clientWidth
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.dialog).toBeLessThanOrEqual(0);
    if (browserName === 'chromium') {
        await page.locator('[data-account-reauth]').scrollIntoViewIfNeeded();
        await page.locator('.caissa-public-identity-dialog').screenshot({ path: output('reauth-mobile-390x844') });
    }
    await page.locator('[data-account-reverify-cancel]').click();
    await expect(page.locator('[data-account-reverify-form]')).toBeHidden();
    await expect(page.locator('[data-account-controls]')).toBeHidden();
    await context.close();
});

test('post-factor token failure resets to a usable verification start without an extra failed submission', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1152, height: 720 } });
    await installFixture(context, { reauthentication: true, dropFreshToken: true });
    const page = await context.newPage();
    await openAccount(page);
    await page.locator('[data-account-reverify]').click();
    await page.locator('[data-account-reverify-input]').fill('123456');
    await page.locator('[data-account-reverify-submit]').click();
    await expect(page.locator('[data-account-control-status]')).toContainText('refreshed session could not be created');
    await expect(page.locator('[data-account-reverify-form]')).toBeHidden();
    await expect(page.locator('[data-account-reverify]')).toBeVisible();
    await page.locator('[data-account-reverify]').click();
    await expect(page.locator('[data-account-reverify-form]')).toBeVisible();
    await context.close();
});

test('mobile Data & Privacy has no horizontal overflow and keeps every confirmation reachable', async ({ browser, browserName }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installFixture(context);
    const page = await context.newPage();
    await openAccount(page);
    await page.locator('[data-account-delete-start]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-account-delete-start]')).toBeVisible();
    await page.locator('[data-account-delete-start]').click();
    await expect(page.locator('[data-account-delete-confirm]')).toBeVisible();
    const metrics = await page.evaluate(() => ({
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialogOverflow: document.querySelector('.caissa-public-identity-dialog').scrollWidth
            - document.querySelector('.caissa-public-identity-dialog').clientWidth,
        dialogBottom: document.querySelector('.caissa-public-identity-dialog').getBoundingClientRect().bottom,
        viewportHeight: innerHeight
    }));
    expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
    expect(metrics.dialogOverflow).toBeLessThanOrEqual(0);
    expect(metrics.dialogBottom).toBeLessThanOrEqual(metrics.viewportHeight);
    if (browserName === 'chromium') {
        await page.locator('.caissa-public-identity-dialog').screenshot({ path: output('mobile-390x844') });
    }
    await context.close();
});
