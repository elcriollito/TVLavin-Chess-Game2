import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function load() {
    const window = {
        CaissaAnalyzeReviewPolicy: {
            presentationSymbol(quality) {
                return ({ Book: '📖', Best: '★', Acceptable: '✓', Inaccuracy: '?!', Mistake: '?', Blunder: '??' })[quality] || '';
            },
            accuracy(results) {
                if (!results.length) return { ok: false };
                return { ok: true, value: Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length) };
            }
        }
    };
    const context = vm.createContext({ window, globalThis: window, Object, Math, Number, String, CustomEvent: class {} });
    for (const file of ['js/play/analysis-summary-projection.js', 'js/play/bots/bots-review-context.js',
        'js/play/bots/bots-analysis-summary-presentation.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    return window;
}

const handoff = Object.freeze({ handoffId: 'analyze-handoff:test', payload: Object.freeze({
    playerColor: 'white', whiteLabel: 'You', blackLabel: 'Pip Bot'
}) });

test('Bots Review context is isolated to completed Bots analysis', () => {
    const window = load();
    const context = window.CaissaBotsReviewContext.create({ owner: 'post-game-core', sourceMode: 'bots' });
    assert.equal(context.ok, true);
    assert.equal(window.CaissaBotsReviewContext.isBotsReview(context.value), true);
    assert.equal(window.CaissaBotsReviewContext.create({ owner: 'post-game-core', sourceMode: 'coach' }).ok, false);
    assert.equal(window.CaissaBotsReviewContext.isBotsReview({ ...context.value, sourceMode: 'coach' }), false);
});

test('summary projects authoritative AnalyzeSection results without inventing categories', () => {
    const window = load();
    const context = window.CaissaBotsReviewContext.create({ owner: 'post-game-core', sourceMode: 'bots' }).value;
    const analysisResults = [
        { moveIndex: 0, quality: 'Book', score: 100, isBestMove: false },
        { moveIndex: 1, quality: 'Acceptable', score: 92, isBestMove: true },
        { moveIndex: 2, quality: 'Mistake', score: 40, isBestMove: false },
        { moveIndex: 3, quality: 'Blunder', score: 10, isBestMove: false }
    ];
    const analyze = { analysisPhase: 'complete', analysisResults, totalPositions: 5, analyzedPositions: 5 };
    const modeled = window.CaissaBotsAnalysisSummaryPresentation.createModel({
        analyze, handoff, context, identity: { name: 'Pip', avatarSrc: '/pip.png' }
    });
    assert.equal(modeled.ok, true);
    assert.equal(modeled.value.phase, 'summary');
    assert.equal(modeled.value.playerAccuracy, 70);
    assert.equal(modeled.value.botAccuracy, 51);
    assert.deepEqual([...modeled.value.rows].map(row => row.label), ['Book', 'Best', 'Acceptable', 'Mistake', 'Blunder']);
    assert.equal(modeled.value.rows.some(row => ['Brilliant', 'Great', 'Miss'].includes(row.label)), false);
    assert.strictEqual(analyze.analysisResults, analysisResults);
});

test('summary reports progress from the existing AnalyzeSection owner', () => {
    const window = load();
    const context = window.CaissaBotsReviewContext.create({ owner: 'post-game-core', sourceMode: 'bots' }).value;
    const modeled = window.CaissaBotsAnalysisSummaryPresentation.createModel({
        analyze: { analysisPhase: 'analyzing', analysisResults: [], totalPositions: 10, analyzedPositions: 4 },
        handoff, context
    });
    assert.equal(modeled.value.phase, 'loading');
    assert.equal(modeled.value.progress, 40);
    assert.equal(window.CaissaBotsAnalysisSummaryPresentation.getSnapshot().analysisOwner, 'AnalyzeSection');
});

test('summary consumes the shared authoritative projection and owns no icon mapping', () => {
    const source = read('js/play/bots/bots-analysis-summary-presentation.js');
    assert.match(source, /CaissaAnalysisSummaryProjection\?\.create/);
    assert.doesNotMatch(source, /QUALITY_ICONS|fa-question|fa-exclamation|fa-bolt/);
});
