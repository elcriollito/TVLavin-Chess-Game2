import { test, expect } from '@playwright/test';

test('PGN Reader Web Mirror V2 exposes the recovered certified contract', async ({ page }) => {
  await page.goto('/pgn-replayer');
  await expect(page).toHaveURL(/\/pgn-replayer\/?$/);
  await expect(page.locator('meta[name="caissa-production-release"]')).toHaveAttribute(
    'content', 'caissa-production-2026-09-05'
  );
  await expect(page.locator('[data-pgn-app]')).toHaveCount(1);

  for (const name of ['Albums', 'Games', 'Notation', 'Analysis']) {
    await expect(page.getByRole('tab', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(page.locator('[data-pgn-open]').first()).toBeAttached();
  await expect(page.locator('[data-pgn-options]')).toBeVisible();
  await expect(page.locator('[data-pgn-save-source]')).toBeAttached();
  await expect(page.locator('[data-pgn-engine]')).toBeVisible();

  await page.getByRole('tab', { name: /^Albums/ }).click();
  await expect(page.locator('[data-pgn-library-family]')).toHaveCount(5);
  await expect(page.locator('[data-pgn-library-family="openings"]')).toBeVisible();
  await expect(page.locator('[data-catalog-album-id="smallchess-alexander-grischuk"]')).toBeVisible();
});
