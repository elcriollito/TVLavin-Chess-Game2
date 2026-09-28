import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/tablebase/standard.js';

function response() {
    return { headers: {}, statusCode: 200,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
}

const live = process.env.CAISSA_TABLEBASE_LIVE === '1';

test('live Lichess contract covers promotion, en passant, terminal states, and 50-move categories', { skip: !live }, async () => {
    const fixtures = [
        { fen: '4k3/6KP/8/8/8/8/7p/8 w - - 0 1', category: 'win', move: 'h7h8q' },
        { fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', category: 'win', move: 'e5d6' },
        { fen: '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', category: 'loss', terminal: 'checkmate' },
        { fen: '7k/5Q2/5K2/8/8/8/8/8 b - - 0 1', category: 'draw', terminal: 'stalemate' },
        { fen: '8/4K2k/5Q1P/6P1/8/8/q7/8 w - - 99 148', category: 'win', move: 'f6g7' },
        { fen: '8/4K2k/5Q1P/6P1/8/8/q7/8 w - - 100 148', category: 'cursed-win', move: 'f6g7' }
    ];
    for (const fixture of fixtures) {
        const res = response();
        await handler({ method: 'GET', query: { fen: fixture.fen } }, res);
        assert.equal(res.statusCode, 200, `${fixture.fen}: ${res.body?.error || ''}`);
        assert.equal(res.body.category, fixture.category, fixture.fen);
        if (fixture.move) assert.ok(res.body.moves.some(move => move.uci === fixture.move), fixture.move);
        if (fixture.terminal) {
            assert.equal(res.body[fixture.terminal], true);
            assert.equal(res.body.moves.length, 0);
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
});
