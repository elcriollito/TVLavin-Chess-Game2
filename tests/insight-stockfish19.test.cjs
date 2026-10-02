const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const registry = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine-registry.js'), 'utf8');

test('Insight factory uses the dedicated Stockfish 19 WASM identity and owner', () => {
    let config;
    function Adapter(value) { config = value; }
    const window = { EngineAdapter: Adapter };
    vm.runInNewContext(registry, { window, console, Map, Object });
    window.EngineRegistry.createInsightEngine();
    assert.equal(config.id, 'stockfish-19-lite');
    assert.equal(config.owner, 'insight-report');
    assert.equal(config.autoStart, false);
    assert.equal(config.requireRuntimeIdentity, true);
    assert.match(config.workerPath, /19\.0\.0/);
    assert.equal(config.defaultOptions.Threads, 1);
    assert.equal(config.defaultOptions.Hash, 16);
});

const coachModule = app.slice(
    app.indexOf('let coachReportData = null;'),
    app.indexOf('// Analyze single game for critical moments')
);

function reportHarness(fail, games = [{ userColor: 'white' }]) {
    let terminated = 0;
    let analyzed = [];
    const engine = {
        id: 'stockfish-19-lite',
        providerId: 'stockfish-19-lite',
        config: {
            version: '19.0.0', runtimeType: 'wasm',
            workerPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js'
        },
        async start() { if (fail === 'start') throw new Error('startup failed'); },
        isReady: () => true,
        getUciIdentity: () => ({
            name: 'Stockfish 19 Lite WASM', author: 'the Stockfish developers', validated: true
        }),
        terminate() { terminated += 1; }
    };
    const context = vm.createContext({
        window: {
            addEventListener() {},
            EngineRegistry: { createInsightEngine: () => engine }
        },
        document: { getElementById: () => null },
        insightProfile: { games },
        AbortController,
        Date,
        Error,
        Number,
        Math,
        setTimeout: fn => { fn(); return 1; },
        clearTimeout() {},
        COACH_CONFIG: {
            ANALYSIS_DEPTH: 12, SCAN_MULTI_PV: 1,
            CONFIRMATION_DEPTH: 14, MULTI_PV: 3
        },
        updateCoachProgress() {},
        async analyzeGameForMoments(game, index, usedEngine, generation) {
            assert.equal(usedEngine, engine);
            analyzed.push(game);
            generation.depths.push(12);
            if (fail === 'analysis') throw new Error('analysis failed');
            return [];
        },
        aggregateCoachData: () => ({ totalMoments: 0 }),
        generateTrainingPlan: () => [],
        displayCoachReport() {},
        showErrorNotification() {},
        showCoachSection() {},
        hideModal() {},
        showModal() {},
        console: { log() {}, warn() {}, error() {} },
        Blob: function Blob() {},
        URL: { createObjectURL() {}, revokeObjectURL() {} }
    });
    vm.runInContext(coachModule, context);
    return { context, engine, terminated: () => terminated, analyzed: () => analyzed };
}

test('report passes a dedicated verified SF19 instance and releases it on success', async () => {
    const harness = reportHarness();
    await harness.context.generateCoachReport(10, 'both');
    const report = vm.runInContext('coachReportData', harness.context);
    assert.equal(harness.terminated(), 1);
    assert.equal(harness.analyzed().length, 1);
    assert.equal(report.engine.version, '19.0.0');
    assert.equal(report.engine.uciName, 'Stockfish 19 Lite WASM');
    assert.equal(report.engine.averageDepthReached, 12);
    assert.equal(report.engine.multiPV, 3);
});

for (const failure of ['start', 'analysis']) {
    test(`report releases its worker on ${failure} failure`, async () => {
        const harness = reportHarness(failure);
        await assert.rejects(harness.context.generateCoachReport(10, 'both'));
        assert.equal(harness.terminated(), 1);
    });
}

test('color filters select only games imported for that player color', async () => {
    const harness = reportHarness(null, [
        { userColor: 'white' }, { userColor: 'black' }, { userColor: 'unknown' }
    ]);
    await harness.context.generateCoachReport(10, 'white');
    assert.equal(harness.analyzed().length, 1);
    assert.equal(harness.analyzed()[0].userColor, 'white');
});

test('generation lifecycle blocks duplicates, rejects stale profiles and terminates on cancel', () => {
    const harness = reportHarness();
    const generation = harness.context.beginCoachGeneration(harness.context.insightProfile);
    assert.throws(
        () => harness.context.beginCoachGeneration(harness.context.insightProfile),
        error => error.code === 'COACH_GENERATION_IN_PROGRESS'
    );
    vm.runInContext('activeCoachGeneration.engine = window.EngineRegistry.createInsightEngine()', harness.context);
    harness.context.insightProfile = { games: [] };
    assert.throws(
        () => harness.context.assertCoachGenerationCurrent(generation),
        error => error.code === 'COACH_GENERATION_CANCELED'
    );
    assert.equal(harness.context.cancelActiveCoachGeneration('test-cancel'), true);
    assert.equal(generation.signal.aborted, true);
    assert.equal(harness.terminated(), 1);
});

const evaluation = app.slice(
    app.indexOf('async function getEngineEvaluation('),
    app.indexOf('// Classify error type')
);

test('evaluation uses primary MultiPV and never the shared Play engine', async () => {
    assert.doesNotMatch(evaluation, /App\.engine/);
    const context = vm.createContext({
        setTimeout, clearTimeout, Error, COACH_CONFIG: { POSITION_TIMEOUT_MS: 15000 }
    });
    vm.runInContext(evaluation, context);
    const engine = {
        setPosition() {},
        go() {
            this.onInfo({ depth: 12, multipv: 1, score: 0.4, mate: null, pv: ['e2e4'] });
            this.onInfo({ depth: 12, multipv: 3, score: -2, mate: null, pv: ['a2a3'] });
            this.onBestMove('e2e4');
        }
    };
    const result = await context.getEngineEvaluation('fen', 12, engine);
    assert.equal(result.score, 0.4);
    assert.equal(result.bestMove, 'e2e4');
    assert.equal(result.lines.length, 2);
    assert.deepEqual(Array.from(result.lines, line => line.multipv), [1, 3]);
    assert.notEqual(result.lines[0], result);
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.equal(engine.onInfo, null);
});

test('missing engine evaluation rejects instead of fabricating a zero score', async () => {
    const context = vm.createContext({
        setTimeout, clearTimeout, Error, COACH_CONFIG: { POSITION_TIMEOUT_MS: 15000 }
    });
    vm.runInContext(evaluation, context);
    const engine = {
        setPosition() {},
        go() { this.onBestMove('e2e4'); }
    };
    await assert.rejects(
        context.getEngineEvaluation('fen', 12, engine),
        /no evaluation/
    );
});

test('custom FEN games start analysis from the PGN setup position', async () => {
    const analysis = app.slice(
        app.indexOf('function coachEvaluationValue('),
        app.indexOf('// Get engine evaluation')
    );
    const loaded = [];
    class FakeChess {
        load_pgn() { return true; }
        history() {
            return [{ color: 'w', san: 'Kh2', from: 'h1', to: 'h2' }];
        }
        load(fen) { loaded.push(fen); return true; }
        reset() { loaded.push('reset'); }
        fen() { return loaded.at(-1); }
        move() {}
        game_over() { return true; }
    }
    const engine = {
        isReady: () => true,
        setMultiPV() {}
    };
    const context = vm.createContext({
        Chess: FakeChess,
        COACH_CONFIG: {
            ANALYSIS_DEPTH: 12, SCAN_MULTI_PV: 1,
            CONFIRMATION_DEPTH: 14, MULTI_PV: 3, POSITION_TIMEOUT_MS: 15000,
            SWING_THRESHOLD: 0.8, BLUNDER_THRESHOLD: 1.2
        },
        assertCoachGenerationCurrent() {},
        getEngineEvaluation: async () => ({ score: 0.2, bestMove: 'h1h2', depth: 12 }),
        classifyError: () => [],
        getGamePhase: () => 'endgame',
        countPieces: () => 2,
        console: { warn() {} },
        Number,
        Math,
        Error
    });
    vm.runInContext(analysis, context);
    await context.analyzeGameForMoments({
        headers: { pgn: '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/7K w - - 0 1"]\n\n1. Kh2' }
    }, 0, engine, {});
    assert.deepEqual(loaded, ['7k/8/8/8/8/8/8/7K w - - 0 1']);
});

test('mate scores remain explicit, signed and non-zero', () => {
    const scorer = app.slice(
        app.indexOf('function coachEvaluationValue('),
        app.indexOf('// Analyze single game')
    );
    const context = vm.createContext({ Number, Math, Error });
    vm.runInContext(scorer, context);
    assert.ok(context.coachEvaluationValue({ mate: 3 }) > 900);
    assert.ok(context.coachEvaluationValue({ mate: -2 }) < -900);
    assert.throws(() => context.coachEvaluationValue({}), /neither/);
});

test('move loss is oriented to the player instead of using absolute swing', () => {
    const scorer = app.slice(
        app.indexOf('function calculateCoachMoveLoss('),
        app.indexOf('// Analyze single game')
    );
    const context = vm.createContext({ Math });
    vm.runInContext(scorer, context);
    assert.equal(context.calculateCoachMoveLoss(0.5, -1, 'w'), 1.5);
    assert.equal(context.calculateCoachMoveLoss(-1, 0.5, 'w'), 0);
    assert.equal(context.calculateCoachMoveLoss(-0.5, 1, 'b'), 1.5);
    assert.equal(context.calculateCoachMoveLoss(1, -0.5, 'b'), 0);
});

test('consecutive plies reuse the shared position evaluation', () => {
    const coachAnalysis = app.slice(
        app.indexOf('async function analyzeGameForMoments('),
        app.indexOf('// Get engine evaluation')
    );
    assert.match(coachAnalysis, /scanCache\.has\(fen\)/);
    assert.match(coachAnalysis, /scanCache\.set\(fen, result\)/);
    assert.match(app, /POSITION_TIMEOUT_MS:\s*15000/);
});

test('Coach scans one line first and confirms candidates deeper with three lines', () => {
    const coachAnalysis = app.slice(
        app.indexOf('async function analyzeGameForMoments('),
        app.indexOf('// Get engine evaluation')
    );
    assert.match(coachAnalysis, /setMultiPV\(COACH_CONFIG\.SCAN_MULTI_PV\)/);
    assert.match(coachAnalysis, /COACH_CONFIG\.ANALYSIS_DEPTH/);
    assert.match(coachAnalysis, /setMultiPV\(COACH_CONFIG\.MULTI_PV\)/);
    assert.match(coachAnalysis, /COACH_CONFIG\.CONFIRMATION_DEPTH/);
    assert.match(coachAnalysis, /alternatives: evalInfo\.lines/);
});

test('two-pass analysis reuses positions and keeps only color-correct confirmed losses', async () => {
    const analysis = app.slice(
        app.indexOf('function coachEvaluationValue('),
        app.indexOf('// Get engine evaluation')
    );
    class FakeChess {
        constructor() { this.state = 0; }
        load_pgn() { return true; }
        history() {
            return [
                { color: 'w', san: 'e4', from: 'e2', to: 'e4' },
                { color: 'b', san: 'e5', from: 'e7', to: 'e5' }
            ];
        }
        reset() { this.state = 0; }
        fen() { return `fen-${this.state}`; }
        move() { this.state += 1; }
        game_over() { return false; }
    }
    const calls = [];
    const multipv = [];
    const scores = {
        12: { 'fen-0': 0, 'fen-1': -1, 'fen-2': -2 },
        14: { 'fen-0': 0.2, 'fen-1': -1.2 }
    };
    const context = vm.createContext({
        Chess: FakeChess,
        COACH_CONFIG: {
            ANALYSIS_DEPTH: 12, SCAN_MULTI_PV: 1,
            CONFIRMATION_DEPTH: 14, MULTI_PV: 3,
            SWING_THRESHOLD: 0.8, BLUNDER_THRESHOLD: 1.2
        },
        assertCoachGenerationCurrent() {},
        async getEngineEvaluation(fen, depth) {
            calls.push([fen, depth]);
            return {
                score: scores[depth][fen], mate: null, bestMove: 'd2d4', depth,
                lines: depth === 14 ? [{ multipv: 1 }, { multipv: 2 }, { multipv: 3 }] : []
            };
        },
        classifyError: () => ['Confirmed'],
        getGamePhase: () => 'opening',
        countPieces: () => 32,
        console: { warn() {} },
        Number,
        Math,
        Error
    });
    vm.runInContext(analysis, context);
    const generation = { candidatesScanned: 0, confirmedMoments: 0 };
    const moments = await context.analyzeGameForMoments(
        { headers: { pgn: '1. e4 e5' } }, 0,
        { isReady: () => true, setMultiPV: value => multipv.push(value) }, generation
    );
    assert.deepEqual(calls.filter(call => call[1] === 12), [
        ['fen-0', 12], ['fen-1', 12], ['fen-2', 12]
    ]);
    assert.deepEqual(multipv, [1, 3, 1]);
    assert.equal(generation.candidatesScanned, 1);
    assert.equal(generation.confirmedMoments, 1);
    assert.equal(moments.length, 1);
    assert.equal(moments[0].moveLoss, 1.4);
    assert.equal(moments[0].alternatives.length, 3);
});

test('resetting Insight restores the importer so providers can change without reload', () => {
    const reset = app.slice(
        app.indexOf('function resetInsightUI()'),
        app.indexOf('// Update the insight indicator')
    );
    const nodes = new Map([
        ['insightImportSection', { style: { display: 'none' } }],
        ['insightResultsSection', { style: { display: 'block' } }],
        ['insightPgnInput', { value: 'PGN' }],
        ['insightFileName', { textContent: 'game.pgn' }],
        ['importProgressSection', { style: { display: 'block' } }],
        ['insightError', { style: { display: 'block' } }]
    ]);
    const context = vm.createContext({
        document: { getElementById: id => nodes.get(id) || null },
        console: { log() {} }
    });
    vm.runInContext(reset, context);
    context.resetInsightUI();
    assert.equal(nodes.get('insightImportSection').style.display, 'block');
    assert.equal(nodes.get('insightResultsSection').style.display, 'none');
});

test('Coach report exposes verified engine metadata in the visible summary and export object', () => {
    const display = app.slice(
        app.indexOf('function displayCoachReport('),
        app.indexOf('// Generate "What\'s Working" content')
    );
    assert.match(display, /Verified Engine/);
    assert.match(display, /averageDepthReached/);
    assert.match(coachModule, /identityValidated/);
    assert.match(coachModule, /workerAsset/);
});

test('Insight Coach analysis is isolated from Play and reimport cancels stale work', () => {
    const coachAnalysis = app.slice(
        app.indexOf('async function generateCoachReport('),
        app.indexOf('// Classify error type')
    );
    assert.doesNotMatch(coachAnalysis, /App\.engine/);
    assert.match(app, /cancelActiveCoachGeneration\('insight-provider-reimport'\)/);
    assert.match(app, /cancelActiveCoachGeneration\('insight-local-reimport'\)/);
    assert.match(app, /cancelActiveCoachGeneration\('coach-modal-closed'\)/);
    assert.match(app, /cancelActiveCoachGeneration\('insight-page-exit'\)/);
});

