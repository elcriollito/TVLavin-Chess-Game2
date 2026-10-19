import { test, expect } from '@playwright/test';

test('loads PGN and produces a downloadable animated GIF with the chosen settings', async ({ page }) => {
  await page.goto('/gif-maker');
  await expect(page.getByRole('heading', { name: /GIF Studio/i })).toBeVisible();
  await page.getByRole('button', { name: /Try the Paul Morphy example game/i }).click();
  await expect(page.locator('[data-gif-status]')).toContainText('Game loaded');
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.locator('[data-gif-ply]')).toContainText('e4');
  await page.getByRole('tab', { name: 'Customize' }).click();
  await page.locator('#gif-orientation').selectOption('black');
  await page.locator('#gif-theme').selectOption('walnut');
  await page.getByRole('tab', { name: 'Export' }).click();
  await page.locator('#gif-end').fill('3');
  await page.locator('#gif-size').selectOption('384');
  await page.getByRole('button', { name: 'Create GIF' }).click();
  await expect(page.locator('[data-gif-status]')).toContainText('GIF ready!', { timeout: 45000 });
  const link = page.getByRole('link', { name: 'Download GIF' });
  await expect(link).toBeVisible();
  const result = await page.evaluate(async () => {
    const url = document.querySelector('[data-gif-download]').href;
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return { signature: String.fromCharCode(...data.slice(0, 6)), size: data.length, terminator: data.at(-1) };
  });
  expect(result).toMatchObject({ signature: 'GIF89a', terminator: 0x3b });
  expect(result.size).toBeGreaterThan(900);
});

test('rejects unsafe URL import and keeps export disabled', async ({ page }) => {
  await page.goto('/gif-maker');
  await page.locator('#gif-pgn').fill('https://www.chess.com/game/live/123');
  await page.getByRole('button', { name: 'Load PGN' }).click();
  await expect(page.locator('[data-gif-status]')).toContainText('URL import is planned');
  await expect(page.getByRole('button', { name: 'Create GIF' })).toBeDisabled();
});
