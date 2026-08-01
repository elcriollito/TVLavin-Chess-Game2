import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

test('Players remains disabled and honest in the QA shell', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const tab = page.locator('[data-shell-mode="players"]');
    await expect(tab).toHaveCount(0);
    await expect(page.locator('[data-players-panel]')).toHaveCount(0);
    expect(await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().playersPanel)).toBeNull();
});

test('Players route cannot be activated by query, storage, history, or configuration', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa-play-mode', 'players');
        sessionStorage.setItem('caissa-play-provider', 'fics');
        window.__CAISSA_PLAY_CONFIG__ = { mode: 'players', provider: 'fics', fallback: 'fics' };
    });
    await page.goto('/play/players?simplified=1&provider=fics&fallback=fics');
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    await expect(page.locator('[data-shell-mode="games"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-shell-mode="players"]')).toHaveCount(0);
    expect(await page.evaluate(() => ({
        panel: !!window.CaissaPlayersPanel,
        group: window.CaissaPlayLoadRegistry.get('players-stack'),
        mode: window.CaissaPlayRouteController.getCurrent().mode
    }))).toEqual({ panel: false, group: null, mode: 'games' });
});

test('Players isolation preserves one board, one worker, and active game ownership', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    const before = await page.evaluate(() => {
        window.__playersBlockedOwnership = {
            board: window.App.board, game: window.App.game, worker: window.App.engine?.worker || null
        };
        return { workers: window.__caissaPlayHarness.snapshot().workersCreated };
    });
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/players?simplified=1'));
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    const after = await page.evaluate(() => ({
        sameBoard: window.App.board === window.__playersBlockedOwnership.board,
        sameGame: window.App.game === window.__playersBlockedOwnership.game,
        sameWorker: (window.App.engine?.worker || null) === window.__playersBlockedOwnership.worker,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length
    }));
    expect(after.sameBoard).toBe(true);
    expect(after.sameGame).toBe(true);
    expect(after.sameWorker).toBe(true);
    expect(after.workers).toBe(before.workers);
    expect(after.boards).toBe(1);
});

test('legacy FICS and Classic remain separately reachable outside Play v2', async ({ page }) => {
    await page.goto('/?section=fics');
    await expect(page.locator('#ficsSection')).toHaveClass(/active/);
    await expect(page.locator('#ficsConnectionStatus')).toBeVisible();
    await page.goto('/yahoo-classic');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await expect(page.locator('#ycClassicLoginStatus')).toBeVisible();
});
