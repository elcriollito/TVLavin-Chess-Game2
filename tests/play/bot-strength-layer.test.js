import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const strengthSource = fs.readFileSync(new URL('../../js/play/bots/bot-strength-layer.js', import.meta.url), 'utf8');
const personalitySource = fs.readFileSync(new URL('../../js/play/bots/bot-personality-policy.js', import.meta.url), 'utf8');

function load() {
    const window = { Chess };
    const context = { window, globalThis: window, Object, Map, Math };
    vm.runInNewContext(strengthSource, context);
    vm.runInNewContext(personalitySource, context);
    return window;
}
const plain = value => JSON.parse(JSON.stringify(value));
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CANDIDATES = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'].map((move, index) =>
    ({ move, multipv: index + 1, score: (100 - index * 80) / 100 }));

test('publishes 63 immutable modelled targets from 100 through 3200', () => {
    const layer = load().CaissaBotStrengthLayer;
    assert.equal(layer.schemaVersion, '1.0.0');
    assert.equal(layer.modelVersion, 'classic-target-model-1');
    assert.equal(layer.list().length, 63);
    assert.equal(layer.getByTarget(100).id, 'strength-100');
    assert.equal(layer.getByTarget(3200).id, 'strength-3200');
    assert.equal(layer.getByTarget(125), null);
    assert.ok(layer.list().every(profile => Object.isFrozen(profile) && Object.isFrozen(profile.policy)
        && profile.calibrationStatus === 'modelled-uncalibrated' && profile.ratingClaim === 'none'));
});

test('search strength rises while variation and loss tolerance fall across the ladder', () => {
    const layer = load().CaissaBotStrengthLayer;
    const profiles = [100, 250, 1000, 1500, 2200, 2800, 3200].map(value => layer.getByTarget(value));
    for (let index = 1; index < profiles.length; index += 1) {
        assert.ok(profiles[index].search.depth >= profiles[index - 1].search.depth);
        assert.ok(profiles[index].policy.errorRatePercent <= profiles[index - 1].policy.errorRatePercent);
        assert.ok(profiles[index].policy.lossBoundaryCp <= profiles[index - 1].policy.lossBoundaryCp);
    }
    assert.deepEqual(plain(profiles.map(profile => profile.search.depth)), [1, 2, 6, 9, 13, 18, 20]);
});

test('modelled selection is deterministic and weaker targets vary more often', () => {
    const w = load(); const policy = w.CaissaBotPersonalityPolicy;
    const pick = (profileId, seed) => policy.select({ profileId, fen: START, seed, candidates: CANDIDATES });
    for (const id of ['strength-100', 'strength-1500', 'strength-3200']) {
        assert.deepEqual(plain(pick(id, 'repeatable')), plain(pick(id, 'repeatable')));
    }
    const weakVariation = Array.from({ length: 100 }, (_, index) => pick('strength-100', `seed-${index}`))
        .filter(result => result.reasonCode === 'MODELLED_STRENGTH_VARIATION').length;
    const eliteVariation = Array.from({ length: 100 }, (_, index) => pick('strength-3200', `seed-${index}`))
        .filter(result => result.reasonCode === 'MODELLED_STRENGTH_VARIATION').length;
    assert.ok(weakVariation >= 80);
    assert.equal(eliteVariation, 0);
    assert.ok(Array.from({ length: 20 }, (_, index) => pick('strength-3200', `elite-${index}`))
        .every(result => result.move === 'e2e4'));
});

test('forced mate and legal-move safety remain stronger than the target model', () => {
    const w = load(); const policy = w.CaissaBotPersonalityPolicy;
    assert.equal(policy.select({ profileId: 'strength-100', fen: START, seed: 'illegal',
        candidates: [{ move: 'a1a8', multipv: 1, score: 99 }] }).ok, false);
    const mateFen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    assert.equal(policy.select({ profileId: 'strength-100', fen: mateFen, seed: 'mate', candidates: [
        { move: 'f7e7', multipv: 1, score: 4 }, { move: 'f7g7', multipv: 2, mate: 1 }
    ] }).move, 'f7g7');
});

test('strength model owns no worker, lifecycle, storage, network, or random source', () => {
    assert.doesNotMatch(strengthSource, /new\s+Worker|fetch\s*\(|WebSocket|localStorage|sessionStorage|Math\.random|App\.|board\.|moveHistory/i);
    assert.doesNotMatch(strengthSource, /calibrationStatus:\s*['"]calibrated|certified|federation|human rating/i);
});
