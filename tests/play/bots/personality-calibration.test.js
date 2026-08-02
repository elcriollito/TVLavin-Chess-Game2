import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { PERSONALITY_CALIBRATION_CORPUS, PERSONALITY_CORPUS_PROVENANCE, PERSONALITY_CORPUS_VERSION } from './personality-calibration-corpus.js';

const source = fs.readFileSync(new URL('../../../js/play/bots/bot-personality-policy.js', import.meta.url), 'utf8');
const window = { Chess }; vm.runInNewContext(source, { window, globalThis: window, Object, Math });
const policy = window.CaissaBotPersonalityPolicy;

test('versioned repository-owned corpus covers forcing, unsafe, stability, mate and promotion properties', () => {
    assert.equal(PERSONALITY_CORPUS_VERSION, '1.0.0');
    assert.match(PERSONALITY_CORPUS_PROVENANCE, /Repository-owned synthetic/);
    assert.deepEqual(new Set(PERSONALITY_CALIBRATION_CORPUS.map(item => item.category)),
        new Set(['forcing-tactics', 'unsafe-forcing', 'stability', 'mate', 'promotion']));
    assert.ok(PERSONALITY_CALIBRATION_CORPUS.every(item => Object.isFrozen(item) && item.limitations.includes('not human-rating')));
});

test('fixed-seed calibration clears the predeclared personality and safety thresholds', () => {
    const byId = Object.fromEntries(PERSONALITY_CALIBRATION_CORPUS.map(item => [item.id, item]));
    const select = (profileId, id, seed = 'calibration') => policy.select({ profileId, seed,
        fen: byId[id].fen, candidates: byId[id].candidates });
    assert.equal(select('tactical', 'forcing-check-safe').move, 'e2b5');
    assert.equal(select('casual', 'forcing-check-safe').move, 'e2d2');
    assert.equal(select('solid', 'forcing-check-safe').move, 'e2d2');
    assert.equal(select('tactical', 'forcing-check-unsafe').move, 'e2d2');
    assert.equal(select('solid', 'stable-exposure').move, 'c3d4');
    assert.notEqual(select('tactical', 'stable-exposure').move, 'c3d4');
    for (const profileId of Object.keys(policy.profiles)) {
        assert.equal(select(profileId, 'mate-priority').move, 'f7g7');
        assert.equal(select(profileId, 'promotion-priority').move, 'a7a8q');
    }
});

test('100 fixed seeds reproduce and quantify bounded Beginner/Casual errors before acceptance', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const candidates = ['e2e4', 'd2d4', 'g1f3', 'c2c4'].map((move, index) =>
        ({ move, multipv: index + 1, score: (50 - index * 30) / 100 }));
    const measure = profileId => Array.from({ length: 100 }, (_, index) => {
        const input = { profileId, fen, candidates, seed: `calibration-seed-${index}` };
        const first = policy.select(input); const repeat = policy.select(input);
        assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(repeat)));
        return first;
    });
    const beginner = measure('beginner'); const casual = measure('casual');
    const errorRate = results => results.filter(item => item.reasonCode === 'CONTROLLED_VARIATION').length / results.length;
    const averageLoss = results => results.reduce((sum, item) => sum + (item.evidence?.lossCp || 0), 0) / results.length;
    assert.ok(errorRate(beginner) >= policy.thresholds.beginnerErrorRateMinimum);
    assert.ok(errorRate(casual) <= policy.thresholds.casualErrorRateMaximum);
    assert.ok(errorRate(beginner) > errorRate(casual));
    assert.ok(averageLoss(beginner) > averageLoss(casual));
});
