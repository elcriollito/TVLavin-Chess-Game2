import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import sharp from 'sharp';

const canonicalScannerUrl = 'https://www.caissa-chess.org/scanner';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 375, height: 812 }
]) {
  test(`Scanner Home link is visible and direct at ${viewport.width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto('/scanner');

    const home = page.getByRole('link', { name: 'Go to CAISSA Chess homepage' });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute('href', '/');
    await expect(page.locator('.public-beta-badge')).toBeVisible();

    const layout = await page.evaluate(() => {
      const link = document.querySelector('.scanner-home-link').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        link: { left: link.left, right: link.right, width: link.width, height: link.height }
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.link.left).toBeGreaterThanOrEqual(0);
    expect(layout.link.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.link.width).toBeGreaterThanOrEqual(44);
    expect(layout.link.height).toBeGreaterThanOrEqual(44);
    if (viewport.width > 520) {
      const placement = await page.evaluate(() => {
        const badge = document.querySelector('.public-beta-badge').getBoundingClientRect();
        const link = document.querySelector('.scanner-home-link').getBoundingClientRect();
        return { gap: link.left - badge.right };
      });
      expect(placement.gap).toBeGreaterThanOrEqual(8);
      expect(placement.gap).toBeLessThanOrEqual(24);
    }

    await home.focus();
    await expect(home).toBeFocused();
    expect(await home.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    expect(errors).toEqual([]);

    await home.click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('desktop QR initializes, renders, decodes, and copies the canonical Scanner URL', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__copiedScannerUrl = value; } }
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/scanner');
  await expect(page.locator('html')).toHaveAttribute('data-scanner-handoff-ready', 'true');
  await expect(page.locator('#scannerCanonicalUrl')).toHaveValue(canonicalScannerUrl);
  await expect(page.locator('#scannerMobileCta')).toHaveAttribute('href', canonicalScannerUrl);
  await expect(page.locator('#copyScannerUrlBtn')).toBeEnabled();
  await expect.poll(() => page.locator('#scannerHandoffQr').evaluate((image) => ({
    complete: image.complete,
    width: image.naturalWidth,
    height: image.naturalHeight
  }))).toEqual({ complete: true, width: 208, height: 208 });

  const response = await request.get('/api/scanner/public/handoff-qr');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toBe('image/png');
  const png = await response.body();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height
  )?.data;
  expect(decoded).toBe(canonicalScannerUrl);

  await page.locator('#copyScannerUrlBtn').click();
  await expect.poll(() => page.evaluate(() => window.__copiedScannerUrl)).toBe(canonicalScannerUrl);
  expect(errors).toEqual([]);
});
