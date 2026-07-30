import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'human-play-infrastructure-contracts.js', 'human-play-provider-matrix.js',
    'human-play-coming-later-policy.js', 'human-play-section-policy.js',
    'human-play-block-readiness.js'
];
const sources = files.map(file => fs.readFileSync(
    new URL(`../../js/play/players/${file}`, import.meta.url), 'utf8'));
function load() {
    const window = {};
    for (const source of sources) vm.runInNewContext(source, { window, globalThis: window, WeakSet });
    return window;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('contracts publish exact frozen categories, blockers, actions, and capability IDs', () => {
    const w = load(), api = w.CaissaHumanPlayInfrastructure;
    assert.equal(api.schemaVersion, '1.0.0');
    assert.deepEqual([...api.categories], [
        'available-now', 'provider-entry', 'provider-owned', 'presentation-only',
        'contract-ready', 'coming-later', 'blocked', 'unsupported', 'unavailable', 'unknown'
    ]);
    assert.equal(api.capabilityIds.length, 26);
    assert.ok(api.blockers.includes('PROPRIETARY_BACKEND_UNAVAILABLE'));
    assert.ok(api.actions.includes('find-match'));
    assert.ok(Object.isFrozen(api.getSnapshot()));
    assert.doesNotThrow(() => JSON.stringify(api.getSnapshot()));
});

test('all 26 capabilities are allowlisted, bounded, evidence-backed, and production blocked', () => {
    const w = load(), snapshot = w.CaissaHumanPlayInfrastructure.getSnapshot();
    assert.equal(snapshot.capabilities.length, 26);
    assert.equal(new Set(snapshot.capabilities.map(item => item.capabilityId)).size, 26);
    for (const capability of snapshot.capabilities) {
        assert.equal(capability.productionReady, false);
        assert.equal(capability.qaOnly, true);
        assert.ok(capability.limitations.length);
        assert.ok(capability.evidence.length);
        assert.ok(capability.blockers.every(code =>
            w.CaissaHumanPlayInfrastructure.blockers.includes(code)));
    }
    assert.equal(snapshot.productionReady, false);
});

test('provider matrix preserves FICS ownership, Classic inheritance, and unavailable runtimes', () => {
    const w = load(), api = w.CaissaHumanPlayInfrastructure;
    const fics = api.getProvider('fics'), classic = api.getProvider('caissa-classic');
    const local = api.getProvider('local'), future = api.getProvider('future-caissa-network');
    assert.equal(fics.runtimeOwner, 'fics');
    assert.equal(fics.support.clock, 'provider-owned');
    assert.equal(fics.simplifiedPlayHandoff, 'blocked');
    assert.equal(classic.runtimeOwner, 'fics');
    assert.equal(classic.support.games, 'presentation-only');
    assert.equal(local.productionReadiness, 'unsupported');
    assert.equal(future.productionReadiness, 'contract-ready');
    assert.equal(future.support.games, 'unsupported');
});

test('section truth has five stable sections, zero default rows, and no indefinite loading', () => {
    const w = load(), sections = w.CaissaHumanPlayInfrastructure.sections;
    assert.deepEqual(plain(sections.map(section => section.label)), [
        'Friends Online', 'Available Players', 'Challenges',
        'Recent Opponents', 'Suggested Players'
    ]);
    assert.ok(sections.every(section => section.itemCount === 0));
    assert.ok(sections.every(section => section.category !== 'loading'));
    assert.equal(sections.find(item => item.label === 'Available Players').category, 'unavailable');
    assert.equal(sections.find(item => item.label === 'Friends Online').category, 'coming-later');
});

test('action policy enables owner entry only and explains unavailable future actions', () => {
    const w = load(), policy = w.CaissaHumanPlayInfrastructure.actionPolicy;
    assert.equal(policy.primary.actionId, 'open-fics');
    assert.deepEqual(plain(policy.secondary.map(item => item.actionId)), ['open-classic', 'return-to-games']);
    assert.equal(policy.unavailable.find(item => item.actionId === 'find-match').blocker,
        'MATCHMAKING_UNAVAILABLE');
    assert.equal(w.CaissaHumanPlayInfrastructure.getCapability('fics-lobby').actionable, true);
    assert.equal(w.CaissaHumanPlayInfrastructure.getCapability('caissa-matchmaking').actionable, false);
    w.CaissaHumanPlayInfrastructure.noteAction(true, null);
    w.CaissaHumanPlayInfrastructure.noteAction(false, 'UNKNOWN');
    assert.equal(w.CaissaHumanPlayInfrastructure.inspect().actionsInvoked, 2);
    assert.equal(w.CaissaHumanPlayInfrastructure.inspect().actionFailures, 1);
});

test('Coming Later copy is fixed, prerequisite-based, alternative-bearing, and date-free', () => {
    const w = load(), policy = w.CaissaHumanPlayInfrastructure.comingLaterPolicy;
    for (const template of Object.values(policy.templates)) {
        assert.ok(template.featureLabel && template.explanation && template.prerequisite && template.alternative);
        assert.doesNotMatch(JSON.stringify(template), /\b20\d{2}\b|waitlist|almost ready|temporary outage/i);
    }
});

test('readiness is architecturally complete while runtime and production remain blocked', () => {
    const w = load(), readiness = w.CaissaHumanPlayInfrastructure.readiness;
    assert.equal(readiness.foundationComplete, true);
    assert.equal(readiness.designReady, true);
    assert.equal(readiness.runtimeComplete, false);
    assert.equal(readiness.productionReady, false);
    assert.ok(readiness.blockers.includes('HUMAN_HANDOFF_UNAVAILABLE'));
    assert.match(readiness.nextRoadmapPhase, /SEASON 10\.10/);
});

test('hostile and malformed capabilities fail closed', () => {
    const w = load(), contracts = w.CaissaHumanPlayInfrastructureContracts;
    const valid = plain(w.CaissaHumanPlayInfrastructure.capabilities[0]);
    assert.equal(contracts.createCapability({ ...valid, capabilityId: 'forged' }), null);
    assert.equal(contracts.createCapability({ ...valid, schemaVersion: '9.0.0' }), null);
    const hostile = JSON.parse('{"capabilityId":"fics-login","__proto__":{"polluted":true}}');
    assert.equal(contracts.createCapability(hostile), null);
    assert.equal({}.polluted, undefined);
});

test('production infrastructure contains no resources, state ownership, fixtures, or misleading success', () => {
    const source = sources.join('\n');
    for (const forbidden of [
        /\bnew\s+(?:Worker|WebSocket)\b/, /localStorage|sessionStorage|indexedDB/,
        /setTimeout|setInterval|requestAnimationFrame/, /querySelector|getElementById|innerHTML/,
        /\bApp\.|GameLifecycle|FairPlayPolicy|createGameRecord|startHumanGame/,
        /fixture|mockPlayer|fakePlayer|invitationToken|matchmakingSuccess/
    ]) assert.doesNotMatch(source, forbidden);
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        for (const file of files)
            assert.equal((html.match(new RegExp(file.replaceAll('.', '\\.'), 'g')) || []).length, 1);
        assert.ok(html.indexOf('human-play-block-readiness.js') < html.indexOf('players-panel.js'));
    }
});
