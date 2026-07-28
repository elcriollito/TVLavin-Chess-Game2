import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
    BOT_CALIBRATION_FIXTURES, BOT_CALIBRATION_FIXTURE_SCHEMA, BOT_CALIBRATION_SUITE_VERSION
} from './calibration-fixtures.js';
import {
    aggregateCalibration, inspectRelativeOrdering, scoreCalibrationMove, validateCalibrationSuite
} from './calibration-harness.js';

test('fixture suite is versioned, valid, unique, bounded, and covers every required category', () => {
    assert.equal(BOT_CALIBRATION_SUITE_VERSION, '1.0.0');
    assert.equal(BOT_CALIBRATION_FIXTURE_SCHEMA, '1.0.0');
    assert.deepEqual(validateCalibrationSuite(), { valid: true, errors: [] });
    assert.equal(new Set(BOT_CALIBRATION_FIXTURES.map(item => item.id)).size, BOT_CALIBRATION_FIXTURES.length);
    assert.deepEqual(new Set(BOT_CALIBRATION_FIXTURES.map(item => item.category)),
        new Set(['development', 'tactical', 'quiet', 'defensive', 'endgame', 'sanity']));
    assert.ok(BOT_CALIBRATION_FIXTURES.every(item => Object.isFrozen(item)
        && item.timeoutMs <= 10000 && item.bestMoves.length > 0));
});

test('every accepted calibration move is legal in its fixture', () => {
    for (const item of BOT_CALIBRATION_FIXTURES) {
        const game = new Chess(item.fen);
        const legal = new Set(game.moves({ verbose: true }).map(move =>
            `${move.from}${move.to}${move.promotion || ''}`));
        for (const move of [...item.bestMoves, ...item.acceptableMoves]) assert.ok(legal.has(move), `${item.id}:${move}`);
    }
});

test('transparent scoring distinguishes best, acceptable, inferior, timeout, and illegal', () => {
    const item = BOT_CALIBRATION_FIXTURES[0];
    assert.deepEqual(scoreCalibrationMove(item, { completed: true, move: item.bestMoves[0] }),
        { points: 2, outcome: 'best' });
    assert.deepEqual(scoreCalibrationMove(item, { completed: true, move: item.acceptableMoves[0] }),
        { points: 1, outcome: 'acceptable' });
    assert.deepEqual(scoreCalibrationMove(item, { completed: true, move: 'a2a3' }),
        { points: 0, outcome: 'legal-inferior' });
    assert.deepEqual(scoreCalibrationMove(item, { completed: false, timeout: true }),
        { points: 0, outcome: 'timeout' });
    assert.deepEqual(scoreCalibrationMove(item, { completed: true, move: 'a1a8' }),
        { points: 0, outcome: 'illegal' });
});

test('aggregation exposes category scores, failures, timeouts, and broad ordering warnings', () => {
    const best = BOT_CALIBRATION_FIXTURES.map(item => ({ completed: true, move: item.bestMoves[0], latencyMs: 10 }));
    const weak = BOT_CALIBRATION_FIXTURES.map(item => ({ completed: true,
        move: new Chess(item.fen).moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`)[0],
        latencyMs: 5 }));
    const seed = aggregateCalibration('caissa-seed', 'seed-depth-2', weak);
    const summit = aggregateCalibration('caissa-summit', 'summit-depth-14', best);
    assert.equal(summit.maximumScore, BOT_CALIBRATION_FIXTURES.length * 2);
    assert.equal(summit.legalFailures, 0);
    assert.equal(summit.timeouts, 0);
    assert.equal(Object.keys(summit.categories).length, 6);
    assert.equal(inspectRelativeOrdering([seed, summit], ['caissa-seed', 'caissa-summit']).supported, true);
    assert.equal(inspectRelativeOrdering([summit, seed], ['caissa-summit', 'caissa-seed']).supported, false);
});

test('calibration sources remain test-only and contain no network, rating, or production worker code', () => {
    const serialized = JSON.stringify(BOT_CALIBRATION_FIXTURES);
    assert.doesNotMatch(
        serialized,
        /(?:https?:|\belo\b|\brating\b|new\s+Worker)/i
    );
});
