import { test, expect } from '@playwright/test';

test('desktop keeps the large board left of one fixed workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/spectator-tv');

  const boardPanel = page.locator('.spectator-v2 .spectator-board-panel');
  const workspace = page.locator('#spectatorWorkspace');
  await expect(boardPanel).toBeVisible();
  await expect(workspace).toBeVisible();

  const geometry = await page.evaluate(() => {
    const board = document.querySelector('.spectator-v2 .spectator-board-panel').getBoundingClientRect();
    const workspace = document.querySelector('#spectatorWorkspace').getBoundingClientRect();
    const body = document.querySelector('.spectator-workspace-body');
    return {
      board: { x: board.x, y: board.y, width: board.width },
      workspace: { x: workspace.x, y: workspace.y, width: workspace.width },
      bodyOverflow: getComputedStyle(body).overflowY,
      workspaceOverflow: getComputedStyle(document.querySelector('#spectatorWorkspace')).overflow
    };
  });

  expect(geometry.board.x).toBeLessThan(geometry.workspace.x);
  expect(geometry.board.width).toBeGreaterThan(geometry.workspace.width);
  expect(Math.abs(geometry.board.y - geometry.workspace.y)).toBeLessThanOrEqual(2);
  expect(geometry.bodyOverflow).toBe('auto');
  expect(geometry.workspaceOverflow).toBe('hidden');
});

test('workflow tabs replace only BODY content and preserve board geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/spectator-tv');

  const board = page.locator('#spectatorBoard');
  const before = await board.boundingBox();
  await expect(page.locator('#spectatorServerView')).toBeVisible();

  await page.getByRole('tab', { name: /2 Channels/ }).click();
  await expect(page.locator('#spectatorChannelsView')).toBeVisible();
  await expect(page.locator('#spectatorServerView')).toBeHidden();

  await page.getByRole('tab', { name: /3 Watch/ }).click();
  await expect(page.locator('#spectatorWatchView')).toBeVisible();
  await expect(page.locator('#spectatorChannelsView')).toBeHidden();
  const after = await board.boundingBox();

  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
});

test('mobile keeps board priority and avoids horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/spectator-tv');

  const layout = await page.evaluate(() => {
    const board = document.querySelector('.spectator-v2 .spectator-board-panel').getBoundingClientRect();
    const workspace = document.querySelector('#spectatorWorkspace').getBoundingClientRect();
    return {
      boardBottom: board.bottom,
      workspaceTop: workspace.top,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(layout.boardBottom).toBeLessThanOrEqual(layout.workspaceTop + 2);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  await expect(page.getByRole('tab', { name: /1 Server/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect & continue/i })).toBeVisible();
});
