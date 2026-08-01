import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['play-analytics-contracts.js','play-analytics-privacy-policy.js','play-analytics-dispatcher.js','play-analytics-governance.js'];
function load() { const window = {}; for (const file of files) vm.runInNewContext(
    fs.readFileSync(`js/play/analytics/${file}`, 'utf8'), { window, globalThis: window }); return window; }

test('registry freezes all and only the 31 approved events with exact governance fields', () => {
    const { CaissaPlayAnalyticsContracts: C, CaissaPlayAnalyticsGovernance: G } = load();
    const registry = G.getEventRegistry();
    assert.equal(G.VERSION, 'PlayAnalyticsGovernance@1.0.0'); assert.equal(registry.length, 31);
    assert.equal(JSON.stringify(registry.map(item => item.eventId)), JSON.stringify([...C.EVENT_IDS]));
    assert.equal(new Set(registry.map(item => item.eventId)).size, 31); assert(G.validateRegistry().ok);
    for (const item of registry) { assert(Object.isFrozen(item)); assert.equal(item.dataClass, 'product-aggregate');
        assert.equal(item.retention, 'page-memory'); assert.equal(item.consentRequired, true);
        assert.equal(item.externalTransportEligible, false); assert.equal(item.productionEligible, false);
        assert(G.validateEventOwnership(item.eventId, item.owner).ok); assert(G.validateProductionEligibility(item.eventId).ok); }
});

test('registry validation fails closed for unknown IDs, duplicate IDs, changed ownership, and extra keys', () => {
    const { CaissaPlayAnalyticsGovernance: G } = load(); const registry = JSON.parse(JSON.stringify(G.getEventRegistry()));
    for (const mutate of [r => { r[0].eventId = 'unknown'; }, r => { r[1].eventId = r[0].eventId; },
        r => { r[0].owner = 'other'; }, r => { r[0].extra = true; }]) { const copy = structuredClone(registry); mutate(copy); assert.equal(G.validateRegistry(copy).ok, false); }
    assert.equal(G.validateEventOwnership('unknown', 'none').reason, 'unknown-event');
});

test('policies are immutable, JSON-safe, consentless, memory-only, and transport-blocked', () => {
    const { CaissaPlayAnalyticsGovernance: G } = load(), policy = G.getPolicy();
    assert.doesNotThrow(() => JSON.stringify(policy)); assert(Object.isFrozen(policy)); assert(Object.isFrozen(policy.prohibited.categories));
    assert.equal(policy.consent.status, 'missing'); assert.equal(policy.consent.externalDelivery, 'blocked');
    assert.equal(policy.retention.persistence, 'none'); assert.equal(policy.retention.dispatcherLimit, 50);
    assert.equal(policy.retention.crossSession, false); assert.equal(policy.transport.transport, 'none');
    assert.equal(policy.transport.networkEligible, false); assert.equal(policy.transport.clarityEligible, false);
    assert.equal(policy.production.eligible, false); assert.deepEqual([...policy.sinks.trustedIds], ['local-diagnostics','qa-test']);
});

test('master prohibited policy covers identity, chess, analysis, exact timing, content, and navigation data', () => {
    const { CaissaPlayAnalyticsGovernance: G } = load(), categories = G.getPolicy().prohibited.categories;
    for (const [category, key] of [['identity','email'],['chessContent','fen'],['analysis','evaluation'],
        ['exactTiming','exactClock'],['authoredContent','summaryContent'],['navigationProvider','rawUrl'],['freeForm','userContent']])
        assert(categories[category].includes(key));
});

test('volume budgets expose normal, warning, and fail states without changing product state', () => {
    const { CaissaPlayAnalyticsGovernance: G } = load();
    assert.equal(G.evaluateVolume().status, 'normal');
    assert.equal(G.evaluateVolume({ counts: { 'play-mode': 20 } }).status, 'warning');
    assert.equal(G.evaluateVolume({ counts: { 'play-mentor': 50 } }).status, 'fail');
    assert.deepEqual([...G.getPolicy().volume.prohibitedTriggers], ['clock-tick','move-stream','render-cycle']);
});

test('retention and redacted health remain bounded and expose no payload history', () => {
    const { CaissaPlayAnalyticsGovernance: G } = load();
    assert(G.evaluateRetention({ bufferSize: 50 }).ok); assert.equal(G.evaluateRetention({ bufferSize: 51 }).ok, false);
    const health = G.inspect(); assert.equal(health.registryCount, 31); assert.equal(health.bufferLimit, 50);
    assert.equal(health.productionEligible, false); assert.equal(health.transport, 'none'); assert.equal('events' in health, false);
    assert.equal('payload' in health, false); assert(Object.isFrozen(health)); assert.equal(G.dispose().disposed, true);
});
