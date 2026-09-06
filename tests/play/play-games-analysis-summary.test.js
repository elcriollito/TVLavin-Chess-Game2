import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function load() {
    const window = { CaissaAnalyzeReviewPolicy: {
        accuracy(results) {
            if (!results.length) return { ok: false };
            return { ok: true, value: (results.reduce((sum, item) => sum + item.score, 0) / results.length).toFixed(1) };
        }
    } };
    const context = vm.createContext({ window, globalThis: window, Object, Math, Number, String });
    for (const file of ['js/play/analysis-summary-projection.js', 'js/play/games-review-context.js'])
        vm.runInContext(read(file), context, { filename: file });
    return window;
}

const handoff = Object.freeze({ handoffId: 'analyze-handoff:games', payload: Object.freeze({
    playerColor: 'white', whiteLabel: 'You', blackLabel: 'CAISSA'
}) });

test('Games review context is isolated to completed Play Game analysis', () => {
    const window = load();
    const created = window.CaissaGamesReviewContext.create({ owner: 'post-game-core', sourceMode: 'games' });
    assert.equal(created.ok, true);
    assert.equal(window.CaissaGamesReviewContext.isGamesReview(created.value), true);
    assert.equal(window.CaissaGamesReviewContext.create({ owner: 'post-game-core', sourceMode: 'bots' }).ok, false);
});

test('shared projection reads AnalyzeSection results without mutation or duplicate calculation', () => {
    const window = load();
    const analysisResults = [
        { moveIndex: 0, quality: 'Book', score: 100, accuracyIncluded: false },
        { moveIndex: 1, quality: 'Acceptable', score: 82, isBestMove: true },
        { moveIndex: 2, quality: 'Inaccuracy', score: 61 },
        { moveIndex: 3, quality: 'Mistake', score: 34 },
        { moveIndex: 4, quality: 'Blunder', score: 10 }
    ];
    const analyze = { analysisPhase: 'complete', analysisResults, analyzedPositions: 6, totalPositions: 6 };
    const modeled = window.CaissaAnalysisSummaryProjection.create({
        analyze, handoff, playerLabel: 'You', opponentLabel: 'CAISSA', acceptableLabel: 'Good'
    });
    assert.equal(modeled.ok, true);
    assert.equal(modeled.value.phase, 'summary');
    assert.equal(modeled.value.playerLabel, 'You');
    assert.equal(modeled.value.opponentLabel, 'CAISSA');
    assert.deepEqual([...modeled.value.rows].map(row => [row.quality, row.label]), [
        ['Book', 'Book'], ['Best', 'Best'], ['Acceptable', 'Good'], ['Inaccuracy', 'Inaccuracy'],
        ['Mistake', 'Mistake'], ['Blunder', 'Blunder']
    ]);
    assert.strictEqual(analyze.analysisResults, analysisResults);
});

test('progress is derived only from authoritative analyzed and total positions', () => {
    const window = load();
    const modeled = window.CaissaAnalysisSummaryProjection.create({
        analyze: { analysisPhase: 'analyzing', analysisResults: [], analyzedPositions: 4, totalPositions: 10 }, handoff
    });
    assert.deepEqual(JSON.parse(JSON.stringify(modeled.value)), {
        phase: 'loading', progress: 40, progressText: 'Reviewing move 5 of 10'
    });
});

test('Games presentation declares one AnalyzeSection owner and shared Guided Review handoff', () => {
    const source = read('js/play/games-analysis-summary-presentation.js');
    assert.match(source, /analysisOwner: 'AnalyzeSection'/);
    assert.match(source, /analysisResultsOwner: 'AnalyzeSection\.analysisResults'/);
    assert.match(source, /caissa:games-guided-review-request/);
    assert.match(source, /CaissaGamesGuidedReviewPresentation\?\.enter/);
    assert.doesNotMatch(source, /Stockfish|new Worker|accuracy\s*\(/);
});
