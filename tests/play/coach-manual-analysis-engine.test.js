import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(`${process.cwd()}/js/play/native-coach/coach-review-exploration.js`, 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    const sourceState = Object.freeze({
        pgn: '1. e4 e5',
        moveHistory: Object.freeze([{ from: 'e2', to: 'e4' }]),
        currentMoveIndex: 0,
        reviewEvidence: Object.freeze({ evaluation: 0.25, bestMove: 'Nf3' })
    });
    let renderedFen = null;
    const presentations = [];
    const requests = [];
    let generation = 0;
    let cancellations = 0;
    let restores = 0;
    let teardowns = 0;
    const engine = {
        currentFen: null,
        getBestMoveAttributed(fen, callback, options) {
            const generationId = `manual:${++generation}`;
            this.currentFen = fen;
            requests.push({ fen, callback, onInfo: options.onInfo, depth: options.depth, generationId });
            return generationId;
        },
        cancelAttributedSearch() { cancellations += 1; return true; }
    };
    const window = {
        Chess,
        document: { body: { classList: { add() {}, remove() {} } } },
        App: {
            game: { pgn: () => sourceState.pgn },
            moveHistory: sourceState.moveHistory,
            currentMoveIndex: sourceState.currentMoveIndex,
            reviewEvidence: sourceState.reviewEvidence,
            board: { position(fen) { renderedFen = fen; } },
            boardAdapter: {
                setPosition(fen) { renderedFen = fen; return { ok: true }; },
                getPosition() { return renderedFen; },
                getSnapshot() { return { positionFen: renderedFen, renderedFen: renderedFen?.split(' ')[0] || null }; },
                setLastMove() {}, setInteractionEnabled() {}, clearSelection() {}, clearLegalTargets() {}
            }
        }
    };
    vm.runInContext(source, vm.createContext({ window, globalThis: window, Object, Promise }),
        { filename: 'coach-review-exploration.js' });
    const analyze = {
        analysisEngine: engine,
        ensureAnalysisEngine: async () => engine,
        teardownAnalysisEngine() { teardowns += 1; }
    };
    const api = window.CaissaCoachReviewExploration;
    const enter = fen => api.enter({ fen, analyze,
        onAnalysis: state => presentations.push(state),
        restore: () => { restores += 1; renderedFen = fen; } });
    return { api, engine, enter, presentations, requests, sourceState, window,
        renderedFen: () => renderedFen, cancellations: () => cancellations,
        restores: () => restores, teardowns: () => teardowns };
}

function complete(request, info) {
    request.onInfo(info, request.generationId);
    request.callback(info.pv[0], null, request.generationId);
}

test('manual sandbox analysis is attributed to the current engine, sandbox, and rendered FEN', async () => {
    const f = fixture();
    const start = new Chess().fen();
    assert.equal(f.enter(start).ok, true);
    assert.equal(f.api.getSnapshot().analysis.status, 'off');
    assert.equal(f.requests.length, 0);

    assert.equal(f.api.setEngineEnabled(true).ok, true);
    assert.equal(f.api.getSnapshot().analysis.status, 'loading');
    assert.equal(f.api.getSnapshot().analysis.bestMove, null);
    assert.deepEqual([...f.api.getSnapshot().analysis.pv], []);
    await tick();
    assert.equal(f.requests.length, 1);
    complete(f.requests[0], { score: 0.31, mate: null, pv: ['e2e4', 'e7e5', 'g1f3'], depth: 14 });
    let state = f.api.getSnapshot();
    assert.equal(state.analysis.status, 'ready');
    assert.equal(state.analysis.bestMove, 'e2e4');
    assert.equal(state.analysis.bestMoveSan, 'e4');
    assert.equal(state.analysis.evaluation, 0.31);
    assert.deepEqual([...state.analysis.pv], ['e4', 'e5', 'Nf3']);
    assert.equal(state.analysis.aligned, true);
    assert.equal(state.analysis.engineFen, start);
    assert.equal(state.analysis.sandboxFen, start);
    assert.equal(state.analysis.renderedFen, start);

    assert.equal(f.api.playMove('e2', 'e4'), true);
    const afterE4 = f.api.getFen();
    state = f.api.getSnapshot();
    assert.equal(state.analysis.status, 'loading');
    assert.equal(state.analysis.requestFen, afterE4);
    assert.equal(state.analysis.bestMove, null);
    assert.deepEqual([...state.analysis.pv], []);
    await tick();
    assert.equal(f.requests.length, 2);

    f.requests[0].callback('d2d4', null, f.requests[0].generationId);
    assert.equal(f.api.getSnapshot().analysis.requestFen, afterE4);
    assert.equal(f.api.getSnapshot().analysis.status, 'loading');
    complete(f.requests[1], { score: 0.18, mate: null, pv: ['e7e5', 'g1f3'], depth: 14 });
    state = f.api.getSnapshot();
    assert.equal(state.analysis.bestMoveSan, 'e5');
    assert.equal(state.analysis.evaluation, 0.18);
    assert.deepEqual([...state.analysis.pv], ['e5', 'Nf3']);
    assert.equal(state.analysis.requestFen, afterE4);
    assert.equal(state.analysis.aligned, true);
    assert.equal(state.staleResults, 1);

    assert.equal(f.api.playMove('e7', 'e5'), true);
    const afterE5 = f.api.getFen();
    await tick();
    assert.equal(f.requests.length, 3);
    complete(f.requests[2], { score: 0.27, mate: null, pv: ['g1f3', 'b8c6'], depth: 14 });
    state = f.api.getSnapshot();
    assert.equal(state.analysis.requestFen, afterE5);
    assert.equal(state.analysis.bestMoveSan, 'Nf3');
    assert.deepEqual([...state.analysis.pv], ['Nf3', 'Nc6']);
    assert.equal(state.acceptedResults, 3);
});

test('illegal moves, engine toggles, and Back to Review preserve their ownership boundaries', async () => {
    const f = fixture();
    const start = new Chess().fen();
    f.enter(start);
    f.api.setEngineEnabled(true);
    await tick();
    complete(f.requests[0], { score: 0.2, mate: null, pv: ['e2e4'], depth: 14 });

    const beforeIllegal = f.api.getSnapshot();
    const beforePresentations = f.presentations.length;
    assert.equal(f.api.playMove('e2', 'e5'), false);
    assert.equal(f.api.getFen(), start);
    assert.equal(f.requests.length, 1);
    assert.equal(f.presentations.length, beforePresentations);
    assert.equal(f.api.getSnapshot().analysis, beforeIllegal.analysis);

    assert.equal(f.api.setEngineEnabled(false).ok, true);
    let state = f.api.getSnapshot();
    assert.equal(state.analysis.status, 'off');
    assert.equal(state.analysis.bestMove, null);
    assert.equal(state.analysis.evaluation, null);
    assert.deepEqual([...state.analysis.pv], []);
    assert.equal(f.api.playMove('e2', 'e4'), true);
    await tick();
    assert.equal(f.requests.length, 1);
    assert.equal(f.api.getSnapshot().analysis.status, 'off');

    const currentSandboxFen = f.api.getFen();
    assert.equal(f.api.setEngineEnabled(true).ok, true);
    await tick();
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].fen, currentSandboxFen);
    const lateRequest = f.requests[1];
    const sourceBeforeLeave = {
        pgn: f.window.App.game.pgn(),
        moveHistory: f.window.App.moveHistory,
        currentMoveIndex: f.window.App.currentMoveIndex,
        reviewEvidence: f.window.App.reviewEvidence
    };
    assert.equal(f.api.leave().ok, true);
    const presentationsAfterLeave = f.presentations.length;
    complete(lateRequest, { score: -0.4, mate: null, pv: ['e7e5'], depth: 14 });
    assert.equal(f.presentations.length, presentationsAfterLeave);
    assert.equal(f.api.isActive(), false);
    assert.equal(f.renderedFen(), start);
    assert.equal(f.restores(), 1);
    assert.equal(f.teardowns(), 1);
    assert.ok(f.cancellations() >= 2);
    assert.deepEqual({
        pgn: f.window.App.game.pgn(),
        moveHistory: f.window.App.moveHistory,
        currentMoveIndex: f.window.App.currentMoveIndex,
        reviewEvidence: f.window.App.reviewEvidence
    }, sourceBeforeLeave);
});
