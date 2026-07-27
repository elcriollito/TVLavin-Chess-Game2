import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, openPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await startGame(page);
});

for (const [name, fixture, expectedSan] of [
    ['castling', positions.castle, 'O-O'],
    ['en passant', positions.enPassant, 'exd6'],
    ['checkmate', positions.checkmateInOne, 'Qg7#']
]) {
    test(`characterizes ${name} from a controlled FEN`, async ({ page }) => {
        expect(await loadPosition(page, fixture.fen)).toBe(true);
        expect(await playMove(page, fixture.from, fixture.to)).toBe(true);
        const state = await snapshot(page);
        expect(state.history).toEqual([expectedSan]);
        if (name === 'checkmate') {
            expect(state.gameActive).toBe(false);
            expect(state.gameStatus.state).toBe('Checkmate');
            expect(state.gameStatus.result).toBe('1-0');
            expect(state.pgn).not.toContain('1-0');
        }
    });
}

test('promotion pauses for choice and queen promotion updates notation', async ({ page }) => {
    expect(await loadPosition(page, positions.whitePromotion.fen)).toBe(true);
    expect(await playMove(page, positions.whitePromotion.from, positions.whitePromotion.to)).toBe(true);
    await expect(page.locator('#promotionModal')).toHaveClass(/show/);
    expect((await snapshot(page)).pendingPromotion).toMatchObject({ from: 'a7', to: 'a8' });
    await page.evaluate(() => window.handlePromotion('q'));
    expect((await snapshot(page)).history[0]).toMatch(/^a8=Q/);
});

test('stalemate and insufficient material are recognized by the current rules runtime', async ({ page }) => {
    for (const [fen, predicate] of [
        [positions.stalemate, 'in_stalemate'],
        [positions.insufficientMaterial, 'insufficient_material']
    ]) {
        expect(await loadPosition(page, fen)).toBe(true);
        expect(await page.evaluate((method) => window.App.game[method](), predicate)).toBe(true);
    }
});

test('blocking: New Game resets board, PGN, evaluation, clocks, and result', async ({ page }) => {
    await playMove(page, 'e2', 'e4');
    await page.evaluate(() => {
        window.updateEvalBar(200, null);
        window.App.pendingPromotion = { from: 'a7', to: 'a8' };
        window.App.gameStatus = { state: 'Draw', result: '½-½', message: 'fixture' };
        window.newGame({ mode: 'analysis', color: 'white', timeControl: 300 });
    });
    const state = await snapshot(page);
    expect(state.history).toEqual([]);
    expect(state.pgn).toBe('');
    expect(state.pendingPromotion).toEqual({ from: 'a7', to: 'a8' });
    expect(state.gameStatus).toMatchObject({ state: 'In Progress', result: '' });
    expect(state.timeControl).toBe(300);
    expect(state.whiteTimeMs).toBeGreaterThan(299_000);
    expect(state.blackTimeMs).toBeGreaterThan(299_000);
});

test('clock starts with one active RAF and game completion stops it', async ({ page }) => {
    await page.evaluate(() => window.newGame({ mode: 'analysis', color: 'white', timeControl: 3 }));
    await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().activeRafs)).toBeGreaterThan(0);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().activeRafs)).toBe(0);
});

test.skip('repetition and fifty-move Play sequences — legacy Play has no public history injection', async () => {});
