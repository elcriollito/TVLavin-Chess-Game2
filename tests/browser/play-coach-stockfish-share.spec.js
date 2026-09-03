import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, {
        bestMoves: ['e2e4', 'e7e5', 'e7e5'],
        scores: [20, 120, 34],
        depth: 12,
        delayMs: 10
    });
    await page.addInitScript(() => {
        window.__caissaCoachNarrations = [];
        window.addEventListener('caissa-coach-narration', event => {
            if (typeof event.detail?.message === 'string') window.__caissaCoachNarrations.push(event.detail.message);
        });
    });
});

async function startCoach(page) {
    await page.goto('/play/coach');
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Play' }).click();
    await expect.poll(() => page.evaluate(() => window.App.currentEvaluation?.bestMove || null))
        .toBe('e2e4');
    return panel;
}

test('Coach explains an engine-backed deviation in her own voice without evaluation numbers', async ({ page }) => {
    await startCoach(page);
    expect(await playMove(page, 'a2', 'a3')).toBe(true);

    await expect.poll(() => page.evaluate(() => window.__caissaCoachNarrations.find(message =>
        /I would have chosen e4/.test(message)) || null)).toContain('I would have chosen e4');
    const review = await page.evaluate(() => window.__caissaCoachNarrations.find(message =>
        /I would have chosen e4/.test(message)));
    expect(review).not.toMatch(/[+-]\d|\d+\.\d+/);
    expect(review).not.toMatch(/Stockfish/i);
    await expect.poll(() => page.evaluate(() => window.App.coachMoveAnnotations[0] || null))
        .toMatchObject({ ply: 1, square: 'a3', key: 'mistake', symbol: '?' });
    await expect(page.locator('[data-active-game-moves] .caissa-coach-move-symbol--mistake'))
        .toHaveText('?');
    await expect(page.locator('#chessboard .square-a3 [data-caissa-coach-move-annotation]'))
        .toHaveText('?');
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['a3', 'e5']);
    expect(await page.evaluate(() => window.App.pendingCoachMoveReview)).toBeNull();
});

test('Share stays inside CAISSA and Coach layout remains bounded on desktop and phone', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const panel = await startCoach(page);
    const desktop = await page.evaluate(() => {
        const board = document.querySelector('.caissa-simplified-shell__board-stage').getBoundingClientRect();
        const chessboard = document.querySelector('#chessboard').getBoundingClientRect();
        const context = document.querySelector('.caissa-simplified-shell__context').getBoundingClientRect();
        const badge = document.querySelector('.eval-score-badge').getBoundingClientRect();
        const engine = document.querySelector('#playerBlackName').getBoundingClientRect();
        const clock = document.querySelector('#topClockBlack').getBoundingClientRect();
        const coach = document.querySelector('[data-caissa-native-coach-panel]').getBoundingClientRect();
        const persona = document.querySelector('.caissa-native-coach-panel__persona').getBoundingClientRect();
        return {
            contextBottomDelta: Math.abs(context.bottom - board.bottom),
            badgeOutsideBoard: badge.bottom <= chessboard.top,
            badgeBesideEngine: badge.left >= engine.right - 1 && badge.right <= clock.left + 1,
            personaTopDelta: persona.top - coach.top
        };
    });
    expect(desktop.contextBottomDelta).toBeLessThanOrEqual(3);
    expect(desktop.badgeOutsideBoard).toBe(true);
    expect(desktop.badgeBesideEngine).toBe(true);
    expect(desktop.personaTopDelta).toBeLessThanOrEqual(16);

    await page.locator('[data-active-game-action="share"]').click();
    const dialog = page.locator('[data-caissa-play-share]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveCount(4);
    await expect(dialog.getByRole('tab', { name: 'PGN' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-share-fen]')).not.toHaveValue('');
    await expect(dialog.locator('[data-share-pgn]')).toHaveValue(/\[Event/);
    await dialog.getByRole('tab', { name: 'Image' }).click();
    await expect(dialog.locator('[data-share-image-status]')).toHaveText('Image ready.');
    await dialog.getByRole('tab', { name: 'GIF' }).click();
    await expect(dialog).toContainText('being prepared');
    await dialog.getByRole('tab', { name: 'Embed' }).click();
    await expect(dialog.locator('[data-share-embed]')).toHaveValue(/CAISSA Chess position/);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
        const dialog = document.querySelector('[data-caissa-play-share]').getBoundingClientRect();
        const board = document.querySelector('.caissa-simplified-shell__board-region').getBoundingClientRect();
        const context = document.querySelector('.caissa-simplified-shell__context').getBoundingClientRect();
        return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            dialogInside: dialog.left >= 0 && dialog.right <= innerWidth && dialog.top >= 0 && dialog.bottom <= innerHeight,
            boardBeforeContext: board.top < context.top
        };
    });
    expect(mobile.overflow).toBeLessThanOrEqual(1);
    expect(mobile.dialogInside).toBe(true);
    expect(mobile.boardBeforeContext).toBe(true);
    await expect(page.locator('[data-active-coach-narrator]')).toBeVisible();
});
