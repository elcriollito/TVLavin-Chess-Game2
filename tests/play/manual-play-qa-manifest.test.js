import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    MANUAL_PLAY_QA_VERSION, MANUAL_PLAY_QA_RESULTS, MANUAL_PLAY_QA_SEVERITIES,
    MANUAL_PLAY_QA_PRIORITIES, MANUAL_PLAY_QA_SCENARIOS, MANUAL_PLAY_QA_DEFECTS
} from './manual-play-qa-manifest.js';

test('manual QA checklist is versioned, immutable, complete, and JSON-safe', () => {
    assert.equal(MANUAL_PLAY_QA_VERSION, 'ManualPlayQA@1.0.0');
    assert(Object.isFrozen(MANUAL_PLAY_QA_SCENARIOS));
    assert.doesNotThrow(() => JSON.stringify(MANUAL_PLAY_QA_SCENARIOS));
    assert.equal(new Set(MANUAL_PLAY_QA_SCENARIOS.map(item => item.scenarioId)).size, MANUAL_PLAY_QA_SCENARIOS.length);
    for (const area of ['navigation', 'board', 'rules', 'clocks', 'games', 'bots', 'coach', 'players',
        'fairplay', 'postgame', 'rematch', 'new-game', 'pgn', 'analyze', 'mentor', 'guided-replay',
        'mentor-summary', 'themes', 'accessibility', 'responsive', 'physical-device', 'external'])
        assert(MANUAL_PLAY_QA_SCENARIOS.some(item => item.area === area), area);
});
test('every scenario uses exact result vocabulary and has nonblank evidence fields', () => {
    for (const item of MANUAL_PLAY_QA_SCENARIOS) {
        assert(MANUAL_PLAY_QA_RESULTS.includes(item.result), item.scenarioId);
        for (const field of ['scenarioId', 'title', 'prerequisites', 'expectedResult', 'actualResult', 'evidence', 'notes'])
            assert.equal(typeof item[field] === 'string' && item[field].trim().length > 0, true, `${item.scenarioId}:${field}`);
        assert(Array.isArray(item.steps) && item.steps.length >= 3, item.scenarioId);
        if (item.severity) assert(MANUAL_PLAY_QA_SEVERITIES.includes(item.severity));
        if (item.priority) assert(MANUAL_PLAY_QA_PRIORITIES.includes(item.priority));
    }
});

test('blocked, physical, certification, and external results cannot masquerade as local passes', () => {
    const counts = Object.fromEntries(MANUAL_PLAY_QA_RESULTS.map(result => [result,
        MANUAL_PLAY_QA_SCENARIOS.filter(item => item.result === result).length]));
    assert.deepEqual(counts, { pass: 23, fail: 0, blocked: 2, 'not-run': 0, external: 3,
        'physical-device': 1, 'manual-certification': 1 });
    assert.equal(MANUAL_PLAY_QA_DEFECTS.length, 0);
});

test('manual QA audit records every scenario and contains no blank result marker', () => {
    const audit = fs.readFileSync('docs/audits/PLAY_MANUAL_CHESS_QA.md', 'utf8');
    for (const item of MANUAL_PLAY_QA_SCENARIOS) assert(audit.includes(item.scenarioId), item.scenarioId);
    assert(!/\|\s*\|\s*(?:\r?\n|$)/.test(audit));
    assert.match(audit, /ManualPlayQA@1\.0\.0/);
});

test('manual checklist is not registered by production', () => {
    for (const file of ['index.html', 'yahoo-classic.html', 'app.js'])
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /manual-play-qa/i, file);
});
