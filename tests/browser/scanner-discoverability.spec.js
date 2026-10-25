import { test, expect } from '@playwright/test';

test('desktop Home and shared navigation discover the Scanner informational landing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  const sidebarScanner = page.locator('.sidebar').getByRole('link', { name: 'Scanner', exact: true });
  await expect(sidebarScanner).toBeVisible();
  const sidebarLabels = await page.locator('.sidebar nav a').allTextContents();
  expect(sidebarLabels.indexOf('Scanner')).toBeGreaterThan(sidebarLabels.indexOf('Endgames'));
  expect(sidebarLabels.indexOf('Scanner')).toBeLessThan(sidebarLabels.indexOf('Engine Arena'));

  const card = page.locator('.scanner-home-card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('href', '/scanner');
  await expect(card.getByText('CAISSA Scanner', { exact: true })).toBeVisible();
  await expect(card.getByText('Public Beta', { exact: true })).toBeVisible();
  await expect(card.getByText('Open Scanner', { exact: false })).toBeVisible();

  const toolsGroup = page.locator('.all-tools-group').filter({ has: page.getByRole('heading', { name: 'Tools', exact: true }) });
  const allToolsScanner = toolsGroup.locator('a[href="/scanner"]');
  await expect(allToolsScanner).toHaveCount(1);
  await expect(allToolsScanner.getByText('CAISSA Scanner', { exact: true })).toBeVisible();
  await expect(allToolsScanner.getByText('Public Beta', { exact: true })).toBeVisible();
  await expect(allToolsScanner).toContainText('Scan chess positions from screenshots, websites, broadcasts, and photos of 2D boards.');

  await card.click();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.locator('#scannerDesktopLanding')).toBeVisible();
  await expect(page.locator('#scannerApp')).toBeHidden();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 430, height: 932 }
]) {
  test(`${viewport.width}x${viewport.height} mobile navigation opens the functional Scanner without overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const mobileNav = page.locator('.mobile-nav');
    const scanner = mobileNav.getByRole('link', { name: 'Scanner', exact: true });
    await expect(scanner).toBeVisible();
    await expect(scanner).toHaveAttribute('href', '/scanner');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await scanner.click();
    await expect(page).toHaveURL(/\/scanner$/);
    await expect(page.locator('#scannerApp')).toBeVisible();
    await expect(page.locator('#scannerDesktopLanding')).toBeHidden();
    await expect(page.locator('#homeScanBtn')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('shared main navigation exposes Scanner exactly once and opens the canonical route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/endgame-library');
  const scanner = page.locator('#mainNav [data-nav-key="scanner"]');
  await expect(scanner).toHaveCount(1);
  await expect(scanner).toHaveAttribute('href', '/scanner');
  await expect(scanner).toHaveAccessibleName('Scanner');
  await scanner.click();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.locator('#scannerDesktopLanding')).toBeVisible();
});
