import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import handler, { publicTablebaseEnabled, validatePosition } from '../api/tablebase/standard.js';
import {
    exactTrainingMoves, moverOutcome, moveSetupPiece, outcomeChange, parseSetupDraft,
    positionOutcome, resultExplanation, resultLabel, setupDraftFen, START_FEN, updateSetupSquare
} from '../js/tablebase/model.js';

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
    assert.throws(() => validatePosition('8/8/8/8/8/8/4k3/4K3 w - - 0 1'), /Illegal position/);
});

test('move categories are inverted for the mover and preserve 50-move draw semantics', () => {
    assert.equal(moverOutcome('loss'), 'win');
    assert.equal(moverOutcome('win'), 'loss');
    assert.equal(moverOutcome('blessed-loss'), 'draw');
    assert.equal(positionOutcome('cursed-win'), 'draw');
    assert.equal(positionOutcome('maybe-win'), 'unknown');
    assert.equal(resultLabel('loss', 'w'), 'Black wins');
    assert.equal(resultLabel('cursed-win', 'w'), 'Draw with the 50-move rule');
    assert.match(resultExplanation('maybe-loss'), /draw or loss/);
    assert.equal(outcomeChange('win', 'draw'), 'This move lost the theoretical win.');
    assert.equal(outcomeChange('draw', 'win'), 'This move lost the theoretical draw.');
    assert.equal(outcomeChange('cursed-win', 'blessed-loss'), 'The draw under the 50-move rule is preserved.');
    assert.match(outcomeChange('maybe-win', 'loss'), /not exact enough/);
});

test('Train exposes only exact preserving moves', () => {
    const result = { category: 'win', moves: [
        { uci: 'a1a2', category: 'loss' },
        { uci: 'a1b1', category: 'draw' },
        { uci: 'a1b2', category: 'maybe-loss' }
    ] };
    assert.deepEqual(exactTrainingMoves(result).map(move => move.uci), ['a1a2']);
    assert.deepEqual(exactTrainingMoves({ ...result, category: 'maybe-win' }), []);
});

test('Setup drafts move and place pieces without inventing history rights', () => {
    let draft = parseSetupDraft(START_FEN);
    draft = moveSetupPiece(draft, 'c2', 'c7');
    draft = updateSetupSquare(draft, 'a1', 'Q');
    draft = { ...draft, turn: 'b', halfmove: 73 };
    const fen = setupDraftFen(draft);
    assert.equal(fen, '6r1/2Rk4/8/KP6/8/8/8/Q7 b - - 73 1');
    assert.equal(new Chess(fen).history().length, 0);
});

test('API returns verified moves and rejects provider data that omits a legal move', async () => {
    const position = '8/8/8/8/8/4k3/8/4K2R w - - 0 1';
    const moves = new Chess(position).moves({ verbose: true }).map(move => ({ uci: move.lan, san: move.san, category: 'loss', dtz: -3, precise_dtz: -3, dtm: -9 }));
    let calls = 0;
    const fetch = async url => {
        calls++;
        assert.equal(url.searchParams.get('fen'), position);
        return { ok: true, status: 200, json: async () => ({ category: 'win', dtz: 3, precise_dtz: 3, dtm: 9, moves }) };
    };
    const req = { method: 'GET', query: { fen: position } };
    const first = response();
    await handler(req, first, { fetch });
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.moves.length, moves.length);
    assert.equal(first.body.source, 'lichess-syzygy');
    assert.equal(first.body.preciseDtz, 3);
    assert.match(first.headers['Cache-Control'], /s-maxage=86400/);
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

test('API validates real-provider promotion, en passant, and terminal response shapes', async () => {
    const fixtures = [
        {
            fen: '4k3/6KP/8/8/8/8/7p/8 w - - 0 1', category: 'win', checkmate: false, stalemate: false,
            moves: [
                ['h7h8q', 'h8=Q+', 'loss'], ['h7h8r', 'h8=R+', 'loss'], ['g7g8', 'Kg8', 'draw'],
                ['g7f6', 'Kf6', 'win'], ['g7g6', 'Kg6', 'win'], ['g7h6', 'Kh6', 'win'],
                ['g7h8', 'Kh8', 'win'], ['h7h8n', 'h8=N', 'win'], ['h7h8b', 'h8=B', 'win']
            ]
        },
        {
            fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', category: 'win', checkmate: false, stalemate: false,
            moves: [['e5d6', 'exd6', 'loss'], ['e5e6', 'e6', 'draw'], ['a1b1', 'Kb1', 'draw'], ['a1a2', 'Ka2', 'draw'], ['a1b2', 'Kb2', 'draw']]
        },
        { fen: '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', category: 'loss', checkmate: true, stalemate: false, moves: [] },
        { fen: '7k/5Q2/5K2/8/8/8/8/8 b - - 0 1', category: 'draw', checkmate: false, stalemate: true, moves: [] }
    ];
    for (const fixture of fixtures) {
        const providerMoves = fixture.moves.map(([uci, san, category]) => ({ uci, san, category, dtz: 0, precise_dtz: 0, dtm: 0, zeroing: uci === 'e5d6' || uci.startsWith('h7h8') }));
        const res = response();
        await handler({ method: 'GET', query: { fen: fixture.fen } }, res, {
            fetch: async () => ({ ok: true, status: 200, json: async () => ({
                category: fixture.category, dtz: 0, precise_dtz: 0, dtm: 0,
                checkmate: fixture.checkmate, stalemate: fixture.stalemate, moves: providerMoves
            }) })
        });
        assert.equal(res.statusCode, 200, fixture.fen);
        assert.equal(res.body.moves.length, fixture.moves.length, fixture.fen);
        assert.equal(res.body.checkmate, fixture.checkmate);
        assert.equal(res.body.stalemate, fixture.stalemate);
    }
});

test('production exposure stays closed until both release and shared-limiter gates are explicit', async () => {
    assert.equal(publicTablebaseEnabled({ VERCEL_ENV: 'preview' }), true);
    assert.equal(publicTablebaseEnabled({ NODE_ENV: 'production' }), false);
    assert.equal(publicTablebaseEnabled({ VERCEL_ENV: 'production', CAISSA_TABLEBASE_PUBLIC_ENABLED: '1' }), false);
    assert.equal(publicTablebaseEnabled({ VERCEL_ENV: 'production', CAISSA_TABLEBASE_PUBLIC_ENABLED: '1', CAISSA_TABLEBASE_SHARED_LIMITER_READY: '1' }), true);
    const res = response();
    await handler({ method: 'GET', query: { fen: START_FEN } }, res, {
        env: { VERCEL_ENV: 'production' }, fetch: () => { throw new Error('unexpected'); }
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'TABLEBASE_REVIEW_ONLY');
});

test('provider 429 honors a longer Retry-After and never caches the failure', async () => {
    const res = response();
    await handler({ method: 'GET', query: { fen: '8/8/8/8/8/4k3/8/4K3 w - - 12 7' } }, res, {
        now: () => 1_000,
        fetch: async () => ({ ok: false, status: 429, headers: { get: name => name.toLowerCase() === 'retry-after' ? '120' : null } })
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['Retry-After'], '120');
    assert.match(res.headers['Cache-Control'], /no-store/);
});
