import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove, snapshot } from '../play/playwright-helpers.js';

test('blocking: one human move causes one deterministic engine reply and no duplicate move', async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e7e5', cp: 75, delayMs: 5 });
    await openPlay(page);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(async () => (await snapshot(page)).history).toEqual(['e4', 'e5']);
    await page.waitForTimeout(100);
    const state = await snapshot(page);
    expect(state.history).toEqual(['e4', 'e5']);
    expect(state.harness.workersCreated).toBe(1);
    expect(state.harness.workerMessages.filter(line => line.startsWith('go '))).toHaveLength(1);
});

test('blocking: New Game rejects a pending stale reply by position identity', async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e7e5', delayMs: 500 });
    await openPlay(page);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    await playMove(page, 'e2', 'e4');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.newGame({ mode: 'analysis', color: 'white', timeControl: 0 }));
    await page.waitForTimeout(500);
    expect((await snapshot(page)).history).toEqual([]);
});

test('characterization: evaluation rail renders cp, mate, sign, and flip orientation', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await page.evaluate(() => {
        window.updateEvalBar(125, null);
    });
    await expect(page.locator('#evalScore')).toHaveText('+1.3');
    const positiveHeight = await page.locator('#evalFill').evaluate(element => element.style.height);
    await page.evaluate(() => window.updateEvalBar(-210, null));
    await expect(page.locator('#evalScore')).toHaveText('-2.1');
    const negativeHeight = await page.locator('#evalFill').evaluate(element => element.style.height);
    expect(positiveHeight).not.toBe(negativeHeight);
    await page.evaluate(() => window.updateEvalBar(null, 3));
    await expect(page.locator('#evalScore')).toContainText('M3');
    await page.evaluate(() => {
        window.App.board.flip();
        window.App.isFlipped = true;
        window.syncEvalOrientation();
    });
    await expect(page.locator('#evalBar')).toHaveClass(/eval-flipped/);
});

test('known defect: leaving Play does not terminate its worker', async ({ page }) => {
    await instrumentPlay(page);
    await openPlay(page);
    await page.locator('[data-section="academy"]').first().click();
    const state = await snapshot(page);
    expect(state.harness.workersCreated).toBe(1);
    expect(state.harness.workersTerminated).toBe(0);
});

test('known defect: duplicate bestmove lines invoke the shared callback twice but only one move is legal', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    await playMove(page, 'e2', 'e4');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        window.__caissaPlayHarness.emit(0, 'bestmove e7e5');
        window.__caissaPlayHarness.emit(0, 'bestmove e7e5', 5);
    });
    await expect.poll(async () => (await snapshot(page)).history).toEqual(['e4', 'e5']);
});

test('worker failure is observable and leaves the current game position intact', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const before = (await snapshot(page)).fen;
    await page.evaluate(() => window.__caissaPlayHarness.fail());
    expect((await snapshot(page)).fen).toBe(before);
});
