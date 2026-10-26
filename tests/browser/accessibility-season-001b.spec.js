import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
});

test('Chess Gym tabsets support roving focus, Home, End, and retain selected state', async ({ page }) => {
  await page.goto('/chess-gym');
  const training = page.getByRole('tab', { name: 'Training', exact: true });
  await training.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Progress', exact: true })).toBeFocused();
  const caissa = page.getByRole('tab', { name: 'CAISSA', exact: true });
  await caissa.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Mentor/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Training', exact: true }).click();
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Mentor/ })).toHaveAttribute('aria-selected', 'true');
});

test('Opening Database exposes operable tabs and an assertive FEN error', async ({ page }) => {
  await page.goto('/opening-database');
  const moves = page.getByRole('tab', { name: 'Moves', exact: true });
  await moves.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Search Games', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Input FEN' }).click();
  await page.locator('#odbFenInput').fill('not a fen');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('targeted routes have no serious or critical Axe findings', async ({ page }) => {
  for (const path of ['/chess-gym', '/opening-database', '/scanner']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(item => ['serious', 'critical'].includes(item.impact));
    expect(blocking, `${path}: ${blocking.map(item => item.id).join(', ')}`).toEqual([]);
  }
});

