import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');

function fixture() {
    const window = {};
    const context = vm.createContext({ window, globalThis: window, Object, Promise });
    for (const file of [
        'js/play/analyze-review-policy.js',
        'js/play/native-coach/coach-review-context.js',
        'js/play/native-coach/coach-review-presentation.js'
    ]) vm.runInContext(read(file), context, { filename: file });
    return window;
}

const handoff = (mode = 'coach', playerColor = 'white') => ({ payload: {
    mode, playerColor, whiteLabel: 'You', blackLabel: 'Coach-assisted game'
} });
const coachContext = window => window.CaissaCoachReviewContext.create({
    owner: 'post-game-core', sourceMode: 'coach'
}).value;

test('Coach Review context is admitted only from Coach post-game', () => {
    const window = fixture();
    const api = window.CaissaCoachReviewContext;
    for (const sourceMode of ['games', 'bots', null]) {
        assert.equal(api.create({ owner: 'post-game-core', sourceMode }).ok, false);
    }
    assert.equal(api.create({ owner: 'unknown', sourceMode: 'coach' }).ok, false);
    const created = api.create({ owner: 'post-game-core', sourceMode: 'coach' });
    assert.equal(created.ok, true);
    assert.equal(api.isCoachReview(created.value), true);
    assert.equal(Object.isFrozen(created.value), true);
});

test('summary derives Player and Coach accuracy and counts from authoritative Analyze results', () => {
    const window = fixture();
    const results = [
        { moveIndex: 0, quality: 'Acceptable', loss: 0, isBestMove: true },
        { moveIndex: 1, quality: 'Book', loss: 0, accuracyIncluded: false, isBestMove: true },
        { moveIndex: 2, quality: 'Mistake', loss: 1.2, isBestMove: false },
        { moveIndex: 3, quality: 'Blunder', loss: 3, isBestMove: false },
        { moveIndex: 4, quality: 'Inaccuracy', loss: .7, isBestMove: false },
        { moveIndex: 5, quality: 'Acceptable', loss: .1, isBestMove: false }
    ];
    const modeled = window.CaissaCoachReviewPresentation.createSummaryModel({
        analyze: { analysisPhase: 'complete', analysisResults: results, analyzedPositions: 7, totalPositions: 7 },
        handoff: handoff(), context: coachContext(window)
    });
    assert.equal(modeled.ok, true);
    assert.equal(modeled.value.phase, 'summary');
    assert.equal(modeled.value.playerAccuracy,
        window.CaissaAnalyzeReviewPolicy.accuracy(results.filter(item => item.moveIndex % 2 === 0)).value);
    assert.equal(modeled.value.coachAccuracy,
        window.CaissaAnalyzeReviewPolicy.accuracy(results.filter(item => item.moveIndex % 2 === 1)).value);
    assert.deepEqual(Array.from(modeled.value.rows, row => ({ ...row })), [
        { label: 'Book', player: 0, coach: 1 },
        { label: 'Best', player: 1, coach: 1 },
        { label: 'Acceptable', player: 1, coach: 1 },
        { label: 'Inaccuracy', player: 1, coach: 0 },
        { label: 'Mistake', player: 1, coach: 0 },
        { label: 'Blunder', player: 0, coach: 1 }
    ]);
    assert.doesNotMatch(JSON.stringify(modeled.value), /Brilliant|Great|Miss/);
});

test('loading copy uses only bounded existing Analyze progress', () => {
    const window = fixture();
    const modeled = window.CaissaCoachReviewPresentation.createSummaryModel({
        analyze: { analysisPhase: 'analyzing', analysisResults: [], analyzedPositions: 3, totalPositions: 8 },
        handoff: handoff(), context: coachContext(window)
    });
    assert.deepEqual({ phase: modeled.value.phase, progress: modeled.value.progress,
        progressText: modeled.value.progressText }, {
        phase: 'loading', progress: 38, progressText: 'Reviewing move 4 of 8'
    });
    assert.doesNotMatch(JSON.stringify(modeled.value), /nodes|NPS|hash|threads|depth|Stockfish/i);
});

test('presentation rejects Games and Bots evidence', () => {
    const window = fixture();
    const analyze = { analysisPhase: 'complete', analysisResults: [] };
    for (const sourceMode of ['games', 'bots']) {
        const context = { schemaVersion: '1.0.0', contextId: 'coach-review', owner: 'post-game-core', sourceMode, active: true };
        assert.equal(window.CaissaCoachReviewPresentation.createSummaryModel({ analyze, handoff: handoff(sourceMode), context }).ok, false);
    }
});

test('boundary integration starts the existing lifecycle once and owns no ply, board, or engine', () => {
    const postGame = read('js/play/post-game-core.js');
    const inline = read('js/play/play-v2-inline-analyze.js');
    const presentation = read('js/play/native-coach/coach-review-presentation.js');
    assert.match(postGame, /sourceMode[\s\S]*CaissaCoachReviewContext\?\.create/);
    assert.match(inline, /reviewPresentation\.mount\(\{ section, host: phaseHost, close: closeButton,[\s\S]*context: input\.reviewContext, handoff: resolved\.value \}\)/);
    assert.match(inline, /if \(!coachReview && playSection\)[\s\S]*playSection\.inert = true/);
    assert.match(inline, /if \(coachReview\)[\s\S]*reviewPresentation\.mount[\s\S]*else \{[\s\S]*section\.classList\.add\('active', 'caissa-play-v2-inline-analyze'\)/);
    assert.match(inline, /AnalyzeSection\.onEnter[\s\S]*reviewPresentation\?\.begin\?\.\(\{ analyze: root\.AnalyzeSection \}\)/);
    assert.match(presentation, /createStructure\(host, close, navigation\)[\s\S]*host\.append\(panel\)/);
    assert.match(presentation, /section\.querySelector\('\.analyze-board-navigation'\)[\s\S]*navigationState/);
    assert.doesNotMatch(presentation, /contextPanel\.append|tabsState|caissa-coach-review-context/);
    assert.match(presentation, /analysisStartRequests > 0[\s\S]*ANALYSIS_ALREADY_REQUESTED/);
    assert.match(presentation, /options\.analyze\.startAnalysis\(\)/);
    assert.match(presentation, /activePlyOwner: 'AnalyzeSection\.currentMoveIndex'/);
    for (const forbidden of [/reviewMoveIndex/, /summaryMoveIndex/, /coachReviewPly/, /new\s+Chess/, /\.move\s*\(/,
        /EngineRegistry/, /Stockfish/, /location\.(?:href|pathname)/]) {
        assert.doesNotMatch(presentation, forbidden);
    }
});
