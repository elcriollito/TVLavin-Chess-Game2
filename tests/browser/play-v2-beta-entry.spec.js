import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

test('authorized internal beta supports canonical Games, Bots, history, refresh, and one board', async ({ page }) => {
    await page.goto('/play/beta');
    await expect(page).toHaveTitle(/CAISSA/i);
    await expect(page.locator('[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Play Game' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Play Bots' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Play Coach' })).toBeVisible();
    for (const blocked of ['Mentor', 'Players']) await expect(page.getByRole('tab', { name: blocked })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Play Bots' }).click();
    await expect(page).toHaveURL(/\/play\/beta\/bots$/);
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.reload();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/play\/beta$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/play\/beta\/bots$/);
});

test('query, fragment, and storage cannot admit prohibited modes or external resources', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('playV2Beta', 'public-beta');
        sessionStorage.setItem('playMode', 'players');
    });
    await page.goto('/play/beta/games?token=internal&mode=players&provider=fics#mentor');
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    expect(urls.filter(url => /fics-client|fics-style|academy|coach-stack|mentor-(?!review-boundary)|guided[-_/]?replay|knowledge|training[-_/]?memory|mastery|players-stack/i.test(url)
        && !/play-v2-fics-isolation\.js/i.test(url))).toEqual([]);
    await expect(page.getByRole('tab', { name: /Mentor|Players/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.evaluate(() => history.replaceState({ legacy: true }, '', '/play/beta/games?legacy=1#openAnalyze'));
    const legacyAttempt = await page.evaluate(() => window.CaissaAnalyzeHandoff.createFromLegacyActivePlay({
        query: 'legacy', fragment: 'openAnalyze', storage: true, mode: 'analysis', retry: true
    }));
    expect(legacyAttempt).toMatchObject({ ok: false, reasonCode: 'LEGACY_ACTIVE_CONTEXT_REQUIRED' });
    const completedAttempt = await page.evaluate(() => window.CaissaAnalyzeHandoff
        .createFromCompletedPlayRecord(window.CaissaGameRecord.buildFromPlay()));
    expect(completedAttempt).toMatchObject({ ok: false, reasonCode: 'INCOMPLETE_GAME_RECORD' });
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
});

test('prohibited and malformed beta descendants fail closed without Play runtime', async ({ page }) => {
    for (const path of ['/play/beta/mentor', '/play/beta/players', '/play/beta/unknown', '/play/beta//bots', '/play/beta/%62ots']) {
        await page.goto(path);
        await expect(page).toHaveTitle(/Play Beta Unavailable/);
        await expect(page.getByRole('heading', { name: 'Play beta is unavailable' })).toBeVisible();
        await expect(page.locator('script')).toHaveCount(0);
        await expect(page.locator('#chessboard')).toHaveCount(0);
    }
});

test('production defaults and QA compatibility remain unchanged', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
    await page.goto('/play');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('body[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);
    await page.goto('/yahoo-classic');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
});

test('minimal beta entry is board-first with one clear setup hierarchy at every target viewport', async ({ page }) => {
    const viewports = [
        { name: 'mobile', width: 390, height: 844, stacked: true },
        { name: 'tablet portrait', width: 768, height: 1024, stacked: true },
        { name: 'tablet landscape', width: 1024, height: 768, stacked: false },
        { name: 'desktop', width: 1440, height: 900, stacked: false }
    ];
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto('/play/beta');
        await expect(page.getByRole('heading', { level: 1, name: 'Play' })).toHaveCount(1);
        await expect(page.getByText('Internal preview', { exact: true })).toBeVisible();
        for (const selector of ['#mainNav', '.header-minimal', '#mobileNavToggle'])
            await expect(page.locator(selector)).toBeHidden();
        await expect(page.locator('[data-games-primary]:visible')).toHaveCount(1);
        const geometry = await page.evaluate(() => {
            const box = selector => document.querySelector(selector).getBoundingClientRect();
            const board = box('#chessboard'); const panel = box('.caissa-simplified-shell__context');
            const action = box('[data-games-primary]');
            return {
                boardWidth: board.width, boardLeft: board.left, boardRight: board.right,
                panelTop: panel.top, panelLeft: panel.left,
                actionVisible: action.top >= 0 && action.bottom <= innerHeight,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        expect(geometry.boardWidth, viewport.name).toBeGreaterThanOrEqual(viewport.width <= 390 ? viewport.width * .85 : 500);
        expect(geometry.actionVisible, viewport.name).toBe(true);
        expect(geometry.overflow, viewport.name).toBeLessThanOrEqual(1);
        if (viewport.stacked) expect(geometry.panelTop, viewport.name).toBeGreaterThan(geometry.boardWidth);
        else expect(geometry.panelLeft, viewport.name).toBeGreaterThan(geometry.boardLeft);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/beta');
    await page.keyboard.press('Tab');
    await expect(page.locator('#chessboard')).toBeFocused();
});

test('Games setup exposes only supported time, accessible color, and one Play action', async ({ page }) => {
    await page.goto('/play/beta');
    const shell = page.locator('[data-entry-experience="beta"]');
    await expect(shell.getByRole('tab')).toHaveText(['Play Game', 'Play Bots', 'Play Coach']);
    await expect(shell.getByRole('radio', { name: /^1\+0/ })).toBeChecked();
    await expect(shell.getByRole('radio', { name: 'White', exact: true })).toBeChecked();
    await expect(shell.getByRole('radio', { name: 'Random', exact: true })).not.toBeChecked();
    await expect(shell.getByRole('radio', { name: 'Black', exact: true })).not.toBeChecked();
    await expect(shell.locator('[data-games-time]')).toHaveCount(7);
    await expect(shell).not.toContainText('No limit');
    await shell.getByRole('radio', { name: /^5\+0/ }).check();
    await shell.getByRole('radio', { name: 'Random', exact: true }).check();
    await expect(shell.getByText('5+0 · Random selected.', { exact: true })).toBeVisible();
    await expect(shell.getByRole('button', { name: 'Play', exact: true })).toHaveCount(1);
    await expect(shell).not.toContainText(/QA Preview|Simplified Play|Current Play Controls|runtime connected|fixed maximum-strength/i);

    await shell.getByRole('tab', { name: 'Play Bots' }).click();
    await expect(page).toHaveURL(/\/play\/beta\/bots$/);
    await expect(shell.getByText('Internal preview. Bot play is not yet certified.', { exact: true })).toBeVisible();
    for (const blocked of ['Mentor', 'Players']) await expect(shell.getByRole('tab', { name: blocked })).toHaveCount(0);
});

test('setup starts once, rejects immediate duplicate activation, and focuses the authoritative board', async ({ page }) => {
    await page.goto('/play/beta');
    await page.getByRole('radio', { name: /3\+0/ }).check();
    await page.getByRole('radio', { name: 'Black', exact: true }).check();
    const result = await page.evaluate(() => {
        const panel = window.CaissaSimplifiedPlayShellInstance;
        const first = panel.setPanelContent();
        const games = window.CaissaGamesPanel;
        const action = document.querySelector('[data-games-primary]');
        action.click(); action.click();
        return { first, apiVersion: games.schemaVersion, duplicateBlocked: action.disabled };
    });
    expect(result.apiVersion).toBe('1.4.0');
    expect(result.duplicateBlocked).toBe(true);
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts)).toBe(1);
    await expect(page.locator('#chessboard')).toBeFocused();
    expect(await page.evaluate(() => ({
        boards: document.querySelectorAll('#chessboard .board-b72b1').length,
        color: window.App.playerColor,
        time: window.App.timeControl,
        active: document.body.classList.contains('caissa-play-game-active')
    }))).toEqual({ boards: 1, color: 'black', time: 180, active: true });
});

test('completed-game Analyze stays over Play v2 and returns to the same PostGame', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/beta');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
    const playUrl = page.url();

    await page.locator('[data-post-game-action="analyze"]').click();
    const analyze = page.locator('#analyzeSection');
    await expect(analyze).toHaveClass(/caissa-play-v2-inline-analyze/);
    await expect(analyze).toHaveAttribute('role', 'dialog');
    await expect(analyze).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Back to game result' })).toBeFocused();
    expect(page.url()).toBe(playUrl);
    expect(new URL(page.url()).searchParams.has('handoff')).toBe(false);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame()?.pgn())).toBeTruthy();

    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(analyze).not.toHaveClass(/caissa-play-v2-inline-analyze/);
    await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
    expect(page.url()).toBe(playUrl);
});

test('keyboard Play activation creates one accepted start and one lifecycle', async ({ page }) => {
    await page.goto('/play/beta');
    const before = await page.evaluate(() => window.CaissaGameLifecycle.inspect().counters.sessions);
    const action = page.getByRole('button', { name: 'Play', exact: true });
    await action.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts)).toBe(1);
    expect(await page.evaluate(() => ({
        starts: window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts,
        lifecycleSessions: window.CaissaGameLifecycle.inspect().counters.sessions,
        boards: document.querySelectorAll('#chessboard .board-b72b1').length
    }))).toEqual({ starts: 1, lifecycleSessions: before + 1, boards: 1 });
});

test('failed initialization is honest, preserves setup, and supports one retry path', async ({ page }) => {
    await page.goto('/play/beta');
    await page.getByRole('radio', { name: /10\+0/ }).check();
    await page.getByRole('radio', { name: 'Black', exact: true }).check();
    await page.evaluate(() => { window.__originalNewGame = window.newGame; window.newGame = () => { throw new Error('controlled'); }; });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Play could not be prepared. Retry when ready.', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: /10\+0/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Black', exact: true })).toBeChecked();
    expect(await page.evaluate(() => window.App.gameStarted)).not.toBe(true);
    await page.evaluate(() => { window.newGame = window.__originalNewGame; delete window.__originalNewGame; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('#chessboard')).toBeFocused();
    expect(await page.evaluate(() => window.App.timeControl)).toBe(600);
});

test('beta setup preserves focus visibility, forced colors, reduced motion, and 200 percent reflow', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.goto('/play/beta');
    const random = page.getByRole('radio', { name: 'Random', exact: true });
    await random.focus();
    await expect(random).toBeFocused();
    await page.addStyleTag({ content: 'html { zoom: 2; }' });
    const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        board: document.querySelector('#chessboard').getBoundingClientRect().width,
        action: document.querySelector('[data-games-primary]').getBoundingClientRect().width,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        forced: matchMedia('(forced-colors: active)').matches
    }));
    expect(result.overflow).toBeLessThanOrEqual(1);
    expect(result.board).toBeGreaterThan(0);
    expect(result.action).toBeGreaterThanOrEqual(44);
    expect(result.reduced && result.forced).toBe(true);
});
