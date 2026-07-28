import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove, snapshot } from '../play/playwright-helpers.js';

test('lifecycle loads passively and derives idle then active Play', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const before = await page.evaluate(() => {
        const h = window.__caissaPlayHarness.snapshot();
        const result = window.CaissaGameLifecycle.sync(window.CaissaPlayCompatibility.getSnapshot());
        return { h, result, lifecycle: window.CaissaGameLifecycle.inspect() };
    });
    expect(before.result.snapshot.state).toBe('idle');
    expect(before.h.workersCreated).toBe(1);
    expect(before.h.boardConstructions).toBe(1);
    expect(before.lifecycle.historySize).toBe(1);
});

test('New Game rotates session and legal moves synchronize without duplicates', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const first = await page.evaluate(() => window.CaissaGameLifecycle.inspect().lifecycleSessionId);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'analysis', color: 'white', timeControl: 0 });
    });
    const second = await page.evaluate(() => window.CaissaGameLifecycle.inspect().lifecycleSessionId);
    expect(second).not.toBe(first);
    await playMove(page, 'e2', 'e4');
    const proof = await page.evaluate(() => {
        const before = window.CaissaGameLifecycle.getHistory().length;
        window.CaissaGameLifecycle.sync(window.CaissaPlayCompatibility.getSnapshot());
        const afterFirst = window.CaissaGameLifecycle.getHistory().length;
        const result = window.CaissaGameLifecycle.sync(window.CaissaPlayCompatibility.getSnapshot());
        return { before, afterFirst, after: window.CaissaGameLifecycle.getHistory().length, result,
            snapshot: window.CaissaGameLifecycle.getSnapshot() };
    });
    expect(proof.snapshot.state).toBe('active');
    expect(proof.snapshot.moveCount).toBe(1);
    expect(proof.result.status).toBe('unchanged');
    expect(proof.after).toBe(proof.afterFirst);
});

test('promotion and completion are passively derived without changing Play ownership', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const states = await page.evaluate(() => {
        const compatibility = window.CaissaPlayCompatibility;
        const lifecycle = window.CaissaGameLifecycle.createLifecycle();
        const base = compatibility.getSnapshot();
        const promotion = JSON.parse(JSON.stringify(base));
        promotion.game.active = true;
        promotion.game.pendingPromotion = { from: 'a7', to: 'a8', color: 'white' };
        lifecycle.sync(promotion, 'PROMOTION_REQUIRED');
        const pending = lifecycle.getSnapshot().state;
        const completed = JSON.parse(JSON.stringify(base));
        completed.game.active = false;
        completed.game.result = '1-0';
        lifecycle.sync(completed, 'GAME_COMPLETED');
        return { pending, completed: lifecycle.getSnapshot().state };
    });
    expect(states).toEqual({ pending: 'awaiting-promotion', completed: 'completed' });
    expect((await snapshot(page)).harness.workersCreated).toBe(1);
});
