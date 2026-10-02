import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/lichess/games.js';
import {
    buildLichessGamesUrl,
    fetchLichessGames,
    validateLichessGamesQuery
} from '../api/_lib/lichess-games.js';

function response({ status = 200, contentType = 'application/x-ndjson', body = '' } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
        async text() { return body; }
    };
}

test('validates usernames, fixed limits, and time-control filters', () => {
    assert.equal(validateLichessGamesQuery({}).ok, false);
    assert.equal(validateLichessGamesQuery({ username: '../bad', max: '10' }).ok, false);
    assert.equal(validateLichessGamesQuery({ username: 'DrNykterstein', max: '11' }).ok, false);
    assert.equal(validateLichessGamesQuery({ username: 'DrNykterstein', max: '20', timeControl: 'daily' }).ok, false);
    assert.deepEqual(validateLichessGamesQuery({ username: 'DrNykterstein', max: '50', timeControl: 'rapid' }), {
        ok: true, username: 'DrNykterstein', max: 50, timeControl: 'rapid'
    });
});

test('requests completed games in newest-first order with the selected performance filter', () => {
    const url = buildLichessGamesUrl({ username: 'DrNykterstein', max: 10, timeControl: 'blitz' });
    assert.equal(url.origin, 'https://lichess.org');
    assert.equal(url.pathname, '/api/games/user/DrNykterstein');
    assert.equal(url.searchParams.get('max'), '10');
    assert.equal(url.searchParams.get('perfType'), 'blitz');
    assert.equal(url.searchParams.get('finished'), 'true');
    assert.equal(url.searchParams.get('ongoing'), 'false');
    assert.equal(url.searchParams.get('sort'), 'dateDesc');
    assert.equal(url.searchParams.get('pgnInJson'), 'true');
});

test('returns normalized completed games in true most-recent order', async () => {
    const body = [
        { id: 'older', pgn: '[Event "Older"]', speed: 'rapid', createdAt: 1000, lastMoveAt: 2000 },
        { id: 'newer', pgn: '[Event "Newer"]', speed: 'rapid', createdAt: 3000, lastMoveAt: 4000 }
    ].map(JSON.stringify).join('\n');
    const result = await fetchLichessGames(
        { username: 'example_user', max: '10', timeControl: 'rapid' },
        { fetchImpl: async () => response({ body }) }
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.deepEqual(result.body.games.map(game => game.id), ['newer', 'older']);
    assert.deepEqual(Object.keys(result.body).sort(), ['games', 'success']);
});

test('preserves rate limits and rejects HTML or malformed upstream success bodies', async () => {
    const query = { username: 'example_user', max: '10', timeControl: 'all' };
    const limited = await fetchLichessGames(query, { fetchImpl: async () => response({ status: 429 }) });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.success, false);

    const html = await fetchLichessGames(query, {
        fetchImpl: async () => response({ contentType: 'text/html', body: '<!doctype html>' })
    });
    assert.equal(html.status, 502);
    assert.equal(html.body.success, false);

    const malformed = await fetchLichessGames(query, {
        fetchImpl: async () => response({ body: '{not json}' })
    });
    assert.equal(malformed.status, 502);
    assert.equal(malformed.body.success, false);
});

test('times out stalled upstream requests with JSON-safe failure data', async () => {
    const fetchImpl = (_url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        }, { once: true });
    });
    const result = await fetchLichessGames(
        { username: 'example_user', max: '10', timeControl: 'all' },
        { fetchImpl, timeoutMs: 5 }
    );
    assert.equal(result.status, 504);
    assert.equal(result.body.success, false);
});

test('serverless handler always emits JSON and rejects non-GET methods', async () => {
    const headers = {};
    let statusCode = 0;
    let body;
    const res = {
        setHeader(name, value) { headers[name.toLowerCase()] = value; },
        status(value) { statusCode = value; return this; },
        json(value) { body = value; return this; }
    };
    await handler({ method: 'POST', query: {} }, res);
    assert.equal(statusCode, 405);
    assert.match(headers['content-type'], /application\/json/);
    assert.equal(body.success, false);
});
