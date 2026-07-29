import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
    await page.goto('/play/players?simplified=1');
    await expect(page.locator('[data-players-panel]')).toBeVisible();
});

test('QA route opens Players in the shared shell with five truthful sections', async ({ page }) => {
    await expect(page.locator('[data-shell-mode="players"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-players-section]')).toHaveCount(5);
    await expect(page.locator('[data-players-panel-section]')).toHaveCount(5);
    await expect(page.locator('[data-players-panel-section="availablePlayers"]')).toContainText('Open the real FICS lobby');
    await expect(page.locator('[data-players-panel-section="friendsOnline"]')).toContainText('Friends are coming later');
    await expect(page.locator('[data-players-panel-section="challenges"]')).toContainText('No CAISSA challenge service');
    await expect(page.locator('[data-players-panel-section="recentOpponents"]')).toContainText('No human game history');
    await expect(page.locator('[data-players-panel-section="suggestedPlayers"]')).toContainText('Suggestions need real presence');
    await expect(page.locator('[data-player-id], [data-player-row]')).toHaveCount(0);
});

test('Players viewing preserves the board, worker, lifecycle, FairPlay, and active game state', async ({ page }) => {
    const before = await page.evaluate(() => {
        window.__playersIsolation = {
            board: window.App?.board,
            game: window.App?.game,
            worker: window.App?.engine?.worker || null
        };
        return {
        gameFen: window.App?.game?.fen?.(),
        gameActive: window.App?.gameActive,
        lifecycle: window.App?.gameLifecycle?.getSnapshot?.() || null,
        fairPlay: window.CaissaFairPlayPolicy?.inspect?.() || null,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        players: window.CaissaPlayersPanel && window.CaissaSimplifiedPlayShellInstance
            .getSnapshot().playersPanel
        };
    });
    await page.locator('[data-shell-mode="games"]').click();
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    await page.locator('[data-shell-mode="players"]').click();
    await expect(page).toHaveURL(/\/play\/players\?simplified=1/);
    const after = await page.evaluate(() => ({
        sameBoard: window.App?.board === window.__playersIsolation.board,
        sameGame: window.App?.game === window.__playersIsolation.game,
        gameFen: window.App?.game?.fen?.(),
        gameActive: window.App?.gameActive,
        sameWorker: (window.App?.engine?.worker || null) === window.__playersIsolation.worker,
        lifecycle: window.App?.gameLifecycle?.getSnapshot?.() || null,
        fairPlay: window.CaissaFairPlayPolicy?.inspect?.() || null,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        resources: window.CaissaSimplifiedPlayShellInstance.getSnapshot().playersPanel.diagnostics
    }));
    expect(after.sameBoard).toBe(true);
    expect(after.sameGame).toBe(true);
    expect(after.sameWorker).toBe(true);
    expect(after.gameFen).toBe(before.gameFen);
    expect(after.gameActive).toBe(before.gameActive);
    expect(after.lifecycle).toEqual(before.lifecycle);
    expect(after.fairPlay).toEqual(before.fairPlay);
    expect(after.boards).toBe(1);
    expect(after.resources.socketCount).toBe(0);
    expect(after.resources.workerCount).toBe(0);
    expect(after.resources.storageWrites).toBe(0);
    expect(after.resources.humanGamesStarted).toBe(0);
});

test('FICS and Classic actions enter their existing independently owned flows', async ({ page }) => {
    await page.locator('[data-players-action="open-fics"]').first().click();
    await expect(page.locator('#ficsSection')).toHaveClass(/active/);
    await expect(page.locator('#ficsConnectionStatus')).toContainText(/Not connected|Disconnected/);
    await page.goBack();
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    await page.locator('[data-players-action="open-classic"]').first().click();
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await expect(page.locator('#ycClassicLoginStatus')).toBeVisible();
});

test('non-QA Players route remains inactive and canonicalizes to Games', async ({ page }) => {
    await page.goto('/play/players');
    await expect(page).toHaveURL(/\/play\/games$/);
    await expect(page.locator('[data-players-panel]')).toBeHidden();
    await expect(page.locator('[data-shell-mode="players"]')).toHaveCount(1);
});

test('Back and Forward restore Players without recreating the board', async ({ page }) => {
    await page.evaluate(() => {
        window.__playersBoardNode = document.querySelector('#playSection #chessboard .board-b72b1');
    });
    await page.locator('[data-shell-mode="games"]').click();
    await page.goBack();
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    expect(await page.evaluate(() =>
        document.querySelector('#playSection #chessboard .board-b72b1') === window.__playersBoardNode
    )).toBe(true);
    await page.goForward();
    await expect(page.locator('[data-shell-mode="games"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toHaveCount(1);
});

test('mobile layout keeps every section and action reachable with no serious accessibility violations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tabs = page.locator('[data-players-section]');
    for (let index = 0; index < await tabs.count(); index += 1) {
        await tabs.nth(index).click();
        const id = await tabs.nth(index).getAttribute('data-players-section');
        await expect(page.locator(`[data-players-panel-section="${id}"]`)).toBeVisible();
    }
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(page.locator('[data-players-panel-section="availablePlayers"]')).toBeVisible();
    for (const action of await page.locator('.caissa-players-panel__footer [data-players-action]').all()) {
        const box = await action.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const results = await new AxeBuilder({ page })
        .include('[data-players-panel]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
