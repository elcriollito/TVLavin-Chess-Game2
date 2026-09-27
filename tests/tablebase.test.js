import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import handler, { validatePosition } from '../api/tablebase/standard.js';
import { moverOutcome, positionOutcome, resultLabel, outcomeChange, START_FEN } from '../js/tablebase/model.js';

function response() {
    return { headers: {}, statusCode: 200,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
}

test('FEN validation respects the seven-piece boundary and chess legality', () => {
    assert.equal(validatePosition(START_FEN), START_FEN);
    assert.throws(() => validatePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), /2 to 7/);
    assert.throws(() => validatePosition('not chess'), /Invalid FEN/);
});

test('move categories are inverted for the mover and preserve 50-move draw semantics', () => {
    assert.equal(moverOutcome('loss'), 'win');
    assert.equal(moverOutcome('win'), 'loss');
    assert.equal(moverOutcome('blessed-loss'), 'draw');
    assert.equal(positionOutcome('cursed-win'), 'draw');
    assert.equal(positionOutcome('maybe-win'), 'unknown');
    assert.equal(resultLabel('loss', 'w'), 'Black wins');
    assert.equal(outcomeChange('win', 'draw'), 'This move lost the theoretical win.');
    assert.equal(outcomeChange('draw', 'win'), 'This move lost the theoretical draw.');
});

test('API returns verified moves and rejects provider data that omits a legal move', async () => {
    const position = '8/8/8/8/8/4k3/8/4K2R w - - 0 1';
    const moves = new Chess(position).moves({ verbose: true }).map(move => ({ uci: move.lan, san: move.san, category: 'loss', dtz: -3, dtm: -9 }));
    let calls = 0;
    const fetch = async url => {
        calls++;
        assert.equal(url.searchParams.get('fen'), position);
        return { ok: true, status: 200, json: async () => ({ category: 'win', dtz: 3, dtm: 9, moves }) };
    };
    const req = { method: 'GET', query: { fen: position } };
    const first = response();
    await handler(req, first, { fetch });
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.moves.length, moves.length);
    assert.equal(first.body.source, 'lichess-syzygy');
    const cached = response();
    await handler(req, cached, { fetch });
    assert.equal(calls, 1);
    assert.deepEqual(cached.body, first.body);

    const bad = response();
    const other = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1';
    await handler({ method: 'GET', query: { fen: other } }, bad, {
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ category: 'win', moves: [] }) })
    });
    assert.equal(bad.statusCode, 502);
});

test('API rejects unsupported requests without contacting the provider', async () => {
    const result = response();
    await handler({ method: 'GET', query: { fen: 'invalid' } }, result, { fetch: () => { throw new Error('unexpected'); } });
    assert.equal(result.statusCode, 400);
});
