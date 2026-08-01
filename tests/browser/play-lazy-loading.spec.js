import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test('Games boots first without deferred Play groups and preserves board/worker identity', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    const proof = await page.evaluate(() => ({
        board: window.App.boardAdapter.getSnapshot().adapterId,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        games: !!window.CaissaSimplifiedPlayShellInstance?.getSnapshot?.().gamesPanel,
        bots: !!window.CaissaBotsPanel, coach: !!window.CaissaCoachPanel,
        players: !!window.CaissaPlayersPanel,
        mentor: !!window.CaissaMentorFoundation,
        analyze: !!window.AnalyzeSection,
        lazyNodes: document.querySelectorAll('[data-caissa-lazy-resource]').length,
        loader: window.CaissaPlayLazyLoader.inspect()
    }));
    expect(proof).toMatchObject({
        workers: 1, games: true, bots: false, coach: false, players: false,
        mentor: false, analyze: false, lazyNodes: 0
    });
    expect(proof.loader.resources.filter(x => x.state === 'loaded')).toHaveLength(0);
});

test('PostGame excludes Mentor and loads Analyze through its independent route group', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => {
        window.CaissaPlayCompatibility.execute('submitMove', { from: 'e2', to: 'e4' });
        window.confirm = () => true; window.resignGame();
    });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-action="mentor-review"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.CaissaPlayLoadRegistry.definitions().map(item => item.resourceId)))
        .toEqual(['bots-stack', 'analyze-deep']);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPlayLazyLoader.getState('analyze-deep')?.state)).toBe('loaded');
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);
});

test('mode groups load once, stale completion cannot replace route, and active resources remain stable', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    const before = await page.evaluate(() => ({
        board: window.App.boardAdapter.getSnapshot().adapterId,
        engine: window.App.engine,
        game: window.App.game
    }));
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/bots?simplified=1'));
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/coach?simplified=1'));
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/players?simplified=1'));
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    const proof = await page.evaluate(before => ({
        boardSame: window.App.boardAdapter.getSnapshot().adapterId === before.board,
        workerCount: window.__caissaPlayHarness.snapshot().workersCreated,
        gameSame: window.App.game === window.App.game,
        scripts: [...document.querySelectorAll('script[data-caissa-lazy-resource]')].map(x => x.src),
        states: Object.fromEntries(window.CaissaPlayLazyLoader.inspect().resources.map(x => [x.resourceId, x.state]))
    }), { board: before.board });
    expect(proof.boardSame).toBe(true);
    expect(proof.workerCount).toBe(1);
    expect(new Set(proof.scripts).size).toBe(proof.scripts.length);
    expect(proof.states).toMatchObject({ 'bots-stack': 'loaded' });
    expect(proof.states['coach-stack']).toBeUndefined();
    expect(proof.states['players-stack']).toBeUndefined();
});

test('save-data prefetch is suppressed and Classic/Legacy remain outside loader activation', async ({ page }) => {
    await page.goto('/');
    const proof = await page.evaluate(async () => ({
        section: document.querySelector('.content-section.active')?.id,
        prefetch: await window.CaissaPlayLazyLoader.prefetch('bots-stack', { qa: true, saveData: true, intent: 'idle' }),
        lazyNodes: document.querySelectorAll('[data-caissa-lazy-resource]').length,
        playersBlocked: window.CaissaPlayRouteController.parse('/play/players').mode
    }));
    expect(proof.prefetch.status).toBe('suppressed');
    expect(proof.lazyNodes).toBe(0);
    expect(proof.playersBlocked).toBe('games');
});
