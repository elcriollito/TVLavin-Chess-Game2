import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/analyze-setup-draft.js', import.meta.url), 'utf8');

function factory() {
    const window = {};
    vm.runInNewContext(source, { window });
    return window.CaissaAnalyzeSetupDraft;
}

test('setup draft is plain placement data with no competing authority', () => {
    assert.doesNotMatch(source, /new\s+Chess|Chessboard\s*\(|new\s+Worker|loadGameFromPgn/);
    const draft = factory().create();
    assert.equal(draft.toFen(), factory().START_FEN);
});

test('setup draft round-trips FEN, turn, and castling rights', () => {
    const draft = factory().create();
    draft.setTurn('b');
    draft.setCastling('Q', false);
    draft.setCastling('k', false);
    assert.equal(draft.toFen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b Kq - 0 1');
    const roundtrip = factory().create({ fen: draft.toFen() });
    assert.equal(roundtrip.toFen(), draft.toFen());
    assert.equal(roundtrip.hasCastling('K'), true);
    assert.equal(roundtrip.hasCastling('Q'), false);
});

test('setup draft supports place, replace, move, remove, clear, and reset', () => {
    const draft = factory().create();
    assert.equal(draft.setPiece('e4', 'wQ'), true);
    assert.equal(draft.getPiece('e4'), 'wQ');
    assert.equal(draft.setPiece('e4', 'bN'), true);
    assert.equal(draft.movePiece('e4', 'f6'), true);
    assert.equal(draft.getPiece('f6'), 'bN');
    assert.equal(draft.removePiece('f6'), true);
    draft.clear();
    assert.equal(draft.toFen(), '8/8/8/8/8/8/8/8 w - - 0 1');
    assert.equal(draft.validate({ requireKings: true }).ok, false);
    draft.reset();
    assert.equal(draft.toFen(), factory().START_FEN);
});

test('setup draft rejects malformed FEN and positions without exactly two kings', () => {
    const api = factory();
    assert.equal(api.parseFen('not-a-fen').ok, false);
    assert.equal(api.parseFen('8/8/8/8/8/8/8/8 w - - 0 1', { requireKings: true }).ok, false);
    assert.equal(api.parseFen('4k3/8/8/8/8/8/8/4K3 x - - 0 1', { requireKings: true }).ok, false);
    assert.equal(api.parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { requireKings: true }).ok, true);
});
