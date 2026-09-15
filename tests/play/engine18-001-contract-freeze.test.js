import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const ROOT = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, ROOT), 'utf8');
const normalized = path => read(path).replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('tests/fixtures/engine18/engine18-001-contracts.json'));
const plain = value => JSON.parse(JSON.stringify(value));

function runScripts(paths, window = {}) {
    const context = {
        window, globalThis: window, Object, Number, String, Boolean, Array, Map, Set,
        WeakSet, Uint32Array, Date, Math, JSON, Error, RegExp, console, Chess
    };
    for (const path of paths) vm.runInNewContext(read(path), context, { filename: path });
    return window;
}

function isolationFixture() {
    let request = 0;
    let session = 0;
    const window = {};
    runScripts(['js/play/engine-request-isolation.js'], window);
    const api = window.CaissaEngineRequestIsolation;
    const boundary = api.createBoundary({
        now: () => Date.parse('2026-09-14T12:00:00.000Z'),
        requestIdFactory: () => `request:${++request}`,
        sessionIdFactory: () => `session:${++session}`
    });
    return { api, boundary };
}

function activeRequest(fixture, fen, purpose = 'opponent-move') {
    const { api, boundary } = fixture;
    if (!boundary.getCurrentSession()) boundary.createSession();
    const sessionId = boundary.getCurrentSession().sessionId;
    const positionToken = api.createPositionToken({ sessionId, fen, moveCount: 0, turn: fen.split(' ')[1] });
    const created = boundary.createRequest({ purpose, sessionId, positionToken, fen,
        moveCount: 0, turn: fen.split(' ')[1], parameters: { depth: 4, multiPv: 1 } });
    assert.equal(created.ok, true);
    assert.equal(boundary.submit(created.request).ok, true);
    return created.request;
}

function response(fixture, request, context = {}) {
    return fixture.boundary.acceptResponse({
        requestId: request.requestId,
        sessionId: request.sessionId,
        purpose: request.purpose,
        positionToken: request.positionToken,
        message: 'bestmove e2e4'
    }, {
        sessionId: context.sessionId ?? request.sessionId,
        purpose: context.purpose ?? request.purpose,
        positionToken: context.positionToken ?? request.positionToken
    });
}

function adapterFixture() {
    const audit = { created: 0, active: 0, maximum: 0, terminated: 0, workers: [] };
    class FakeWorker {
        constructor(url) {
            this.url = String(url); this.messages = []; this.onmessage = null;
            audit.created += 1; audit.active += 1; audit.maximum = Math.max(audit.maximum, audit.active);
            audit.workers.push(this);
        }
        postMessage(message) { this.messages.push(String(message)); }
        emit(message) { this.onmessage?.({ data: message }); }
        terminate() { audit.terminated += 1; audit.active -= 1; }
    }
    const window = { location: { pathname: '/play' }, Worker: FakeWorker, WebAssembly: {}, CAISSA_DEBUG: false };
    vm.runInNewContext(read('js/engine-adapter.js'), {
        window, Worker: FakeWorker, WebAssembly: window.WebAssembly,
        setTimeout: () => 1, clearTimeout: () => {}, console
    });
    return { window, audit };
}

function makeReady(adapter, worker, identity = 'Stockfish 2019-08-15 Multi-Variant') {
    worker.emit(`id name ${identity}`);
    worker.emit('id author frozen-baseline');
    worker.emit('uciok');
    worker.emit('readyok');
    assert.equal(adapter.isReady(), true);
}

test('ENGINE18-001 manifest freezes the four explicit provider roles without activating migration', () => {
    assert.equal(manifest.schemaVersion, '1.0.0');
    assert.equal(manifest.capturedFromOriginMain, '197d5e26ec408a6ffdc97078724f2c4f3c07fdac');
    assert.equal(manifest.migrationPerformed, false);
    assert.equal(manifest.engines.playGame.providerId, 'stockfish');
    assert.equal(manifest.engines.playCoachActive.providerId, 'stockfish');
    assert.equal(manifest.engines.playBots.status, 'FROZEN');
    assert.equal(manifest.engines.playBots.migrationTarget, null);
    assert.equal(manifest.engines.coachReviewManual.providerId, 'stockfish-18-lite');

    const registry = runScripts(['js/engine-registry.js']).EngineRegistry;
    for (const role of ['playGame', 'playCoachActive', 'playBots']) {
        const expected = manifest.engines[role];
        const actual = registry.get(expected.providerId);
        assert.equal(actual.version, expected.registryVersion);
        assert.equal(actual.workerPath, expected.worker);
        assert.equal(actual.execution, expected.execution);
        assert.equal(actual.defaultOptions.MultiPV, 1);
    }
    const review = registry.getAnalyze('stockfish-18-lite');
    assert.equal(review.name, manifest.engines.coachReviewManual.identity);
    assert.equal(review.version, '18.0.0');
    assert.equal(review.workerPath, manifest.engines.coachReviewManual.worker);
    assert.equal(review.wasmPath, manifest.engines.coachReviewManual.wasm);
});

test('Play Game target strengths preserve depth, movetime, MultiPV and book eligibility contracts', () => {
    const window = runScripts(['js/play/opponent-strength.js']);
    for (const expected of manifest.playGameStrengths) {
        const description = window.CaissaOpponentStrength.describe(expected.target).value;
        assert.equal(description.searchDepth, expected.depth, `target ${expected.target}`);
        assert.equal(description.fullPower, expected.fullPower, `target ${expected.target}`);
        window.CaissaOpponentStrengthSession.beginGame(expected.target);
        const search = plain(window.CaissaOpponentStrengthSession.getSearchOptions());
        assert.equal(search?.depth ?? null, expected.depth, `target ${expected.target}`);
        assert.equal(search === null ? 2000 : null, expected.movetimeMs, `target ${expected.target}`);
        assert.equal(search === null, expected.bookEligible, `target ${expected.target}`);
        assert.equal(expected.multiPv, 1);
    }
    const app = read('app.js');
    assert.match(app, /!activeBot && !targetStrength && App\.useOpeningBook/);
    assert.match(app, /const engineSearch = \{ \.\.\.\(botSearch \|\| \{ movetime: 2000 \}\)/);
});

test('canonical FEN is sent unchanged and only an attributed legal result is committable', () => {
    const { window, audit } = adapterFixture();
    const adapter = new window.EngineAdapter({ workerPath: '/engine/stockfish-working.js', defaultOptions: { MultiPV: 1 } });
    const worker = audit.workers[0];
    makeReady(adapter, worker);
    const fen = manifest.canonicalPositions[1].fen;
    let delivered = null;
    adapter.getBestMoveAttributed(fen, (bestMove, ponder, generation) => {
        delivered = { bestMove, ponder, generation };
    }, { depth: 4 });
    assert.deepEqual(worker.messages.slice(-2), [`position fen ${fen}`, 'go depth 4']);
    assert.equal(adapter.currentFen, fen);
    worker.emit('bestmove f1b5 ponder a7a6');
    assert.equal(delivered.bestMove, 'f1b5');
    const game = new Chess(fen);
    assert.ok(game.move({ from: delivered.bestMove.slice(0, 2), to: delivered.bestMove.slice(2, 4) }));
    assert.equal(audit.created, 1);

    const app = read('app.js');
    assert.match(app, /const currentFen = App\.game\.fen\(\)/);
    assert.match(app, /App\.game\.fen\(\) !== currentFen/);
    assert.match(app, /acceptEngineIsolationResponse\(isolationRequest/);
    assert.match(app, /const move = App\.game\.move\(\{/);
    assert.match(app, /if \(move\) \{/);
});

test('normal, superseded, Undo, Reset, rematch, route, mode and game-over races fail closed', () => {
    const startFen = manifest.canonicalPositions[0].fen;
    const nextFen = manifest.canonicalPositions[1].fen;
    const observed = {};

    {
        const f = isolationFixture(); const request = activeRequest(f, startFen);
        observed.normal = response(f, request).status;
    }
    {
        const f = isolationFixture(); const old = activeRequest(f, startFen);
        activeRequest(f, nextFen); observed['superseded-search'] = response(f, old).status;
    }
    for (const id of ['undo', 'route-change', 'mode-change', 'game-over']) {
        const f = isolationFixture(); const request = activeRequest(f, startFen);
        f.boundary.cancel(request.requestId); observed[id] = response(f, request).status;
    }
    for (const id of ['reset', 'rematch']) {
        const f = isolationFixture(); const request = activeRequest(f, startFen);
        f.boundary.createSession();
        observed[id] = response(f, request, { sessionId: f.boundary.getCurrentSession().sessionId }).status;
    }

    for (const race of manifest.fenAcceptance.races)
        assert.equal(observed[race.id], race.expected, race.id);
    assert.deepEqual({ staleCanonicalCommits: 0, illegalCommits: 0, wrongFenCommits: 0 }, {
        staleCanonicalCommits: manifest.fenAcceptance.maximumStaleCommits,
        illegalCommits: manifest.fenAcceptance.maximumIllegalCommits,
        wrongFenCommits: manifest.fenAcceptance.maximumWrongFenCommits
    });
});

test('EngineAdapter freezes UCI lifecycle, generation barrier, PV parsing and White-POV normalization', () => {
    const { window, audit } = adapterFixture();
    const adapter = new window.EngineAdapter({ workerPath: '/engine/stockfish-working.js', defaultOptions: { MultiPV: 1 } });
    const worker = audit.workers[0]; makeReady(adapter, worker);
    assert.deepEqual(worker.messages.slice(0, 4), [
        'uci', 'setoption name MultiPV value 1', 'setoption name MultiPV value 1', 'isready'
    ]);

    adapter.currentFen = manifest.canonicalPositions[0].fen;
    assert.equal(adapter.normalizeScore(75), 0.75);
    assert.equal(adapter.normalizeMate(3), 3);
    adapter.currentFen = manifest.canonicalPositions[2].fen;
    assert.equal(adapter.normalizeScore(75), -0.75);
    assert.equal(adapter.normalizeMate(3), -3);
    const parsed = adapter.parseInfo('info depth 12 multipv 1 score cp 75 pv e7e5 g1f3');
    assert.equal(parsed.depth, 12);
    assert.equal(parsed.score, -0.75);
    assert.deepEqual(plain(parsed.pv), ['e7e5', 'g1f3']);

    const delivered = [];
    adapter.getBestMoveAttributed('fen-a w', move => delivered.push(move), { depth: 3 });
    adapter.getBestMoveAttributed('fen-b w', move => delivered.push(move), { depth: 4 });
    worker.emit('bestmove e2e4');
    assert.deepEqual(delivered, []);
    worker.emit('readyok'); worker.emit('bestmove d2d4');
    assert.deepEqual(delivered, ['d2d4']);
    assert.equal(adapter.inspectAttribution().diagnostics.superseded, 1);
});

test('one gameplay Worker and ordered Coach-to-Review ownership handoff remain enforced', () => {
    const { window, audit } = adapterFixture();
    const gameplay = new window.EngineAdapter({ workerPath: '/engine/stockfish-working.js', owner: 'native-play-v2' });
    makeReady(gameplay, audit.workers[0]);
    assert.equal(audit.active, 1);
    gameplay.terminate('postgame-mode-transition');
    assert.equal(audit.active, 0);
    const review = new window.EngineAdapter({
        workerPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
        owner: 'analyze-v2-stockfish-18'
    });
    assert.equal(audit.active, 1);
    assert.equal(audit.maximum, manifest.workerOwnership.maximumOrdinaryCoachReviewWorkers);
    review.terminate('test-complete');
    assert.equal(audit.active, 0);

    const app = read('app.js');
    const analyze = read('js/analyze-section.js');
    assert.match(app, /App\.engine = createEngineInstance\(engineId/);
    assert.match(app, /App\.engine\?\.terminate.*postgame-mode-transition/);
    assert.match(analyze, /createAnalyzeEngine\('stockfish-18-lite'/);
    assert.equal(app.indexOf("terminate('postgame-mode-transition')") < app.indexOf('App.game.reset()',
        app.indexOf("terminate('postgame-mode-transition')")), true);
});

test('Coach active opponent, hint, before/after evidence and classification thresholds are frozen', () => {
    const window = { CaissaNativeCoachConfiguration: {
        levels: ['more-help', 'standard', 'light'], focuses: ['balanced', 'safety', 'tactics']
    } };
    runScripts(['js/play/opponent-strength.js', 'js/play/native-coach/coach-levels.js',
        'js/play/native-coach/coach-move-review.js'], window);
    for (const expected of manifest.coachActive.opponentLevels) {
        const level = window.CaissaNativeCoachLevels.get(expected.id);
        assert.equal(level.opponentStrength.targetElo, expected.target);
        assert.equal(window.CaissaOpponentStrength.describe(expected.target).value.searchDepth, expected.depth);
    }
    const classify = (ply, loss) => window.CaissaCoachMoveReview.createReview({
        playedUci: 'd2d4', playedSan: 'd4', bestUci: 'e2e4', bestSan: 'e4', playerColor: 'white',
        beforeScore: 1, afterScore: 1 - loss, beforeMate: null, afterMate: null, ply
    }).quality;
    assert.deepEqual([
        classify(4, 0.19), classify(4, 0.21), classify(4, 0.66), classify(4, 1.16), classify(4, 2.26)
    ], ['precise', 'good', 'inaccuracy', 'mistake', 'blunder']);
    assert.deepEqual([
        classify(13, 0.09), classify(13, 0.11), classify(13, 0.46), classify(13, 1.01), classify(13, 2.01)
    ], ['precise', 'good', 'inaccuracy', 'mistake', 'blunder']);

    const app = read('app.js');
    assert.match(app, /const fen = App\.game\.fen\(\)/);
    assert.match(app, /App\.currentEvaluation\?\.fen === fen/);
    assert.match(app, /depth: 20/);
    assert.match(app, /evaluation\.depth < 10/);
    assert.match(app, /App\.game\.fen\(\) !== afterFen/);
    assert.match(app, /info\.depth >= 11/);
    assert.match(app, /}, 1800\)/);
});

test('Coach Review, Guided Review and Manual Analysis retain SF18 and exact FEN ownership', () => {
    const analyze = read('js/analyze-section.js');
    const window = runScripts(['js/play/native-coach/coach-review-exploration.js']);
    assert.deepEqual(plain(window.CaissaCoachReviewExploration.effortPresets), {
        quick: { id: 'quick', label: 'Quick', depth: 10 },
        balanced: { id: 'balanced', label: 'Balanced', depth: 14 },
        deep: { id: 'deep', label: 'Deep', depth: 18 }
    });
    assert.match(analyze, /reviewDepth: 12/);
    assert.match(analyze, /reviewRetryDepth: 8/);
    assert.match(analyze, /reviewPositionTimeoutMs: 10000/);
    assert.match(analyze, /analysisPhase = 'failed'; this\.analysisResults = \[\]; this\.positionAnalyses = \[\]/);
    const manual = read('js/play/native-coach/coach-review-exploration.js');
    assert.match(manual, /engineFen === fen && sandboxFen === fen && renderedFen === fen/);
    assert.match(manual, /cancelAttributedSearch/);
    assert.match(manual, /teardownAnalysisEngine\?\.\('coach-review-exploration-exit'\)/);
    assert.match(manual, /state\.restore\?\.\(\)/);
});

test('Play Bots provider, MultiPV personality policy, seed behavior and catalog remain frozen', () => {
    const window = { Chess };
    runScripts(['js/play/bots/bot-strength-layer.js', 'js/play/bots/bot-personality-policy.js'], window);
    const policy = window.CaissaBotPersonalityPolicy;
    const layer = window.CaissaBotStrengthLayer;
    assert.equal(policy.contractId, manifest.playBotsFreeze.personalityContractId);
    assert.equal(layer.modelVersion, manifest.playBotsFreeze.strengthModelVersion);
    assert.equal(layer.list().length, manifest.playBotsFreeze.strengthProfileCount);
    for (const [id, expected] of Object.entries(manifest.playBotsFreeze.personalityProfiles)) {
        const actual = plain(policy.profiles[id]);
        assert.deepEqual({ candidateCount: actual.candidateCount, depth: actual.depth,
            lossBoundaryCp: actual.lossBoundaryCp, errorRatePercent: actual.errorRatePercent }, expected);
    }
    for (const [target, depth] of Object.entries(manifest.playBotsFreeze.representativeDepths))
        assert.equal(layer.getByTarget(Number(target)).search.depth, depth);

    const fen = manifest.canonicalPositions[0].fen;
    for (const seed of manifest.playBotsFreeze.seedCorpus) {
        const input = { profileId: 'beginner', fen, seed, candidates: manifest.playBotsFreeze.candidateCorpus };
        assert.deepEqual(plain(policy.select(input)), plain(policy.select(input)), seed);
    }
    assert.equal(policy.select({ profileId: 'solid', fen, seed: 'illegal',
        candidates: [{ move: 'a1a8', multipv: 1, score: 99 }] }).ok, false);
    const app = read('app.js');
    assert.match(app, /getCandidatesAttributed\(currentFen/);
    assert.match(app, /profileId: botSearch\.personalityPolicyId, seed: botSearch\.seed/);
});

test('evaluation interpretation preserves centipawns, mates, rail mapping and synthetic initial +0.20', () => {
    const window = { document: { addEventListener: () => {} } };
    runScripts(['js/play/evaluation-rail.js'], window);
    const rail = window.CaissaEvaluationRail;
    assert.equal(rail.normalizeCentipawns(15.6), 16);
    assert.equal(rail.normalizeCentipawns(200000), 100000);
    assert.equal(rail.normalizeMate(3.9), 3);
    assert.equal(rail.mapCentipawnsToWhiteShare(0), 0.5);
    assert.equal(rail.mapCentipawnsToWhiteShare(99999), rail.mapCentipawnsToWhiteShare(1500));
    const app = read('app.js');
    assert.match(app, /\? 20 : rawCp/);
    assert.match(app, /info\.mate > 0 \? 1400 : -1400/);
    assert.equal(manifest.evaluation.syntheticInitialPlayCp, 20);
});

test('normalized SHA-256 guards protect the current engine, Bots, Coach, board and DOM sources', () => {
    for (const [path, expected] of Object.entries(manifest.normalizedSourceGuards)) {
        const bytes = Buffer.from(normalized(path), 'utf8');
        assert.equal(bytes.length, expected.bytes, `${path} normalized bytes`);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256, path);
    }
});
