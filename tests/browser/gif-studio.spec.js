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

test('imports FEN, records legal moves and exports GIF', async ({ page }) => {
  await page.goto('/gif-maker');
  await page.locator('#gif-fen').fill('8/8/4k3/8/3P4/4K3/8/8 w - - 0 1');
  await page.getByRole('button', { name: 'Load FEN & record moves' }).click();
  await expect(page.getByRole('tab', { name: 'Setup Position' })).toHaveAttribute('aria-selected', 'true');
  const board = page.locator('#gif-board');
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  const sq = name => ({ x: box.x + (name.charCodeAt(0) - 97 + .5) * box.width / 8,
    y: box.y + (8 - Number(name[1]) + .5) * box.height / 8 });
  const start = sq('d4'); const end = sq('d5');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('[data-gif-status]')).toContainText('Recorded');
  await expect(page.locator('[data-gif-moves]')).toContainText('d5');
  await page.getByRole('tab', { name: 'Export' }).click();
  await page.locator('#gif-size').selectOption('384');
  await page.getByRole('button', { name: 'Create GIF' }).click();
  await expect(page.locator('[data-gif-status]')).toContainText('GIF ready!', { timeout: 45000 });
});

test('HEAD/BODY/FOOT geometry remains stable in all four tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/gif-maker');
  const samples = [];
  for (const label of ['Import', 'Customize', 'Export', 'Setup Position']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    samples.push(await page.evaluate(() => {
      const panel = document.querySelector('.gif-panel').getBoundingClientRect();
      const foot = document.querySelector('.gif-panel-foot').getBoundingClientRect();
      return { height: panel.height, footOffset: Math.round((foot.top - panel.top) * 10) / 10 };
    }));
  }
  expect(new Set(samples.map(({ height }) => height)).size).toBe(1);
  expect(new Set(samples.map(({ footOffset }) => footOffset)).size).toBe(1);
  await expect(page.locator('.gif-board-region .gif-replay')).toHaveCount(0);
  await expect(page.locator('.gif-panel-foot .gif-replay')).toHaveCount(1);
});

test('setup draft is isolated and supports moving manually placed pieces', async ({ page }) => {
  await page.goto('/gif-maker');
  await page.getByRole('tab', { name: 'Setup Position' }).click();
  await page.locator('#gif-setup-preset').selectOption('empty');
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await page.getByRole('button', { name: 'Apply position & play moves' }).click();
  await expect(page.locator('[data-gif-status]')).toContainText('exactly one white king');
  await page.locator('#gif-setup-preset').selectOption('pawn');
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  const board = page.locator('#gif-board');
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  const sq = name => ({ x: box.x + (name.charCodeAt(0) - 97 + .5) * box.width / 8,
    y: box.y + (8 - Number(name[1]) + .5) * box.height / 8 });
  const start = sq('d4'); const end = sq('d3');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('[data-gif-setup-fen]')).toContainText('3PK3');
  await page.getByRole('button', { name: 'Apply position & play moves' }).click();
  await expect(page.locator('[data-gif-status]')).toContainText('Position applied');
});
