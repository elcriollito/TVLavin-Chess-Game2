import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import {
    instrumentPlay, loadPosition, openPlay, playMove, snapshot as legacySnapshot, startGame
} from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

test('public boundary loads after App with a frozen versioned API', async ({ page }) => {
    await openPlay(page);
    const contract = await page.evaluate(() => ({
        available: window.CaissaPlayCompatibility.isAvailable(),
        version: window.CaissaPlayCompatibility.schemaVersion,
        frozen: Object.isFrozen(window.CaissaPlayCompatibility),
        json: JSON.stringify(window.CaissaPlayCompatibility.getSnapshot())
    }));
    expect(contract).toMatchObject({ available: true, version: '1.3.0', frozen: true });
    expect(() => JSON.parse(contract.json)).not.toThrow();
});

test('adapter initialization creates zero boards, workers, RAFs, listeners, DOM, and storage writes', async ({ page }) => {
    await page.goto('/');
    const proof = await page.evaluate(async () => {
        const response = await fetch('/js/play/legacy-play-compatibility.js');
        const source = await response.text();
        const harnessBefore = window.__caissaPlayHarness.snapshot();
        const storageBefore = Object.entries(localStorage).sort();
        const identity = window.CaissaPlayCompatibility;
        const mutations = [];
        const observer = new MutationObserver(records => mutations.push(...records));
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        (0, eval)(source);
        observer.disconnect();
        const harnessAfter = window.__caissaPlayHarness.snapshot();
        return {
            sameInstance: identity === window.CaissaPlayCompatibility,
            harnessBefore,
            harnessAfter,
            mutations: mutations.length,
            sameStorage: JSON.stringify(storageBefore) === JSON.stringify(Object.entries(localStorage).sort())
        };
    });
    expect(proof.sameInstance).toBe(true);
    expect(proof.harnessAfter).toEqual(proof.harnessBefore);
    expect(proof.mutations).toBe(0);
    expect(proof.sameStorage).toBe(true);
});

test('snapshot tracks idle, active, one move, evaluation, and inactive Play states', async ({ page }) => {
    await openPlay(page);
    let state = await page.evaluate(() => window.CaissaPlayCompatibility.getSnapshot());
    expect(state).toMatchObject({ active: true, mounted: true, board: { available: true } });
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    await page.evaluate(() => window.updateEvalBar(125, null));
    state = await page.evaluate(() => {
        window.App.lastEvalCp = 125;
        return window.CaissaPlayCompatibility.getSnapshot();
    });
    expect(state.position.moveHistory.map(move => move.san)).toEqual(['e4']);
    expect(state.position.pgn).toContain('1. e4');
    expect(state.evaluation).toMatchObject({ available: true, scorePawns: 1.25, perspective: 'white' });
    await page.locator('[data-section="academy"]').first().click();
    state = await page.evaluate(() => window.CaissaPlayCompatibility.getSnapshot());
    expect(state.active).toBe(false);
    expect(state.engine.available).toBe(true);
});

test('snapshot exposes promotion, game-over, and known stale-promotion behavior immutably', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await loadPosition(page, positions.whitePromotion.fen);
    await playMove(page, positions.whitePromotion.from, positions.whitePromotion.to);
    let state = await page.evaluate(() => window.CaissaPlayCompatibility.getSnapshot());
    expect(state.game.pendingPromotion).toMatchObject({ from: 'a7', to: 'a8' });
    expect(state.game.pendingPromotion.context).toBeNull();
    expect(await page.evaluate(() => Object.isFrozen(window.CaissaPlayCompatibility.getPendingPromotion()))).toBe(true);
    await page.evaluate(() => window.CaissaPlayCompatibility.execute('resetGame'));
    state = await page.evaluate(() => window.CaissaPlayCompatibility.getSnapshot());
    expect(state.game.pendingPromotion).toMatchObject({ from: 'a7', to: 'a8' });
    await loadPosition(page, positions.checkmateInOne.fen);
    await page.evaluate(({ from, to }) =>
        window.CaissaPlayCompatibility.execute('submitMove', { from, to }), positions.checkmateInOne);
    state = await page.evaluate(() => window.CaissaPlayCompatibility.getSnapshot());
    expect(state.game).toMatchObject({ active: false, result: '1-0', termination: null });
    expect(state.position.pgn).not.toContain('1-0');
});

test('commands route one legal move, reject malformed input, flip once, and return PGN', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const before = await legacySnapshot(page);
    const results = await page.evaluate(() => ({
        malformed: window.CaissaPlayCompatibility.execute('submitMove', { from: '<b>', to: 'e4' }),
        legal: window.CaissaPlayCompatibility.execute('submitMove', { from: 'e2', to: 'e4' }),
        flip: window.CaissaPlayCompatibility.execute('flipBoard'),
        pgn: window.CaissaPlayCompatibility.execute('requestPgn'),
        unsupported: window.CaissaPlayCompatibility.execute('offerDraw')
    }));
    const after = await legacySnapshot(page);
    expect(results.malformed.status).toBe('rejected');
    expect(results.legal.status).toBe('accepted');
    expect(results.flip.status).toBe('accepted');
    expect(results.pgn.value).toContain('1. e4');
    expect(results.unsupported.status).toBe('unsupported');
    expect(after.history).toEqual(['e4']);
    expect(after.isFlipped).toBe(!before.isFlipped);
});

test('mutating returned data cannot replace App.game or change legacy state', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const isolation = await page.evaluate(() => {
        const originalGame = window.App.game;
        const originalBoard = window.App.board;
        const originalClock = window.App.whiteTimeMs;
        const state = window.CaissaPlayCompatibility.getSnapshot();
        const failures = [];
        for (const mutate of [
            () => state.position.moveHistory.push({ san: 'h4' }),
            () => { state.clocks.whiteMilliseconds = 1; },
            () => { state.game.status.result = '1-0'; }
        ]) {
            try { mutate(); } catch (error) { failures.push(error.name); }
        }
        return {
            failures,
            frozen: [
                Object.isFrozen(state),
                Object.isFrozen(state.position.moveHistory),
                Object.isFrozen(state.clocks),
                Object.isFrozen(state.game.status)
            ],
            sameGame: originalGame === window.App.game,
            sameBoard: originalBoard === window.App.board,
            sameClock: originalClock === window.App.whiteTimeMs,
            history: window.App.game.history(),
            snapshotClock: state.clocks.whiteMilliseconds,
            snapshotResult: state.game.status.result
        };
    });
    expect(isolation.failures).toEqual(['TypeError']);
    expect(isolation.frozen).toEqual([true, true, true, true]);
    expect(isolation).toMatchObject({
        sameGame: true,
        sameBoard: true,
        sameClock: true,
        history: ['e4'],
        snapshotClock: 0,
        snapshotResult: ''
    });
});

test('Analyze command uses a tokenized handoff and preserves Play state', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const before = await page.evaluate(() => window.CaissaPlayCompatibility.getCurrentFen());
    const command = await page.evaluate(() => window.CaissaPlayCompatibility.execute('openAnalyze'));
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect(page.locator('#analyzeSection')).toBeVisible();
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/caissa-play-v2-inline-analyze/);
    const after = await page.evaluate(() => window.CaissaPlayCompatibility.getCurrentFen());
    const handoff = await page.evaluate(token => window.CaissaAnalyzeHandoff.resolve(token), command.value);
    expect(command).toMatchObject({ ok: true, status: 'accepted', reason: null });
    expect(command.value).toMatch(/^[A-Za-z0-9_-]{12,120}$/);
    expect(handoff).toMatchObject({ ok: true, value: { intent: 'inspect-current-position', payload: {
        recordId: null, result: null, termination: null, recordStatus: 'active'
    } } });
    expect(after).toBe(before);
    await page.evaluate(() => window.CaissaNavigation.navigateToSection('play'));
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    expect(await page.evaluate(() => ({ active: window.App.gameActive,
        fen: window.CaissaPlayCompatibility.getCurrentFen() }))).toEqual({ active: true, fen: before });
});
