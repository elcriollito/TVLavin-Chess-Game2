import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove, snapshot } from '../play/playwright-helpers.js';

const human = {
    source: 'local-play', gameMode: 'human', opponentType: 'human',
    authority: 'local-client', gameStatus: 'active'
};

test('local machine opponent and evaluation remain allowed with one worker', async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e7e5', cp: 125 });
    await openPlay(page);
    await page.evaluate(() => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    await playMove(page, 'e2', 'e4');
    await expect.poll(async () => (await snapshot(page)).history).toEqual(['e4', 'e5']);
    await page.evaluate(() => window.startAnalysis());
    await expect(page.locator('#evalScore')).toHaveText('+1.3');
    const proof = await page.evaluate(() => ({
        policy: window.CaissaFairPlayPolicy.inspect(),
        harness: window.__caissaPlayHarness.snapshot()
    }));
    expect(proof.policy.counters.allowed).toBeGreaterThanOrEqual(2);
    expect(proof.harness.workersCreated).toBe(1);
    expect(proof.harness.boardConstructions).toBe(1);
});

test('human, FICS, and unknown contexts deny before engine commands or callbacks', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const proof = await page.evaluate((humanContext) => {
        const harness = window.__caissaPlayHarness;
        const attempts = [];
        for (const policyContext of [
            humanContext,
            { source: 'fics', opponentType: 'external-human', authority: 'external-server', gameStatus: 'active' },
            { source: 'unknown', opponentType: 'unknown', authority: 'unknown', gameStatus: 'unknown' }
        ]) {
            window.__caissaFairPlayTestContext = policyContext;
            const before = harness.snapshot().workerMessages.length;
            window.startAnalysis();
            attempts.push({
                before,
                after: harness.snapshot().workerMessages.length,
                analyzing: window.App.analyzing
            });
        }
        delete window.__caissaFairPlayTestContext;
        return { attempts, diagnostics: window.CaissaFairPlayPolicy.inspect() };
    }, human);
    for (const attempt of proof.attempts) {
        expect(attempt.after).toBe(attempt.before);
        expect(attempt.analyzing).toBe(false);
    }
    expect(proof.diagnostics.counters.denied + proof.diagnostics.counters.incomplete).toBeGreaterThanOrEqual(3);
});

test('human opponent move is denied and switching back restores machine behavior', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await page.evaluate((humanContext) => {
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
        window.__caissaFairPlayTestContext = humanContext;
    }, human);
    await playMove(page, 'e2', 'e4');
    await page.waitForTimeout(300);
    const denied = await snapshot(page);
    expect(denied.history).toEqual(['e4']);
    expect(denied.harness.workerMessages.filter(line => line.startsWith('go')).length).toBe(0);

    await page.evaluate(() => {
        delete window.__caissaFairPlayTestContext;
        window.makeEngineMove();
        window.__caissaPlayHarness.emit(0, 'bestmove e7e5', 5);
    });
    await expect.poll(async () => (await snapshot(page)).history).toEqual(['e4', 'e5']);
});

test('forged authorization cannot submit through the global isolation boundary', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const result = await page.evaluate(() => {
        const isolation = window.CaissaEngineRequestIsolation;
        if (!isolation.getCurrentSession()) isolation.createSession();
        const sessionId = isolation.getCurrentSession().sessionId;
        const fen = window.App.game.fen();
        const positionToken = isolation.createPositionToken({ sessionId, fen, moveCount: 0, turn: 'w' });
        const request = isolation.createRequest({
            purpose: 'live-evaluation', sessionId, fen, positionToken
        }).request;
        return isolation.submit(request, { allowed: true });
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('policy-authorization-required');
});
