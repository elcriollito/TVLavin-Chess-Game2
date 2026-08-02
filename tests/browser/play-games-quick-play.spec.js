import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('resignation finalizes one valid Games record and clean PostGame', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    const proof = await page.evaluate(() => {
        window.confirm = () => true;
        window.resignGame();
        const snapshot = window.CaissaPlayCompatibility.getSnapshot();
        let record = null; let validation = null; let error = null;
        try {
            record = window.CaissaGameRecord.buildFromPlay();
            validation = window.CaissaGameRecord.validate(record);
        } catch (caught) { error = String(caught); }
        return { snapshot, record, validation, error,
            lifecycle: window.CaissaGameLifecycle.getSnapshot(),
            lifecycleHistory: window.CaissaGameLifecycle.getHistory(),
            startSyncPresent: window.newGame.toString().includes("'GAME_STARTED'"),
            postGame: window.CaissaPostGameExperienceInstance.getSnapshot() };
    });
    expect(proof.error).toBeNull();
    expect(proof.validation.valid, JSON.stringify(proof.validation.errors)).toBe(true);
    expect(proof.record.result).toMatchObject({ value: '0-1', termination: 'resignation', complete: true });
    expect(proof.record.timing.timeControl).toEqual({ initialSeconds: 60, incrementSeconds: 0 });
    expect(proof.record.notation.pgn).toContain('[TimeControl "60+0"]');
    expect(proof.startSyncPresent).toBe(true);
    expect(proof.lifecycle.state, JSON.stringify(proof.lifecycleHistory)).toBe('completed');
    expect(proof.postGame.visible).toBe(true);
});

test('promotion is choice-required and keyboard-selectable for every piece in both orientations', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    const cases = [
        { color: 'white', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', from: 'a7', to: 'a8' },
        { color: 'black', fen: '7K/8/8/8/8/8/p7/7k b - - 0 1', from: 'a2', to: 'a1' }
    ];
    for (const item of cases) for (const piece of ['q', 'r', 'b', 'n']) {
        await page.evaluate(({ item }) => {
            window.App.game.load(item.fen); window.App.board.position(item.fen, false);
            window.App.board.orientation(item.color); window.App.isFlipped = item.color === 'black';
            window.App.moveHistory = []; window.App.currentMoveIndex = -1;
            window.App.pendingPromotion = null; window.App.gameActive = true; window.App.isPlayerTurn = true;
            window.makeMoveFromSquares(item.from, item.to);
        }, { item });
        await expect(page.locator('#promotionModal')).toHaveClass(/show/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#promotionModal')).toHaveClass(/show/);
        const choice = page.locator(`.promotion-btn[data-piece="${piece}"]`);
        await choice.focus(); await page.keyboard.press('Enter');
        await expect(page.locator('#promotionModal')).not.toHaveClass(/show/);
        expect(await page.evaluate(() => window.App.game.history()[0])).toMatch(new RegExp(`=${piece.toUpperCase()}`));
        await expect(page.locator('#chessboard')).toBeFocused();
    }
});
