import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(new URL('../../js/play/bots/bot-personality-policy.js', import.meta.url), 'utf8');
function load() { const window = { Chess }; vm.runInNewContext(source, { window, globalThis: window, Object, Math }); return window.CaissaBotPersonalityPolicy; }
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('publishes the frozen PlayV2BotPersonalityPolicy@1.0.0 contract and predeclared thresholds', () => {
    const policy = load();
    assert.equal(policy.contractId, 'PlayV2BotPersonalityPolicy@1.0.0');
    assert.deepEqual(Object.keys(policy.profiles), ['beginner', 'casual', 'tactical', 'solid']);
    assert.equal(policy.globalPolicies.legalMovesOnly, true);
    assert.equal(policy.globalPolicies.workerOwner, 'existing-single-owner');
    assert.equal(policy.globalPolicies.certifiedEloClaim, 'prohibited');
    assert.equal(policy.thresholds.legalMoveRate, 1);
    assert.ok(Object.isFrozen(policy) && Object.isFrozen(policy.profiles.beginner));
});

test('rejects illegal candidates and never selects outside the legal allowlist', () => {
    const policy = load();
    const result = policy.select({ profileId: 'beginner', fen: START, seed: 'fixed', candidates: [
        { move: 'a1a8', multipv: 1, score: 10 }, { move: 'e2e4', multipv: 2, score: 0.1 }
    ] });
    assert.equal(result.ok, true); assert.equal(result.move, 'e2e4');
    assert.equal(policy.select({ profileId: 'solid', fen: START, seed: 'fixed', candidates: [{ move: 'a1a8' }] }).ok, false);
});

test('same position, profile, candidates and seed reproduce controlled Beginner/Casual choices', () => {
    const policy = load();
    const candidates = ['e2e4', 'd2d4', 'g1f3', 'c2c4'].map((move, index) =>
        ({ move, multipv: index + 1, score: (40 - index * 30) / 100 }));
    for (const profileId of ['beginner', 'casual']) {
        for (const seed of ['fixture-a', 'fixture-b', 'fixture-c']) {
            const first = policy.select({ profileId, fen: START, seed, candidates });
            const second = policy.select({ profileId, fen: START, seed, candidates });
            assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
        }
    }
});

test('Beginner has more bounded controlled variation than Casual under fixed seeds', () => {
    const policy = load();
    const candidates = ['e2e4', 'd2d4', 'g1f3', 'c2c4'].map((move, index) =>
        ({ move, multipv: index + 1, score: (50 - index * 30) / 100 }));
    const rates = Object.fromEntries(['beginner', 'casual'].map(profileId => [profileId,
        Array.from({ length: 100 }, (_, index) => policy.select({ profileId, fen: START, seed: `seed-${index}`, candidates }))
            .filter(result => result.reasonCode === 'CONTROLLED_VARIATION').length / 100]));
    assert.ok(rates.beginner >= policy.thresholds.beginnerErrorRateMinimum);
    assert.ok(rates.casual <= policy.thresholds.casualErrorRateMaximum);
    assert.ok(rates.beginner > rates.casual);
});

test('Tactical prefers a sound checking candidate but rejects one outside its loss boundary', () => {
    const policy = load();
    const fen = '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1';
    const safe = policy.select({ profileId: 'tactical', fen, seed: 'tactical', candidates: [
        { move: 'e2d2', multipv: 1, score: 0.5 }, { move: 'e2b5', multipv: 2, score: 0.2 }
    ] });
    assert.equal(safe.move, 'e2b5'); assert.equal(safe.reasonCode, 'TACTICAL_PREFERENCE');
    const unsafe = policy.select({ profileId: 'tactical', fen, seed: 'tactical', candidates: [
        { move: 'e2d2', multipv: 1, score: 0.5 }, { move: 'e2b5', multipv: 2, score: -1 }
    ] });
    assert.equal(unsafe.move, 'e2d2');
});

test('forced mate outranks personality and negative mate is avoided when a safe candidate exists', () => {
    const policy = load();
    const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    for (const profileId of Object.keys(policy.profiles)) {
        assert.equal(policy.select({ profileId, fen, seed: 'mate', candidates: [
            { move: 'f7e7', multipv: 1, score: 4 }, { move: 'f7g7', multipv: 2, mate: 1 }
        ] }).move, 'f7g7');
    }
});

test('Solid chooses lower immediate forcing exposure inside its evaluation-safe set', () => {
    const policy = load();
    const fen = 'rnbqkbnr/1pp1ppp1/p2p3p/8/1P6/2B5/P1PPPPPP/RN1QKBNR w KQkq - 0 4';
    const result = policy.select({ profileId: 'solid', fen, seed: 'solid', candidates: [
        { move: 'b4b5', multipv: 1, score: 0.5 }, { move: 'c3d4', multipv: 2, score: 0.45 },
        { move: 'c3e5', multipv: 3, score: 0.4 }
    ] });
    assert.equal(result.move, 'c3d4'); assert.equal(result.reasonCode, 'STABILITY_PREFERENCE');
    assert.equal(result.evidence.exposure, 0);
});

test('source owns no Worker, lifecycle, network, storage, random, identity, or move commit', () => {
    assert.doesNotMatch(source, /new\s+Worker|fetch\s*\(|WebSocket|localStorage|sessionStorage|Math\.random/i);
    assert.doesNotMatch(source, /App\.|moveHistory|board\.position|playerName|biography/i);
});
