import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';
const source = fs.readFileSync(new URL('../../js/analyze-session.js', import.meta.url), 'utf8');
function api() {
    const window = { Chess };
    vm.runInNewContext(source, { window, Object });
    return window.CaissaAnalyzeSession;
}
test('session owns independent chess state and deterministic move navigation', () => {
    const a = api().createSession({ pgn: '1. e4 e5 2. Nf3', selectedPly: 3 });
    const b = api().createSession({ pgn: '1. e4 e5 2. Nf3', selectedPly: 3 });
    assert.notEqual(a.game, b.game);
    const finalFen = a.game.fen();
    a.jumpTo(-1);
    assert.notEqual(a.game.fen(), finalFen);
    assert.equal(b.game.fen(), finalFen);
    assert.equal(a.jumpTo(999).selectedPly, 2);
});
test('custom FEN and FEN-only sessions validate without shared references', () => {
    const fen = '8/8/8/8/8/8/4P3/4K2k w - - 0 1';
    const session = api().createSession({ initialFen: fen });
    assert.equal(session.game.fen(), fen);
    assert.equal(api().createSession({ initialFen: 'bad fen' }), null);
});
test('malformed PGN fails safely and disposal is structured', () => {
    assert.equal(api().createSession({ pgn: 'not pgn ???' }), null);
    assert.equal(api().createSession().dispose().status, 'disposed');
});
test('session module has no Play, board, engine, storage, DOM, or resource ownership', () => {
    assert.doesNotMatch(source, /\bApp\b|Chessboard|document|Storage|localStorage|sessionStorage|Worker|setTimeout|requestAnimationFrame|Engine/);
});
test('Analyze integration never assigns Play chess, board, history, clocks, or engine state', () => {
    const integration = fs.readFileSync(new URL('../../js/analyze-section.js', import.meta.url), 'utf8');
    assert.doesNotMatch(integration, /App\.(?:game|board|moveHistory|currentMoveIndex|gameMode|gameActive|engineEnabled)\s*=/);
    assert.doesNotMatch(integration, /CaissaClockService\.(?:configure|start|switchTurn|reset)/);
});
