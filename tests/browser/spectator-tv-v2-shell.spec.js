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

test('board controls occupy the broadcast header once and remain above the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/spectator-tv');

  const controlIds = ['spectatorFlipBoardBtn', 'spectatorTheaterBtn', 'spectatorFullscreenBtn', 'spectatorBoardRefreshBtn'];
  for (const id of controlIds) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  const geometry = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const header = box('.spectator-broadcast-bar');
    const controls = box('.spectator-board-tools');
    const board = box('.spectator-board-frame');
    const provider = box('.spectator-broadcast-bar > span');
    const status = box('#spectatorGameStatus');
    return {
      header: { top: header.top, bottom: header.bottom },
      controls: { left: controls.left, right: controls.right, top: controls.top, bottom: controls.bottom },
      boardTop: board.top,
      providerRight: provider.right,
      statusLeft: status.left,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(geometry.controls.top).toBeGreaterThanOrEqual(geometry.header.top - 1);
  expect(geometry.controls.bottom).toBeLessThanOrEqual(geometry.header.bottom + 1);
  expect(geometry.controls.bottom).toBeLessThanOrEqual(geometry.boardTop);
  expect(geometry.providerRight).toBeLessThanOrEqual(geometry.controls.left);
  expect(geometry.controls.right).toBeLessThanOrEqual(geometry.statusLeft);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
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

test('requested desktop zoom geometry keeps the header controls visible and separated', async ({ page }) => {
  const physicalViewports = [
    { width: 1920, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 }
  ];
  const zoomLevels = [1, 0.9, 0.8, 0.7, 0.6];

  await page.goto('/spectator-tv');
  for (const physical of physicalViewports) {
    for (const zoom of zoomLevels) {
      await page.setViewportSize({
        width: Math.round(physical.width / zoom),
        height: Math.round(physical.height / zoom)
      });

      const geometry = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const header = box('.spectator-broadcast-bar');
        const provider = box('.spectator-broadcast-bar > span');
        const controls = box('.spectator-board-tools');
        const status = box('#spectatorGameStatus');
        const board = box('.spectator-board-frame');
        const workspace = box('#spectatorWorkspace');
        const panel = box('.spectator-board-panel');
        const buttons = Array.from(document.querySelectorAll('.spectator-board-tools .spectator-tool-button'), element => element.getBoundingClientRect());
        return {
          controlsAboveBoard: controls.bottom <= board.top,
          noHeaderOverlap: provider.right <= controls.left && controls.right <= status.left,
          buttonsUncut: buttons.length === 4 && buttons.every(button => (
            button.width > 0
            && button.height > 0
            && button.left >= header.left
            && button.right <= header.right
            && button.top >= header.top
            && button.bottom <= header.bottom
          )),
          workspaceAligned: Math.abs(workspace.top - panel.top) <= 2,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
        };
      });

      expect(geometry, `${physical.width}x${physical.height} at ${Math.round(zoom * 100)}%`).toEqual({
        controlsAboveBoard: true,
        noHeaderOverlap: true,
        buttonsUncut: true,
        workspaceAligned: true,
        noHorizontalOverflow: true
      });
    }
  }
});

test('mobile keeps board priority and avoids horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/spectator-tv');

  const layout = await page.evaluate(() => {
    const board = document.querySelector('.spectator-v2 .spectator-board-panel').getBoundingClientRect();
    const boardFrame = document.querySelector('.spectator-board-frame').getBoundingClientRect();
    const controls = document.querySelector('.spectator-board-tools').getBoundingClientRect();
    const workspace = document.querySelector('#spectatorWorkspace').getBoundingClientRect();
    return {
      boardBottom: board.bottom,
      boardFrameTop: boardFrame.top,
      controlsBottom: controls.bottom,
      workspaceTop: workspace.top,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(layout.boardBottom).toBeLessThanOrEqual(layout.workspaceTop + 2);
  expect(layout.controlsBottom).toBeLessThanOrEqual(layout.boardFrameTop);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  for (const id of ['spectatorFlipBoardBtn', 'spectatorTheaterBtn', 'spectatorFullscreenBtn', 'spectatorBoardRefreshBtn']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: /1 Server/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect & continue/i })).toBeVisible();
});
