import { test, expect } from '@playwright/test';

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground, background) {
  const parse = (color) => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const luminance = (color) => {
    const [r, g, b] = parse(color).map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
});

test('Scanner dialog traps forward and reverse focus and restores its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/scanner');
  const trigger = page.locator('#homeScanBtn');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'New Scan' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#cancelNewScanBtn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#choosePhotoBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#cancelNewScanBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('target surfaces reflow without horizontal document overflow at 200 percent zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ['/chess-gym', '/opening-database', '/spectator-tv', '/scanner', '/analyze']) {
    await page.goto(path);
    await page.addStyleTag({ content: 'html { zoom: 2; }' });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test('focused bypass text and the corrected brand text meet text contrast', async ({ page }) => {
  await page.goto('/analyze');
  const bypass = page.locator('.caissa-global-skip-link');
  await bypass.focus();
  const bypassColors = await bypass.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(contrastRatio(bypassColors.color, bypassColors.background)).toBeGreaterThanOrEqual(4.5);

  const brand = page.locator('.nav-logo').first();
  const brandColors = await brand.evaluate((element) => {
    const style = getComputedStyle(element);
    const background = getComputedStyle(element.closest('nav')).backgroundColor;
    return { color: style.color, background };
  });
  expect(contrastRatio(brandColors.color, brandColors.background)).toBeGreaterThanOrEqual(4.5);
});
