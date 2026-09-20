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

test('native Chrome zoom matrix keeps White, FOOT, board, and aligned columns fully unclipped', async ({ page }) => {
  const profiles = [
    { zoom: 67, width: 2304, height: 959 },
    { zoom: 75, width: 2048, height: 853 },
    { zoom: 80, width: 1920, height: 800 },
    { zoom: 90, width: 1707, height: 711 },
    { zoom: 100, width: 1536, height: 640 }
  ];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto('/spectator-tv');

    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const layout = box('#spectatorLayout');
      const panel = box('.spectator-board-panel');
      const workspace = box('#spectatorWorkspace');
      const whiteBar = box('#spectatorBottomPlayer');
      const foot = box('.spectator-workspace-foot');
      const board = box('.spectator-board-frame');
      const head = document.querySelector('.spectator-workspace-head');
      const body = document.querySelector('.spectator-workspace-body');
      const footElement = document.querySelector('.spectator-workspace-foot');
      const controls = Array.from(document.querySelectorAll('.spectator-board-tools .spectator-tool-button'), element => element.getBoundingClientRect());
      const visibleBottom = Math.min(window.innerHeight, layout.bottom);
      return {
        viewportBottom: window.innerHeight,
        visualViewportHeight: window.visualViewport.height,
        layoutBottom: layout.bottom,
        panelBottom: panel.bottom,
        workspaceBottom: workspace.bottom,
        whiteBar: { top: whiteBar.top, bottom: whiteBar.bottom },
        foot: { top: foot.top, bottom: foot.bottom },
        board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
        whiteFullyVisible: whiteBar.top >= 0 && whiteBar.bottom <= visibleBottom,
        footFullyVisible: foot.top >= 0 && foot.bottom <= visibleBottom,
        boardFullyVisible: board.top >= 0 && board.bottom <= visibleBottom,
        panelsWithinViewport: panel.bottom <= window.innerHeight && workspace.bottom <= window.innerHeight,
        bottomDifference: Math.abs(panel.bottom - workspace.bottom),
        pageScroll: document.documentElement.scrollHeight > window.innerHeight || window.scrollY !== 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        headFixed: getComputedStyle(head).overflowY !== 'auto' && getComputedStyle(head).overflowY !== 'scroll',
        bodyScrollOwner: getComputedStyle(body).overflowY === 'auto',
        footFixed: getComputedStyle(footElement).overflowY !== 'auto' && getComputedStyle(footElement).position !== 'fixed',
        controlsPresent: controls.length === 4 && controls.every(control => control.width > 0 && control.height > 0),
        heading: document.querySelector('.spectator-title')?.textContent.trim(),
        route: window.location.pathname,
        boardRoots: document.querySelectorAll('#spectatorBoard').length
      };
    });

    expect(geometry, `${profile.zoom}%`).toMatchObject({
      viewportBottom: profile.height,
      visualViewportHeight: profile.height,
      whiteFullyVisible: true,
      footFullyVisible: true,
      boardFullyVisible: true,
      panelsWithinViewport: true,
      pageScroll: false,
      horizontalOverflow: false,
      headFixed: true,
      bodyScrollOwner: true,
      footFixed: true,
      controlsPresent: true,
      heading: 'Chess TV',
      route: '/spectator-tv',
      boardRoots: 1
    });
    expect(geometry.bottomDifference, `${profile.zoom}% column bottoms`).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.board.width - geometry.board.height), `${profile.zoom}% square board`).toBeLessThanOrEqual(1);
    expect(geometry.board.width, `${profile.zoom}% nonzero board`).toBeGreaterThan(0);
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
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
    section.beginGameSelection({
      gameId: '919', whitePlayer: 'Alpha', blackPlayer: 'Beta',
      timeControl: '5+0', variant: 'standard', rated: true
    }, { requestObservation: false });
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

test('rapid Game A to Game B selection rejects stale metadata and preserves one board root', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/spectator-tv');

  const result = await page.evaluate(async () => {
    const section = window.CaissaSpectatorTVSection;
    const client = window.CaissaFICSClient;
    const calls = [];
    client.authenticated = true;
    client.connected = true;
    client.connectionState = 'connected';
    client.switchObservedGame = gameId => {
      calls.push(String(gameId));
      return calls.length === 1
        ? { ok: true, code: 'SWITCH_REQUESTED' }
        : { ok: false, code: 'OBSERVE_IN_PROGRESS' };
    };
    section.state = window.CaissaSpectatorTV.createInitialState({
      status: window.CaissaSpectatorTV.STATES.LOADING_GAMES
    });
    section.catalog = window.CaissaSpectatorTVCatalog.createCatalog({
      games: [
        { gameId: '101', whitePlayer: 'Alpha White', blackPlayer: 'Alpha Black', whiteRating: 1701, blackRating: 1702, timeControl: '15+0', variant: 'standard', rated: true },
        { gameId: '202', whitePlayer: 'Beta White With A Long Accessible Name', blackPlayer: 'Beta Black With A Long Accessible Name', whiteRating: 1901, blackRating: 1902, timeControl: '5+2', variant: 'standard', rated: false }
      ]
    });
    section.renderGameList();
    section.beginGameSelection(section.catalog.gameMap['101'], { requestObservation: false });
    section.renderStyle12({
      liveGame: {
        currentFen: new Chess().fen(), gameNumber: 101,
        whiteName: 'Alpha White', blackName: 'Alpha Black',
        whiteClock: 900, blackClock: 900, sideToMove: 'w', observedGame: true, status: 'observing'
      },
      moveHistory: []
    });
    await section.boardView.whenIdle();
    const root = document.querySelector('#spectatorBoard > *');

    section.watchGame('101');
    const generationA = section.selectionGeneration;
    section.watchGame('202');
    const generationB = section.selectionGeneration;
    const afterSelection = {
      selected: section.selectedGame.gameId,
      result: document.querySelector('[data-spectator-detail="result"] strong')?.textContent.trim(),
      status: document.querySelector('[data-spectator-detail="status"] .caissa-ui-badge')?.textContent.trim(),
      players: document.querySelector('[data-spectator-detail="players"] strong')?.textContent.trim(),
      header: document.querySelector('#spectatorGameStatus')?.textContent.trim(),
      fen: section.lastRenderedFen
    };

    const gameA = new Chess();
    gameA.move('e4');
    section.renderStyle12({
      selectionGeneration: generationA,
      liveGame: {
        currentFen: gameA.fen(), gameNumber: 101, whiteName: 'Alpha White', blackName: 'Alpha Black',
        whiteClock: 899, blackClock: 900, sideToMove: 'b', observedGame: true, result: '1-0'
      },
      moveHistory: [{ moveNumber: 1, color: 'white', san: 'e4' }]
    });
    const afterStaleA = {
      selected: section.selectedGame.gameId,
      fen: section.lastRenderedFen,
      players: document.querySelector('[data-spectator-detail="players"] strong')?.textContent.trim(),
      header: document.querySelector('#spectatorGameStatus')?.textContent.trim()
    };

    section.handleObservationSettled({ gameNumber: '101' });
    const gameB = new Chess();
    gameB.move('d4');
    section.renderStyle12({
      selectionGeneration: generationB,
      liveGame: {
        currentFen: gameB.fen(), gameNumber: 202,
        whiteName: 'Beta White With A Long Accessible Name',
        blackName: 'Beta Black With A Long Accessible Name',
        whiteClock: 111, blackClock: 222, sideToMove: 'b', observedGame: true, status: 'observing'
      },
      moveHistory: [{ moveNumber: 1, color: 'white', san: 'd4' }]
    });
    await section.boardView.whenIdle();
    section.renderGameEnded({
      selectionGeneration: generationA,
      result: '1-0',
      liveGame: { gameNumber: 101, status: 'ended', result: '1-0' },
      moveHistory: []
    });

    const details = Object.fromEntries(Array.from(document.querySelectorAll('[data-spectator-detail]'), cell => [
      cell.dataset.spectatorDetail,
      cell.querySelector('strong, .caissa-ui-badge')?.textContent.trim() || ''
    ]));
    const liveSnapshot = {
      details,
      header: document.querySelector('#spectatorGameStatus').textContent.trim(),
      topPlayer: document.querySelector('#spectatorTopPlayer .spectator-player-name').textContent.trim(),
      bottomPlayer: document.querySelector('#spectatorBottomPlayer .spectator-player-name').textContent.trim(),
      clocks: Array.from(document.querySelectorAll('.spectator-player-clock'), element => element.textContent.trim())
    };
    section.renderGameEnded({
      selectionGeneration: generationB,
      result: '0-1',
      liveGame: {
        gameNumber: 202, status: 'ended', result: '0-1',
        whiteName: 'Beta White With A Long Accessible Name',
        blackName: 'Beta Black With A Long Accessible Name'
      },
      moveHistory: [{ moveNumber: 1, color: 'white', san: 'd4' }]
    });
    const finishedSnapshot = {
      status: document.querySelector('[data-spectator-detail="status"] .caissa-ui-badge').textContent.trim(),
      result: document.querySelector('[data-spectator-detail="result"] strong').textContent.trim(),
      header: document.querySelector('#spectatorGameStatus').textContent.trim(),
      foot: document.querySelector('.spectator-workspace-foot').textContent.replace(/\s+/g, ' ').trim()
    };
    return {
      calls,
      generationA,
      generationB,
      afterSelection,
      afterStaleA,
      selected: section.selectedGame.gameId,
      liveSnapshot,
      finishedSnapshot,
      visibleClockCount: Array.from(document.querySelectorAll('.spectator-player-clock')).filter(element => element.getBoundingClientRect().width > 0).length,
      duplicateClockRows: document.querySelectorAll('.spectator-clock-row, .spectator-player-card__clock').length,
      duplicateClockSummary: /White\s+(?:\d{1,2}:\d{2}|--:--)\s*\|\s*Black\s+(?:\d{1,2}:\d{2}|--:--)/i
        .test(document.querySelector('.spectator-board-panel').innerText),
      sameRoot: root === document.querySelector('#spectatorBoard > *'),
      roots: document.querySelectorAll('#spectatorBoard > *').length,
      renderer: section.boardView.getSnapshot().renderer,
      foot: document.querySelector('.spectator-workspace-foot').textContent.replace(/\s+/g, ' ').trim()
    };
  });

  expect(result.generationB).toBeGreaterThan(result.generationA);
  expect(result.afterSelection).toMatchObject({
    selected: '202', result: '—', status: 'Loading',
    players: 'Beta White With A Long Accessible Name vs Beta Black With A Long Accessible Name',
    header: 'Game #202 - Loading', fen: null
  });
  expect(result.afterStaleA).toMatchObject({
    selected: '202', fen: null,
    players: 'Beta White With A Long Accessible Name vs Beta Black With A Long Accessible Name',
    header: 'Game #202 - Loading'
  });
  expect(result.calls).toEqual(['101', '202', '202']);
  expect(result.selected).toBe('202');
  expect(result.liveSnapshot.details.game).toBe('202');
  expect(result.liveSnapshot.details.players).toContain('Beta White With A Long Accessible Name vs Beta Black With A Long Accessible Name');
  expect(result.liveSnapshot.details['time-control']).toBe('5+2');
  expect(result.liveSnapshot.details.status).toBe('Live');
  expect(result.liveSnapshot.details.result).toBe('—');
  expect(result.liveSnapshot.header).toBe('Game #202 - Black to move');
  expect(result.liveSnapshot.topPlayer).toContain('Beta Black With A Long Accessible Name');
  expect(result.liveSnapshot.bottomPlayer).toContain('Beta White With A Long Accessible Name');
  expect(result.liveSnapshot.clocks).toEqual(['3:42', '1:51']);
  expect(result.finishedSnapshot).toMatchObject({
    status: 'Finished', result: '0-1', header: 'Game #202 - Finished'
  });
  expect(result.finishedSnapshot.foot).toContain('Connected · FICS');
  expect(result.finishedSnapshot.foot).not.toContain('Game Finished');
  expect(result.visibleClockCount).toBe(2);
  expect(result.duplicateClockRows).toBe(0);
  expect(result.duplicateClockSummary).toBe(false);
  expect(result.sameRoot).toBe(true);
  expect(result.roots).toBe(1);
  expect(result.renderer).toBe('persistent');
  expect(result.foot).toContain('Connected · FICS');
  expect(result.foot).not.toContain('Game Finished');
});

test('compact details and simplified FOOT adapt across desktop and mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/spectator-tv');
  await page.evaluate(() => {
    const section = window.CaissaSpectatorTVSection;
    const client = window.CaissaFICSClient;
    client.authenticated = true;
    client.connected = true;
    client.connectionState = 'connected';
    client.refreshLobby = () => { window.__spectatorRefreshCalls = (window.__spectatorRefreshCalls || 0) + 1; };
    section.state = window.CaissaSpectatorTV.createInitialState({ status: window.CaissaSpectatorTV.STATES.LOADING_GAMES });
    section.catalog = window.CaissaSpectatorTVCatalog.createCatalog({
      games: [{ gameId: '303', whitePlayer: 'A Very Long White Player Name', blackPlayer: 'A Very Long Black Player Name', whiteRating: 2001, blackRating: 2002, timeControl: '3+0', variant: 'standard', rated: true }]
    });
    section.beginGameSelection(section.catalog.gameMap['303'], { requestObservation: false });
  });

  for (const profile of [{ width: 1366, height: 768, columns: 2 }, { width: 390, height: 844, columns: 1 }, { width: 844, height: 390, columns: 2 }]) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    const layout = await page.evaluate(() => {
      const grid = document.querySelector('#spectatorLiveContext');
      const rows = Array.from(grid.querySelectorAll('.spectator-context-row'));
      const body = document.querySelector('.spectator-workspace-body');
      const players = document.querySelector('[data-spectator-detail="players"] strong');
      const cells = Array.from(grid.querySelectorAll('.spectator-context-cell'));
      return {
        rowColumns: rows.map(row => getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length),
        rowCellCounts: rows.map(row => row.querySelectorAll('.spectator-context-cell').length),
        borderedCells: cells.filter(cell => parseFloat(getComputedStyle(cell).borderTopWidth) > 0).length,
        gridOverflow: grid.scrollWidth > grid.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
        bodyOverflowY: getComputedStyle(body).overflowY,
        playerTitle: players.getAttribute('title'),
        playerText: players.textContent.trim()
      };
    });
    expect(layout.rowColumns, JSON.stringify(profile)).toEqual(Array(6).fill(profile.columns));
    expect(layout.rowCellCounts, JSON.stringify(profile)).toEqual(Array(6).fill(2));
    expect(layout.borderedCells, JSON.stringify(profile)).toBe(12);
    expect(layout.gridOverflow, JSON.stringify(profile)).toBe(false);
    expect(layout.pageOverflow, JSON.stringify(profile)).toBe(false);
    expect(layout.bodyOverflowY, JSON.stringify(profile)).toBe('auto');
    expect(layout.playerTitle, JSON.stringify(profile)).toBe(layout.playerText);
  }

  const foot = page.locator('.spectator-workspace-foot');
  await expect(foot.getByRole('button', { name: /Refresh/i })).toHaveCount(0);
  await expect(foot.getByRole('button', { name: /Watch featured/i })).toHaveCount(0);
  await expect(page.locator('#spectatorBoardRefreshBtn')).toBeVisible();
  await expect(page.locator('.spectator-game-watch')).toHaveCount(1);

  await page.locator('#spectatorWorkspaceBackBtn').click();
  await expect(page.locator('#spectatorChannelsView')).toBeVisible();
  await page.locator('#spectatorBoardRefreshBtn').click();
  await expect.poll(() => page.evaluate(() => window.__spectatorRefreshCalls || 0)).toBe(1);
  await expect(foot.getByRole('button', { name: 'Back to Server' })).toBeVisible();
  await page.locator('#spectatorWorkspaceBackBtn').click();
  await expect(page.locator('#spectatorServerView')).toBeVisible();
  await expect(foot.getByRole('button', { name: /Connect & continue/i })).toBeVisible();
  expect(await page.evaluate(() => window.CaissaFICSClient.authenticated)).toBe(true);
});

test('Exit table unobserves once, clears the watch authority, and rejects late events', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/spectator-tv?hotfix=001b');

  await page.evaluate(async () => {
    const section = window.CaissaSpectatorTVSection;
    const client = window.CaissaFICSClient;
    client.authenticated = true;
    client.connected = true;
    client.connectionState = 'connected';
    client.ws = { id: 'existing-fics-socket' };
    window.__spectatorSocket = client.ws;
    window.__spectatorWire = [];
    client.send = command => {
      window.__spectatorWire.push(command);
      return { ok: true, code: 'COMMAND_SENT' };
    };
    client.refreshLobby = () => {};
    client.activeTables = [{
      number: '404', white: 'Exit White', black: 'Exit Black',
      whiteRating: 1801, blackRating: 1802, timeControl: '5+2',
      variant: 'standard', rated: true, observers: 4,
      label: '404 W: 1801 B: 1802 Exit White vs Exit Black'
    }];
    section.state = window.CaissaSpectatorTV.createInitialState({
      status: window.CaissaSpectatorTV.STATES.LOADING_GAMES
    });
    section.catalog = window.CaissaSpectatorTVCatalog.createCatalog({
      games: [{
        gameId: '404', whitePlayer: 'Exit White', blackPlayer: 'Exit Black',
        whiteRating: 1801, blackRating: 1802, timeControl: '5+2', variant: 'standard', rated: true
      }]
    });
    section.catalogLoadCompleted = true;
    section.beginGameSelection(section.catalog.gameMap['404'], { requestObservation: false });
    client.liveGame = {
      ...client.liveGame, currentFen: new Chess().fen(), gameNumber: 404,
      whiteName: 'Exit White', blackName: 'Exit Black', whiteClock: 299, blackClock: 298,
      sideToMove: 'w', observedGame: true, gameActive: false, status: 'observing'
    };
    section.renderStyle12({ liveGame: { ...client.liveGame }, moveHistory: [] });
    await section.boardView.whenIdle();
    window.__spectatorRoot = document.querySelector('#spectatorBoard > *');
    window.__spectatorGeneration = section.selectionGeneration;
  });

  await expect(page.locator('#spectatorWorkspaceBackBtn')).toHaveText(/Exit table/);
  await page.locator('#spectatorWorkspaceBackBtn').click();
  await expect(page.locator('#spectatorChannelsView')).toBeVisible();
  await expect(page.locator('#spectatorWorkspaceBackBtn')).toHaveText(/Back/);

  const afterExit = await page.evaluate(() => {
    const section = window.CaissaSpectatorTVSection;
    const staleGame = new Chess();
    staleGame.move('e4');
    section.renderStyle12({
      selectionGeneration: window.__spectatorGeneration,
      liveGame: {
        currentFen: staleGame.fen(), gameNumber: 404,
        whiteName: 'Exit White', blackName: 'Exit Black', whiteClock: 295, blackClock: 298,
        sideToMove: 'b', observedGame: true, status: 'observing'
      },
      moveHistory: [{ moveNumber: 1, color: 'white', san: 'e4' }]
    });
    section.renderGameEnded({
      selectionGeneration: window.__spectatorGeneration,
      result: '1-0', liveGame: { gameNumber: 404, status: 'ended', result: '1-0' }
    });
    const watchButton = document.querySelector('.spectator-game-watch');
    return {
      wire: window.__spectatorWire.slice(),
      tab: section.activeWorkspaceTab,
      selectedGame: section.selectedGame,
      observedId: section.state.currentObservedGameId,
      lastRenderedFen: section.lastRenderedFen,
      queuedGameId: section.queuedGameId,
      generationAdvanced: section.selectionGeneration > window.__spectatorGeneration,
      watchingRows: document.querySelectorAll('.spectator-game-row.is-current').length,
      watchText: watchButton?.textContent.trim(),
      watchDisabled: watchButton?.disabled,
      authenticated: window.CaissaFICSClient.authenticated,
      sameSocket: window.CaissaFICSClient.ws === window.__spectatorSocket,
      sameRoot: window.__spectatorRoot === document.querySelector('#spectatorBoard > *'),
      foot: document.querySelector('.spectator-workspace-foot').textContent.replace(/\s+/g, ' ').trim()
    };
  });

  expect(afterExit).toMatchObject({
    wire: ['unobserve 404'], tab: 'channels', selectedGame: null, observedId: null,
    lastRenderedFen: null, queuedGameId: null, generationAdvanced: true,
    watchingRows: 0, watchText: 'Watch', watchDisabled: false,
    authenticated: true, sameSocket: true, sameRoot: true
  });
  expect(afterExit.foot).toContain('Connected · FICS');
  expect(afterExit.foot).toContain('Back');
  expect(afterExit.foot).not.toMatch(/Game Finished|Refresh|Watch featured/);

  const reopenObservedGame = async () => page.evaluate(async () => {
    const section = window.CaissaSpectatorTVSection;
    const client = window.CaissaFICSClient;
    section.beginGameSelection(section.catalog.gameMap['404'], { requestObservation: false });
    client.liveGame = {
      ...client.liveGame, currentFen: new Chess().fen(), gameNumber: 404,
      whiteName: 'Exit White', blackName: 'Exit Black', whiteClock: 299, blackClock: 298,
      sideToMove: 'w', observedGame: true, gameActive: false, status: 'observing'
    };
    section.renderStyle12({ liveGame: { ...client.liveGame }, moveHistory: [] });
    await section.boardView.whenIdle();
  });

  await reopenObservedGame();
  await page.getByRole('tab', { name: /2 Channels/ }).click();
  await expect(page.locator('#spectatorChannelsView')).toBeVisible();
  await reopenObservedGame();
  await page.getByRole('tab', { name: /1 Server/ }).click();
  await expect(page.locator('#spectatorServerView')).toBeVisible();
  expect(await page.evaluate(() => window.__spectatorWire)).toEqual([
    'unobserve 404', 'unobserve 404', 'unobserve 404'
  ]);
  expect(await page.evaluate(() => window.CaissaFICSClient.ws === window.__spectatorSocket)).toBe(true);
});
