import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

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

test('boundary integration starts the existing lifecycle once and keeps review ply ownership in AnalyzeSection', () => {
    const postGame = read('js/play/post-game-core.js');
    const inline = read('js/play/play-v2-inline-analyze.js');
    const presentation = read('js/play/native-coach/coach-review-presentation.js');
    assert.match(postGame, /sourceMode[\s\S]*CaissaCoachReviewContext\?\.create/);
    assert.match(inline, /reviewPresentation\.mount\(\{ section, host: phaseHost, close: closeButton,[\s\S]*context: input\.reviewContext, handoff: resolved\.value \}\)/);
    assert.match(inline, /if \(!embeddedReview && playSection\)[\s\S]*playSection\.inert = true/);
    assert.match(inline, /if \(embeddedReview\)[\s\S]*reviewPresentation\.mount[\s\S]*else \{[\s\S]*section\.classList\.add\('active', 'caissa-play-v2-inline-analyze'\)/);
    assert.match(inline, /AnalyzeSection\.onEnter[\s\S]*reviewPresentation\?\.begin\?\.\(\{ analyze: root\.AnalyzeSection \}\)/);
    assert.match(presentation, /createSummaryStructure\(options\.close\)/);
    assert.match(presentation, /phase: 'review-summary', content: summary\.panel,[\s\S]*foot: summary\.foot/);
    assert.doesNotMatch(presentation, /section\.querySelector\('\.analyze-board-navigation'\)|navigationState/);
    assert.doesNotMatch(presentation, /contextPanel\.append|tabsState|caissa-coach-review-context/);
    assert.match(presentation, /analysisStartRequests > 0[\s\S]*ANALYSIS_ALREADY_REQUESTED/);
    assert.match(presentation, /options\.analyze\.startAnalysis\(\)/);
    assert.match(presentation, /activePlyOwner: 'AnalyzeSection\.currentMoveIndex'/);
    for (const forbidden of [/reviewMoveIndex/, /summaryMoveIndex/, /coachReviewPly/, /new\s+Chess/, /\.move\s*\(/,
        /EngineRegistry/, /Stockfish/, /location\.(?:href|pathname)/]) {
        assert.doesNotMatch(presentation, forbidden);
    }
});

test('Guided Review derives concise and expanded copy only from authoritative move evidence', () => {
    const window = fixture();
    const analyze = {
        currentMoveIndex: 1,
        getLoadedMoves: () => ['e4', 'd5'],
        analysisResults: [{}, { moveIndex: 1, move: 'd5', quality: 'Inaccuracy', annotation: '?!',
            recommendationAvailable: true, bestMoveSan: 'Nf6', evalBefore: 0.25, evalAfter: 0.82,
            mateAfter: null, loss: 0.57 }]
    };
    const concise = window.CaissaCoachReviewPresentation.createGuidedModel(analyze, false, handoff('coach', 'black'));
    const expanded = window.CaissaCoachReviewPresentation.createGuidedModel(analyze, true, handoff('coach', 'black'));
    assert.equal(concise.index, 1);
    assert.equal(concise.message, 'You played d5. Nf6 was the stronger continuation in the analysis.');
    assert.equal(concise.detail, '');
    assert.match(expanded.detail, /changed from \+0\.25 before the move to \+0\.82 after it/);
    assert.doesNotMatch(JSON.stringify(expanded), /Brilliant|Great|Miss/);
});

test('Guided Review Next selects interleaved two-sided moments chronologically without wraparound', () => {
    const window = fixture();
    const qualities = ['Acceptable', 'Mistake', 'Inaccuracy', 'Acceptable', 'Acceptable',
        'Inaccuracy', 'Acceptable', 'Acceptable', 'Blunder', 'Mistake'];
    const analyze = { currentMoveIndex: 0, analysisResults: qualities.map((quality, moveIndex) => ({
        moveIndex, quality, isBestMove: moveIndex === 0 || moveIndex === 3 || moveIndex === 6
    })) };
    const review = window.CaissaCoachReviewPresentation;
    assert.deepEqual([...review.reviewWorthyClassifications], ['Inaccuracy', 'Mistake', 'Blunder']);
    assert.deepEqual([...review.findReviewMoments(analyze)], [1, 2, 5, 8, 9]);
    for (const [current, destination] of [[0, 1], [1, 2], [2, 5], [5, 8], [8, 9], [9, null]]) {
        analyze.currentMoveIndex = current;
        assert.equal(review.findNextReviewMoment(analyze), destination);
    }
    const opponent = { currentMoveIndex: 1, getLoadedMoves: () => ['e4', 'd5'], analysisResults: [null, {
        moveIndex: 1, quality: 'Mistake', annotation: '?', recommendationAvailable: true,
        bestMoveSan: 'Nf6', evalBefore: 0.2, evalAfter: 1.4, loss: 1.2
    }] };
    const narration = review.createGuidedModel(opponent, false, handoff('coach', 'white'));
    assert.match(narration.message, /^Your opponent played d5, classified as mistake\./);
    assert.match(narration.message, /Nf6 was the stronger continuation available to them/);
});

test('Review Complete persists after the final negative moment and reopens only before it', () => {
    const window = fixture();
    const analyze = { currentMoveIndex: 9, analysisResults: Array.from({ length: 14 }, (_, moveIndex) => ({
        moveIndex, quality: moveIndex === 10 ? 'Inaccuracy' : 'Acceptable', unavailable: false
    })) };
    const review = window.CaissaCoachReviewPresentation;
    assert.equal(review.isReviewComplete(analyze), false);
    assert.equal(review.findNextReviewMoment(analyze), 10);
    for (const ply of [10, 11, 12, 13]) {
        analyze.currentMoveIndex = ply;
        assert.equal(review.isReviewComplete(analyze), true, `ply ${ply}`);
        assert.equal(review.findNextReviewMoment(analyze), null, `ply ${ply}`);
    }
    analyze.currentMoveIndex = 9;
    assert.equal(review.isReviewComplete(analyze), false);
});

test('exploration is a separate temporary branch and never declares another review ply owner', () => {
    const presentation = read('js/play/native-coach/coach-review-presentation.js');
    const exploration = read('js/play/native-coach/coach-review-exploration.js');
    const app = read('app.js');
    assert.match(exploration, /const game = new root\.Chess\(\)/);
    assert.match(exploration, /baseFen: options\.fen, moves: \[\], positions: \[options\.fen\], cursor: 0/);
    assert.match(exploration, /reviewPlyOwner: 'AnalyzeSection\.currentMoveIndex'/);
    assert.match(presentation, /getSnapshot\?\.\(\)\.engineEnabled === true/);
    assert.match(presentation, /data-coach-exploration-engine-label/);
    assert.match(app, /isCoachReviewExplorationActive\(\)[\s\S]*CaissaCoachReviewExploration\.playMove/);
    assert.doesNotMatch(exploration, /App\.(?:game|moveHistory|currentMoveIndex)\s*=/);
    assert.doesNotMatch(presentation + exploration, /guidedMoveIndex|reviewStepIndex|coachReviewMoveIndex/);
});

test('temporary exploration cursor reproduces positions and truncates a changed continuation', () => {
    const rendered = [];
    const authoritative = { moveHistory: Object.freeze(['authoritative']), currentMoveIndex: 7 };
    const window = {
        Chess,
        document: { body: { classList: { add() {}, remove() {} } } },
        App: {
            ...authoritative,
            board: { position(fen) { rendered.push(fen); } },
            boardAdapter: { setLastMove() {}, setInteractionEnabled() {}, clearSelection() {}, clearLegalTargets() {} }
        }
    };
    const context = vm.createContext({ window, globalThis: window, Object, Promise });
    vm.runInContext(read('js/play/native-coach/coach-review-exploration.js'), context,
        { filename: 'coach-review-exploration.js' });
    const api = window.CaissaCoachReviewExploration;
    const analyze = { ensureAnalysisEngine: async () => null, teardownAnalysisEngine() {} };
    const start = new Chess().fen();
    assert.equal(api.enter({ fen: start, analyze }).ok, true);
    assert.equal(api.playMove('e2', 'e4'), true); const afterOne = api.getFen();
    assert.equal(api.playMove('e7', 'e5'), true); const afterTwo = api.getFen();
    assert.equal(api.playMove('g1', 'f3'), true); const oldAfterThree = api.getFen();
    assert.deepEqual([...api.getLine()].map(move => move.san), ['e4', 'e5', 'Nf3']);
    assert.equal(api.previous().ok, true);
    assert.equal(api.getFen(), afterTwo);
    assert.equal(api.first().ok, true);
    assert.equal(api.getFen(), start);
    assert.equal(api.next().ok, true);
    assert.equal(api.getFen(), afterOne);
    assert.equal(api.last().ok, true);
    assert.equal(api.getFen(), oldAfterThree);
    assert.equal(api.previous().ok, true);
    assert.equal(api.playMove('b1', 'c3'), true);
    assert.deepEqual([...api.getLine()].map(move => move.san), ['e4', 'e5', 'Nc3']);
    assert.notEqual(api.getFen(), oldAfterThree);
    assert.deepEqual({ ...api.getSnapshot() }, {
        schemaVersion: '1.2.0', active: true, baseFen: start, currentFen: api.getFen(), temporaryPlyCount: 3,
        cursor: 3, atFirst: false, atLast: true, engineEnabled: true, effortPresetId: 'balanced',
        analysisDepth: 14, reviewPlyOwner: 'AnalyzeSection.currentMoveIndex'
    });
    assert.equal(window.App.moveHistory, authoritative.moveHistory);
    assert.equal(window.App.currentMoveIndex, authoritative.currentMoveIndex);
    api.leave();
    assert.equal(api.getSnapshot().temporaryPlyCount, 0);
    assert.equal(rendered.length > 0, true);
});

test('Review Settings reuses the authoritative PGN export and exposes only human effort presets', () => {
    const presentation = read('js/play/native-coach/coach-review-presentation.js');
    const exploration = read('js/play/native-coach/coach-review-exploration.js');
    const postGame = read('js/play/post-game-core.js');
    assert.match(presentation, /downloadPgn\?\.\(\{ preservePresentation: true \}\)/);
    assert.match(postGame, /new this\.#Blob\(\[this\.#record\.notation\.pgn\]/);
    assert.match(postGame, /preservePresentation !== true[\s\S]*this\.execute\('download-pgn'\)/);
    assert.match(presentation, /data-coach-guided-settings/);
    assert.match(presentation, /data-coach-review-save-pgn/);
    assert.match(presentation, /\['quick', 'balanced', 'deep'\]/);
    assert.match(exploration, /quick:[\s\S]*depth: 10/);
    assert.match(exploration, /balanced:[\s\S]*depth: 14/);
    assert.match(exploration, /deep:[\s\S]*depth: 18/);
    assert.match(exploration, /startAnalysis\(fen,[\s\S]*EFFORT_PRESETS\[effortPresetId\]\.depth/);
    assert.doesNotMatch(presentation, />\s*(?:Threads|Hash|Nodes|NPS|UCI|Depth)\s*</i);
});

test('Coach Review projects existing ply and exploration evaluations into the single visible rail owner', () => {
    const presentation = read('js/play/native-coach/coach-review-presentation.js');
    const rail = read('js/play/evaluation-rail.js');
    const app = read('app.js');
    assert.match(presentation, /selected\.evalAfter, selected\.mateAfter, 'coach-review-ply'/);
    assert.match(presentation, /info\.evaluation, info\.mate, 'coach-review-exploration'/);
    assert.match(presentation, /CaissaEvaluationRailInstance/);
    assert.match(rail, /\['live', 'post-game'\]\.includes\(this\.#mode\)/);
    assert.match(app, /!document\.body\?\.classList\?\.contains\('caissa-coach-review-summary-active'\)/);
    assert.doesNotMatch(presentation, /new\s+Engine|new\s+Worker/);
});

test('interactive Analysis effort is session-only and leaves Balanced at the existing depth', async () => {
    const depths = [];
    class Chess {
        load(fen) { this.position = fen; return true; }
        fen() { return this.position; }
        moves() { return []; }
        get() { return null; }
        game_over() { return false; }
    }
    const window = {
        Chess,
        document: { body: { classList: { add() {}, remove() {} } } },
        App: { board: { position() {} }, boardAdapter: {
            setLastMove() {}, setInteractionEnabled() {}, clearSelection() {}, clearLegalTargets() {}
        } }
    };
    const context = vm.createContext({ window, globalThis: window, Object, Promise });
    vm.runInContext(read('js/play/native-coach/coach-review-exploration.js'), context,
        { filename: 'coach-review-exploration.js' });
    const engine = { stopAnalysis() {}, startAnalysis(_fen, _callback, depth) { depths.push(depth); } };
    const analyze = { ensureAnalysisEngine: async () => engine, analysisEngine: engine, teardownAnalysisEngine() {} };
    const api = window.CaissaCoachReviewExploration;
    assert.deepEqual({ preset: api.getSnapshot().effortPresetId, depth: api.getSnapshot().analysisDepth },
        { preset: 'balanced', depth: 14 });
    assert.equal(api.setEffortPreset('quick').ok, true);
    assert.equal(api.enter({ fen: 'review-fen', analyze }).ok, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(depths.at(-1), 10);
    assert.equal(api.setEffortPreset('deep').ok, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(depths.at(-1), 18);
    assert.equal(api.getSnapshot().reviewPlyOwner, 'AnalyzeSection.currentMoveIndex');
    api.leave();
    assert.equal(api.getSnapshot().effortPresetId, 'deep');
});
