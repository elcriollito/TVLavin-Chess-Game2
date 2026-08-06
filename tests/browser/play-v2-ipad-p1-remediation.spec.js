import { test, expect } from '@playwright/test';
import { instrumentPlay, loadPosition, openPlay, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

async function startBlack(page) {
    await openPlay(page, 'play/beta/games');
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page.locator('[data-games-setup-disclosure]')).toBeAttached();
    const disclosure = page.locator('[data-games-setup-disclosure]');
    if (!(await disclosure.evaluate(node => node.open))) await page.locator('[data-games-setup-summary]').click();
    await page.getByRole('radio', { name: 'Black', exact: true }).check();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
}

async function orientationState(page) {
    return page.evaluate(() => ({
        requested: window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.color,
        resolved: window.App.playerColor,
        effective: window.App.board.orientation(),
        adapter: window.App.boardAdapter.getSnapshot().orientation,
        fen: window.App.game.fen(),
        boards: document.querySelectorAll('#chessboard .board-b72b1').length,
        lifecycle: window.CaissaGameLifecycle.getSnapshot(),
        labels: {
            white: document.getElementById('playerWhiteName').textContent,
            black: document.getElementById('playerBlackName').textContent
        },
        edges: {
            topColor: document.querySelector('.caissa-simplified-shell__player--opponent')?.dataset.edgeColor,
            bottomColor: document.querySelector('.caissa-simplified-shell__player--current')?.dataset.edgeColor,
            topLabel: document.querySelector('.caissa-simplified-shell__player--opponent [id^="player"]')?.textContent,
            bottomLabel: document.querySelector('.caissa-simplified-shell__player--current [id^="player"]')?.textContent,
            topClock: document.querySelector('.caissa-simplified-shell__player--opponent [id^="topClock"]')?.id,
            bottomClock: document.querySelector('.caissa-simplified-shell__player--current [id^="topClock"]')?.id
        }
    }));
}

function expectOwnedEdges(state) {
    expect(state.edges.bottomColor).toBe(state.effective);
    expect(state.edges.topColor).toBe(state.effective === 'black' ? 'white' : 'black');
    expect(state.edges.bottomLabel).toBe(state.labels[state.effective]);
    expect(state.edges.topLabel).toBe(state.labels[state.effective === 'black' ? 'white' : 'black']);
    expect(state.edges.bottomClock).toBe(state.effective === 'black' ? 'topClockBlack' : 'topClockWhite');
    expect(state.edges.topClock).toBe(state.effective === 'black' ? 'topClockWhite' : 'topClockBlack');
}

async function resignToPostGame(page) {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-post-game-action="new-game"]')).toBeVisible();
}

test('resolved session color absolutely owns orientation across presets and repeated sessions', async ({ page }) => {
    await openPlay(page, 'play/beta/games');
    await page.setViewportSize({ width: 834, height: 1194 });
    const disclosure = page.locator('[data-games-setup-disclosure]');
    const openSetup = async () => { if (!(await disclosure.evaluate(node => node.open)))
        await page.locator('[data-games-setup-summary]').click(); };
    const start = async (color, preset = 'blitz-5') => {
        await openSetup(); await page.locator(`[data-games-time="${preset}"]`).check();
        await page.locator(`[data-games-color="${color}"]`).check();
        await page.locator('[data-games-primary]').click();
        const state = await orientationState(page);
        expect(state.effective).toBe(state.resolved); expect(state.adapter).toBe(state.resolved);
        expect(state.boards).toBe(1); expectOwnedEdges(state); return state.resolved;
    };
    for (const color of ['white', 'black']) {
        await start(color); await resignToPostGame(page);
        for (let rematch = 0; rematch < 2; rematch += 1) {
            await page.locator('[data-post-game-action="rematch"]').click();
            const state = await orientationState(page);
            expect(state).toMatchObject({ resolved: color, effective: color, adapter: color, boards: 1 });
            expectOwnedEdges(state);
            await resignToPostGame(page);
        }
        await page.locator('[data-post-game-action="new-game"]').click();
        await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(false);
    }
    for (const preset of ['bullet-1', 'bullet-2-1', 'blitz-3', 'blitz-3-2', 'blitz-5', 'rapid-10', 'rapid-15-10']) {
        await start('black', preset); await resignToPostGame(page);
        await page.locator('[data-post-game-action="new-game"]').click();
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const resolved = await start('random'); expect(['white', 'black']).toContain(resolved);
        await resignToPostGame(page); await page.locator('[data-post-game-action="new-game"]').click();
    }
    await start('white');
    await page.evaluate(() => window.flipBoard());
    const flipped = await orientationState(page);
    expect(flipped).toMatchObject({ resolved: 'white', effective: 'black', adapter: 'black' });
    expect(flipped.labels.white).toBe('Player');
    expect(flipped.edges).toMatchObject({ bottomColor: 'black', bottomLabel: flipped.labels.black,
        bottomClock: 'topClockBlack', topColor: 'white', topLabel: 'Player', topClock: 'topClockWhite' });
});

for (const mode of [
    { route: 'games', primary: '[data-games-primary]' },
    { route: 'bots', primary: '[data-bot-primary]' },
    { route: 'coach', primary: '[data-coach-primary]' }
]) test(`${mode.route} owns coherent physical labels and clocks`, async ({ page }) => {
    await openPlay(page, `play/beta/${mode.route}`);
    await page.locator(mode.primary).click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
    const state = await orientationState(page);
    expectOwnedEdges(state);
    expect(state.boards).toBe(1);
});

async function installAnalyzeTrace(page) {
    await page.evaluate(() => {
        const trace = [];
        let sequence = 0;
        const rect = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
                x: box.x, y: box.y, width: box.width, height: box.height,
                right: box.right, bottom: box.bottom, display: style.display,
                visibility: style.visibility, minWidth: style.minWidth,
                minHeight: style.minHeight, maxWidth: style.maxWidth,
                maxHeight: style.maxHeight, aspectRatio: style.aspectRatio,
                gridTemplateColumns: style.gridTemplateColumns,
                flex: style.flex
            };
        };
        const visible = node => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return box.width > 0 && box.height > 0 && style.display !== 'none'
                && style.visibility !== 'hidden';
        };
        const capture = event => {
            const viewport = visualViewport;
            trace.push({ sequence: ++sequence, event, now: performance.now(),
                viewport: { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth,
                    clientHeight: document.documentElement.clientHeight,
                    width: viewport?.width, height: viewport?.height,
                    offsetTop: viewport?.offsetTop, offsetLeft: viewport?.offsetLeft,
                    scale: viewport?.scale },
                orientation: screen.orientation?.type || null,
                visibilityState: document.visibilityState,
                classes: {
                    body: document.body.className,
                    analyze: document.getElementById('analyzeSection')?.className || null
                },
                play: rect('#playSection'), postGame: rect('[data-post-game-panel]'),
                overlay: rect('#analyzeSection'), workspace: rect('#analyzeSection .analyze-workspace'),
                shell: rect('#analyzeSection .analyze-board-zone'),
                host: rect('#analyzeChessboard'), inner: rect('#analyzeChessboard .board-b72b1'),
                close: rect('[data-play-v2-analyze-close]'),
                mountedBoards: document.querySelectorAll('.board-b72b1').length,
                visibleBoards: [...document.querySelectorAll('.board-b72b1')].filter(visible).length,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            });
            if (trace.length > 1200) trace.shift();
        };
        window.__ipadAnalyzeTrace = { trace, capture };
        for (const [target, name] of [[window, 'window'], [visualViewport, 'visualViewport']]) {
            for (const event of target === window ? ['resize', 'orientationchange'] : ['resize', 'scroll'])
                target?.addEventListener(event, () => capture(`${name}:${event}`));
        }
        const mutation = new MutationObserver(() => capture('mutation'));
        mutation.observe(document.getElementById('analyzeSection'), {
            attributes: true, childList: true, subtree: true
        });
        const resize = new ResizeObserver(entries => {
            for (const entry of entries) capture(`resizeObserver:${entry.target.id || entry.target.className}`);
        });
        for (const selector of ['#analyzeSection', '.analyze-workspace', '.analyze-board-zone', '#analyzeChessboard']) {
            const node = document.querySelector(selector); if (node) resize.observe(node);
        }
        const wrapAnalyzeOwner = () => {
            const owner = window.AnalyzeSection;
            if (!owner || owner.__ipadTraceWrapped) return;
            const originalOnEnter = owner.onEnter.bind(owner);
            owner.onEnter = (...args) => {
                capture('onEnter:before');
                const result = originalOnEnter(...args);
                capture('onEnter:after');
                const board = owner.board;
                if (board?.resize && !board.__ipadTraceWrapped) {
                    const originalResize = board.resize.bind(board);
                    board.resize = (...resizeArgs) => {
                        capture('board.resize:before');
                        const resizeResult = originalResize(...resizeArgs);
                        capture('board.resize:after');
                        return resizeResult;
                    };
                    board.__ipadTraceWrapped = true;
                }
                return result;
            };
            owner.__ipadTraceWrapped = true;
            capture('owner:wrapped');
        };
        wrapAnalyzeOwner();
        const ownerProbe = new MutationObserver(wrapAnalyzeOwner);
        ownerProbe.observe(document.head, { childList: true, subtree: true });
        let ownerProbeFrames = 0;
        const probeOwnerOnFrame = () => {
            wrapAnalyzeOwner();
            if (!window.AnalyzeSection && ownerProbeFrames++ < 120) requestAnimationFrame(probeOwnerOnFrame);
        };
        requestAnimationFrame(probeOwnerOnFrame);
        capture('trace:installed');
    });
}

async function finishGame(page) {
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
}

async function analyzeGeometry(page, event) {
    return page.evaluate(label => {
        window.__ipadAnalyzeTrace.capture(label);
        return window.__ipadAnalyzeTrace.trace.at(-1);
    }, event);
}

function assertAnalyzeGeometry(state) {
    expect(state.inner, JSON.stringify(state)).not.toBeNull();
    expect(state.inner.width, JSON.stringify(state)).toBeGreaterThan(0);
    expect(state.inner.height, JSON.stringify(state)).toBeGreaterThan(0);
    expect(state.inner.height / state.inner.width, JSON.stringify(state)).toBeGreaterThan(0.9);
    expect(Math.abs(state.inner.width - state.inner.height), JSON.stringify(state)).toBeLessThanOrEqual(2);
    expect(Math.abs(state.host.width - state.inner.width), JSON.stringify(state)).toBeLessThanOrEqual(2);
    expect(Math.abs(state.host.height - state.inner.height), JSON.stringify(state)).toBeLessThanOrEqual(2);
    expect(state.visibleBoards, JSON.stringify(state)).toBe(1);
    expect(state.overflow, JSON.stringify(state)).toBeLessThanOrEqual(1);
    expect(state.close.right, JSON.stringify(state)).toBeLessThanOrEqual(state.viewport.width + 1);
}

async function frameBarrier(page, label) {
    return page.evaluate(value => new Promise(resolve => requestAnimationFrame(() => {
        window.__ipadAnalyzeTrace.capture(`${value}:frame-1`);
        requestAnimationFrame(() => {
            window.__ipadAnalyzeTrace.capture(`${value}:frame-2`);
            resolve();
        });
    })), label);
}

test('Black Rematch derives orientation from the current resolved session color', async ({ page }) => {
    await startBlack(page);
    expect(await orientationState(page)).toMatchObject({ resolved: 'black', effective: 'black', adapter: 'black' });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="rematch"]').click();
    expect(await orientationState(page)).toMatchObject({ resolved: 'black', effective: 'black', adapter: 'black',
        boards: 1, labels: { white: 'CAISSA', black: 'Player' } });
});

test('Inline Analyze remeasures after a transient portrait visual viewport', async ({ page }) => {
    await openPlay(page, 'play/beta/games');
    await page.setViewportSize({ width: 834, height: 1194 });
    await installAnalyzeTrace(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    assertAnalyzeGeometry(await analyzeGeometry(page, 'open:stable'));
    await page.evaluate(() => {
        window.__ipadAnalyzeTrace.capture('viewport:before-reduce');
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 860 });
        window.visualViewport.dispatchEvent(new Event('resize'));
        window.__ipadAnalyzeTrace.capture('viewport:after-reduce');
    });
    assertAnalyzeGeometry(await analyzeGeometry(page, 'viewport:reduced'));
    await page.evaluate(() => {
        delete window.visualViewport.height;
        window.__ipadAnalyzeTrace.capture('viewport:restored-without-resize');
    });
    await frameBarrier(page, 'viewport:restored');
    const geometry = await analyzeGeometry(page, 'viewport:final');
    console.log('IPAD_ANALYZE_GEOMETRY', JSON.stringify(geometry));
    assertAnalyzeGeometry(geometry);
});

test('Inline Analyze remains square through 20 Back, viewport, scroll, and rotation cycles', async ({ page }) => {
    await openPlay(page, 'play/beta/games');
    await page.setViewportSize({ width: 834, height: 1194 });
    await installAnalyzeTrace(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await finishGame(page);
    const sizes = [{ width: 834, height: 1194 }, { width: 1194, height: 834 }];
    for (let cycle = 0; cycle < 20; cycle += 1) {
        if (cycle === 2) await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        if (cycle === 4) {
            await page.setViewportSize(sizes[1]);
            await page.evaluate(() => dispatchEvent(new Event('orientationchange')));
            await page.setViewportSize(sizes[0]);
            await page.evaluate(() => dispatchEvent(new Event('orientationchange')));
        }
        if (cycle % 4 === 1) await page.evaluate(() => {
            Object.defineProperty(visualViewport, 'height', { configurable: true, value: 540 });
            visualViewport.dispatchEvent(new Event('resize'));
        });
        await page.evaluate(value => window.__ipadAnalyzeTrace.capture(`cycle:${value}:before-click`), cycle);
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
        if (cycle === 6) {
            await page.setViewportSize(sizes[1]);
            await page.evaluate(() => dispatchEvent(new Event('orientationchange')));
            await page.setViewportSize(sizes[0]);
            await page.evaluate(() => dispatchEvent(new Event('orientationchange')));
        }
        if (cycle % 4 === 1) await page.evaluate(() => {
            delete visualViewport.height;
        });
        await frameBarrier(page, `cycle:${cycle}`);
        assertAnalyzeGeometry(await analyzeGeometry(page, `cycle:${cycle}:stable`));
        await page.getByRole('button', { name: 'Back to game result' }).click();
        await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
    }
    const summary = await page.evaluate(() => {
        const invalid = state => state.inner &&
            state.classes.analyze?.split(/\s+/).includes('active') &&
            (state.inner.width <= 0 || state.inner.height <= 0 ||
                state.inner.height / state.inner.width < 0.9 ||
                Math.abs(state.inner.width - state.inner.height) > 2);
        const invalidEvents = window.__ipadAnalyzeTrace.trace.filter(invalid);
        return { events: window.__ipadAnalyzeTrace.trace.length,
            firstTransient: invalidEvents[0] || null,
            badFrames: invalidEvents.filter(state => /frame|stable/.test(state.event)) };
    });
    console.log('IPAD_ANALYZE_20_CYCLE_TRACE', JSON.stringify(summary));
    expect(summary.badFrames).toEqual([]);
});

for (const profile of [
    { name: 'portrait', width: 834, height: 1194 },
    { name: 'landscape', width: 1194, height: 834 },
    { name: 'portrait-reflow-200', width: 834, height: 1194, zoom: true }
]) {
    test(`Inline Analyze representative iPad ${profile.name} geometry`, async ({ page }) => {
        if (profile.zoom) await page.addInitScript(() => {
            document.addEventListener('DOMContentLoaded', () => {
                document.documentElement.style.fontSize = '200%';
            }, { once: true });
        });
        await openPlay(page, 'play/beta/games');
        await page.setViewportSize({ width: profile.width, height: profile.height });
        await installAnalyzeTrace(page);
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await finishGame(page);
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
        await frameBarrier(page, profile.name);
        assertAnalyzeGeometry(await analyzeGeometry(page, `${profile.name}:stable`));
    });
}

for (const mode of [
    { name: 'Bots', route: 'play/beta/bots', start: '[data-bot-primary]' },
    { name: 'Coach', route: 'play/beta/coach', start: '[data-coach-primary]' }
]) {
    test(`Inline Analyze after a completed ${mode.name} game remains contained`, async ({ page }) => {
        await openPlay(page, mode.route);
        await page.setViewportSize({ width: 834, height: 1194 });
        await installAnalyzeTrace(page);
        await page.locator(mode.start).click();
        await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
        await playMove(page, 'e2', 'e4');
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-active-game-action="resign"]').click();
        await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
        await frameBarrier(page, `mode:${mode.name}`);
        assertAnalyzeGeometry(await analyzeGeometry(page, `mode:${mode.name}:stable`));
    });
}

test('Inline Analyze ignores stale geometry callbacks across rapid public Back and reopen cycles', async ({ page }) => {
    await openPlay(page, 'play/beta/games');
    await page.setViewportSize({ width: 834, height: 1194 });
    await installAnalyzeTrace(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await finishGame(page);
    for (let cycle = 0; cycle < 10; cycle += 1) {
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
        await page.getByRole('button', { name: 'Back to game result' }).click();
        await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
    }
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await frameBarrier(page, 'rapid:final');
    assertAnalyzeGeometry(await analyzeGeometry(page, 'rapid:stable'));
    const lateInvalidFrames = await page.evaluate(() => window.__ipadAnalyzeTrace.trace.filter(state =>
        /rapid:.*frame|rapid:stable/.test(state.event) && state.inner &&
        (state.inner.width <= 0 || state.inner.height <= 0 ||
            Math.abs(state.inner.width - state.inner.height) > 2)));
    expect(lateInvalidFrames).toEqual([]);
});

test('Inline Analyze remains contained after Back, mode change, new game, and PostGame', async ({ page }) => {
    await openPlay(page, 'play/beta/games');
    await page.setViewportSize({ width: 834, height: 1194 });
    await installAnalyzeTrace(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await finishGame(page);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await page.getByRole('tab', { name: 'Play Bots' }).click();
    await page.locator('[data-bot-primary]').click();
    await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await frameBarrier(page, 'mode-change:final');
    assertAnalyzeGeometry(await analyzeGeometry(page, 'mode-change:stable'));
});

test('Coach help status is isolated when the shell changes to Games', async ({ page }) => {
    await page.goto('/play/beta/coach');
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.locator('[data-coach-primary]').click();
    const help = page.locator('[data-active-game-action="coach-help"]');
    await help.click(); await help.click();
    await expect(page.locator('[data-active-game-status]')).toContainText(/cooling down|unavailable/i);
    await page.getByRole('tab', { name: 'Play Game' }).click();
    await expect(page.getByRole('tab', { name: 'Play Game' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-active-game-status]')).toHaveText('');
    await expect(page.locator('[data-active-game-action="coach-help"]')).toBeHidden();
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeHidden();
});
