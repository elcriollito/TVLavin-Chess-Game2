import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();
const LANDSCAPE_VIEWPORTS = Object.freeze([
    { width: 844, height: 390 },
    { width: 852, height: 393 },
    { width: 932, height: 430 }
]);
const TWENTY_MOVES = Object.freeze([
    'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7',
    'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7'
]);

function observedSnapshot(overrides = {}) {
    return {
        fen: START_FEN,
        gameNumber: 616,
        whiteName: 'A_Very_Long_White_Player_Handle_For_Layout',
        blackName: 'A_Very_Long_Black_Player_Handle_For_Layout',
        relation: 0,
        userColor: null,
        sideToMove: 'w',
        lastMove: 'none',
        lastMoveVerbose: 'none',
        moveNumber: 1,
        whiteClock: 600,
        blackClock: 600,
        initialTime: 10,
        increment: 0,
        observedGame: true,
        ...overrides
    };
}

async function openFics(page, viewport) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
        window.CAISSA_FICS_PERSISTENT_BOARD_PILOT = true;
    });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true
        && document.querySelectorAll('#ficsBoardContainer .piece-417db').length === 32);
}

async function beginObserve(page, overrides = {}) {
    await page.evaluate(value => {
        const client = window.CaissaFICSClient;
        Object.assign(client, { connected: true, authenticated: true, connectionState: 'connected' });
        client.handleStyle12(value);
    }, observedSnapshot(overrides));
    await page.evaluate(() => window.CaissaFICSClient.waitForBoardRendererIdle());
    await expect(page.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
}

function observedLine(sans, gameNumber = 616) {
    const game = new Chess();
    return sans.map((san, index) => {
        const move = game.move(san);
        if (!move) throw new Error(`Invalid BOARD-006C fixture move: ${san}`);
        return observedSnapshot({
            fen: game.fen(),
            gameNumber,
            sideToMove: game.turn(),
            lastMove: move.san,
            lastMoveVerbose: {
                from: move.from,
                to: move.to,
                flags: move.flags,
                captured: move.captured || null,
                promotion: move.promotion || null
            },
            moveNumber: Number(game.fen().split(' ')[5]),
            whiteClock: 600 - index,
            blackClock: 600 - index
        });
    });
}

async function playStates(page, states) {
    await page.evaluate(async values => {
        for (const value of values) window.CaissaFICSClient.handleStyle12(value);
        await window.CaissaFICSClient.waitForBoardRendererIdle();
    }, states);
}

async function measureLayout(page) {
    return page.evaluate(() => {
        const capture = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                right: rect.right,
                bottom: rect.bottom,
                clientWidth: node.clientWidth,
                clientHeight: node.clientHeight,
                scrollWidth: node.scrollWidth,
                scrollHeight: node.scrollHeight,
                display: style.display,
                position: style.position,
                overflow: style.overflow,
                overflowX: style.overflowX,
                overflowY: style.overflowY,
                minWidth: style.minWidth,
                maxWidth: style.maxWidth,
                minHeight: style.minHeight,
                maxHeight: style.maxHeight,
                widthStyle: style.width,
                heightStyle: style.height,
                flex: style.flex,
                gridTemplateColumns: style.gridTemplateColumns,
                gridTemplateRows: style.gridTemplateRows,
                whiteSpace: style.whiteSpace,
                textOverflow: style.textOverflow,
                aspectRatio: style.aspectRatio
            };
        };
        return {
            visualViewport: window.visualViewport ? {
                width: window.visualViewport.width,
                height: window.visualViewport.height,
                offsetLeft: window.visualViewport.offsetLeft,
                offsetTop: window.visualViewport.offsetTop,
                scale: window.visualViewport.scale
            } : null,
            document: {
                clientWidth: document.documentElement.clientWidth,
                clientHeight: document.documentElement.clientHeight,
                scrollWidth: document.documentElement.scrollWidth,
                scrollHeight: document.documentElement.scrollHeight,
                bodyScrollWidth: document.body.scrollWidth,
                bodyScrollHeight: document.body.scrollHeight,
                scrollX,
                scrollY
            },
            state: {
                product: document.querySelector('#ficsSection')?.dataset.ficsProductState || null,
                body: document.querySelector('.fics-rd2-workspace-body')?.dataset.ficsBodyMode || null,
                selected: document.querySelector('.fics-rd2-workspace-body')?.dataset.ficsSelectedView || null,
                resizeCount: window.CaissaFICSShell.getSnapshot().boardResizeCount
            },
            app: capture('.app-container'),
            header: capture('.header-minimal'),
            nav: capture('.main-navigation'),
            content: capture('.content-area'),
            layout: capture('#ficsSection .fics-layout'),
            shell: capture('.fics-rd2-shell'),
            boardColumn: capture('.fics-rd2-board'),
            boardShell: capture('.fics-live-board-shell'),
            topBar: capture('#ficsTopPlayerBar'),
            board: capture('#ficsBoardContainer'),
            bottomBar: capture('#ficsBottomPlayerBar'),
            workspace: capture('.fics-rd2-workspace'),
            workspaceHead: capture('.fics-rd2-workspace-head'),
            tabs: capture('.fics-rd2-tabs'),
            workspaceBody: capture('.fics-rd2-workspace-body'),
            dynamicBody: capture('.fics-rd3-dynamic-body'),
            game: capture('.fics-rd4-game'),
            workspaceFoot: capture('.fics-rd2-workspace-foot'),
            sessionChrome: capture('.fics-rd7-session-chrome'),
            topName: capture('#ficsTopPlayerBar .fics-player-name'),
            bottomName: capture('#ficsBottomPlayerBar .fics-player-name')
        };
    });
}

function expectViewportContained(measurement, viewport) {
    expect(measurement.visualViewport.width).toBe(viewport.width);
    expect(measurement.visualViewport.height).toBe(viewport.height);
    expect(measurement.document.scrollWidth).toBe(viewport.width);
    expect(measurement.document.scrollHeight).toBe(viewport.height);
    expect(measurement.document.scrollX).toBe(0);
    expect(measurement.document.scrollY).toBe(0);
    expect(measurement.board.width).toBeGreaterThanOrEqual(320);
    expect(Math.abs(measurement.board.width - measurement.board.height)).toBeLessThanOrEqual(1);
    expect(measurement.board.bottom).toBeLessThanOrEqual(viewport.height);
    expect(measurement.workspace.right).toBeLessThanOrEqual(viewport.width);
    expect(measurement.workspace.bottom).toBeLessThanOrEqual(viewport.height);
}

function expectSameRect(actual, expected, keys = ['x', 'y', 'width', 'height']) {
    for (const key of keys) expect(Math.abs(actual[key] - expected[key])).toBeLessThanOrEqual(1);
}

for (const viewport of LANDSCAPE_VIEWPORTS) {
    test(`Lobby, Observe, Tables and Game share one landscape contract at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        await openFics(page, viewport);
        const lobby = await measureLayout(page);
        await beginObserve(page);
        const observing = await measureLayout(page);
        await page.getByRole('tab', { name: 'Tables' }).click();
        const tables = await measureLayout(page);
        await page.getByRole('tab', { name: 'Game' }).click();
        const game = await measureLayout(page);

        for (const measurement of [lobby, observing, tables, game]) {
            expectViewportContained(measurement, viewport);
            expect(measurement.topBar.height).toBe(28);
            expect(measurement.bottomBar.height).toBe(28);
            expect(measurement.workspace.overflow).toBe('hidden');
            expect(measurement.workspaceBody.minHeight).toBe('0px');
            expect(measurement.topName.whiteSpace).toBe('nowrap');
            expect(measurement.bottomName.whiteSpace).toBe('nowrap');
        }
        for (const measurement of [observing, tables, game]) {
            expectSameRect(measurement.shell, lobby.shell);
            expectSameRect(measurement.boardColumn, lobby.boardColumn);
            expectSameRect(measurement.boardShell, lobby.boardShell);
            expectSameRect(measurement.board, lobby.board);
            expectSameRect(measurement.workspace, lobby.workspace);
            expect(measurement.state.resizeCount).toBe(lobby.state.resizeCount);
        }
        expect(observing.tabs.height).toBe(lobby.tabs.height);
        expect(tables.tabs.height).toBe(lobby.tabs.height);
        expect(game.tabs.height).toBe(lobby.tabs.height);
        expect(observing.topName.scrollWidth).toBeGreaterThan(observing.topName.clientWidth);
        expect(observing.bottomName.scrollWidth).toBeGreaterThan(observing.bottomName.clientWidth);
        expect(observing.topName.textOverflow).toBe('ellipsis');
        expect(observing.bottomName.textOverflow).toBe('ellipsis');

        await playStates(page, observedLine(TWENTY_MOVES));
        const overflow = await page.locator('.fics-rd4-move-scroll').evaluate(node => ({
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
            overflowY: getComputedStyle(node).overflowY,
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight
        }));
        expect(overflow.overflowY).toBe('auto');
        expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
        expect(overflow.documentWidth).toBe(viewport.width);
        expect(overflow.documentHeight).toBe(viewport.height);

        if (viewport.width === 844) {
            console.log(`[BOARD-006C DELTA ${testInfo.project.name}]`, JSON.stringify({
                lobby: {
                    visualViewport: lobby.visualViewport,
                    document: lobby.document,
                    shell: lobby.shell,
                    boardColumn: lobby.boardColumn,
                    board: lobby.board,
                    bars: [lobby.topBar.height, lobby.bottomBar.height],
                    workspace: lobby.workspace,
                    head: lobby.workspaceHead,
                    tabs: lobby.tabs,
                    foot: lobby.workspaceFoot
                },
                observeMinusLobby: {
                    shellWidth: observing.shell.width - lobby.shell.width,
                    boardColumnWidth: observing.boardColumn.width - lobby.boardColumn.width,
                    boardWidth: observing.board.width - lobby.board.width,
                    boardHeight: observing.board.height - lobby.board.height,
                    topBarHeight: observing.topBar.height - lobby.topBar.height,
                    bottomBarHeight: observing.bottomBar.height - lobby.bottomBar.height,
                    workspaceWidth: observing.workspace.width - lobby.workspace.width,
                    workspaceHeight: observing.workspace.height - lobby.workspace.height,
                    tabsHeight: observing.tabs.height - lobby.tabs.height,
                    footHeight: observing.workspaceFoot.height - lobby.workspaceFoot.height,
                    resizeCount: observing.state.resizeCount - lobby.state.resizeCount
                }
            }));
        }
    });
}

test('physical-like Mobile Safari context preserves the landscape contract', async ({ browser, browserName }) => {
    test.skip(browserName === 'chromium', 'WebKit is the authoritative Mobile Safari approximation for this diagnostic.');
    const viewport = LANDSCAPE_VIEWPORTS[0];
    const context = await browser.newContext({
        viewport,
        screen: viewport,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
    });
    const page = await context.newPage();
    await openFics(page, viewport);
    const lobby = await measureLayout(page);
    await beginObserve(page);
    const observing = await measureLayout(page);
    expectViewportContained(lobby, viewport);
    expectViewportContained(observing, viewport);
    expectSameRect(observing.board, lobby.board);
    expectSameRect(observing.workspace, lobby.workspace);
    expect(observing.state.resizeCount).toBe(lobby.state.resizeCount);
    await context.close();
});

test('Classic palette and overlay tokens are identical on legacy and persistent surfaces', async ({ page }, testInfo) => {
    await openFics(page, LANDSCAPE_VIEWPORTS[0]);
    const legacy = await page.evaluate(() => ({
        light: getComputedStyle(document.querySelector('#ficsBoardContainer .white-1e1d7')).backgroundColor,
        dark: getComputedStyle(document.querySelector('#ficsBoardContainer .black-3c85d')).backgroundColor
    }));
    const legacyPath = testInfo.outputPath('classic-legacy-landscape.png');
    await page.locator('#ficsBoardContainer').screenshot({ path: legacyPath });

    await beginObserve(page, { lastMove: 'e4', lastMoveVerbose: { from: 'e2', to: 'e4', flags: 'b' } });
    await page.evaluate(() => {
        document.querySelector('.caissa-board__highlight[data-square="e2"]')
            .classList.add('caissa-board__highlight--selected');
        document.querySelector('.caissa-board__highlight[data-square="e4"]')
            .classList.add('caissa-board__highlight--last');
        document.querySelector('.caissa-board__highlight[data-square="c3"]')
            .classList.add('caissa-board__highlight--hint');
    });
    const persistent = await page.evaluate(() => {
        const root = document.querySelector('.caissa-board');
        return {
            light: getComputedStyle(document.querySelector('.caissa-board__square--light')).backgroundColor,
            dark: getComputedStyle(document.querySelector('.caissa-board__square--dark')).backgroundColor,
            coordinate: getComputedStyle(document.querySelector('.caissa-board__coordinate')).color,
            selected: getComputedStyle(document.querySelector('.caissa-board__highlight--selected')).borderTopColor,
            lastMove: getComputedStyle(document.querySelector('.caissa-board__highlight--last')).backgroundColor,
            hint: getComputedStyle(document.querySelector('.caissa-board__highlight--hint')).borderTopColor,
            tokens: {
                light: getComputedStyle(root).getPropertyValue('--caissa-board-light').trim(),
                dark: getComputedStyle(root).getPropertyValue('--caissa-board-dark').trim(),
                coordinates: getComputedStyle(root).getPropertyValue('--caissa-board-coordinates').trim(),
                selected: getComputedStyle(root).getPropertyValue('--caissa-board-selected').trim(),
                lastMove: getComputedStyle(root).getPropertyValue('--caissa-board-last-move').trim()
            }
        };
    });
    const persistentPath = testInfo.outputPath('classic-persistent-landscape.png');
    await page.locator('#ficsBoardContainer').screenshot({ path: persistentPath });

    expect(legacy).toEqual({ light: 'rgb(240, 217, 181)', dark: 'rgb(181, 136, 99)' });
    expect(persistent.light).toBe(legacy.light);
    expect(persistent.dark).toBe(legacy.dark);
    expect(persistent.coordinate).toBe('rgba(20, 24, 30, 0.72)');
    expect(persistent.selected).toBe('rgb(246, 201, 69)');
    expect(persistent.lastMove).toBe('rgba(246, 201, 69, 0.38)');
    expect(persistent.hint).toBe('rgba(60, 125, 231, 0.55)');
    console.log(`[BOARD-006C CLASSIC COLORS ${testInfo.project.name}]`, JSON.stringify({ legacy, persistent }));
    await testInfo.attach('legacy CAISSA Classic board', { path: legacyPath, contentType: 'image/png' });
    await testInfo.attach('persistent CAISSA Classic board', { path: persistentPath, contentType: 'image/png' });
});

test('portrait-landscape-observe-leave rotation preserves roots, pieces and resize accounting', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const portrait = { width: 390, height: 844 };
    const landscape = LANDSCAPE_VIEWPORTS[0];
    await openFics(page, portrait);
    const portraitLobby = await measureLayout(page);

    await page.setViewportSize(landscape);
    await page.waitForTimeout(250);
    const landscapeLobby = await measureLayout(page);
    const lobbyShot = testInfo.outputPath('01-landscape-lobby.png');
    await page.screenshot({ path: lobbyShot });

    await beginObserve(page);
    await page.evaluate(() => {
        window.__board006cRoot = document.querySelector('.caissa-board');
        window.__board006cSquares = [...document.querySelectorAll('.caissa-board__square')];
        window.__board006cPieces = [...document.querySelectorAll('.caissa-board__piece')];
    });
    const landscapeGame = await measureLayout(page);
    expectSameRect(landscapeGame.board, landscapeLobby.board);
    expect(landscapeGame.state.resizeCount).toBe(landscapeLobby.state.resizeCount);

    await page.getByRole('tab', { name: 'Tables' }).click();
    const observingShot = testInfo.outputPath('02-landscape-observing.png');
    await page.screenshot({ path: observingShot });
    await page.getByRole('tab', { name: 'Game' }).click();
    const gameShot = testInfo.outputPath('03-landscape-game-tab.png');
    await page.screenshot({ path: gameShot });

    await page.setViewportSize(portrait);
    await page.waitForTimeout(250);
    const portraitGame = await measureLayout(page);
    const portraitShot = testInfo.outputPath('04-portrait-observing.png');
    await page.screenshot({ path: portraitShot });
    expect(Math.abs(portraitGame.board.width - portraitGame.board.height)).toBeLessThanOrEqual(1);
    expect(portraitGame.document.scrollWidth).toBe(portrait.width);
    expect(portraitGame.state.resizeCount).toBe(landscapeGame.state.resizeCount + 1);

    await page.setViewportSize(landscape);
    await page.waitForTimeout(250);
    const landscapeRestored = await measureLayout(page);
    const restoredShot = testInfo.outputPath('05-landscape-observing-restored.png');
    await page.screenshot({ path: restoredShot });
    expectSameRect(landscapeRestored.board, landscapeGame.board);
    expect(landscapeRestored.state.resizeCount).toBe(portraitGame.state.resizeCount + 1);
    expect(await page.evaluate(() => ({
        root: window.__board006cRoot === document.querySelector('.caissa-board'),
        squares: window.__board006cSquares.every((node, index) =>
            node === document.querySelectorAll('.caissa-board__square')[index]),
        pieces: window.__board006cPieces.every((node, index) =>
            node === document.querySelectorAll('.caissa-board__piece')[index]),
        transition: getComputedStyle(document.querySelector('.caissa-board__piece')).transitionDuration
    }))).toEqual({ root: true, squares: true, pieces: true, transition: '0s' });

    expect(await page.evaluate(() => {
        window.CaissaFICSClient.send = () => ({ ok: true, code: 'COMMAND_SENT' });
        return window.CaissaFICSClient.leaveObservedGame();
    })).toMatchObject({ ok: true });
    await page.waitForFunction(() => window.CaissaFICSClient.getBoardRendererSnapshot().renderer === 'legacy');
    await page.setViewportSize(portrait);
    await page.waitForTimeout(250);
    const portraitLobbyRestored = await measureLayout(page);
    await page.setViewportSize(landscape);
    await page.waitForTimeout(250);
    const landscapeLobbyRestored = await measureLayout(page);
    expectSameRect(landscapeLobbyRestored.board, landscapeLobby.board);
    expect(portraitLobbyRestored.document.scrollWidth).toBe(portrait.width);
    expect(landscapeLobbyRestored.document.scrollWidth).toBe(landscape.width);
    expect(Math.abs(portraitLobby.board.width - portraitLobby.board.height)).toBeLessThanOrEqual(1);

    const axe = await new AxeBuilder({ page }).include('#ficsSection').analyze();
    expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
    for (const [name, path] of [
        ['landscape lobby', lobbyShot],
        ['landscape observing', observingShot],
        ['landscape Game tab', gameShot],
        ['portrait observing', portraitShot],
        ['landscape observing restored', restoredShot]
    ]) await testInfo.attach(name, { path, contentType: 'image/png' });
});
