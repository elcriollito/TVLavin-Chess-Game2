import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/analyze-game-import.js', import.meta.url), 'utf8');
const CHESSCOM_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.04.19"]
[White "TVLAVIN"]
[Black "kopi_walet"]
[Result "0-1"]
[Termination "kopi_walet won on time"]

1. d4 d6 2. Nf3 Nf6 3. Nc3 g6 0-1`;

function loadImporter(fetchImpl = null) {
    const context = vm.createContext({ AbortController, DOMException, Map, URL, Set, window: null, fetch: fetchImpl });
    context.window = context;
    new vm.Script(source, { filename: 'analyze-game-import.js' }).runInContext(context);
    return context.CaissaAnalyzeGameImport;
}

function jsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => '0' },
        json: async () => payload,
        text: async () => JSON.stringify(payload)
    };
}

function pgnResponse(status, pgn) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => String(pgn?.length || 0) },
        text: async () => pgn
    };
}

test('V2.0.1 normalizes allowlisted Chess.com URLs, usernames, and harmless query parameters', () => {
    const importer = loadImporter();
    for (const input of [
        'https://www.chess.com/game/live/170875822747?username=TVLAVIN',
        'chess.com/game/live/170875822747?utm_source=share&username=tvlavin&ref=mobile',
        'https://chess.com/analysis/game/live/170875822747/analysis?username=TvLaViN'
    ]) {
        const parsed = importer.parse(input);
        assert.equal(parsed.provider, 'chess.com');
        assert.equal(parsed.id, '170875822747');
        assert.equal(parsed.gameType, 'live');
        assert.equal(parsed.username, 'tvlavin');
        assert.equal(parsed.normalizedUrl, 'https://www.chess.com/game/live/170875822747?username=tvlavin');
        assert.equal(parsed.supported, true);
    }
    const missing = importer.parse('https://www.chess.com/game/live/170875822747?tracking=1');
    assert.equal(missing.username, null);
    assert.equal(missing.normalizedUrl, 'https://www.chess.com/game/live/170875822747');
});

test('V2.0.1 resolves the exact Chess.com game newest-to-oldest and stops immediately after match', async () => {
    const calls = [];
    const importer = loadImporter(async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith('/archives')) return jsonResponse(200, { archives: [
            'https://api.chess.com/pub/player/tvlavin/games/2026/03',
            'https://api.chess.com/pub/player/tvlavin/games/2026/04',
            'https://api.chess.com/pub/player/tvlavin/games/2026/05',
            'https://evil.test/pub/player/tvlavin/games/2026/06'
        ] });
        if (url.endsWith('/2026/05')) return jsonResponse(200, { games: [{
            url: 'https://www.chess.com/game/live/999999999999',
            pgn: CHESSCOM_PGN,
            white: { username: 'TVLAVIN' },
            black: { username: 'someone' }
        }] });
        if (url.endsWith('/2026/04')) return jsonResponse(200, { games: [{
            url: 'https://www.chess.com/game/live/170875822747',
            pgn: CHESSCOM_PGN,
            white: { username: 'TVLAVIN' },
            black: { username: 'kopi_walet' }
        }] });
        throw new Error(`unexpected request: ${url}`);
    });

    const progress = [];
    const result = await importer.resolve(
        'https://www.chess.com/game/live/170875822747?username=TVLAVIN&utm_source=share',
        { onProgress: update => progress.push({ ...update }) }
    );
    assert.equal(result.source, 'Chess.com Game URL');
    assert.equal(result.pgn, CHESSCOM_PGN);
    assert.equal(result.white, 'TVLAVIN');
    assert.equal(result.black, 'kopi_walet');
    assert.equal(result.result, '0-1');
    assert.equal(result.matchedArchive, 'https://api.chess.com/pub/player/tvlavin/games/2026/04');
    assert.equal(result.matchedRecordUrl, 'https://www.chess.com/game/live/170875822747');
    assert.equal(result.requestCount, 3);
    assert.deepEqual(calls.map(([url]) => url), [
        'https://api.chess.com/pub/player/tvlavin/games/archives',
        'https://api.chess.com/pub/player/tvlavin/games/2026/05',
        'https://api.chess.com/pub/player/tvlavin/games/2026/04'
    ]);
    assert.deepEqual(progress.map(({ checked, total }) => [checked, total]), [[0, 3], [1, 3]]);
    for (const [, options] of calls) {
        assert.equal(options.credentials, 'omit');
        assert.equal(options.referrerPolicy, 'no-referrer');
    }
});

test('V2.0.1 accepts a contextual username for a Chess.com URL that omits it', async () => {
    const calls = [];
    const importer = loadImporter(async (url) => {
        calls.push(url);
        if (url.endsWith('/archives')) return jsonResponse(200, {
            archives: ['https://api.chess.com/pub/player/kopi_walet/games/2026/04']
        });
        return jsonResponse(200, { games: [{
            url: 'https://www.chess.com/game/live/170875822747',
            pgn: CHESSCOM_PGN,
            white: { username: 'TVLAVIN' },
            black: { username: 'kopi_walet' }
        }] });
    });
    const result = await importer.resolve('https://chess.com/game/live/170875822747', { username: 'KOPI_WALET' });
    assert.equal(result.username, 'kopi_walet');
    assert.equal(result.requestCount, 2);
    assert.ok(calls.every(url => url.startsWith('https://api.chess.com/pub/player/kopi_walet/games/')));
});

test('V2.0.1 requires a username without making a request', async () => {
    let requests = 0;
    const importer = loadImporter(async () => { requests += 1; });
    await assert.rejects(
        importer.resolve('https://www.chess.com/game/live/170875822747'),
        error => error.code === 'MISSING_USERNAME'
            && error.message === "Enter either player's Chess.com username."
    );
    assert.equal(requests, 0);
});

test('V2.0.1 validates exact game ID and supplied player before accepting a record', async () => {
    const importer = loadImporter(async (url) => {
        if (url.endsWith('/archives')) return jsonResponse(200, {
            archives: ['https://api.chess.com/pub/player/not_the_player/games/2026/04']
        });
        return jsonResponse(200, { games: [{
            url: 'https://www.chess.com/game/live/170875822747',
            pgn: CHESSCOM_PGN,
            white: { username: 'TVLAVIN' },
            black: { username: 'kopi_walet' }
        }] });
    });
    await assert.rejects(
        importer.resolve('https://www.chess.com/game/live/170875822747?username=not_the_player'),
        error => error.code === 'GAME_NOT_FOUND'
    );
});

test('V2.0.1 distinguishes Chess.com account, game, API, rate-limit, and missing-PGN failures', async () => {
    const archiveUrl = 'https://api.chess.com/pub/player/tvlavin/games/2026/04';
    const cases = [
        [async () => jsonResponse(404, {}), 'USERNAME_NOT_FOUND'],
        [async () => jsonResponse(429, {}), 'CHESSCOM_RATE_LIMITED'],
        [async () => jsonResponse(503, {}), 'PROVIDER_UNAVAILABLE'],
        [async url => url.endsWith('/archives')
            ? jsonResponse(200, { archives: [archiveUrl] })
            : jsonResponse(404, {}), 'GAME_UNAVAILABLE'],
        [async url => url.endsWith('/archives')
            ? jsonResponse(200, { archives: [archiveUrl] })
            : jsonResponse(429, {}), 'CHESSCOM_RATE_LIMITED'],
        [async url => url.endsWith('/archives')
            ? jsonResponse(200, { archives: [archiveUrl] })
            : jsonResponse(200, { games: [{
                url: 'https://www.chess.com/game/live/170875822747',
                white: { username: 'TVLAVIN' },
                black: { username: 'kopi_walet' }
            }] }), 'MISSING_PGN']
    ];
    for (const [fetchImpl, expectedCode] of cases) {
        const importer = loadImporter(fetchImpl);
        await assert.rejects(
            importer.resolve('https://www.chess.com/game/live/170875822747?username=tvlavin'),
            error => error.code === expectedCode,
            expectedCode
        );
    }
    const offline = loadImporter(async () => { throw new Error('offline'); });
    await assert.rejects(
        offline.resolve('https://www.chess.com/game/live/170875822747?username=tvlavin'),
        error => error.code === 'NETWORK_ERROR'
    );
});

test('V2.0.1 maps AbortSignal cancellation and never continues archive search', async () => {
    const controller = new AbortController();
    let requests = 0;
    const importer = loadImporter((url, { signal }) => {
        requests += 1;
        if (url.endsWith('/archives')) return Promise.resolve(jsonResponse(200, {
            archives: ['https://api.chess.com/pub/player/tvlavin/games/2026/05']
        }));
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
        }, { once: true }));
    });
    const pending = importer.resolve(
        'https://www.chess.com/game/live/170875822747?username=tvlavin',
        { signal: controller.signal }
    );
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(pending, error => error.code === 'ABORTED');
    assert.equal(requests, 2);
});

test('V2.0.1 keeps the Chess.com archive index in memory only for the browser session', async () => {
    let archiveIndexRequests = 0;
    const importer = loadImporter(async (url) => {
        if (url.endsWith('/archives')) {
            archiveIndexRequests += 1;
            return jsonResponse(200, { archives: ['https://api.chess.com/pub/player/tvlavin/games/2026/04'] });
        }
        return jsonResponse(200, { games: [{
            url: 'https://www.chess.com/game/live/170875822747',
            pgn: CHESSCOM_PGN,
            white: { username: 'TVLAVIN' },
            black: { username: 'kopi_walet' }
        }] });
    });
    await importer.resolve('https://www.chess.com/game/live/170875822747?username=tvlavin');
    await importer.resolve('https://www.chess.com/game/live/170875822747?username=TVLAVIN');
    assert.equal(archiveIndexRequests, 1);
});

test('A3 Lichess URL normalization and direct public export remain unchanged', async () => {
    const pgn = '[Event "A3"]\n[White "Alpha"]\n[Black "Beta"]\n\n1. e4 e5 2. Nf3 *';
    const calls = [];
    const importer = loadImporter(async (...args) => {
        calls.push(args);
        return pgnResponse(200, pgn);
    });
    const parsed = importer.parse('http://www.lichess.org/6uaBSKABq9bK/white?foo=bar#moves');
    assert.equal(parsed.id, '6uaBSKAB');
    const result = await importer.resolve('https://lichess.org/8fuPHGyu/black?anything=ignored');
    assert.equal(result.pgn, pgn);
    assert.equal(result.source, 'Lichess Game URL');
    assert.equal(calls[0][0], 'https://lichess.org/game/export/8fuPHGyu?clocks=false&evals=false&literate=false');
});

test('V2.0.1 rejects malformed IDs, routes, usernames, arbitrary hosts, credentials, ports, and protocols', () => {
    const importer = loadImporter();
    for (const input of [
        'https://chess.com/game/live/not-a-number?username=tvlavin',
        'https://chess.com/member/tvlavin?username=tvlavin',
        'https://chess.com/game/live/170875822747?username=a',
        'https://chess.com/game/live/170875822747?username=tvlavin&username=other',
        'https://example.com/game/live/170875822747?username=tvlavin',
        'https://chess.com.evil.test/game/live/170875822747?username=tvlavin',
        'https://user:pass@chess.com/game/live/170875822747?username=tvlavin',
        'https://chess.com:444/game/live/170875822747?username=tvlavin',
        'file:///game/live/170875822747?username=tvlavin'
    ]) assert.throws(() => importer.parse(input), error => /URL|game link|game ID|username/.test(error.message), input);
});

test('V2.0.1 resolver has no chess, board, engine, storage, scraping, or arbitrary-fetch authority', () => {
    assert.doesNotMatch(source, /new\s+Chess|Chessboard\s*\(|new\s+Worker|analysisEngine|loadedGame|currentMoveIndex/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|DOMParser|innerHTML|document\.|cookie/i);
    assert.doesNotMatch(source, /fetchImpl\s*\(\s*(?:rawValue|normalizedUrl|url\.toString|record\.url)/);
    assert.match(source, /fetchImpl\(endpoint/);
    assert.match(source, /api\.chess\.com/);
    assert.match(source, /getTrustedChessComArchiveUrl/);
});
