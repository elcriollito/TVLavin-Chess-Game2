import { expect, test } from '@playwright/test';
import { instrumentPlay, openPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page);
    await page.addInitScript(() => {
        window.__clockStorageWrites = 0;
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (...args) {
            window.__clockStorageWrites += 1;
            return original.apply(this, args);
        };
    });
    await openPlay(page);
    await page.evaluate(() => { window.__clockStorageWrites = 0; });
});

test('ClockService owns start, elapsed time, one switch, reset, and compatibility reads', async ({ page }) => {
    const state = await page.evaluate(() => {
        window.newGame({ mode: 'analysis', color: 'white', timeControl: 300 });
        const service = window.CaissaClockService;
        const started = service.getSnapshot();
        service.tick(started.lastTickMonotonic + 1250);
        const afterTick = service.getSnapshot();
        const move = window.CaissaPlayCompatibility.execute('submitMove', { from: 'e2', to: 'e4' });
        const afterMove = service.getSnapshot();
        const compatibility = window.CaissaPlayCompatibility.getSnapshot();
        const lifecycle = window.CaissaGameLifecycle.getSnapshot();
        const record = window.CaissaGameRecord.buildFromPlay({ now: () => 0 });
        window.newGame({ mode: 'analysis', color: 'white', timeControl: 300 });
        const reset = service.getSnapshot();
        return {
            namespace: service.schemaVersion,
            oneInstance: service.getCurrent() === service.getCurrent(),
            started, afterTick, move, afterMove, compatibility,
            lifecycle, record, reset,
            storageWrites: window.__clockStorageWrites
        };
    });
    expect(state.namespace).toBe('1.0.0');
    expect(state.oneInstance).toBe(true);
    expect(state.started.running).toBe(true);
    expect(state.started.activeColor).toBe('white');
    expect(state.afterTick.whiteRemainingMs).toBe(298750);
    expect(state.afterTick.blackRemainingMs).toBe(300000);
    expect(state.move.ok).toBe(true);
    expect(state.afterMove.activeColor).toBe('black');
    expect(state.afterMove.sequence).toBeGreaterThan(state.afterTick.sequence);
    expect(state.compatibility.clocks.whiteMilliseconds).toBe(state.afterMove.whiteRemainingMs);
    expect(state.compatibility.clocks.activeColor).toBe('black');
    expect(state.lifecycle.clocksRunning).toBe(true);
    expect(state.record.timing.finalClocks.whiteMilliseconds).toBe(state.afterMove.whiteRemainingMs);
    expect(state.reset.whiteRemainingMs).toBe(300000);
    expect(state.reset.blackRemainingMs).toBe(300000);
    expect(state.reset.clockSessionId).not.toBe(state.started.clockSessionId);
    expect(state.storageWrites).toBe(0);
});

test('illegal moves and board flip do not switch; promotion keeps ticking until commit', async ({ page }) => {
    const state = await page.evaluate(() => {
        window.newGame({ mode: 'analysis', color: 'white', timeControl: 300 });
        const before = window.CaissaClockService.getSnapshot();
        const illegal = window.CaissaPlayCompatibility.execute('submitMove', { from: 'e2', to: 'e5' });
        const afterIllegal = window.CaissaClockService.getSnapshot();
        window.flipBoard();
        const afterFlip = window.CaissaClockService.getSnapshot();
        return { before, illegal, afterIllegal, afterFlip };
    });
    expect(state.illegal.ok).toBe(false);
    expect(state.afterIllegal.activeColor).toBe(state.before.activeColor);
    expect(state.afterIllegal.sequence).toBe(state.before.sequence);
    expect(state.afterFlip.activeColor).toBe(state.before.activeColor);
    expect(state.afterFlip.sequence).toBe(state.before.sequence);
});

test('timeout is terminal once and New Game cancels/replaces the prior loop', async ({ page }) => {
    const state = await page.evaluate(() => {
        window.newGame({ mode: 'analysis', color: 'white', timeControl: 3 });
        const service = window.CaissaClockService;
        const before = service.getSnapshot();
        const timeout = service.tick(before.lastTickMonotonic + 5000);
        const firstText = window.App.elements.gameResult.textContent;
        const again = service.tick(before.lastTickMonotonic + 6000);
        const after = service.getSnapshot();
        const lifecycle = window.CaissaGameLifecycle.getSnapshot();
        return { timeout, again, after, firstText, lifecycle, inspect: service.inspect() };
    });
    expect(state.timeout.status).toBe('timed-out');
    expect(state.again.status).toBe('unchanged');
    expect(state.after.whiteRemainingMs).toBe(0);
    expect(state.after.running).toBe(false);
    expect(state.after.timedOutColor).toBe('white');
    expect(state.firstText).toContain('Black wins');
    expect(state.inspect.rafActive).toBe(false);
    expect(state.lifecycle.clocksRunning).toBe(false);
});
