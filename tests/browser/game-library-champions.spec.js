import { expect, test } from '@playwright/test';

const desktopSizes = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 }
];

test('championship archive renders its chronological mural at the required desktop sizes', async ({ page }) => {
  await page.goto('/game-library/champions');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('World Chess');
  await expect(page.locator('.champion-card')).toHaveCount(18);
  await expect(page.locator('.champion-card').first()).toContainText('Wilhelm Steinitz');
  await expect(page.locator('.champion-card').last()).toContainText('Gukesh Dommaraju');
  await expect(page.locator('[data-split-diagram]')).toContainText('Classical lineage');
  await expect(page.locator('[data-split-diagram]')).toContainText('FIDE lineage');

  for (const size of desktopSizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))).toEqual({ client: size.width, scroll: size.width });
    await expect(page.locator('.archive-hero')).toBeVisible();
    await expect(page.locator('.champion-card').first()).toBeVisible();
  }
});
test('Fischer and Karpov details expose transitions and only safe PGN actions', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="bobby-fischer"]').click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Spassky–Fischer');
  await expect(dialog).toContainText('Fischer–Karpov title succession');
  await expect(dialog.getByRole('link', { name: 'Download PGN' })).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Reader handoff pending' })).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close champion detail' }).click();

  await page.locator('[data-open-champion="anatoly-karpov"]').click();
  await expect(dialog).toContainText('Karpov–Korchnoi');
  await expect(dialog).toContainText('match-aborted');
  await expect(dialog.getByRole('link', { name: 'Download PGN' })).toHaveAttribute('href', '/pgn/world-champions/Karpov_Anatoly/karpov-kasparov-1985.pgn');
});

test('the existing Game Library route still resolves to the saved-position drawer', async ({ page }) => {
  await page.goto('/game-library');
  await expect(page.locator('#libraryPanel')).toHaveClass(/open/);
  await expect(page.locator('#libraryTabPositions')).toBeVisible();
  await expect(page.locator('#libraryTabGames')).toBeVisible();
});
