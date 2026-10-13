import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    const harness = {
        config: {
            protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
            capabilities: { matchmaking: true, rated: true, tournaments: true, multiboard: true }, realtime: null
        },
        state: { profile: { display_name: 'Alex' }, ticket: null, game: null, recentGames: [], players: [], challenges: [] },
        stateReads: 0,
        emptyPlayersAfterRead: null,
        challengeCreates: 0,
        moveCommands: 0,
        moveDelayMs: 0,
        nextStateSnapshots: []
    };
    harnesses.set(page, harness);
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'user_white',fullName:'Alex',email:'alex@example.com',getToken:async()=> 'browser-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: harness.config });
        }
        let responseState = harness.state;
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            if (command.eventType === 'queue.join') harness.state = { ...harness.state, game: activeGame(), recentGames: [activeGame()] };
            if (command.eventType === 'game.move') {
                harness.moveCommands += 1;
                const nextState = { ...harness.state, game: { ...harness.state.game, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
                    moves: [{ ply: 1, from: 'e2', to: 'e4', san: 'e4', color: 'white' }], ply: 1, turn: 'black', version: 2,
                    clock_started_at: new Date().toISOString() } };
                if (harness.moveDelayMs) await new Promise(resolve => setTimeout(resolve, harness.moveDelayMs));
                harness.state = nextState;
            }
            if (command.eventType === 'game.resign') {
                const completed = completedGame(harness.state.game);
                harness.state = { ...harness.state, game: null, recentGames: [completed] };
                responseState = { ...harness.state, game: completed };
            } else {
                responseState = harness.state;
            }
            if (command.eventType === 'challenge.create') harness.challengeCreates += 1;
            if (command.eventType === 'challenge.accept' || command.eventType === 'challenge.decline') {
                harness.state = { ...harness.state, challenges: harness.state.challenges.filter(item => item.id !== command.payload.challengeId) };
                responseState = harness.state;
            }
        } else {
            harness.stateReads += 1;
            if (harness.emptyPlayersAfterRead && harness.stateReads >= harness.emptyPlayersAfterRead) {
                harness.state = { ...harness.state, players: [] };
            }
            responseState = harness.nextStateSnapshots.length ? harness.nextStateSnapshots.shift() : harness.state;
        }
        return route.fulfill({ json: { protocolVersion: '1.0.0', eventType: 'game.snapshot', serverTimestamp: new Date().toISOString(), data: { state: responseState } } });
    });
});

test('signed-in player finds a match and receives a canonical move acknowledgement', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await page.goto('/online');
    await expect(page.getByRole('heading', { name: 'Online Chess' })).toBeVisible();
    await expect(page.locator('#connection-label')).toHaveText('Connected');
    await expect(page.locator('#online-board .caissa-board__piece')).toHaveCount(32);
    const lobbyBoardBox = await page.locator('#board-shell').boundingBox();
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    await expect(page.locator('#curtain-title')).toBeHidden();
    await expect(page.locator('#turn-copy')).toHaveText('Your turn');
    await expect(page.locator('.game-status-line')).toHaveCount(0);
    await expect(page.locator('#player-top .player-name')).toHaveText('Rival');
    const liveBoardBox = await page.locator('#board-shell').boundingBox();
    expect(Math.abs(liveBoardBox.width - lobbyBoardBox.width)).toBeLessThan(1);
    expect(Math.abs(liveBoardBox.height - lobbyBoardBox.height)).toBeLessThan(1);
    await page.locator('.caissa-board__square[data-square="e2"]').click();
    await page.locator('.caissa-board__square[data-square="e4"]').click();
    await expect(page.locator('#move-list')).toContainText('e4');
    await expect(page.locator('#turn-copy')).toContainText('to move');
    expect(browserErrors).toEqual([]);
    if (process.env.CAISSA_CAPTURE_ONLINE_SCREENSHOT === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/caissa-online-live-desktop.png', fullPage: true });
    }
});

test('board-first shell remains usable at phone width and has no serious axe findings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');
    await expect(page.locator('#online-board')).toBeVisible();
    await expect(page.locator('.online-header').getByRole('heading', { name: 'Online Chess' })).toBeVisible();
    await expect(page.locator('.online-header .brand')).toBeVisible();
    await expect(page.locator('.online-header #account-link')).toBeVisible();
    await expect(page.locator('.mobile-navigation')).toBeVisible();
    await page.locator('.mobile-navigation summary').click();
    await expect(page.getByRole('navigation', { name: 'Mobile primary navigation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mobile primary navigation' }).getByRole('link', { name: 'Puzzles' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Players' })).toBeVisible();
    const layout = await page.evaluate(() => ({
        domNodes: document.getElementsByTagName('*').length,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(layout.domNodes).toBeLessThan(500);
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    if (process.env.CAISSA_CAPTURE_ONLINE_SCREENSHOT === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/caissa-online-lobby-mobile.png', fullPage: true });
    }
});

test('compact header recovers vertical space and tabs support keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    await expect(page.locator('.online-titlebar')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Online Chess', level: 1 })).toHaveCount(1);
    const geometry = await page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return { y: value.y, width: value.width, height: value.height, bottom: value.bottom };
        };
        return {
            header: rect('.online-header'), layout: rect('.online-layout'), board: rect('#board-shell'),
            panel: rect('.play-workspace'), pageOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight
        };
    });
    expect(geometry.header.height).toBe(68);
    expect(geometry.layout.y).toBeCloseTo(92, 0);
    expect(geometry.board.width).toBeCloseTo(654, 0);
    expect(geometry.board.width).toBe(geometry.board.height);
    expect(Math.abs(geometry.panel.bottom - geometry.layout.bottom)).toBeLessThan(1);
    expect(geometry.pageOverflowY).toBeLessThanOrEqual(0);

    const newGame = page.getByRole('tab', { name: 'New Game' });
    await newGame.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Games', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Games', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Players' })).toBeFocused();
});

test('disabled capabilities read as Casual and unavailable instead of internal contracts', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.config = {
        ...harness.config,
        capabilities: { matchmaking: true, rated: false, tournaments: false, multiboard: false, openGames: false }
    };
    await page.goto('/online');
    await expect(page.locator('#game-mode-label')).toHaveText('Casual');
    await expect(page.locator('#rated-control')).toBeHidden();
    await expect(page.locator('#browse-tournaments')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('Protocol 1.0.0');
    await page.getByRole('tab', { name: 'Games' }).click();
    await page.getByRole('tab', { name: 'Open games' }).click();
    await expect(page.locator('#games-open-unavailable')).toContainText("Open games aren't available yet");
    await expect(page.locator('#games-open-unavailable')).toContainText('Public joinable games are not enabled in this version.');
});

test('isolated Tournament panel uses synthetic demo data and stays below the board on mobile', async ({ page }) => {
    let onlineApiRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/online') onlineApiRequests += 1; });
    await page.goto('/online?demo=tournament');
    await expect(page.getByRole('tab', { name: 'Tournament' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Tournament' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.demo-banner')).toContainText('Visual demo');
    await expect(page.locator('.tournament-standings .is-current-player')).toContainText('Alexander (you)');
    await expect(page.getByRole('button', { name: 'Next game' })).toBeVisible();
    await expect.poll(() => onlineApiRequests).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
        const board = document.querySelector('.board-column').getBoundingClientRect();
        const panel = document.querySelector('.play-workspace').getBoundingClientRect();
        return {
            panelBelowBoard: panel.y >= board.bottom,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    expect(mobile.panelBelowBoard).toBe(true);
    expect(mobile.overflowX).toBeLessThanOrEqual(0);
});

test('board group and workspace share aligned desktop geometry and one scrollable body', async ({ page }) => {
    const desktopCases = [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'short', width: 1440, height: 720 },
        { name: 'zoom-25-on-2560x1440', zoom: 25, width: 10240, height: 5760 },
        { name: 'zoom-33-on-2560x1440', zoom: 33, width: 7758, height: 4364 },
        { name: 'zoom-50-on-2560x1440', zoom: 50, width: 5120, height: 2880 },
        { name: 'zoom-67-on-2560x1440', zoom: 67, width: 3821, height: 2149 },
        { name: 'zoom-80-on-2560x1440', zoom: 80, width: 3200, height: 1800 },
        { name: 'zoom-100-on-2560x1440', zoom: 100, width: 2560, height: 1440 },
        { name: 'zoom-125-on-2560x1440', zoom: 125, width: 2048, height: 1152 }
    ];
    for (const viewport of desktopCases) {
        await page.setViewportSize(viewport);
        await page.goto('/online');
        const geometry = await onlineLayoutGeometry(page);
        expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThan(1);
        expect(geometry.board.width).toBeGreaterThan(geometry.panel.width);
        expect(geometry.gap).toBeGreaterThanOrEqual(24);
        expect(geometry.gap).toBeLessThanOrEqual(32.1);
        expect(geometry.horizontalIntersection).toBe(0);
        expect(geometry.groupLeft).toBeGreaterThanOrEqual(geometry.main.x - 0.5);
        expect(geometry.groupRight).toBeLessThanOrEqual(geometry.main.right + 0.5);
        expect(Math.abs(geometry.groupCenterDelta)).toBeLessThan(1);
        expect(Math.abs(geometry.panel.y - geometry.boardColumn.y)).toBeLessThan(1);
        expect(Math.abs(geometry.panel.bottom - geometry.boardColumn.bottom)).toBeLessThan(1);
        expect(Math.abs(geometry.head.y - geometry.panel.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.foot.bottom - geometry.panel.bottom)).toBeLessThanOrEqual(1);
        expect(geometry.bodyOverflowY).toBe('auto');
        expect(geometry.moveListOverflowY).toBe('visible');
        expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
        if (process.env.CAISSA_CAPTURE_ONLINE_LAYOUT === '1') {
            console.log(`CAISSA_ONLINE_LAYOUT_METRICS ${JSON.stringify({ viewport, geometry })}`);
            const path = `test-results/online-layout-${viewport.name}.png`;
            if (viewport.width <= 2560) await page.screenshot({ path, fullPage: true });
            else await page.locator('.online-main').screenshot({ path });
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');
    const mobile = await onlineLayoutGeometry(page);
    expect(Math.abs(mobile.board.width - mobile.board.height)).toBeLessThan(1);
    expect(Math.abs(mobile.panel.width - mobile.boardColumn.width)).toBeLessThan(1);
    expect(mobile.panel.y - mobile.boardColumn.bottom).toBeGreaterThanOrEqual(13);
    expect(mobile.horizontalOverflow).toBeLessThanOrEqual(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_LAYOUT === '1') {
        console.log(`CAISSA_ONLINE_LAYOUT_METRICS ${JSON.stringify({ viewport: { name: 'mobile', width: 390, height: 844 }, geometry: mobile })}`);
        await page.screenshot({ path: 'test-results/online-layout-mobile.png', fullPage: true });
    }
});

test('completed game actions survive at least three canonical polling cycles', async ({ page }) => {
    const harness = harnesses.get(page);
    await page.goto('/online');
    await expect(page.locator('#connection-label')).toHaveText('Connected');
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    await expect(page.locator('#game-view')).toBeVisible();
    await page.locator('#resign-game').click();
    await page.locator('#confirm-dialog [value="confirm"]').click();
    await expect(page.locator('#result-view')).toBeVisible();

    const firstRead = harness.stateReads;
    for (let cycle = 1; cycle <= 3; cycle += 1) {
        await expect.poll(() => harness.stateReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(firstRead + cycle);
        await expect(page.locator('#result-view')).toBeVisible();
        await expect(page.locator('#game-view')).toBeHidden();
        await expect(page.locator('#turn-copy')).toHaveText('Game over');
        await expect(page.locator('#rematch-game')).toBeVisible();
        await expect(page.locator('#analyze-game')).toBeVisible();
        await expect(page.locator('#download-pgn')).toBeVisible();
        if (process.env.CAISSA_CAPTURE_ONLINE_REVIEW_GATE === '1') {
            await page.locator('#result-view').screenshot({
                path: `docs/visual-evidence/caissa-online-game-over-poll-${cycle}.png`
            });
        }
    }

    await page.locator('#new-opponent').click();
    await expect(page.locator('#lobby-view')).toBeVisible();
    const clearedAtRead = harness.stateReads;
    await expect.poll(() => harness.stateReads, { timeout: 10_000 }).toBeGreaterThan(clearedAtRead);
    await expect(page.locator('#lobby-view')).toBeVisible();
    await expect(page.locator('#result-view')).toBeHidden();
});

test('players snapshot removes stale rows and restores its empty state', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.players = [{
        clerkId: 'user_rival', displayName: 'Rival', status: 'online', rating: 1512, pool: 'blitz'
    }];
    harness.emptyPlayersAfterRead = 2;

    await page.goto('/online');
    await page.getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#players-list .player-row')).toHaveCount(1);
    await expect(page.locator('#players-list')).toContainText('Rival');
    await expect(page.locator('#players-list button', { hasText: 'Challenge' })).toHaveCount(1);
    if (process.env.CAISSA_CAPTURE_ONLINE_REVIEW_GATE === '1') {
        await page.locator('#players-list').screenshot({
            path: 'docs/visual-evidence/caissa-online-players-before-expiry.png'
        });
    }

    await expect.poll(() => harness.stateReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#players-list')).toHaveClass('empty-state');
    await expect(page.locator('#players-list')).toContainText('No players online');
    await expect(page.locator('#players-list .player-row')).toHaveCount(0);
    await expect(page.locator('#players-list button', { hasText: 'Challenge' })).toHaveCount(0);
    expect(harness.challengeCreates).toBe(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_REVIEW_GATE === '1') {
        await page.locator('#players-list').screenshot({
            path: 'docs/visual-evidence/caissa-online-players-after-expiry.png'
        });
    }
});

test('records the online drag, drop and delayed-authority boundaries', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.moveDelayMs = 3500;
    await page.goto('/online');
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    const source = await page.locator('.caissa-board__square[data-square="e2"]').boundingBox();
    const target = await page.locator('.caissa-board__square[data-square="e4"]').boundingBox();
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    await page.evaluate(() => {
        const root = document.querySelector('#online-board .caissa-board');
        const piece = document.querySelector('.caissa-board__piece[data-square="e2"]');
        const probe = window.__caissaDragProbe = {
            pointerMoves: 0, visualWrites: 0, geometryReadsDuringMove: 0,
            cursorToPieceLag: [], frameIntervals: [], longTasks: [],
            lastPointerAt: 0, dragging: false, inPointerMove: false, lastFrameAt: 0, pointerUpAt: 0,
            destinationAt: 0
        };
        const originalRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (...args) {
            if (probe.inPointerMove) probe.geometryReadsDuringMove += 1;
            return originalRect.apply(this, args);
        };
        document.addEventListener('pointermove', () => { probe.inPointerMove = true; }, true);
        document.addEventListener('pointermove', () => { probe.inPointerMove = false; }, false);
        document.addEventListener('pointerup', () => { probe.inPointerMove = false; }, true);
        root.addEventListener('pointermove', () => {
            probe.pointerMoves += 1;
            probe.lastPointerAt = performance.now();
        }, true);
        root.addEventListener('pointerdown', () => {
            probe.dragging = true;
            probe.lastFrameAt = performance.now();
            const frame = now => {
                if (!probe.dragging) return;
                probe.frameIntervals.push(now - probe.lastFrameAt);
                probe.lastFrameAt = now;
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        }, true);
        root.addEventListener('pointerup', () => {
            probe.pointerUpAt = performance.now();
            probe.dragging = false;
        }, true);
        new MutationObserver(records => {
            for (const record of records) {
                if (record.attributeName === 'style' && piece.style.transform) {
                    probe.visualWrites += 1;
                    probe.cursorToPieceLag.push(performance.now() - probe.lastPointerAt);
                }
                if (record.attributeName === 'data-square' && piece.dataset.square === 'e4' && !probe.destinationAt) {
                    probe.destinationAt = performance.now();
                }
            }
        }).observe(piece, { attributes: true, attributeFilter: ['style', 'data-square'] });
        try {
            new PerformanceObserver(list => {
                if (probe.dragging) probe.longTasks.push(...list.getEntries().map(entry => entry.duration));
            }).observe({ type: 'longtask' });
        } catch (_) {}
    });

    await page.mouse.move(source.x + source.width * 0.28, source.y + source.height * 0.72);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width * 0.28, target.y + target.height * 0.72, { steps: 16 });
    await page.mouse.up();
    await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
    await page.waitForTimeout(2800);
    const revertedDuringCommit = await page.locator('.caissa-board__piece[data-square="e2"]').count() === 1;
    await expect(page.locator('#move-list')).toContainText('e4', { timeout: 4000 });
    const metrics = await page.evaluate(() => {
        const probe = window.__caissaDragProbe;
        const sortedLag = [...probe.cursorToPieceLag].sort((a, b) => a - b);
        const sortedFrames = [...probe.frameIntervals].filter(value => value > 0).sort((a, b) => a - b);
        const percentile = (items, p) => items.length ? items[Math.min(items.length - 1, Math.floor(items.length * p))] : 0;
        const resource = performance.getEntriesByType('resource')
            .filter(entry => entry.name.includes('/api/online'))
            .sort((a, b) => b.duration - a.duration)[0];
        return {
            pointerEvents: probe.pointerMoves,
            visualWrites: probe.visualWrites,
            geometryReadsDuringMove: probe.geometryReadsDuringMove,
            cursorLagP50Ms: percentile(sortedLag, 0.5),
            cursorLagP95Ms: percentile(sortedLag, 0.95),
            frameP50Ms: percentile(sortedFrames, 0.5),
            frameP95Ms: percentile(sortedFrames, 0.95),
            dropPresentationMs: probe.destinationAt - probe.pointerUpAt,
            httpDurationMs: resource?.duration || 0,
            longTasks: probe.longTasks.length
        };
    });
    console.log(`CAISSA_ONLINE_DRAG_METRICS ${JSON.stringify({ ...metrics, revertedDuringCommit })}`);
    expect(revertedDuringCommit).toBe(false);
    expect(metrics.visualWrites).toBeLessThanOrEqual(metrics.pointerEvents);
    expect(metrics.geometryReadsDuringMove).toBe(0);
    expect(metrics.dropPresentationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.dropPresentationMs).toBeLessThan(50);
    expect(metrics.httpDurationMs).toBeGreaterThan(3000);
    expect(metrics.longTasks).toBe(0);
    expect(harness.moveCommands).toBe(1);
});

test('a stale snapshot after commit cannot rewind the board or re-enable input', async ({ page }) => {
    const harness = harnesses.get(page);
    await page.goto('/online');
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    await page.locator('.caissa-board__square[data-square="e2"]').click();
    await page.locator('.caissa-board__square[data-square="e4"]').click();
    await expect(page.locator('#move-list')).toContainText('e4');
    const readsBeforeStale = harness.stateReads;
    harness.nextStateSnapshots.push({
        ...harness.state,
        game: activeGame(),
        recentGames: [activeGame()]
    });
    await expect.poll(() => harness.stateReads, { timeout: 6000 }).toBeGreaterThan(readsBeforeStale);
    await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
    await expect(page.locator('.caissa-board__piece[data-square="e2"]')).toHaveCount(0);
    await expect(page.locator('#move-list')).toContainText('e4');
    await expect(page.locator('#online-board .caissa-board')).toHaveAttribute('aria-disabled', 'true');
    expect(harness.moveCommands).toBe(1);
});

test('incoming invitation stays visible across tabs, is deduplicated by id, and disappears on response', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.challenges = [challengeFixture({ direction: 'incoming' })];
    await page.goto('/online');
    await expect(page.locator('#challenge-notice')).toBeVisible();
    await expect(page.locator('#challenge-notice-title')).toContainText('Rival');
    await expect(page.locator('#challenge-notice-control')).toContainText('3+2');
    await page.evaluate(() => { window.__challengeNoticeNode = document.getElementById('challenge-notice'); });
    for (const tab of ['Games', 'Players', 'New Game']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.locator('#challenge-notice')).toBeVisible();
    }
    const firstRead = harness.stateReads;
    await expect.poll(() => harness.stateReads, { timeout: 6000 }).toBeGreaterThan(firstRead);
    expect(await page.evaluate(() => window.__challengeNoticeNode === document.getElementById('challenge-notice'))).toBe(true);
    await page.locator('#challenge-notice-decline').click();
    await expect(page.locator('#challenge-notice')).toBeHidden();
    expect(harness.state.challenges).toEqual([]);
    const readsAfterResponse = harness.stateReads;
    harness.nextStateSnapshots.push({ ...harness.state, challenges: [challengeFixture({ direction: 'incoming' })] });
    await expect.poll(() => harness.stateReads, { timeout: 6000 }).toBeGreaterThan(readsAfterResponse);
    await expect(page.locator('#challenge-notice')).toBeHidden();
});

test('invitation notice expires locally without waiting for another poll', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.challenges = [challengeFixture({ expiresAt: new Date(Date.now() + 1500).toISOString() })];
    await page.goto('/online');
    await expect(page.locator('#challenge-notice')).toBeVisible();
    await expect(page.locator('#challenge-notice')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#challenges-list .challenge-row')).toHaveCount(0);
});

test('outgoing invitation shows waiting, blocks duplicates, and null ratings render as Casual', async ({ page }) => {
    const harness = harnesses.get(page);
    const completed = completedGame();
    harness.state = {
        ...harness.state,
        recentGames: [completed],
        players: [{ clerkId: 'user_black', displayName: 'Rival', status: 'online', rating: null, pool: 'blitz' }],
        challenges: [challengeFixture({ direction: 'outgoing' })]
    };
    await page.goto('/online');
    await expect(page.locator('#challenge-notice-title')).toHaveText('Waiting for Rival');
    await expect(page.locator('#challenge-notice-actions')).toBeHidden();
    await page.getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#players-list')).toContainText('Casual · Blitz');
    await expect(page.locator('#players-list')).not.toContainText('null');
    await expect(page.locator('#players-list button')).toHaveText('Waiting');
    await expect(page.locator('#players-list button')).toBeDisabled();
    expect(harness.challengeCreates).toBe(0);
    await page.getByRole('tab', { name: 'Games' }).click();
    await page.locator('#games-list .game-row').click();
    await expect(page.locator('#result-view')).toBeVisible();
    await expect(page.locator('#rematch-game')).toHaveText('Waiting for rematch');
    await expect(page.locator('#rematch-game')).toBeDisabled();
    if (process.env.CAISSA_CAPTURE_ONLINE_FEEDBACK === '1') {
        await page.screenshot({ path: 'test-results/online-feedback-rematch-desktop.png', fullPage: true });
    }
});

test('Games separates private history from unsupported public open games', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.recentGames = [completedGame()];
    await page.goto('/online');
    await page.getByRole('tab', { name: 'Games' }).click();
    await expect(page.locator('[data-games-view="history"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#games-list .game-row')).toContainText('Alex');
    await page.getByRole('tab', { name: 'Open games' }).click();
    await expect(page.locator('#games-open')).toBeVisible();
    await expect(page.locator('#games-open')).toContainText("Open games aren't available yet");
    await expect(page.locator('#games-history')).toBeHidden();
});

test('custom Minutes and Increment fields align on desktop and narrow mobile', async ({ page }) => {
    await page.goto('/online');
    await page.locator('[data-control="custom"]').click();
    await expect(page.locator('#custom-clock label').nth(0)).toContainText('Minutes');
    await expect(page.locator('#custom-clock label').nth(1)).toContainText('Increment (seconds)');
    await expect(page.locator('#custom-clock')).not.toContainText(/^seconds$/);
    const desktop = await customClockGeometry(page);
    expect(Math.abs(desktop.minutes.width - desktop.increment.width)).toBeLessThan(1);
    expect(Math.abs(desktop.minutes.height - desktop.increment.height)).toBeLessThan(1);
    expect(Math.abs(desktop.minutes.y - desktop.increment.y)).toBeLessThan(1);
    if (process.env.CAISSA_CAPTURE_ONLINE_FEEDBACK === '1') {
        await page.screenshot({ path: 'test-results/online-feedback-custom-desktop.png', fullPage: true });
    }
    await page.setViewportSize({ width: 340, height: 760 });
    const mobile = await customClockGeometry(page);
    expect(Math.abs(mobile.minutes.width - mobile.increment.width)).toBeLessThan(1);
    expect(Math.abs(mobile.minutes.height - mobile.increment.height)).toBeLessThan(1);
    expect(mobile.increment.y).toBeGreaterThan(mobile.minutes.y + mobile.minutes.height);
    if (process.env.CAISSA_CAPTURE_ONLINE_FEEDBACK === '1') {
        await page.screenshot({ path: 'test-results/online-feedback-custom-mobile.png', fullPage: true });
    }
});

async function customClockGeometry(page) {
    return page.evaluate(() => {
        const rect = id => {
            const value = document.getElementById(id).getBoundingClientRect();
            return { x: value.x, y: value.y, width: value.width, height: value.height };
        };
        return { minutes: rect('custom-minutes'), increment: rect('custom-increment') };
    });
}

async function onlineLayoutGeometry(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return {
                x: value.x,
                y: value.y,
                width: value.width,
                height: value.height,
                right: value.right,
                bottom: value.bottom
            };
        };
        const boardColumn = rect('.board-column');
        const panel = rect('.play-workspace');
        const main = rect('.online-main');
        const groupLeft = Math.min(boardColumn.x, panel.x);
        const groupRight = Math.max(boardColumn.right, panel.right);
        return {
            main,
            boardColumn,
            board: rect('#board-shell'),
            panel,
            head: rect('.workspace-head'),
            foot: rect('.workspace-foot'),
            gap: panel.x - boardColumn.right,
            groupLeft,
            groupRight,
            groupCenterDelta: ((groupLeft + groupRight) / 2) - ((main.x + main.right) / 2),
            horizontalIntersection: Math.max(
                0,
                Math.min(boardColumn.right, panel.right) - Math.max(boardColumn.x, panel.x)
            ),
            bodyOverflowY: getComputedStyle(document.querySelector('.workspace-body')).overflowY,
            moveListOverflowY: getComputedStyle(document.querySelector('.move-list')).overflowY,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

function challengeFixture(overrides = {}) {
    return {
        id: '22222222-2222-4222-8222-222222222222', direction: 'incoming',
        otherClerkId: 'user_black', otherDisplayName: 'Rival', pool: 'blitz',
        baseMs: 180000, incrementMs: 2000, rated: false, state: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides
    };
}

function activeGame() {
    return {
        id: '11111111-1111-4111-8111-111111111111', protocol_version: '1.0.0', status: 'active',
        pool: 'blitz', rated: true, base_ms: 180000, increment_ms: 2000,
        white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        white_display_name: 'Alex', black_display_name: 'Rival', initial_fen: START_FEN, fen: START_FEN,
        moves: [], pgn: '', ply: 0, turn: 'white', version: 1,
        white_time_ms: 180000, black_time_ms: 180000,
        white_rating_before: 1500, black_rating_before: 1512,
        clock_started_at: new Date(Date.now() + 5000).toISOString(), created_at: new Date().toISOString()
    };
}

function completedGame(source = activeGame()) {
    return {
        ...source,
        status: 'completed', result: '0-1', termination: 'resignation', version: Number(source?.version || 1) + 1,
        pgn: '[Event "CAISSA Online"]\n[Result "0-1"]\n\n0-1', clock_started_at: null,
        white_rating_after: 1480, white_rating_delta: -20,
        black_rating_after: 1532, black_rating_delta: 20,
        completed_at: new Date().toISOString()
    };
}
