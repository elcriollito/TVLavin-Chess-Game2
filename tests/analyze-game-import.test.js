import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/analyze-game-import.js', import.meta.url), 'utf8');

function loadImporter(fetchImpl = null) {
    const context = vm.createContext({ URL, Set, window: null, fetch: fetchImpl });
    context.window = context;
    new vm.Script(source, { filename: 'analyze-game-import.js' }).runInContext(context);
    return context.CaissaAnalyzeGameImport;
}

test('A3 normalizes allowlisted Lichess game URL variants to the public eight-character ID', () => {
    const importer = loadImporter();
    for (const [input, id] of [
        ['lichess.org/8fuPHGyu', '8fuPHGyu'],
        ['http://www.lichess.org/6uaBSKABq9bK/white?foo=bar#moves', '6uaBSKAB'],
        ['https://lichess.org/game/export/YO3ICtJi/?evals=true', 'YO3ICtJi']
    ]) {
        const parsed = importer.parse(input);
        assert.equal(parsed.provider, 'lichess');
        assert.equal(parsed.id, id);
        assert.equal(parsed.normalizedUrl, `https://lichess.org/${id}`);
        assert.equal(parsed.supported, true);
    }
});

test('A3 recognizes public Chess.com game forms but fails closed without an official ID endpoint', async () => {
    let requests = 0;
    const importer = loadImporter(async () => { requests += 1; });
    for (const input of [
        'chess.com/game/live/123456789',
        'https://www.chess.com/game/daily/987654321/analysis?tab=analysis',
        'https://chess.com/analysis/game/live/123456789/analysis'
    ]) {
        const parsed = importer.parse(input);
        assert.equal(parsed.provider, 'chess.com');
        assert.equal(parsed.supported, false);
        await assert.rejects(importer.resolve(input), error => error.code === 'CHESSCOM_DIRECT_UNAVAILABLE');
    }
    assert.equal(requests, 0);
    assert.equal(
        importer.errors.CHESSCOM_DIRECT_UNAVAILABLE,
        "Direct Chess.com game links cannot currently be imported through Chess.com's public API. Search by username instead."
    );
});

test('A3 rejects malformed IDs, unsupported domains, credentials, ports, and non-web protocols', () => {
    const importer = loadImporter();
    for (const input of [
        'https://lichess.org/not-an-id',
        'https://chess.com/game/live/not-a-number',
        'https://example.com/8fuPHGyu',
        'https://lichess.org.evil.test/8fuPHGyu',
        'https://user:pass@lichess.org/8fuPHGyu',
        'https://lichess.org:444/8fuPHGyu',
        'file:///8fuPHGyu'
    ]) assert.throws(() => importer.parse(input), error => /URL|game link|game ID/.test(error.message));
});

test('A3 resolves only a CAISSA-constructed Lichess endpoint and returns PGN without parsing it', async () => {
    const pgn = '[Event "A3"]\n[White "Alpha"]\n[Black "Beta"]\n\n1. e4 e5 2. Nf3 *';
    const calls = [];
    const importer = loadImporter(async (...args) => {
        calls.push(args);
        return { ok: true, status: 200, headers: { get: () => String(pgn.length) }, text: async () => pgn };
    });
    const result = await importer.resolve('https://lichess.org/8fuPHGyu/black?anything=ignored');
    assert.equal(result.pgn, pgn);
    assert.equal(result.source, 'Lichess Game URL');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'https://lichess.org/game/export/8fuPHGyu?clocks=false&evals=false&literate=false');
    assert.equal(calls[0][1].headers.Accept, 'application/x-chess-pgn');
    assert.equal(calls[0][1].credentials, 'omit');
});

test('A3 maps provider, rate-limit, unavailable, invalid response, and network failures', async () => {
    const cases = [
        [{ status: 404, ok: false }, 'GAME_UNAVAILABLE'],
        [{ status: 410, ok: false }, 'GAME_UNAVAILABLE'],
        [{ status: 429, ok: false }, 'RATE_LIMITED'],
        [{ status: 503, ok: false }, 'PROVIDER_UNAVAILABLE'],
        [{ status: 200, ok: true, headers: { get: () => '0' }, text: async () => '' }, 'INVALID_PGN_RESPONSE']
    ];
    for (const [response, code] of cases) {
        const importer = loadImporter(async () => ({ headers: { get: () => '0' }, text: async () => '', ...response }));
        await assert.rejects(importer.resolve('lichess.org/8fuPHGyu'), error => error.code === code);
    }
    const offline = loadImporter(async () => { throw new Error('offline'); });
    await assert.rejects(offline.resolve('lichess.org/8fuPHGyu'), error => error.code === 'NETWORK_ERROR');
});

test('A3 importer has no chess, board, engine, storage, HTML scraping, or arbitrary server fetch authority', () => {
    assert.doesNotMatch(source, /new\s+Chess|Chessboard\s*\(|new\s+Worker|analysisEngine|loadedGame|currentMoveIndex/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|DOMParser|innerHTML/);
    assert.doesNotMatch(source, /fetchImpl\s*\(\s*(?:rawValue|normalizedUrl|url\.toString)/);
    assert.match(source, /fetchImpl\(endpoint/);
    assert.match(source, /https:\/\/lichess\.org\/game\/export\/\$\{encodeURIComponent\(parsed\.id\)\}/);
});
