import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/analyze-local-branch-session.js', import.meta.url), 'utf8');

function createApi() {
    const window = {};
    vm.runInNewContext(source, { window, Object, Number, Map, Set });
    return window.CaissaAnalyzeLocalBranchSession;
}

const originals = () => [
    { san: 'e4', uci: 'e2e4', fenBefore: 'start', fenAfter: 'after-e4', color: 'w', moveNumber: 1 },
    { san: 'e5', uci: 'e7e5', fenBefore: 'after-e4', fenAfter: 'after-e5', color: 'b', moveNumber: 1 },
    { san: 'Nf3', uci: 'g1f3', fenBefore: 'after-e5', fenAfter: 'after-Nf3', color: 'w', moveNumber: 2 },
    { san: 'Nc6', uci: 'b8c6', fenBefore: 'after-Nf3', fenAfter: 'after-Nc6', color: 'b', moveNumber: 2 }
];

function sans(session) {
    return [...session.getActiveLine()].map(node => node.san);
}

test('original FICS main line and source metadata remain immutable after a middle-game branch', () => {
    const originalMoves = originals();
    const session = createApi().create({
        handoffId: 'h1', recordId: 'fics-game:1', initialFen: 'start',
        originalMoves, originalPgn: '1. e4 e5 2. Nf3 Nc6 1-0', originalResult: '1-0'
    });
    session.selectNode('original-2');
    const inserted = session.insertOrSelectMove({
        san: 'd4', uci: 'd2d4', fenBefore: 'after-e5', fenAfter: 'after-d4',
        color: 'w', moveNumber: 2
    });
    assert.equal(inserted.status, 'variation-created');
    assert.deepEqual(sans(session), ['e4', 'e5', 'd4']);
    const state = session.inspect();
    assert.equal(state.originalPgn, '1. e4 e5 2. Nf3 Nc6 1-0');
    assert.equal(state.originalResult, '1-0');
    assert.deepEqual([...state.originalLineIds], ['original-1', 'original-2', 'original-3', 'original-4']);
    assert.equal(state.nodes.find(node => node.id === 'original-3').san, 'Nf3');
    assert.equal(state.nodes.find(node => node.id === 'original-4').san, 'Nc6');
    assert.deepEqual(originalMoves.map(move => move.san), ['e4', 'e5', 'Nf3', 'Nc6']);
});

test('a local variation can continue and navigation follows the selected branch', () => {
    const session = createApi().create({ originalMoves: originals() });
    session.selectNode('original-2');
    session.insertOrSelectMove({ san: 'd4', uci: 'd2d4', fenAfter: 'd4' });
    session.insertOrSelectMove({ san: 'exd4', uci: 'e5d4', fenAfter: 'exd4' });
    assert.deepEqual(sans(session), ['e4', 'e5', 'd4', 'exd4']);
    session.previous();
    session.previous();
    assert.equal(session.inspect().currentNodeId, 'original-2');
    session.next();
    assert.equal(session.getCurrentNode().san, 'd4');
    session.last();
    assert.equal(session.getCurrentNode().san, 'exd4');
    session.first();
    assert.equal(session.inspect().currentNodeId, 'root');
});

test('re-entering an existing child selects it without creating a duplicate', () => {
    const session = createApi().create({ originalMoves: originals() });
    session.selectNode('original-2');
    const first = session.insertOrSelectMove({ san: 'd4', uci: 'd2d4', fenAfter: 'd4' });
    session.selectNode('original-2');
    const second = session.insertOrSelectMove({ san: 'd4', uci: 'd2d4', fenAfter: 'd4' });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.node.id, first.node.id);
    assert.equal(session.inspect().localNodeCount, 1);
});

test('multiple sibling and nested variations coexist without deleting one another', () => {
    const session = createApi().create({ originalMoves: originals() });
    session.selectNode('original-2');
    const d4 = session.insertOrSelectMove({ san: 'd4', uci: 'd2d4' }).node;
    session.insertOrSelectMove({ san: 'exd4', uci: 'e5d4' });
    session.selectNode('original-2');
    const c4 = session.insertOrSelectMove({ san: 'c4', uci: 'c2c4' }).node;
    session.insertOrSelectMove({ san: 'Nf6', uci: 'g8f6' });
    const state = session.inspect();
    const branchPoint = state.nodes.find(node => node.id === 'original-2');
    assert.equal(branchPoint.childrenIds.includes('original-3'), true);
    assert.equal(branchPoint.childrenIds.includes(d4.id), true);
    assert.equal(branchPoint.childrenIds.includes(c4.id), true);
    assert.equal(state.localNodeCount, 4);
});

test('click-style selection returns to the original line or a saved variation', () => {
    const session = createApi().create({ originalMoves: originals() });
    session.selectNode('original-2');
    const branch = session.insertOrSelectMove({ san: 'd4', uci: 'd2d4' }).node;
    session.selectNode('original-4');
    assert.deepEqual(sans(session), ['e4', 'e5', 'Nf3', 'Nc6']);
    session.selectNode(branch.id);
    assert.deepEqual(sans(session), ['e4', 'e5', 'd4']);
});

test('reset removes only local variations and restores the exact source line', () => {
    const session = createApi().create({
        recordId: 'record-7', originalMoves: originals(), originalPgn: 'source-pgn', originalResult: '0-1'
    });
    session.selectNode('original-2');
    session.insertOrSelectMove({ san: 'd4', uci: 'd2d4' });
    assert.equal(session.resetVariations().ok, true);
    assert.deepEqual(sans(session), ['e4', 'e5', 'Nf3', 'Nc6']);
    const state = session.inspect();
    assert.equal(state.currentNodeId, 'original-4');
    assert.equal(state.localNodeCount, 0);
    assert.equal(state.recordId, 'record-7');
    assert.equal(state.originalPgn, 'source-pgn');
    assert.equal(state.originalResult, '0-1');
});

test('dispose discards every transient node and prevents later insertion', () => {
    const session = createApi().create({ originalMoves: originals() });
    session.selectNode('original-2');
    session.insertOrSelectMove({ san: 'd4', uci: 'd2d4' });
    assert.equal(session.dispose().ok, true);
    assert.equal(session.inspect().active, false);
    assert.equal(session.inspect().localNodeCount, 0);
    assert.equal(session.insertOrSelectMove({ san: 'c4', uci: 'c2c4' }).ok, false);
});

test('the local tree has no networking, live-game, pending-move, or clock authority', () => {
    for (const forbidden of [
        /WebSocket/, /CaissaFICSClient/, /sendCommand/, /sendMove/, /pendingMove/,
        /liveGame/, /whiteClock/, /blackClock/, /CaissaClockService/
    ]) assert.doesNotMatch(source, forbidden);
});
