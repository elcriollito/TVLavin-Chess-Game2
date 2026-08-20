import { test, expect } from '@playwright/test';

for (const route of ['/premium', '/about', '/library', '/roadmap']) {
  test(`${route} owns one configured Clerk bootstrap`, async ({ page }) => {
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

test('Play keeps its engine worker CSP isolated from the Clerk page policy', async ({ request }) => {
  const [premium, play] = await Promise.all([request.get('/premium'), request.get('/play')]);
  expect(premium.headers()['content-security-policy']).toContain("worker-src 'self' blob:");
  expect(play.headers()['content-security-policy']).toContain("worker-src 'self'");
  expect(play.headers()['content-security-policy']).not.toContain("worker-src 'self' blob:");
});
