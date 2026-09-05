import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function openCoach(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/coach');
    await expect(page).toHaveURL(/\/play\/coach$/);
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('canonical Coach route exposes one permanent Head Body Foot shell', async ({ page }) => {
    await openCoach(page);
    const shell = page.locator('[data-caissa-coach-shell]');
    await expect(shell).toHaveCount(1);
    await expect(shell.locator(':scope > [data-caissa-coach-head]')).toHaveCount(1);
    await expect(shell.locator(':scope > [data-caissa-coach-body]')).toHaveCount(1);
    await expect(shell.locator(':scope > [data-caissa-coach-foot]')).toHaveCount(1);
    await expect(shell.getByAltText('Caissa, goddess of chess')).toHaveCount(1);
    for (const name of ['Play Game', 'Play Bots', 'Play Coach'])
        await expect(page.getByRole('tab', { name, exact: true })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'Play Coach', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('Coach Setup preserves featured aliases, seven levels, color choices, and one game owner', async ({ page }) => {
    await openCoach(page);
    const panel = page.locator('[data-caissa-native-coach-panel]');
    for (const name of ['Casual', 'Balanced', 'Challenging'])
        await expect(panel.getByRole('radio', { name, exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /Show All Levels/ }).click();
    for (const name of ['Beginner', 'Expert', 'Master', 'Grandmaster'])
        await expect(panel.getByRole('radio', { name, exact: true })).toBeVisible();
    for (const name of ['White', 'Random', 'Black'])
        await expect(panel.getByRole('radio', { name, exact: true })).toBeVisible();
    await panel.locator('label').filter({ hasText: 'Balanced' }).click();
    await expect(panel.getByRole('radio', { name: 'Balanced', exact: true })).toBeChecked();
    await panel.locator('[data-coach-primary]').click();
    await expect(panel).toHaveAttribute('data-coach-shell-phase', 'active-game');
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(2);
    const proof = await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        game: !!window.App.game,
        boardAdapter: !!window.App.boardAdapter,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    expect(proof).toEqual({ boards: 1, game: true, boardAdapter: true, workers: 1 });
});

test('Coach remains bounded on mobile and isolates Bots and Games', async ({ page }) => {
    await openCoach(page, { width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
    await page.getByRole('tab', { name: 'Play Bots', exact: true }).click();
    await expect(page).toHaveURL(/\/play\/bots$/);
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeHidden();
    await page.getByRole('tab', { name: 'Play Game', exact: true }).click();
    await expect(page).toHaveURL(/\/play\/games$/);
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
});
