import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('authorized mobile Beta Center lists Scanner with a keyboard-accessible route', async ({ page }) => {
  const response = await page.goto('/beta');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('CAISSA Beta Program');
  await expect(page.getByRole('heading', { level: 1, name: 'CAISSA Beta' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'CAISSA Scanner' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Your Beta Activity' })).toBeVisible();
  await expect(page.getByText('0 / 100', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No beta submissions yet.')).toBeVisible();
  await expect(page.getByText('Pending / incomplete')).toBeVisible();
  const open = page.locator('a.open-beta[data-experiment-id="scanner"]');
  await expect(open).toHaveAccessibleName(/Open Beta.*CAISSA Scanner/);
  await expect(open).toHaveAttribute('href', '/scanner/beta');
  await open.focus();
  await expect(open).toBeFocused();
  const box = await open.boundingBox();
  expect(box.width).toBeGreaterThan(300);
  const bodyWidth = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow,noarchive');
});
