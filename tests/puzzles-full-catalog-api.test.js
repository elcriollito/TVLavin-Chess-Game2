import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/puzzles/select.js';
import {
    PuzzleCatalogRequestError,
    PuzzleCatalogUnavailableError,
    buildPuzzleCatalogUrl,
    fetchPuzzleSelection,
    parsePuzzleSelection,
} from '../api/_lib/puzzle-catalog.js';
import { PuzzleCatalogSource, ratingBounds } from '../js/puzzles/catalog-source.js';

const selection = parsePuzzleSelection({ themes: 'fork,pin', minRating: '1700', maxRating: '2100', limit: '12' });

test('selection parameters are bounded before reaching the catalog Worker', () => {
    assert.deepEqual(selection.tags, ['fork', 'pin']);
    assert.equal(selection.dimension, 'theme');
    assert.equal(selection.minPlays, 500);
    assert.equal(parsePuzzleSelection({ themes: 'equality' }).minPlays, 100);
    assert.equal(parsePuzzleSelection({ openings: 'Sicilian_Defense' }).dimension, 'opening');
    assert.equal(parsePuzzleSelection({ themes: 'fork', quality: 'all' }).minPlays, 0);
    for (const invalid of [
        { themes: '' },
        { themes: 'fork);drop table puzzles' },
        { themes: 'fork', openings: 'Sicilian_Defense' },
        { themes: 'fork', minRating: '100', maxRating: '2000' },
        { themes: 'fork', minRating: '1200', maxRating: '2400' },
        { themes: 'fork', limit: '1000' },
        { themes: 'fork', quality: 'invented' },
        { themes: 'fork', cursor: 'not-signed' },
    ]) assert.throws(() => parsePuzzleSelection(invalid), PuzzleCatalogRequestError);
});

test('the Worker query is filtered, cursor based, capped, and carries no credential in the URL', () => {
    const url = buildPuzzleCatalogUrl('https://catalog.example.workers.dev', selection);
    assert.equal(url.pathname, '/v1/select');
    assert.equal(url.searchParams.get('minRating'), '1700');
    assert.equal(url.searchParams.get('maxRating'), '2100');
    assert.equal(url.searchParams.get('themes'), 'fork,pin');
    assert.equal(url.searchParams.get('quality'), 'standard');
    assert.equal(url.searchParams.get('limit'), '12');
    assert.equal(url.searchParams.get('offset'), null);
    assert.doesNotMatch(url.href, /token|secret|apikey/i);
});

test('server selection keeps the Worker token in headers and returns the browser contract', async () => {
    let request;
    const result = await fetchPuzzleSelection(selection, {
        env: { CAISSA_PUZZLE_WORKER_URL: 'https://catalog.example.workers.dev', CAISSA_PUZZLE_WORKER_TOKEN: 'server-secret' },
        fetch: async (url, options) => {
            request = { url, options };
            return new Response(JSON.stringify({
                sourceVersion: '2026-09-10', cursor: 'body.signature', hasMore: true,
                puzzles: [{
                    puzzle_id: 'abc12', fen: '8/8/8/8/8/8/4k3/6K1 w - - 0 1', moves: 'g1f1 e2f3',
                    rating: 1800, rating_deviation: 70, popularity: 95, nb_plays: 5000,
                    themes: 'fork', game_url: 'https://lichess.org/example#1', opening_tags: '',
                }],
            }), { status: 200 });
        },
    });
    assert.equal(request.options.headers.Authorization, 'Bearer server-secret');
    assert.doesNotMatch(request.url.href, /server-secret/);
    assert.equal(result.cursor, 'body.signature');
    assert.equal(result.hasMore, true);
    assert.deepEqual(result.puzzles[0], {
        id: 'abc12', fen: '8/8/8/8/8/8/4k3/6K1 w - - 0 1', moves: 'g1f1 e2f3', rating: 1800,
        deviation: 70, popularity: 95, plays: 5000, themes: ['fork'],
        gameUrl: 'https://lichess.org/example#1', openingTags: [],
    });
});

test('local full-catalog access is explicit and cannot activate in production', async () => {
    let selectedPath = '';
    const local = await fetchPuzzleSelection(selection, {
        env: {
            CAISSA_PUZZLE_ALLOW_LOCAL_SQLITE: '1',
            CAISSA_PUZZLE_SQLITE_PATH: 'C:/data/lichess-puzzles.sqlite3',
            VERCEL_ENV: 'development',
        },
        selectLocalPuzzles: async (_selection, path) => {
            selectedPath = path;
            return { source: 'local-full-catalog', puzzles: [] };
        },
    });
    assert.equal(selectedPath, 'C:/data/lichess-puzzles.sqlite3');
    assert.equal(local.source, 'local-full-catalog');
    await assert.rejects(fetchPuzzleSelection(selection, {
        env: {
            CAISSA_PUZZLE_ALLOW_LOCAL_SQLITE: '1',
            CAISSA_PUZZLE_SQLITE_PATH: 'C:/data/lichess-puzzles.sqlite3',
            VERCEL_ENV: 'production',
        },
    }), /not configured/);
});

function responseRecorder() {
    return {
        headers: {}, statusCode: 0, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; },
    };
}

test('the public handler fails closed and advertises the curated fallback', async () => {
    const response = responseRecorder();
    await handler({ method: 'GET', headers: {}, query: { themes: 'fork' }, socket: {} }, response, {
        checkRateLimit: () => ({ allowed: true, remaining: 59 }),
        fetchPuzzleSelection: async () => { throw new PuzzleCatalogUnavailableError(); },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'PUZZLE_CATALOG_UNAVAILABLE');
    assert.equal(response.body.fallback, '/data/puzzles/lichess-curated-preview.json');
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
});

test('the public handler does not CDN-cache randomized first pages', async () => {
    const response = responseRecorder();
    await handler({ method: 'GET', headers: {}, query: { themes: 'fork' }, socket: {} }, response, {
        checkRateLimit: () => ({ allowed: true, remaining: 59 }),
        fetchPuzzleSelection: async () => ({ source: 'full-catalog', puzzles: [], cursor: null, hasMore: false }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
});

test('browser source uses full-catalog batches and falls back without blocking training', async () => {
    const previewPuzzle = { id: 'old01', rating: 1800, themes: ['fork'] };
    const remotePuzzle = { id: 'new01', rating: 1800, themes: ['fork'] };
    const calls = [];
    const source = new PuzzleCatalogSource({
        fetchFn: async url => {
            calls.push(String(url));
            if (url === '/preview.json') return { ok: true, json: async () => ({ categories: { Motifs: ['fork'] }, puzzles: [previewPuzzle] }) };
            return { ok: true, json: async () => ({ puzzles: [remotePuzzle], estimatedTotal: 100, hasMore: false }) };
        },
        fallbackUrl: '/preview.json',
    });
    await source.initialize();
    assert.deepEqual(ratingBounds(1800, 'normal'), [1600, 2000]);
    assert.equal((await source.next({ category: 'Motifs', theme: 'fork', target: 1800, difficulty: 'normal' }, new Set())).puzzle.id, 'new01');
    assert.match(calls[1], /^\/api\/puzzles\/select\?/);

    const fallback = new PuzzleCatalogSource({
        fetchFn: async url => url === '/preview.json'
            ? { ok: true, json: async () => ({ categories: { Motifs: ['fork'] }, puzzles: [previewPuzzle] }) }
            : { ok: false, status: 503 },
        fallbackUrl: '/preview.json',
    });
    await fallback.initialize();
    const result = await fallback.next({ category: 'Motifs', theme: 'fork', target: 1800, difficulty: 'normal' }, new Set());
    assert.equal(result.source, 'curated-fallback');
    assert.equal(result.puzzle.id, 'old01');
});

test('browser source keeps the native fetch receiver', async () => {
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = function (url) {
        assert.equal(this, globalThis);
        assert.equal(url, '/preview.json');
        return Promise.resolve({ ok: true, json: async () => ({ categories: {}, puzzles: [] }) });
    };
    try {
        await new PuzzleCatalogSource({ fallbackUrl: '/preview.json' }).initialize();
    } finally {
        globalThis.fetch = nativeFetch;
    }
});

test('browser source can force the curated fallback without another API attempt', async () => {
    const calls = [];
    const source = new PuzzleCatalogSource({
        fetchFn: async url => {
            calls.push(String(url));
            return { ok: true, json: async () => ({
                categories: { Motifs: ['fork'] },
                puzzles: [{ id: 'safe01', rating: 1800, themes: ['fork'] }],
            }) };
        },
        fallbackUrl: '/preview.json',
    });
    await source.initialize();
    const result = await source.next(
        { category: 'Motifs', theme: 'fork', target: 1800, difficulty: 'normal' },
        new Set(),
        { allowRemote: false },
    );
    assert.equal(result.source, 'curated-fallback');
    assert.deepEqual(calls, ['/preview.json']);
});

test('browser source does not restart an exhausted signed-cursor pool', async () => {
    let apiCalls = 0;
    const source = new PuzzleCatalogSource({
        fetchFn: async url => {
            if (url === '/data/puzzles/lichess-curated-preview.json') {
                return new Response(JSON.stringify({
                    categories: { tactics: ['fork'] },
                    puzzles: [{ id: 'fallback', rating: 1800, themes: ['fork'] }],
                }));
            }
            apiCalls += 1;
            return new Response(JSON.stringify({
                source: 'full-catalog', hasMore: false, cursor: null,
                puzzles: [{ id: 'remote', rating: 1800, themes: ['fork'] }],
            }));
        },
    });
    await source.initialize();
    const selection = { category: 'tactics', theme: 'fork', target: 1800, difficulty: 'balanced' };
    const seen = new Set(['remote']);
    const result = await source.next(selection, seen);
    assert.equal(apiCalls, 1);
    assert.equal(result.puzzle.id, 'fallback');
});
