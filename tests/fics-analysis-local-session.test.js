import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/analyze-local-branch-session.js', import.meta.url), 'utf8');

function createApi() {
    const window = {};
    vm.runInNewContext(source, { window, Object, Number });
    return window.CaissaAnalyzeLocalBranchSession;
}

test('FICS local analysis starts a flat branch at the selected historical ply', () => {
    const api = createApi();
    const session = api.create({ handoffId: 'h1', recordId: 'fics-game:1',
        sourceMoves: ['e4', 'e5', 'Nf3', 'Nc6'], selectedPly: 4 });
    const branch = session.beginBranch({ currentMoveIndex: 1, fen: 'historical-fen' });
    assert.equal(branch.ok, true);
    assert.equal(branch.branchStartPly, 2);
    assert.deepEqual([...branch.sourcePrefix], ['e4', 'e5']);
    assert.equal(session.recordMove({ line: ['e4', 'e5', 'd4'], fen: 'local-fen' }).ok, true);
    const state = session.inspect();
    assert.equal(state.networkPolicy, 'local-only');
    assert.deepEqual([...state.localMoves], ['d4']);
    assert.equal(state.currentFen, 'local-fen');
});

test('disposing a FICS local branch removes its transient moves', () => {
    const session = createApi().create({ sourceMoves: ['e4'] });
    session.beginBranch({ currentMoveIndex: 0, fen: 'before' });
    session.recordMove({ line: ['e4', 'e5'], fen: 'after' });
    assert.equal(session.dispose().ok, true);
    assert.equal(session.inspect().active, false);
    assert.deepEqual([...session.inspect().localMoves], []);
    assert.equal(session.beginBranch({ currentMoveIndex: 0 }).ok, false);
});

test('the local session has no networking, live-game, pending-move, or clock authority', () => {
    for (const forbidden of [
        /WebSocket/, /CaissaFICSClient/, /sendCommand/, /sendMove/, /pendingMove/,
        /liveGame/, /whiteClock/, /blackClock/, /CaissaClockService/
    ]) assert.doesNotMatch(source, forbidden);
});
