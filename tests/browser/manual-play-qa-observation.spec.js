import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

const evidence = name => resolve('test-results/manual-play-qa', `${name}.png`);

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('desktop mouse and keyboard observation session', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.screenshot({ path: evidence('desktop-games-dark-1440x900'), fullPage: true, animations: 'disabled' });
    const games = page.getByRole('tab', { name: 'Games' });
    await games.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/play\/bots\?simplified=1/);
    await page.keyboard.press('End');
    await expect(page).toHaveURL(/\/play\/players\?simplified=1/);
    await expect(page.locator('[data-players-panel]')).toContainText('unavailable');
    await page.screenshot({ path: evidence('desktop-players-frozen-1440x900'), fullPage: true, animations: 'disabled' });
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
    await page.locator('[data-games-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    expect(await playMove(page, 'e2', 'e5')).toBe(false);
    const proof = await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        history: window.App.game.history(),
        focus: getComputedStyle(document.activeElement).outlineStyle
    }));
    expect(proof.boards).toBe(1);
    expect(proof.workers).toBeLessThanOrEqual(1);
    expect(proof.history).toHaveLength(1);
});
test('terminal, PostGame, PGN, Analyze, Mentor, and promotion observation session', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('[data-post-game-result]')).toHaveText('White wins.');
    await expect(page.locator('[data-post-game-summary]')).toContainText('checkmate');
    await page.screenshot({ path: evidence('desktop-postgame-checkmate-1440x900'), fullPage: true, animations: 'disabled' });
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().mentor.request?.requestId)).toBeTruthy();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    expect(new URL(page.url()).searchParams.has('pgn')).toBe(false);
    expect(new URL(page.url()).searchParams.has('fen')).toBe(false);
    await page.goBack();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.evaluate(() => window.newGame({ mode: 'analysis', color: 'white', timeControl: 0 }));
    await loadPosition(page, positions.whitePromotion.fen);
    await playMove(page, positions.whitePromotion.from, positions.whitePromotion.to);
    await expect(page.locator('#promotionModal')).toHaveClass(/show/);
    await page.screenshot({ path: evidence('desktop-promotion-dialog-1440x900'), fullPage: true, animations: 'disabled' });
    await page.evaluate(() => window.handlePromotion('n'));
    expect(await page.evaluate(() => window.App.game.history()[0])).toMatch(/=N/);
});

test('compact touch-emulation, themes, reflow, and accessibility observation session', async ({ page, context }) => {
    await context.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/games?simplified=1');
    await page.evaluate(() => window.CaissaPlayThemes.applyTheme('caissa-light'));
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.screenshot({ path: evidence('compact-games-light-390x844'), fullPage: true, animations: 'disabled' });
    const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        board: document.querySelector('#chessboard').getBoundingClientRect().width,
        cta: document.querySelector('[data-games-primary]').getBoundingClientRect().height,
        theme: document.body.dataset.caissaPlayTheme,
        live: document.querySelectorAll('.caissa-simplified-shell [aria-live]').length
    }));
    expect(geometry.overflow).toBeLessThanOrEqual(2);
    expect(geometry.board).toBeGreaterThan(250);
    expect(geometry.cta).toBeGreaterThanOrEqual(44);
    expect(geometry).toMatchObject({ theme: 'caissa-light', live: 2 });
    const axe = await new AxeBuilder({ page }).include('.caissa-simplified-shell').analyze();
    expect(axe.violations).toEqual([]);
    await page.setViewportSize({ width: 844, height: 390 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});
