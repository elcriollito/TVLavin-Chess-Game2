import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRating, recordOutcome } from '../js/puzzles/session-rating.js';

test('session estimate moves once for a solved or missed puzzle; skips do not rate', () => {
    const initial = createSessionRating();
    assert.equal(initial.rating, 1800);
    assert.equal(recordOutcome(initial, 1800, 'skipped'), initial);
    const solved = recordOutcome(initial, 1800, 'solved');
    assert.deepEqual({ rating: solved.rating, solved: solved.solved, failed: solved.failed, change: solved.last.change },
        { rating: 1812, solved: 1, failed: 0, change: 12 });
    const missed = recordOutcome(solved, 1800, 'failed');
    assert.equal(missed.solved, 1);
    assert.equal(missed.failed, 1);
    assert.ok(missed.rating < solved.rating);
    assert.equal(initial.rating, 1800);
});
