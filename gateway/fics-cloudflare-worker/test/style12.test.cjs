const assert = require('node:assert/strict');
const test = require('node:test');

async function loadParser() {
    await import('../../../js/fics-style12.js');
    return globalThis.FICSStyle12;
}

test('converts Style12 ranks to FEN placement', async () => {
    const { rankToFen } = await loadParser();
    assert.equal(rankToFen('rnbqkb-r'), 'rnbqkb1r');
    assert.equal(rankToFen('--------'), '8');
});

test('parses documented Style12 example', async () => {
    const { parseStyle12 } = await loadParser();
    const state = parseStyle12('<12> rnbqkb-r pppppppp -----n-- -------- ----P--- -------- PPPPKPPP RNBQ-BNR B -1 0 0 1 1 0 7 Newton Einstein 1 2 12 39 39 119 122 2 K/e1-e2 (0:06) Ke2 0');
    assert.equal(state.whiteName, 'Newton');
    assert.equal(state.blackName, 'Einstein');
    assert.equal(state.relation, 1);
    assert.equal(state.userColor, 'b');
    assert.equal(state.castling, 'kq');
    assert.equal(state.fen, 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPPKPPP/RNBQ1BNR b kq - 0 2');
});

test('parses live observed-game Style12 with trailing fields', async () => {
    const { parseStyle12 } = await loadParser();
    const state = parseStyle12('<12> r-b--rk- ppp---pp ----pp-- -------- ---n---q P-----N- -PP-BPPP R--Q-RK- B -1 0 0 0 0 1 2 tuvo rusalka 0 2 12 31 32 168 117 13 B/d3-e2 (0:43) Be2 0 1 0');
    assert.equal(state.observedGame, true);
    assert.equal(state.gameNumber, 2);
    assert.equal(state.whiteClock, 168);
    assert.equal(state.blackClock, 117);
    assert.equal(state.fen, 'r1b2rk1/ppp3pp/4pp2/8/3n3q/P5N1/1PP1BPPP/R2Q1RK1 b - - 1 13');
});

test('maps castling, en passant, black turn, and observer relation', async () => {
    const { parseStyle12 } = await loadParser();
    const state = parseStyle12('<12> r---k--r pppppppp -------- -------- ---Pp--- -------- PPP-PPPP R---K--R B 4 1 1 1 1 0 42 WhitePlayer BlackPlayer 0 5 0 39 39 300 300 2 P/e2-e4 (0:01) e4 0');
    assert.equal(state.sideToMove, 'b');
    assert.equal(state.enPassant, 'e3');
    assert.equal(state.castling, 'KQkq');
    assert.equal(state.observedGame, true);
    assert.equal(state.userColor, null);
    assert.equal(state.fen, 'r3k2r/pppppppp/8/8/3Pp3/8/PPP1PPPP/R3K2R b KQkq e3 0 2');
});
