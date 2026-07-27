import { test, expect } from '@playwright/test';
import {
    instrumentPlay, openPlay, playMove, snapshot
} from '../play/playwright-helpers.js';

test('isolation API is passive and existing namespaces and resources remain stable', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const proof = await page.evaluate(() => {
        const before = window.__caissaPlayHarness.snapshot();
        const compatibility = window.CaissaPlayCompatibility;
        const records = window.CaissaGameRecord;
        const persistence = window.CaissaGameRecordPersistence;
        const api = window.CaissaEngineRequestIsolation;
        const inspected = api.inspect();
        const after = window.__caissaPlayHarness.snapshot();
        return {
            available: Boolean(api),
            schemaVersion: api.schemaVersion,
            before,
            after,
            compatibilitySame: compatibility === window.CaissaPlayCompatibility,
            recordsSame: records === window.CaissaGameRecord,
            persistenceSame: persistence === window.CaissaGameRecordPersistence,
            inspected
        };
    });
    expect(proof.available).toBe(true);
    expect(proof.schemaVersion).toBe('1.0.0');
    expect(proof.after).toEqual(proof.before);
    expect(proof.before.workersCreated).toBe(1);
    expect(proof.before.boardConstructions).toBe(1);
    expect(proof).toMatchObject({
        compatibilitySame: true,
        recordsSame: true,
        persistenceSame: true
    });
});

test('one human move produces one accepted deterministic opponent response', async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e7e5', cp: 75, delayMs: 5 });
    await openPlay(page);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    await playMove(page, 'e2', 'e4');
    await expect.poll(async () => (await snapshot(page)).history).toEqual(['e4', 'e5']);
    const proof = await page.evaluate(() => window.CaissaEngineRequestIsolation.inspect());
    expect(proof.counters.completed).toBe(1);
    expect(proof.counters.created).toBe(1);
    expect(proof.activeRequests).toEqual({});
    expect((await snapshot(page)).harness.workersCreated).toBe(1);
});

test('duplicate bestmove is rejected before a duplicate board mutation', async ({ page }) => {
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
    await page.waitForTimeout(30);
    const proof = await page.evaluate(() => window.CaissaEngineRequestIsolation.inspect());
    expect((await snapshot(page)).history).toEqual(['e4', 'e5']);
    expect(proof.counters.completed).toBe(1);
    expect(proof.counters.staleResponses).toBeGreaterThanOrEqual(1);
});

test('New Game rotates session and rejects delayed prior bestmove', async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e7e5', delayMs: 500 });
    await openPlay(page);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    const firstSession = await page.evaluate(() =>
        window.CaissaEngineRequestIsolation.getCurrentSession().sessionId);
    await playMove(page, 'e2', 'e4');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.newGame({ mode: 'analysis', color: 'white', timeControl: 0 }));
    const secondSession = await page.evaluate(() =>
        window.CaissaEngineRequestIsolation.getCurrentSession().sessionId);
    await page.waitForTimeout(550);
    const state = await snapshot(page);
    const diagnostics = await page.evaluate(() => window.CaissaEngineRequestIsolation.inspect());
    expect(secondSession).not.toBe(firstSession);
    expect(state.history).toEqual([]);
    expect(diagnostics.counters.staleResponses).toBeGreaterThanOrEqual(1);
    expect(state.harness.workersCreated).toBe(1);
});

test('stale evaluation is rejected and newer evaluation remains independent of opponent', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const proof = await page.evaluate(() => {
        const api = window.CaissaEngineRequestIsolation;
        api.createSession({ sessionId: 'browser-session' });
        const sessionId = api.getCurrentSession().sessionId;
        const fenA = window.App.game.fen();
        const tokenA = api.createPositionToken({ sessionId, fen: fenA, moveCount: 0, turn: 'w' });
        const oldEval = api.createRequest({
            purpose: 'live-evaluation', sessionId, positionToken: tokenA, fen: fenA
        }).request;
        api.submit(oldEval);
        const opponent = api.createRequest({
            purpose: 'opponent-move', sessionId, positionToken: tokenA, fen: fenA
        }).request;
        api.submit(opponent);
        const fenB = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const tokenB = api.createPositionToken({ sessionId, fen: fenB, moveCount: 1, turn: 'b' });
        const newEval = api.createRequest({
            purpose: 'live-evaluation', sessionId, positionToken: tokenB, fen: fenB, moveCount: 1, turn: 'b'
        }).request;
        api.submit(newEval);
        const beforeScore = document.getElementById('evalScore').textContent;
        const stale = api.acceptResponse({
            requestId: oldEval.requestId,
            sessionId,
            purpose: oldEval.purpose,
            positionToken: oldEval.positionToken,
            message: 'info depth 12 score cp 900 pv e2e4'
        }, {
            sessionId,
            purpose: oldEval.purpose,
            positionToken: tokenB
        });
        if (stale.ok) window.updateEvalBar(900, null);
        const afterScore = document.getElementById('evalScore').textContent;
        const canceled = api.cancelPurpose('live-evaluation', sessionId);
        return {
            stale,
            canceled,
            beforeScore,
            afterScore,
            oldStatus: api.getRequest(oldEval.requestId).status,
            newStatus: api.getRequest(newEval.requestId).status,
            opponentStatus: api.getRequest(opponent.requestId).status
        };
    });
    expect(proof.stale.status).toBe('stale-position');
    expect(proof.afterScore).toBe(proof.beforeScore);
    expect(proof.oldStatus).toBe('stale');
    expect(proof.newStatus).toBe('canceled');
    expect(proof.opponentStatus).toBe('active');
});

test('accepted live evaluation preserves score, mate, flip, worker retention, and storage', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const storageBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    await page.evaluate(() => window.startAnalysis());
    await page.waitForTimeout(20);
    await page.evaluate(() =>
        window.__caissaPlayHarness.emit(0, 'info depth 12 score cp 125 nodes 1 pv e2e4'));
    await expect(page.locator('#evalScore')).toHaveText('+1.3');
    await page.evaluate(() =>
        window.__caissaPlayHarness.emit(0, 'info depth 12 score mate 3 nodes 1 pv e2e4'));
    await expect(page.locator('#evalScore')).toContainText('M3');
    await page.evaluate(() => {
        window.App.board.flip();
        window.App.isFlipped = true;
        window.syncEvalOrientation();
    });
    await expect(page.locator('#evalBar')).toHaveClass(/eval-flipped/);
    const sameStorage = await page.evaluate(before =>
        before === JSON.stringify(Object.entries(localStorage).sort()), storageBefore);
    await page.locator('[data-section="academy"]').first().click();
    const proof = await page.evaluate(() => ({
        harness: window.__caissaPlayHarness.snapshot()
    }));
    expect(proof.harness.workersCreated).toBe(1);
    expect(proof.harness.workersTerminated).toBe(0);
    expect(sameStorage).toBe(true);
});
