import { test, expect } from '@playwright/test';

const routes = ['/play/beta', '/play/beta/games', '/play/beta/bots', '/play/beta/coach'];

for (const route of routes) {
    test(`fresh ${route} bootstrap exposes only the shared CAISSA auth core`, async ({ browser }) => {
        const context = await browser.newContext();
        await context.addInitScript(() => Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
            configurable: true, get: () => '', set: () => {}
        }));
        await context.route('**/api/public-auth-config', route => route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ clerkPublishableKey: 'pk_test_browser_contract_123456789', registrationTracking: true }) }));
        await context.route('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js', route => route.fulfill({
            status: 200, contentType: 'text/javascript', body: `window.Clerk={user:null,session:null,load:async()=>{},addListener:()=>{}};`
        }));
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
        expect(requests.filter(url => /\/api\/public-auth-config(?:[?#]|$)/.test(url))).toHaveLength(1);
        expect(requests.filter(url => /\/api\/mentor\//.test(url))).toEqual([]);
        expect(requests.filter(url => /supabase/i.test(url))).toEqual([]);
        expect(failures).toEqual([]);
        expect(errors).toEqual([]);
        expect(proof.authConfig).toBe('object');
        expect(proof.auth).toBe('object');
        expect(proof.local.filter(key => /token/i.test(key))).toEqual([]);
        expect(proof.session.filter(key => /token/i.test(key))).toEqual([]);
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
