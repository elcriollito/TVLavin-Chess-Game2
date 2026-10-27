import { test, expect } from '@playwright/test';
import fs from 'node:fs';

for (const route of ['/premium', '/about', '/library', '/roadmap']) {
  test(`${route} owns one configured Clerk bootstrap`, async ({ page }) => {
    await page.route(`**${route}`, request => request.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fs.readFileSync(`${route.slice(1)}.html`, 'utf8')
    }));
    await page.addInitScript(() => {
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
        configurable: true, get: () => '', set: () => {}
      });
      window.__internal_ClerkUICtor = function ClerkUI() {};
    });
    await page.route('**/api/public-auth-config', request => request.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clerkPublishableKey: 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ',
        registrationTracking: false,
        identityOwnerHandoff: null,
        registrationCandidate: { enabled: false }
      })
    }));
    await page.route('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js', request => request.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: 'window.Clerk={user:null,session:null,load:async()=>{},addListener:()=>{},signOut:async()=>{}};'
    }));
    const consoleErrors = [];
    const clerkScripts = [];
    page.on('console', message => {
      const text = message.text();
      if (/Missing publishableKey|Content Security Policy.*worker-src|auth-bootstrap/i.test(text)) consoleErrors.push(text);
    });
    page.on('request', request => {
      if (/clerk\.browser\.js/.test(request.url())) clerkScripts.push(request.url());
    });
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.isLoaded === true)).toBe(true);
    expect(consoleErrors).toEqual([]);
    expect(clerkScripts).toHaveLength(1);
  });
}

test('Play routes permit Clerk Blob Workers without conflicting document policies', async ({ request }) => {
  for (const route of ['/play', '/play/games', '/play/bots', '/play/coach']) {
    const response = await request.get(route);
    const header = response.headers()['content-security-policy'];
    const document = await response.text();
    const meta = document.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
    for (const policy of [header, meta]) {
      expect(policy, route).toContain("worker-src 'self' blob:");
      expect(policy, route).not.toMatch(/worker-src[^;]*(?:https?:|\*)/);
      expect(policy, route).not.toContain("worker-src 'self';");
      expect(policy, route).not.toContain("'unsafe-eval'");
    }
  }
});
