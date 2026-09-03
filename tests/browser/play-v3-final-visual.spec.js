import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

test('Coach final desktop layout, controls, hint lifecycle, annotation placement, and Undo are coherent', async ({ page }) => {
    await instrumentPlay(page, {
        bestMoves: ['e2e4', 'e2e4'],
        scores: [20, 20, 20],
        depth: 12,
        delayMs: 10
    });
    const runtime = monitorRuntime(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play/coach?checkpoint=4b2e1a9');
    await page.locator('[data-coach-primary]').click();
    await expect.poll(() => page.evaluate(() => window.App.currentEvaluation?.bestMove || null)).toBe('e2e4');

    for (const action of ['resign', 'coach-hint', 'coach-undo', 'share', 'download', 'settings'])
        await expect(page.locator(`[data-active-game-action="${action}"]`)).toBeVisible();
    await expect(page.locator('[data-play-assistance]')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Explorer coming soon' })).toBeDisabled();
    await expect(page.locator('[data-active-opening-link]')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#playerBlackName')).toHaveText('Engine');
    expect((await page.locator('body').innerText())).not.toMatch(/Stockfish/i);

    const desktop = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const boardStage = rect('.caissa-simplified-shell__board-stage');
        const board = rect('#chessboard');
        const context = rect('.caissa-simplified-shell__context');
        const contextBody = rect('.caissa-simplified-shell__context-body');
        const narrator = rect('[data-active-coach-narrator]');
        const engine = rect('#playerBlackName');
        const evaluation = rect('#evalScore');
        const clock = rect('#topClockBlack');
        return {
            contextBottomDelta: Math.abs(context.bottom - boardStage.bottom),
            contextWidth: context.width,
            boardWidth: board.width,
            emptyTopGap: narrator.top - contextBody.top,
            evaluationOutsideBoard: evaluation.bottom <= board.top,
            evaluationBesideEngine: evaluation.left >= engine.right - 1 && evaluation.right <= clock.left + 1,
            narrationFont: parseFloat(getComputedStyle(document.querySelector('[data-active-coach-speech]')).fontSize),
            openingFont: parseFloat(getComputedStyle(document.querySelector('[data-active-game-opening]')).fontSize)
        };
    });
    expect(desktop.contextBottomDelta).toBeLessThanOrEqual(3);
    expect(desktop.contextWidth).toBeGreaterThanOrEqual(380);
    expect(desktop.boardWidth).toBeGreaterThan(desktop.contextWidth);
    expect(desktop.emptyTopGap).toBeLessThanOrEqual(12);
    expect(desktop.evaluationOutsideBoard).toBe(true);
    expect(desktop.evaluationBesideEngine).toBe(true);
    expect(desktop.narrationFont).toBeGreaterThanOrEqual(16);
    expect(desktop.openingFont).toBeGreaterThanOrEqual(16);

    await page.locator('[data-active-game-action="coach-hint"]').click();
    await expect(page.locator('body')).toHaveClass(/caissa-coach-hint-active/);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect(page.locator('body')).not.toHaveClass(/caissa-coach-hint-active/);
    const badge = page.locator('#chessboard .square-e4 [data-caissa-coach-move-annotation]');
    await expect(badge).toBeVisible();
    const placement = await badge.evaluate(node => {
        const badgeRect = node.getBoundingClientRect();
        const squareRect = node.parentElement.getBoundingClientRect();
        return {
            topRatio: (badgeRect.top - squareRect.top) / squareRect.height,
            rightRatio: (squareRect.right - badgeRect.right) / squareRect.width,
            centerOffset: Math.hypot(
                badgeRect.left + badgeRect.width / 2 - (squareRect.left + squareRect.width / 2),
                badgeRect.top + badgeRect.height / 2 - (squareRect.top + squareRect.height / 2)
            ) / squareRect.width
        };
    });
    expect(placement.topRatio).toBeGreaterThanOrEqual(0);
    expect(placement.topRatio).toBeLessThan(0.18);
    expect(placement.rightRatio).toBeGreaterThanOrEqual(0);
    expect(placement.rightRatio).toBeLessThan(0.18);
    expect(placement.centerOffset).toBeGreaterThan(0.25);

    await page.locator('[data-active-game-action="coach-undo"]').click();
    await expect(page.locator('[data-caissa-coach-move-annotation]')).toHaveCount(0);
    expect(await page.evaluate(() => window.App.coachMoveAnnotations.length)).toBe(0);
    expect(runtime.errors).toEqual([]);
    expect(runtime.badResponses.filter(entry => !/\/data\/openings\/eco\/B00\.json$/.test(entry))).toEqual([]);
});

for (const mode of [
    { route: '/play/games', start: '[data-games-primary]' },
    { route: '/play/bots', start: '[data-bot-primary]' },
    { route: '/play/coach', start: '[data-coach-primary]' }
]) {
    test(`${mode.route} remains ordered and free of horizontal overflow at 487px`, async ({ page }) => {
        await instrumentPlay(page, { autoReply: false });
        const runtime = monitorRuntime(page);
        await page.setViewportSize({ width: 487, height: 844 });
        await page.goto(`${mode.route}?checkpoint=4b2e1a9`);
        await page.locator(mode.start).click();
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('.caissa-simplified-shell__board-region').getBoundingClientRect();
            const context = document.querySelector('.caissa-simplified-shell__context').getBoundingClientRect();
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                boardBeforeContext: board.top < context.top,
                boardInside: board.left >= -1 && board.right <= innerWidth + 1,
                contextInside: context.left >= -1 && context.right <= innerWidth + 1
            };
        });
        expect(geometry).toEqual({ overflow: 0, boardBeforeContext: true, boardInside: true, contextInside: true });
        runtime.assertClean();
    });
}

test('local placeholder auth stays anonymous without Clerk or runtime console errors', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.goto('/play/coach?checkpoint=4b2e1a9');
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
    await page.waitForTimeout(750);
    expect(await page.evaluate(() => typeof window.Clerk)).toBe('undefined');
    runtime.assertClean();
});
