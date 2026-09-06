import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(new URL('../../js/play/bots/bots-analysis-exploration.js', import.meta.url), 'utf8');

function fixture() {
    const classes = new Set(); const rendered = []; const authoritative = {
        moveHistory: Object.freeze([{ san: 'e4' }]), currentMoveIndex: 6, pgn: '[Result "1-0"]'
    };
    const window = { Chess, document: { body: { classList: {
        add(value) { classes.add(value); }, remove(value) { classes.delete(value); }
    } } }, App: { ...authoritative, board: { position(fen) { rendered.push(fen); } }, boardAdapter: {
        setLastMove() {}, setInteractionEnabled() {}, clearSelection() {}, clearLegalTargets() {}
    } } };
    window.window = window; window.globalThis = window;
    vm.runInContext(source, vm.createContext({ window, globalThis: window, Object, Promise }),
        { filename: 'bots-analysis-exploration.js' });
    return { window, api: window.CaissaBotsAnalysisExploration, classes, rendered, authoritative };
}

test('Bots exploration owns only a temporary linear line and truncates a replaced future', () => {
    const { window, api, authoritative } = fixture(); let restored = 0;
    const analyze = { ensureAnalysisEngine: async () => null, teardownAnalysisEngine() {} };
    const start = new Chess().fen();
    assert.equal(api.enter({ fen: start, analyze, entryReviewPly: 6, restore: () => { restored += 1; } }).ok, true);
    assert.equal(api.playMove('e2', 'e4'), true); assert.equal(api.playMove('e7', 'e5'), true);
    assert.equal(api.playMove('g1', 'f3'), true); const discarded = api.getFen();
    api.previous(); assert.equal(api.playMove('b1', 'c3'), true);
    assert.deepEqual([...api.getLine()].map(move => move.san), ['e4', 'e5', 'Nc3']);
    assert.notEqual(api.getFen(), discarded);
    assert.equal(api.getSnapshot().entryReviewPly, 6);
    assert.equal(api.getSnapshot().reviewPlyOwner, 'AnalyzeSection.currentMoveIndex');
    assert.equal(window.App.moveHistory, authoritative.moveHistory);
    assert.equal(window.App.currentMoveIndex, authoritative.currentMoveIndex);
    assert.equal(window.App.pgn, authoritative.pgn);
    api.leave(); assert.equal(restored, 1); assert.equal(api.getSnapshot().temporaryPlyCount, 0);
});

test('Engine Off preserves its last presentation and navigation creates no request', async () => {
    const { api } = fixture(); const presentations = []; let starts = 0;
    const engine = { stopAnalysis() {}, startAnalysis(_fen, callback) {
        starts += 1; callback({ score: .42, mate: null, pv: ['e2e4', 'e7e5'] });
    } };
    const analyze = { ensureAnalysisEngine: async () => engine, analysisEngine: engine, teardownAnalysisEngine() {} };
    api.enter({ fen: new Chess().fen(), analyze, entryReviewPly: 2,
        onAnalysis: value => presentations.push(value) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 1); assert.equal(presentations.at(-1).evaluation, .42);
    api.playMove('e2', 'e4'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 2); api.setEngineEnabled(false);
    const requests = api.getSnapshot().engineRequests; assert.equal(presentations.at(-1).status, 'off');
    assert.equal(presentations.at(-1).evaluation, .42);
    api.first(); api.last(); assert.equal(api.getSnapshot().engineRequests, requests); assert.equal(starts, 2);
    api.setEngineEnabled(true); await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 3); api.leave();
});

test('Bots presentation excludes technical engine internals and duplicate authoritative state', () => {
    const presentation = fs.readFileSync(new URL('../../js/play/bots/bots-guided-review-presentation.js', import.meta.url), 'utf8');
    const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    assert.doesNotMatch(presentation, />\s*(?:Depth|Nodes|Hash|Threads|NPS|MultiPV|Centipawn loss)\s*</i);
    assert.doesNotMatch(source + presentation, /botReviewIndex|reviewMoveIndex|App\.(?:moveHistory|game)\s*=/);
    assert.match(source, /temporaryOwner: 'CaissaBotsAnalysisExploration'/);
    assert.match(presentation, /entryReviewPly: anchor/);
    assert.match(app, /context === 'bots-analysis-exploration'[\s\S]*CaissaBotsAnalysisExploration\.playMove/);
});

test('temporary Chess owner accepts promotion without touching the completed game', () => {
    const { window, api, authoritative } = fixture();
    const analyze = { ensureAnalysisEngine: async () => null, teardownAnalysisEngine() {} };
    assert.equal(api.enter({ fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', analyze, entryReviewPly: 1 }).ok, true);
    assert.equal(api.playMove('a7', 'a8', 'q'), true);
    assert.equal(api.getLine()[0].promotion, 'q');
    assert.equal(window.App.moveHistory, authoritative.moveHistory);
    api.leave();
});

test('completed game is a read-only study timeline and a branch keeps separate ownership', () => {
    const { window, api, authoritative } = fixture();
    const sourceGame = new Chess();
    ['e4', 'c5', 'Nf3', 'd6'].forEach(move => sourceGame.move(move));
    const sourceMoves = sourceGame.history({ verbose: true }).map(move => ({ ...move }));
    const originalMoves = JSON.stringify(sourceMoves); const originalPgn = authoritative.pgn;
    const analyze = { ensureAnalysisEngine: async () => null, teardownAnalysisEngine() {} };
    assert.equal(api.enter({ fen: sourceGame.fen(), sourceInitialFen: new Chess().fen(), sourceMoves,
        sourceCursor: 4, analyze, entryReviewPly: 3 }).ok, true);
    assert.deepEqual([...api.getSourceLine()].map(move => move.san), ['e4', 'c5', 'Nf3', 'd6']);
    assert.equal(api.getSnapshot().mode, 'source'); assert.equal(api.getSnapshot().sourceCursor, 4);
    api.first(); assert.equal(api.getSnapshot().sourceCursor, 0);
    api.next(); api.next(); assert.equal(api.getSnapshot().sourceCursor, 2);
    assert.equal(api.playMove('g1', 'f3'), true);
    assert.equal(api.getSnapshot().mode, 'temporary'); assert.equal(api.getSnapshot().branchSourceCursor, 2);
    assert.deepEqual([...api.getLine()].map(move => move.san), ['Nf3']);
    api.goToSource(3); assert.equal(api.getSnapshot().mode, 'source');
    assert.equal(api.getSnapshot().sourceCursor, 3); assert.equal(api.getSnapshot().temporaryPlyCount, 1);
    assert.equal(JSON.stringify(sourceMoves), originalMoves);
    assert.equal(window.App.moveHistory, authoritative.moveHistory);
    assert.equal(window.App.pgn, originalPgn); assert.equal(window.App.currentMoveIndex, 6);
    api.leave();
});
