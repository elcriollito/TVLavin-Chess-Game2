import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parseSelection,
    poolKeys,
    signCursor,
    verifyCursor,
} from '../cloudflare-puzzles-worker/src/index.js';
import worker from '../cloudflare-puzzles-worker/src/index.js';

const secret = '0123456789abcdef0123456789abcdef';

test('Worker expands indexed theme, opening, rating, and quality pools', () => {
    const theme = parseSelection(new URL('https://worker/v1/select?themes=fork&minRating=1700&maxRating=1900&quality=standard&limit=12'));
    assert.equal(theme.dimension, 'theme');
    assert.deepEqual(theme.tags, ['fork']);
    assert.deepEqual(poolKeys(theme), [
        'theme:fork:q2:b17', 'theme:fork:q2:b18',
    ]);

    const opening = parseSelection(new URL('https://worker/v1/select?openings=Sicilian_Defense&quality=relaxed'));
    assert.equal(opening.dimension, 'opening');
    assert.equal(poolKeys(opening).length, 8);
    assert.ok(poolKeys(opening).every(key => key.startsWith('opening:Sicilian_Defense:')));

    const narrow = parseSelection(new URL('https://worker/v1/select?themes=fork&minRating=1750&maxRating=1790'));
    assert.deepEqual(poolKeys(narrow), ['theme:fork:q2:b17']);
});

test('signed cursors reject tampering, expiry, and filter substitution state', async () => {
    const payload = {
        version: '2026-09-10', filters: 'filter-digest', startKey: 10,
        afterKey: 20, afterId: '4TN7E', wrapped: false, expires: 2_000,
    };
    const cursor = await signCursor(payload, secret);
    assert.deepEqual(await verifyCursor(cursor, secret, 1_000), payload);
    await assert.rejects(verifyCursor(cursor.replace(/.$/u, 'x'), secret, 1_000), /invalid cursor/);
    await assert.rejects(verifyCursor(cursor, secret, 2_001), /expired cursor/);
});

test('Worker rejects mixed dimensions and excessive ranges before D1', () => {
    assert.throws(() => parseSelection(new URL('https://worker/v1/select?themes=fork&openings=Sicilian_Defense')), /exactly one/);
    assert.throws(() => parseSelection(new URL('https://worker/v1/select?themes=fork&minRating=1000&maxRating=2000')), /rating range/);
    assert.throws(() => parseSelection(new URL('https://worker/v1/select?themes=fork&quality=unknown')), /quality/);
});

test('private puzzle lookup requires the Worker token and returns only rating metadata', async () => {
    const first = async () => ({ puzzle_id: '4TN7E', rating: 1820 });
    const env = { WORKER_TOKEN: 'worker-secret', PUZZLES: {
        prepare() { return { bind(id) { assert.equal(id, '4TN7E'); return { first }; } }; },
    } };
    const hidden = await worker.fetch(new Request('https://worker/v1/puzzle/4TN7E'), env);
    assert.equal(hidden.status, 404);

    const response = await worker.fetch(new Request('https://worker/v1/puzzle/4TN7E', {
        headers: { Authorization: 'Bearer worker-secret' },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        puzzleId: '4TN7E', rating: 1820, sourceVersion: '2026-09-10',
    });
});

test('private puzzle lookup returns a typed 404 without exposing other catalog fields', async () => {
    const env = { WORKER_TOKEN: 'worker-secret', PUZZLES: {
        prepare() { return { bind() { return { first: async () => null }; } }; },
    } };
    const response = await worker.fetch(new Request('https://worker/v1/puzzle/abc12', {
        headers: { Authorization: 'Bearer worker-secret' },
    }), env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: 'PUZZLE_NOT_FOUND' });
});
