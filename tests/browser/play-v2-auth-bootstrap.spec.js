import { test, expect } from '@playwright/test';

const routes = ['/play/beta', '/play/beta/games', '/play/beta/bots', '/play/beta/coach'];

for (const route of routes) {
    test(`fresh ${route} bootstrap owns no auth request, identity, cookie, or storage`, async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const requests = [];
        const failures = [];
        const errors = [];
        page.on('request', request => requests.push(request.url()));
        page.on('requestfailed', request => failures.push(request.url()));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(error.message));
        const beforeCookies = await context.cookies();
        await page.goto(route, { waitUntil: 'networkidle' });
        const proof = await page.evaluate(() => ({
            local: Object.keys(localStorage),
            session: Object.keys(sessionStorage),
            authConfig: typeof window.CAISSA_AUTH_CONFIG,
            auth: typeof window.CAISSA_AUTH
        }));
        expect(requests.filter(url => /\/api\/public-auth-config(?:[?#]|$)/.test(url))).toEqual([]);
        expect(requests.filter(url => /(?:clerk|supabase)/i.test(url))).toEqual([]);
        expect(failures).toEqual([]);
        expect(errors).toEqual([]);
        expect(proof).toEqual({ local: [], session: [], authConfig: 'undefined', auth: 'undefined' });
        expect(await context.cookies()).toEqual(beforeCookies);
        await context.close();
    });
}

test('Players remains a runtime-free unavailable document', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('/play/beta/players');
    await expect(page).toHaveTitle(/Play Beta Unavailable/);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.locator('#chessboard')).toHaveCount(0);
    expect(requests.filter(url => /\/api\/public-auth-config(?:[?#]|$)/.test(url))).toEqual([]);
});
