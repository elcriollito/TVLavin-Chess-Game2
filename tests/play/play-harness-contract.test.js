import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { positions } from './fixtures/positions.js';

test('all reusable chess positions are valid chess.js positions', () => {
    const fixtures = Object.values(positions)
        .filter(value => typeof value === 'string' || value?.fen)
        .map(value => typeof value === 'string' ? value : value.fen);
    for (const fen of fixtures) {
        assert.doesNotThrow(() => new Chess(fen), `invalid fixture: ${fen}`);
    }
});

test('test harness remains isolated from production sources', () => {
    const production = ['app.js', 'index.html', 'styles.css', 'js/engine-adapter.js']
        .map(path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
        .join('\n');
    assert.doesNotMatch(production, /__caissaPlayHarness|DeterministicWorker/);
});
