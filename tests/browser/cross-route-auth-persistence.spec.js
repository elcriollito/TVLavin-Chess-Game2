import { test, expect } from '@playwright/test';

const routes = ['/play', '/arena', '/endgame-trainer', '/play-online/playchess', '/analyze', '/play'];

async function installAuthFixture(context, authenticated) {
  await context.addInitScript(() => Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
    configurable: true, get: () => '', set: () => {}
  }));
  await context.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clerkPublishableKey: 'pk_test_browser_contract_123456789', registrationTracking: true })
  }));
  await context.route('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: authenticated
      ? `window.Clerk={user:{id:'fixture-subject',fullName:'Fixture User',firstName:'Fixture',imageUrl:null,primaryEmailAddress:{emailAddress:'fixture@example.test'}},session:{getToken:async()=> 'fixture-token'},load:async()=>{},addListener:()=>{},signOut:async()=>{}};`
      : `window.Clerk={user:null,session:null,load:async()=>{},addListener:()=>{},signOut:async()=>{}};`
  }));
  await context.route('**/api/user/sync', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true })
  }));
  await context.route('**/api/wallet', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ credits: 5, isPremium: false, role: 'member' })
  }));
}

async function stableAuthState(page) {
  await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toMatch(/authenticated|anonymous/);
  return page.locator('#sidebarAuthArea');
}

test('authenticated identity persists across route families, reload, tabs, and history', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 885, height: 611 } });
  await installAuthFixture(context, true);
  const page = await context.newPage();
  for (const route of routes) {
    await test.step(route, async () => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const area = await stableAuthState(page);
      await expect(area).toHaveAttribute('data-auth-state', 'authenticated');
      await expect(page.locator('#sidebarUserInfo')).toBeVisible();
      await expect(page.locator('#sidebarUserTier')).toHaveText('Free');
      await expect(page.locator('#sidebarSignIn')).toBeHidden();
      await expect(page.locator('#sidebarCreateAccount')).toBeHidden();
      expect(await page.locator('#sidebarAuthArea').evaluate(element => element.querySelectorAll('#sidebarUserInfo').length)).toBe(1);
    });
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await stableAuthState(page);
  await expect(page.locator('#sidebarUserInfo')).toBeVisible();

  const second = await context.newPage();
  await second.goto('/endgame-trainer', { waitUntil: 'domcontentloaded' });
  await stableAuthState(second);
  await expect(second.locator('#sidebarUserTier')).toHaveText('Free');
  await second.close();

  await page.goto('/arena');
  await page.goto('/analyze');
  await page.goBack();
  await stableAuthState(page);
  await expect(page.locator('#sidebarSignIn')).toBeHidden();
  await page.goForward();
  await stableAuthState(page);
  await expect(page.locator('#sidebarUserInfo')).toBeVisible();
  await context.close();
});

test('anonymous routes show only Sign In and Create Account after readiness', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 885, height: 611 } });
  await installAuthFixture(context, false);
  const page = await context.newPage();
  for (const route of routes) {
    await test.step(route, async () => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const area = await stableAuthState(page);
      await expect(area).toHaveAttribute('data-auth-state', 'anonymous');
      await expect(page.locator('#sidebarSignIn')).toBeVisible();
      await expect(page.locator('#sidebarCreateAccount')).toBeVisible();
      await expect(page.locator('#sidebarUserInfo')).toBeHidden();
      await expect(page.locator('#sidebarSignIn')).toHaveAttribute('href', /\/signin\?redirect_url=/);
      await expect(page.locator('#sidebarCreateAccount')).toHaveAttribute('href', /\/signup\?redirect_url=/);
    });
  }
  await context.close();
});

test('Play compact sidebar keeps the resolved auth state discoverable without mixed controls', async ({ browser }) => {
  for (const authenticated of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 885, height: 611 } });
    await installAuthFixture(context, authenticated);
    const page = await context.newPage();
    await page.goto('/play', { waitUntil: 'domcontentloaded' });
    await stableAuthState(page);
    if (authenticated) {
      await expect(page.locator('#sidebarUserInfo')).toBeVisible();
      await expect(page.locator('#sidebarUserInfo')).toHaveAccessibleName('Account menu');
      await expect(page.locator('#sidebarSignIn')).toBeHidden();
    } else {
      await expect(page.locator('#sidebarSignIn')).toBeVisible();
      await expect(page.locator('#sidebarCreateAccount')).toBeVisible();
      await expect(page.locator('#sidebarUserInfo')).toBeHidden();
    }
    await context.close();
  }
});
