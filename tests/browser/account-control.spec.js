import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const output = name => `test-results/account-control/${name}.png`;

async function installFixture(context, { reauthentication = false, review = false } = {}) {
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
        body: `window.Clerk={user:{id:'synthetic-owner',fullName:'Private Synthetic Name',firstName:'Private',imageUrl:null,primaryEmailAddress:{emailAddress:'private.synthetic@example.test'}},session:{getToken:async()=> 'fixture-token'},load:async()=>{},addListener:()=>{},signOut:async()=>{}};`
    }));
    for (const path of ['**/api/user/sync', '**/api/wallet']) {
        await context.route(path, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    }
    await context.route('**/api/beta/access', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
    await context.route('**/api/user/public-identity', route => route.fulfill({ json: { identity: {
        displayName: 'SafeKnight', nickname: 'SafeKnight', fallbackAlias: 'Player-1122334455667788',
        hasCustomNickname: true, policyVersion: 1, version: 1, updatedAt: '2026-10-18T00:00:00Z'
    } } }));
    await context.route('**/api/account/privacy/summary', route => route.fulfill({ json: {
        backendReady: true,
        requiresReauthentication: reauthentication,
        summary: {
            ownership: review ? 'REVIEW_REQUIRED' : 'VERIFIED', accountState: 'ACTIVE',
            counts: { onlineGames: 4, puzzleProgress: 1, puzzleAttempts: 27, activeEntitlements: review ? 1 : 0 },
            capabilities: { export: !review, progressReset: !review, accountDeletion: !review },
            manualReviewRequired: review
        }
    } }));
    await context.route('**/api/account/progress-reset/prepare', async route => {
        calls.push({ type: 'prepare', body: route.request().postDataJSON() });
        await route.fulfill({ json: {
            operationId: '30000000-0000-4000-8000-000000000001',
            confirmationToken: 'a'.repeat(43), status: 'PREPARED'
        } });
    });
    await context.route('**/api/account/progress-reset/confirm', async route => {
        calls.push({ type: 'confirm', body: route.request().postDataJSON() });
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
