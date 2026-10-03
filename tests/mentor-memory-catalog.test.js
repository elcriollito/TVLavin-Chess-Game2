import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCatalog, memoryPieceLoad, memoryPuzzlePosition } from '../js/mentor/mentor-memory-catalog.js';

const beginner = { min: 3, max: 7 };
const low = { id: 'small', fen: '7k/8/8/3r4/3R4/8/8/K7 w - - 0 1', moves: 'd4d5 h8g8', themes: ['endgame'] };
const high = { id: 'full', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: 'e2e4 e7e5', themes: ['opening'] };
const reply = value => ({ ok: true, json: async () => value });

test('piece load reaches 100 for 32 pieces; puzzle eligibility counts after the setup capture', () => {
    assert.equal(memoryPieceLoad(high.fen).density, 100);
    assert.equal(memoryPieceLoad(low.fen).count, 4);
    const position = memoryPuzzlePosition(low, 'full-catalog');
    assert.equal(position.pieceCount, 3);
    assert.equal(position.fen.split(' ')[0], '7k/8/8/3R4/8/8/8/K7');
    assert.equal(position.source, 'full-catalog');
    assert.equal(memoryPuzzlePosition({ ...low, moves: 'd4d9' }, 'full-catalog'), null);
    assert.notEqual(memoryPuzzlePosition(high, 'full-catalog').placement, high.fen.split(' ')[0]);
});

test('random selection uses only matching actual positions and caches without additional calls', async () => {
    let calls = 0;
    const catalog = createMemoryCatalog({ rng: () => 0, fetchFn: async () => {
        calls++; return reply({ puzzles: [high, low], source: 'full-catalog', hasMore: false });
    } });
    const item = await catalog.next(beginner);
    assert.equal(item.id, 'puzzle-small'); assert.equal(calls, 1);
    assert.equal((await catalog.next(beginner)).id, item.id); assert.equal(calls, 1);
});

test('sampling is bounded and fallback cannot silently return a different level', async () => {
    const urls = [];
    const catalog = createMemoryCatalog({ fetchFn: async url => {
        urls.push(url);
        if (url.includes('curated')) return reply({ puzzles: [low] });
        return reply({ puzzles: [low], source: 'full-catalog', hasMore: true, cursor: `page.${urls.length}` });
    } });
    assert.equal(await catalog.next({ min: 28, max: 32 }), null);
    assert.equal(urls.filter(url => url.includes('/api/')).length, 4);
    assert.ok(urls.filter(url => url.includes('/api/')).every(url => new URL(url, 'https://test').searchParams.get('limit') === '16'));
});

test('curated Puzzles fallback retains provenance and excludes already exposed placement', async () => {
    const catalog = createMemoryCatalog({ fetchFn: async url => url.includes('/api/')
        ? { ok: false, status: 503 } : reply({ puzzles: [low] }) });
    const item = await catalog.next(beginner);
    assert.equal(item.source, 'curated-fallback');
    assert.equal(await catalog.next(beginner, { excludedPlacements: new Set([item.placement]) }), null);
});

test('cancellation does not deliver an obsolete puzzle or start fallback requests', async () => {
    const controller = new AbortController(); let calls = 0;
    const catalog = createMemoryCatalog({ fetchFn: async () => { calls++; controller.abort(); return reply({ puzzles: [low] }); } });
    await assert.rejects(catalog.next(beginner, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, 1);
});
