import { test, expect } from '@playwright/test';

test('Play Coach v3.1 exposes the certified permanent shell contract', async ({ page }) => {
  await page.goto('/play/coach');
  await expect(page).toHaveURL(/\/play\/coach\/?$/);
  await expect(page.locator('meta[name="caissa-production-release"]')).toHaveAttribute(
    'content', 'caissa-production-2026-09-05'
  );

  await expect(page.getByRole('tab', { name: 'Play Game' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Play Bots' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Play Coach' })).toHaveAttribute('aria-selected', 'true');

  const shell = page.locator('[data-caissa-coach-shell]');
  await expect(shell).toHaveCount(1);
  await expect(shell.locator(':scope > [data-caissa-coach-head]')).toHaveCount(1);
  await expect(shell.locator(':scope > [data-caissa-coach-body]')).toHaveCount(1);
  await expect(shell.locator(':scope > [data-caissa-coach-foot]')).toHaveCount(1);
  await expect(shell).toContainText('Choose your level');
  await expect(shell.getByRole('radio', { name: 'Casual' })).toBeVisible();
  await expect(shell.getByRole('radio', { name: 'Balanced' })).toBeVisible();
  await expect(shell.getByRole('radio', { name: 'Challenging' })).toBeVisible();
  await expect(shell.getByRole('button', { name: /Show All Levels/i })).toBeVisible();
});
