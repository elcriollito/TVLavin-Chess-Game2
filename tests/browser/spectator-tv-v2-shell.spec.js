import { test, expect } from '@playwright/test';

test('Chess TV identity keeps the canonical route and one accessible navigation link', async ({ page, request }) => {
  const response = await page.goto('/spectator-tv');
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle('Chess TV | CAISSA Chess');
  await expect(page.getByRole('heading', { name: 'Chess TV', exact: true })).toBeVisible();

  const navigationLink = page.locator('#mainNav a[href="/spectator-tv"]');
  await expect(navigationLink).toHaveCount(1);
  await expect(navigationLink).toHaveAccessibleName('Chess TV');
  await expect(navigationLink).toHaveAttribute('data-nav-key', 'spectator');
  await expect(page.locator('#spectatorSection')).toBeVisible();
  await expect(page.locator('#spectatorWorkspace')).toHaveAttribute('aria-label', 'Chess TV controls');
  await expect(page.getByRole('link', { name: 'Spectator TV', exact: true })).toHaveCount(0);

  const aliasResponse = await request.get('/chess-tv');
  expect(aliasResponse.status()).toBe(404);
});

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
      board: { x: board.x, y: board.y, width: board.width, bottom: board.bottom },
      workspace: { x: workspace.x, y: workspace.y, width: workspace.width, bottom: workspace.bottom },
      bodyOverflow: getComputedStyle(body).overflowY,
      bodyOverflowX: getComputedStyle(body).overflowX,
      workspaceOverflow: getComputedStyle(document.querySelector('#spectatorWorkspace')).overflow
    };
  });

  expect(geometry.board.x).toBeLessThan(geometry.workspace.x);
  expect(geometry.board.width).toBeGreaterThan(geometry.workspace.width);
  expect(Math.abs(geometry.board.y - geometry.workspace.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.board.bottom - geometry.workspace.bottom)).toBeLessThanOrEqual(1);
  expect(geometry.bodyOverflow).toBe('auto');
  expect(geometry.bodyOverflowX).toBe('hidden');
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

  const before = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      board: box('#spectatorBoard'),
      head: box('.spectator-workspace-head'),
      foot: box('.spectator-workspace-foot')
    };
  });
  await expect(page.locator('#spectatorServerView')).toBeVisible();

  await page.getByRole('tab', { name: /2 Channels/ }).click();
  await expect(page.locator('#spectatorChannelsView')).toBeVisible();
  await expect(page.locator('#spectatorServerView')).toBeHidden();

  await page.getByRole('tab', { name: /3 Watch/ }).click();
  await expect(page.locator('#spectatorWatchView')).toBeVisible();
  await expect(page.locator('#spectatorChannelsView')).toBeHidden();
  const after = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      board: box('#spectatorBoard'),
      head: box('.spectator-workspace-head'),
      foot: box('.spectator-workspace-foot')
    };
  });

  for (const area of ['board', 'head', 'foot']) {
    for (const dimension of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(after[area][dimension] - before[area][dimension]), `${area}.${dimension}`).toBeLessThanOrEqual(1);
    }
  }
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
          workspaceBottomAligned: Math.abs(workspace.bottom - panel.bottom) <= 1,
          boardNonzero: board.width > 0 && board.height > 0,
          headFixed: getComputedStyle(document.querySelector('.spectator-workspace-head')).overflowY !== 'auto',
          bodyScrollOwner: getComputedStyle(document.querySelector('.spectator-workspace-body')).overflowY === 'auto',
          footFixed: getComputedStyle(document.querySelector('.spectator-workspace-foot')).position !== 'fixed',
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
        };
      });

      expect(geometry, `${physical.width}x${physical.height} at ${Math.round(zoom * 100)}%`).toEqual({
        controlsAboveBoard: true,
        noHeaderOverlap: true,
        buttonsUncut: true,
        workspaceAligned: true,
        workspaceBottomAligned: true,
        boardNonzero: true,
        headFixed: true,
        bodyScrollOwner: true,
        footFixed: true,
        noHorizontalOverflow: true
      });
    }
  }
});

test('theater and fullscreen keep both desktop columns stable and nonzero', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/spectator-tv');

  const measure = () => page.evaluate(() => {
    const board = document.querySelector('.spectator-board-panel').getBoundingClientRect();
    const boardFrame = document.querySelector('.spectator-board-frame').getBoundingClientRect();
    const workspace = document.querySelector('#spectatorWorkspace').getBoundingClientRect();
    return {
      bottomDifference: Math.abs(board.bottom - workspace.bottom),
      boardWidth: boardFrame.width,
      boardHeight: boardFrame.height,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  const expectStable = geometry => {
    expect(geometry.bottomDifference).toBeLessThanOrEqual(1);
    expect(geometry.boardWidth).toBeGreaterThan(0);
    expect(geometry.boardHeight).toBeGreaterThan(0);
    expect(geometry.horizontalOverflow).toBe(false);
  };

  await page.locator('#spectatorTheaterBtn').click();
  await expect(page.locator('#spectatorTheaterBtn')).toHaveAttribute('aria-pressed', 'true');
  expectStable(await measure());
  await page.locator('#spectatorTheaterBtn').click();

  await page.locator('#spectatorFullscreenBtn').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id || null)).toBe('spectatorStage');
  expectStable(await measure());
  await page.locator('#spectatorFullscreenBtn').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id || null)).toBeNull();
  expectStable(await measure());
});

test('mobile portrait and landscape keep board first with a complete HEAD BODY FOOT panel', async ({ page }) => {
  const profiles = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 932, height: 430 }
  ];
  await page.goto('/spectator-tv');
  for (const profile of profiles) {
    await page.setViewportSize(profile);
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const board = box('.spectator-v2 .spectator-board-panel');
      const boardFrame = box('.spectator-board-frame');
      const controls = box('.spectator-board-tools');
      const workspace = box('#spectatorWorkspace');
      const head = box('.spectator-workspace-head');
      const body = box('.spectator-workspace-body');
      const foot = box('.spectator-workspace-foot');
      return {
        boardBottom: board.bottom,
        boardFrame: { width: boardFrame.width, height: boardFrame.height, top: boardFrame.top },
        controlsBottom: controls.bottom,
        workspace: { top: workspace.top, bottom: workspace.bottom },
        orderedRegions: head.top < body.top && body.bottom <= foot.top + 1 && foot.bottom <= workspace.bottom + 1,
        footClosesPanel: Math.abs(foot.bottom - workspace.bottom) <= 1,
        bodyOverflow: getComputedStyle(document.querySelector('.spectator-workspace-body')).overflowY,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });

    expect(layout.boardBottom, JSON.stringify(profile)).toBeLessThanOrEqual(layout.workspace.top + 2);
    expect(layout.controlsBottom, JSON.stringify(profile)).toBeLessThanOrEqual(layout.boardFrame.top);
    expect(layout.boardFrame.width, JSON.stringify(profile)).toBeGreaterThan(0);
    expect(layout.boardFrame.height, JSON.stringify(profile)).toBeGreaterThan(0);
    expect(Math.abs(layout.boardFrame.width - layout.boardFrame.height), JSON.stringify(profile)).toBeLessThanOrEqual(1);
    expect(layout.orderedRegions, JSON.stringify(profile)).toBe(true);
    expect(layout.footClosesPanel, JSON.stringify(profile)).toBe(true);
    expect(layout.bodyOverflow, JSON.stringify(profile)).toBe('auto');
    expect(layout.documentWidth, JSON.stringify(profile)).toBeLessThanOrEqual(layout.viewportWidth);
  }

  for (const id of ['spectatorFlipBoardBtn', 'spectatorTheaterBtn', 'spectatorFullscreenBtn', 'spectatorBoardRefreshBtn']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: /1 Server/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect & continue/i })).toBeVisible();
});

test('live Spectator updates reuse the persistent FICS renderer without board geometry drift', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/spectator-tv');

  const result = await page.evaluate(async () => {
    const section = window.CaissaSpectatorTVSection;
    const game = new Chess();
    const emit = san => {
      const move = game.move(san);
      const style12 = {
        fen: game.fen(), gameNumber: 919, whiteName: 'Alpha', blackName: 'Beta',
        relation: 0, sideToMove: game.turn(), lastMove: move.san, lastMoveVerbose: move,
        whiteClock: 300, blackClock: 300, observedGame: true
      };
      section.renderStyle12({
        style12,
        liveGame: {
          currentFen: style12.fen, gameNumber: 919, whiteName: 'Alpha', blackName: 'Beta',
          sideToMove: style12.sideToMove, whiteClock: 300, blackClock: 300,
          observedGame: true, gameActive: false, status: 'observing'
        },
        moveHistory: []
      });
    };
    emit('e4');
    await section.boardView.whenIdle();
    const root = document.querySelector('#spectatorBoard > *');
    const before = document.querySelector('.spectator-board-frame').getBoundingClientRect().toJSON();
    for (const san of ['e5', 'Nf3', 'Nc6', 'Bb5']) emit(san);
    await section.boardView.whenIdle();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = document.querySelector('.spectator-board-frame').getBoundingClientRect().toJSON();
    const snapshot = section.boardView.getSnapshot();
    const sameRootAfterUpdates = root === document.querySelector('#spectatorBoard > *');
    section.handleDisconnected();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return {
      renderer: snapshot.renderer,
      sameRoot: sameRootAfterUpdates,
      sameRootAfterDisconnect: root === document.querySelector('#spectatorBoard > *'),
      before,
      after,
      width: document.querySelector('#spectatorBoard').getBoundingClientRect().width,
      height: document.querySelector('#spectatorBoard').getBoundingClientRect().height,
      pendingVisual: snapshot.pendingVisual,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  expect(result.renderer).toBe('persistent');
  expect(result.sameRoot).toBe(true);
  expect(result.sameRootAfterDisconnect).toBe(true);
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.pendingVisual).toBe(false);
  expect(result.horizontalOverflow).toBe(false);
  for (const dimension of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(result.after[dimension] - result.before[dimension]), dimension).toBeLessThanOrEqual(1);
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(message => !/favicon/i.test(message))).toEqual([]);
});
