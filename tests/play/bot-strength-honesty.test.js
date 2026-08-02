import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const policySource = read('js/play/bots/bot-strength-honesty.js');

function loadPolicy() {
    const window = {};
    vm.runInNewContext(policySource, { window, globalThis: window, Object });
    return window.CaissaPlayV2BotStrengthHonesty;
}

test('publishes PlayV2BotStrengthHonesty@1.0.0 with every mandatory denial', () => {
    const policy = loadPolicy();
    assert.equal(policy.contractId, 'PlayV2BotStrengthHonesty@1.0.0');
    assert.equal(policy.currentRatingStatus, 'unrated-calibration-pending');
    for (const key of ['numericEloDisplay', 'certifiedEloClaim', 'federationRatingClaim',
        'exactHumanStrengthClaim', 'realPersonReplica', 'realPersonIdentity', 'realPersonLikeness', 'depthAsElo'])
        assert.equal(policy[key], 'prohibited');
    assert.equal(policy.styleClaimRequiresCalibrationEvidence, true);
    assert.equal(policy.difficultyClaimRequiresRelativeEvidence, true);
    assert.equal(policy.personalityNames, 'allowlisted');
    assert.equal(policy.publicRatingActivationRequiresVersionedCalibration, true);
    assert.equal(policy.analyticsTransport, 'disabled');
    assert.deepEqual([...policy.personalityNameAllowlist], ['Beginner', 'Casual', 'Tactical', 'Solid']);
    assert.equal(Object.isFrozen(policy), true);
});

test('future numeric-rating gate is complete and permits no placeholder number', () => {
    const policy = loadPolicy();
    assert.equal(policy.futureNumericRatingLabel, 'Estimated');
    assert.deepEqual([...policy.futureNumericRatingGate], [
        'versioned-bot-configuration', 'versioned-engine-and-worker', 'reproducible-calibration-protocol',
        'sufficiently-large-sample', 'opponent-pool-and-rating-provenance', 'time-control-specification',
        'confidence-interval-or-documented-uncertainty', 'device-and-performance-considerations',
        'calibration-date', 'expiration-and-recalibration-policy', 'independent-review', 'explicit-product-approval'
    ]);
    assert.doesNotMatch(policySource, /(?:estimated|elo|rating)\s*[:=]\s*['"]?\d{3,4}/i);
});

test('profile gate rejects missing disclosure, unapproved identity, rating fields, and claims', () => {
    const policy = loadPolicy();
    const valid = { id: 'beginner', name: 'Beginner', shortName: 'Beginner', description: 'Limited.',
        ratingStatus: 'Unrated · calibration pending', presentation: { tagline: 'Limited, with bounded inaccuracies.', strengths: [], limitations: [] } };
    assert.equal(policy.validateProfile(valid).valid, true);
    for (const mutation of [
        { ratingStatus: 'Rated' }, { name: 'Magnus Carlsen' }, { elo: 1400 }, { federationTitle: 'GM' },
        { realPersonIdentity: 'person' }, { description: 'Certified Elo strength.' }, { description: 'Unbeatable.' }
    ]) assert.equal(policy.validateProfile({ ...valid, ...mutation }).valid, false);
});

test('focused bot surfaces disclose unrated status and contain no public numeric or identity claim', () => {
    const registry = read('js/play/bots/bot-registry.js');
    const panel = read('js/play/bots-panel.js');
    assert.equal((registry.match(/ratingStatus: 'Unrated · calibration pending'/g) || []).length, 4);
    assert.doesNotMatch(registry + panel, /\b\d{3,4}\s*(?:elo|rating)\b/i);
    assert.doesNotMatch(registry + panel, /\b(?:grandmaster|professional|unbeatable|replica of|plays exactly like)\b/i);
    assert.match(panel, /profile\.ratingStatus/);
    assert.match(panel, /aria-label.*profile\.name.*profile\.ratingStatus.*tagline.*difficultyBand/s);
});

test('style phrases and relative difficulty remain owned by calibrated policy profiles', () => {
    const registry = read('js/play/bots/bot-registry.js');
    const personality = read('js/play/bots/bot-personality-policy.js');
    for (const phrase of ['Limited, with bounded inaccuracies.', 'Balanced recreational behavior.',
        'Prefers sound forcing candidates.', 'Prefers stable, lower-exposure candidates.']) assert.match(registry, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const id of ['beginner', 'casual', 'tactical', 'solid']) {
        assert.match(registry, new RegExp(`personalityPolicyId: '${id}'`));
        assert.match(personality, new RegExp(`${id}: Object\\.freeze`));
    }
});

test('security and privacy guard finds no transport, identity lookup, storage, or upload in bot profiles', () => {
    const sources = ['bot-strength-honesty.js', 'bot-profile.js', 'bot-registry.js', 'bot-session.js']
        .map(file => read(`js/play/bots/${file}`)).join('\n');
    assert.doesNotMatch(sources, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|document\.cookie|localStorage|sessionStorage|indexedDB|PGN upload|FICS identity|searchParams/i);
});
