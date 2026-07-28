import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, monitorRuntime } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('legacy and QA layouts share one versioned rail owner and one value', async ({ page }) => {
    await openPlay(page);
    const initial = await page.evaluate(() => ({
        schema: window.CaissaEvaluationRail.schemaVersion,
        rails: document.querySelectorAll('#playSection #evalBar').length,
        owner: document.querySelector('#evalBar').dataset.evaluationRailOwner,
        boardId: window.App.boardAdapter.getSnapshot().adapterId
    }));
    expect(initial.schema).toBe('1.0.0');
    expect(initial.rails).toBe(1);
    await page.evaluate(() => window.updateEvalBar(125, null));
    await expect(page.locator('#evalScore')).toHaveText('+1.3');
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    const qa = await page.evaluate(() => ({
        rails: document.querySelectorAll('#playSection #evalBar').length,
        owner: document.querySelector('#evalBar').dataset.evaluationRailOwner,
        boardId: window.App.boardAdapter.getSnapshot().adapterId,
        score: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp
    }));
    expect(qa).toEqual({ rails: 1, owner: initial.owner, boardId: initial.boardId, score: 125 });
});

test('equal, positive, negative, mate, and orientation preserve White perspective', async ({ page }) => {
    await openPlay(page);
    for (const [cp, text] of [[0, '+0.0'], [300, '+3.0'], [-225, '-2.3']]) {
        await page.evaluate(value => window.updateEvalBar(value, null), cp);
        await expect(page.locator('#evalScore')).toHaveText(text);
    }
    await page.evaluate(() => window.updateEvalBar(null, -4));
    await expect(page.locator('#evalScore')).toHaveText('M-4');
    const before = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot());
    await page.evaluate(() => window.flipBoard());
    const after = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot());
    expect(after.mate).toBe(before.mate);
    expect(after.label).toBe(before.label);
    expect(after.orientation).toBe('black');
    await expect(page.locator('#evalBar')).toHaveClass(/eval-flipped/);
});

test('New Game resets score and engine failure exposes a stable accessible error', async ({ page }) => {
    await openPlay(page);
    await page.evaluate(() => window.updateEvalBar(500, null));
    await page.evaluate(() => window.newGame({ mode: 'engine', color: 'white', timeControl: 0 }));
    let snapshot = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot());
    expect(snapshot.scoreType).toBe('neutral');
    expect(snapshot.displayMode).toBe('live');
    await page.evaluate(() => window.__caissaPlayHarness.fail());
    snapshot = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot());
    expect(snapshot.displayMode).toBe('error');
    await expect(page.locator('#evalBar')).toHaveAttribute('aria-label', /engine error/i);
});

test('denied human and FICS decisions clear stale values and block fresh display', async ({ page }) => {
    await openPlay(page);
    await page.evaluate(() => window.updateEvalBar(600, null));
    const results = await page.evaluate(() => {
        const policy = window.CaissaFairPlayPolicy;
        const rail = window.CaissaEvaluationRailInstance;
        const apply = context => rail.applyPolicy(policy.evaluatePurpose('live-evaluation', {
            ...context, purpose: 'live-evaluation'
        }));
        const human = apply({
            source: 'local-play', gameMode: 'human', opponentType: 'human',
            authority: 'local-client', gameStatus: 'active'
        });
        const blocked = rail.setEvaluation(900);
        const fics = apply({
            source: 'fics', opponentType: 'external-human',
            authority: 'external-server', gameStatus: 'active'
        });
        return { human, blocked, fics, snapshot: rail.getSnapshot() };
    });
    expect(results.human.ok && results.fics.ok).toBe(true);
    expect(results.blocked.reasonCode).toBe('POLICY_DENIED');
    expect(results.snapshot.scoreType).toBe('neutral');
    expect(results.snapshot.displayMode).toBe('unavailable');
    await expect(page.locator('#evalScore')).toHaveText('—');
});

test('machine policy restores new evaluation while forged decisions remain rejected', async ({ page }) => {
    await openPlay(page);
    const result = await page.evaluate(() => {
        const rail = window.CaissaEvaluationRailInstance;
        const forged = rail.applyPolicy({
            policyVersion: '1.0.0', decisionId: 'forged', purpose: 'live-evaluation',
            allowed: true, capabilities: { evaluationMode: 'live', mayShowEvaluation: true }
        });
        window.__caissaFairPlayTestContext = {
            source: 'local-play', gameMode: 'human', opponentType: 'human',
            authority: 'local-client', gameStatus: 'active'
        };
        window.updateEvalBar(900, null);
        delete window.__caissaFairPlayTestContext;
        const restored = window.updateEvalBar(-125, null);
        return { forged, restored, snapshot: rail.getSnapshot() };
    });
    expect(result.forged.reasonCode).toBe('INVALID_POLICY');
    expect(result.restored).toBe(true);
    expect(result.snapshot.scoreCp).toBe(-125);
});

const viewports = [
    [320, 568], [375, 667], [390, 844], [412, 915],
    [768, 1024], [1024, 768], [1366, 768], [1440, 900]
];

test('rail geometry and accessibility remain stable across required viewports', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openPlay(page);
    for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => {
            window.App.boardAdapter.resize();
            window.ensureEvalBarLayout();
        });
        const geometry = await page.evaluate(() => {
            const rail = document.querySelector('#evalBar').getBoundingClientRect();
            const board = document.querySelector('#chessboard').getBoundingClientRect();
            return {
                railHeight: Math.round(rail.height), boardHeight: Math.round(board.height),
                overlap: !(rail.right <= board.left || rail.left >= board.right),
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                role: document.querySelector('#evalBar').getAttribute('role'),
                label: document.querySelector('#evalBar').getAttribute('aria-label')
            };
        });
        expect(Math.abs(geometry.railHeight - geometry.boardHeight), `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.overlap, `${width}x${height}`).toBe(false);
        expect(geometry.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.role).toBe('meter');
        expect(geometry.label).toBeTruthy();
    }
    runtime.assertClean();
});
