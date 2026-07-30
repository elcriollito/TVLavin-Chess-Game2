import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

const scenarios = [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } }
];

for (const scenario of scenarios) {
    test(`${scenario.name} selector respects limits, chronology and technical-only boundaries`, async ({ page }) => {
        await page.setViewportSize(scenario.viewport);
        await page.goto('/play/games?simplified=1');
        const proof = await page.evaluate(async () => {
            await window.CaissaPlayLazyLoader.load('mentor-critical-moments', { qa: true });
            const ev = cp => ({ type: 'cp', cp, mate: null, perspective: 'white' });
            const positions = [
                [0, 0, null], [1, -250, 'white'], [4, 200, 'black'],
                [7, -300, 'white'], [10, 250, 'black'], [13, -350, 'white']
            ].map(([ply, cp, mover]) => ({
                schemaVersion: '1.0.0', positionId: `position:${ply}`, ply,
                evaluation: ev(cp), bestMove: { uci: 'e2e4' },
                playedMove: ply ? { uci: 'd2d4', san: 'd4' } : null,
                mover, sideToMove: mover === 'white' ? 'black' : 'white',
                phase: ply < 4 ? 'opening' : ply < 10 ? 'middlegame' : 'endgame',
                material: { whiteMinusBlack: ply >= 10 ? -5 : 0 }, terminal: ply === 13
            }));
            const result = { schemaVersion: '1.0.0', resultId: 'analysis-result:browser',
                runId: 'run:browser', requestId: 'request:browser', status: 'complete',
                summary: { positionsRequested: positions.length, positionsCompleted: positions.length,
                    partial: false }, positions };
            const selections = [1, 3, 5].map(limit =>
                window.CaissaCriticalMoments.select(result, {
                    requestId: 'request:browser', review: { criticalMomentLimit: limit }
                }).value);
            return {
                selections, inspect: window.CaissaCriticalMoments.inspect(),
                boards: document.querySelectorAll('#chessboard').length,
                resources: window.__playTestInstrumentation?.snapshot?.() || null,
                url: location.href, analyzeBoard: !!window.CaissaAnalyzeSection?.board
            };
        });
        expect(proof.selections.map(value => value.selectedCount)).toEqual([1, 3, 5]);
        for (const selection of proof.selections) {
            expect(selection.selectedCount).toBeLessThanOrEqual(selection.requestedLimit);
            expect(selection.selectedMoments.map(moment => moment.ply))
                .toEqual([...selection.selectedMoments].sort((a, b) => a.ply - b.ply).map(moment => moment.ply));
            expect(selection.capabilities).toEqual({
                mentorExplanation: false, guidedReplay: false,
                knowledgeMapping: false, recommendations: false
            });
            expect(JSON.stringify(selection)).not.toMatch(/moveGrade|mentorText|knowledgeUnit|strength|weakness/i);
        }
        expect(proof.inspect.engineRequests).toBe(0);
        expect(proof.inspect.storageWrites).toBe(0);
        expect(proof.inspect.listeners).toBe(0);
        expect(proof.inspect.timers).toBe(0);
        expect(proof.boards).toBe(1);
        expect(proof.analyzeBoard).toBe(false);
        expect(proof.url).not.toMatch(/(?:pgn|fen)=/i);
    });
}

test('adjacent sequence deduplicates, weak evidence stays empty and partial result is honest', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(async () => {
        await window.CaissaPlayLazyLoader.load('mentor-critical-moments', { qa: true });
        const p = (ply, cp, options = {}) => ({
            schemaVersion: '1.0.0', positionId: `position:${ply}`, ply,
            evaluation: { type: options.mate == null ? 'cp' : 'mate',
                cp: options.mate == null ? cp : null, mate: options.mate ?? null, perspective: 'white' },
            bestMove: { uci: 'e2e4' }, playedMove: ply ? { uci: 'd2d4', san: 'd4' } : null,
            mover: options.mover || (ply % 2 ? 'white' : 'black'),
            phase: options.phase || 'middlegame', material: { whiteMinusBlack: options.material || 0 },
            terminal: options.terminal === true
        });
        const envelope = (positions, status = 'complete') => ({
            schemaVersion: '1.0.0', runId: `run:${status}:${positions.length}`,
            requestId: 'request:browser', status,
            summary: { partial: status === 'partial' }, positions
        });
        const adjacent = window.CaissaCriticalMoments.select(envelope([
            p(0, 0), p(1, -250), p(2, 200, { mover: 'black' }),
            p(3, null, { mate: 1 }), p(4, null, { mate: 1, terminal: true })
        ]), { requestId: 'request:browser', review: { criticalMomentLimit: 5 } }).value;
        const weak = window.CaissaCriticalMoments.select(envelope([
            p(0, 0), p(1, 15), p(2, -10, { mover: 'black' })
        ]), { requestId: 'request:browser', review: { criticalMomentLimit: 5 } }).value;
        const partial = window.CaissaCriticalMoments.select(envelope([
            p(0, 0), p(1, -200)
        ], 'partial'), { requestId: 'request:browser', review: { criticalMomentLimit: 3 } }).value;
        return { adjacent, weak, partial };
    });
    expect(proof.adjacent.selectedCount).toBe(1);
    expect(proof.adjacent.suppressedCount).toBeGreaterThan(0);
    expect(proof.weak.selectedCount).toBe(0);
    expect(proof.partial.incomplete).toBe(true);
    expect(proof.partial.selectedCount).toBe(1);
});

test('PostGame explicitly selects from a completed envelope without changing Analyze or action hierarchy', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().mentor.request?.requestId)).toBeTruthy();
    const proof = await page.evaluate(async () => {
        const requestId = window.CaissaPostGameExperienceInstance.getSnapshot().mentor.request.requestId;
        const result = {
            schemaVersion: '1.0.0', runId: 'run:post-game', requestId, status: 'complete',
            summary: { partial: false }, positions: [
                { positionId: 'position:0', ply: 0,
                    evaluation: { cp: 100, mate: null, perspective: 'white' },
                    bestMove: { uci: 'e2e4' }, playedMove: null, mover: null,
                    phase: 'middlegame', material: { whiteMinusBlack: 0 }, terminal: false },
                { positionId: 'position:1', ply: 1,
                    evaluation: { cp: -200, mate: null, perspective: 'white' },
                    bestMove: { uci: 'd7d5' }, playedMove: { uci: 'd2d4', san: 'd4' },
                    mover: 'white', phase: 'middlegame',
                    material: { whiteMinusBlack: -3 }, terminal: false }
            ]
        };
        const selected = await window.CaissaPostGameExperienceInstance.selectCriticalMoments(result);
        const snapshot = window.CaissaPostGameExperienceInstance.getSnapshot();
        return {
            selected, snapshot, primary: document.querySelectorAll(
                '.caissa-post-game__action--primary').length,
            analyzeBoard: !!window.CaissaAnalyzeSection?.board
        };
    });
    expect(proof.selected.ok).toBe(true);
    expect(proof.selected.value.selectedCount).toBe(1);
    expect(proof.snapshot.mentor.criticalMomentSelection.selectedCount).toBe(1);
    expect(proof.primary).toBe(1);
    expect(proof.analyzeBoard).toBe(false);
});
