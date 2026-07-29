import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'presence-freshness-policy.js', 'player-presence.js', 'presence-snapshot.js',
    'presence-registry.js', 'presence-provider-adapter.js',
    'fics-presence-adapter.js', 'classic-presence-adapter.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../js/play/players/${file}`, import.meta.url), 'utf8'));
function load() {
    const window = {};
    for (const source of sources) vm.runInNewContext(source, { window, globalThis: window, JSON, Map, Set });
    return window;
}
const policy = { freshUntilMs: 1000, staleUntilMs: 2000, expireAfterMs: 3000, maxClockSkewMs: 100 };
function record(overrides = {}) {
    return {
        provider: 'fics', providerPlayerId: 'Real_User', displayName: 'Real_User',
        rating: null, title: null, status: 'available', preferredTimeControls: [],
        country: null, friendState: 'unsupported', guest: false, lastSeenAt: null,
        providerTimestamp: 10000, observedAt: 10500, challengeAvailability: 'provider-only',
        capabilities: { challengeEntry: true }, sourceConfidence: 'direct', ...overrides
    };
}
function snapshot(records = [record()], overrides = {}) {
    return {
        provider: 'fics', status: records.length ? 'connected' : 'empty',
        authenticated: true, observedAt: 10500, providerTimestamp: 10000,
        records, source: 'deterministic-adapter', ...overrides
    };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('contracts publish exact frozen versioned vocabularies', () => {
    const w = load();
    for (const api of [
        w.CaissaPresenceFreshnessPolicy, w.CaissaPlayerPresence,
        w.CaissaPresenceSnapshot, w.CaissaPresenceRegistry,
        w.CaissaPresenceProviderAdapter, w.CaissaFicsPresenceAdapter,
        w.CaissaClassicPresenceAdapter
    ]) {
        assert.equal(api.schemaVersion, '1.0.0');
        assert.ok(Object.isFrozen(api));
    }
    assert.deepEqual([...w.CaissaPlayerPresence.sourceConfidence], ['direct', 'derived', 'stale', 'unknown']);
});

test('provider-qualified identity normalizes case and prevents collisions', () => {
    const w = load();
    const fics = w.CaissaPlayerPresence.normalize(record(), { freshnessPolicy: policy });
    const local = w.CaissaPlayerPresence.normalize(record({
        provider: 'local', providerPlayerId: 'REAL_USER'
    }), { freshnessPolicy: policy });
    assert.equal(fics.presenceId, 'fics:real_user');
    assert.equal(local.presenceId, 'local:real_user');
    assert.notEqual(fics.presenceId, local.presenceId);
    assert.equal(fics.displayName, 'Real_User');
    for (const id of ['', 'with space', '<script>', 'x'.repeat(65)])
        assert.equal(w.CaissaPlayerPresence.normalize(record({ providerPlayerId: id }), { freshnessPolicy: policy }), null);
});

test('optional rating remains provider-qualified and strictly bounded', () => {
    const w = load();
    const missing = w.CaissaPlayerPresence.normalize(record(), { freshnessPolicy: policy });
    assert.equal(missing.rating, null);
    const rated = w.CaissaPlayerPresence.normalize(record({
        rating: { value: 1725, ratingType: 'blitz', provisional: true }
    }), { freshnessPolicy: policy });
    assert.deepEqual(plain(rated.rating), {
        value: 1725, ratingType: 'blitz', provisional: true, provider: 'fics'
    });
    for (const rating of [
        { value: -1, ratingType: 'blitz' }, { value: 4001, ratingType: 'standard' },
        { value: 1500, ratingType: 'elo' }
    ]) assert.equal(w.CaissaPlayerPresence.normalize(record({ rating }), { freshnessPolicy: policy }), null);
});

test('optional title, country, guest, controls, and friend state never infer data', () => {
    const w = load();
    const value = w.CaissaPlayerPresence.normalize(record({
        title: 'FICS-title', country: 'us', guest: true,
        preferredTimeControls: [{ baseSeconds: 300, incrementSeconds: 0 }]
    }), { freshnessPolicy: policy });
    assert.equal(value.title, 'FICS-title');
    assert.equal(value.country, 'US');
    assert.equal(value.guest, true);
    assert.equal(value.friendState, 'unsupported');
    assert.deepEqual(plain(value.preferredTimeControls), [{ baseSeconds: 300, incrementSeconds: 0 }]);
});

test('freshness is deterministic, handles skew, and stale fails closed', () => {
    const w = load();
    const evaluate = age => w.CaissaPresenceFreshnessPolicy.evaluate(10000, 10000 + age, policy);
    assert.equal(evaluate(500).status, 'fresh');
    assert.equal(evaluate(1500).status, 'aging');
    assert.equal(evaluate(2500).status, 'stale');
    assert.equal(evaluate(3500).status, 'expired');
    assert.equal(w.CaissaPresenceFreshnessPolicy.evaluate(10050, 10000, policy).ageMs, 0);
    assert.equal(w.CaissaPresenceFreshnessPolicy.evaluate(10200, 10000, policy), null);
    const stale = w.CaissaPlayerPresence.normalize(record({ observedAt: 12500 }), { freshnessPolicy: policy });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.challengeAvailability, 'unavailable');
    assert.equal(stale.sourceConfidence, 'stale');
});

test('snapshot distinguishes connected empty, disconnected, unsupported, and invalid data', () => {
    const w = load();
    const connected = w.CaissaPresenceSnapshot.create(snapshot(), { freshnessPolicy: policy });
    assert.equal(connected.connected, true);
    assert.equal(connected.records.length, 1);
    assert.ok(Object.isFrozen(connected.records[0]));
    assert.equal(w.CaissaPresenceSnapshot.create(snapshot([], { status: 'disconnected' }), { freshnessPolicy: policy }).connected, false);
    assert.equal(w.CaissaPresenceSnapshot.create(snapshot([], { status: 'unsupported' }), { freshnessPolicy: policy }).status, 'unsupported');
    assert.equal(w.CaissaPresenceSnapshot.create(snapshot([record(), record()]), { freshnessPolicy: policy }), null);
    assert.equal(w.CaissaPresenceSnapshot.create({ ...snapshot(), schemaVersion: '9.0.0' }, { freshnessPolicy: policy }), null);
});

test('registry ingests, replaces, isolates providers, expires, clears, and disposes', () => {
    const w = load();
    const registry = w.CaissaPresenceRegistry.create();
    assert.equal(registry.ingest(snapshot(), { freshnessPolicy: policy }).ok, true);
    assert.equal(registry.get('fics:real_user').displayName, 'Real_User');
    assert.equal(registry.list().length, 1);
    assert.equal(registry.ingest(snapshot([record({ displayName: 'Updated' })]), { freshnessPolicy: policy }).ok, true);
    assert.equal(registry.get('fics:real_user').displayName, 'Updated');
    assert.equal(registry.ingest({
        ...snapshot([record({ provider: 'local' })]), provider: 'local'
    }, { freshnessPolicy: policy }).ok, true);
    assert.equal(registry.list().length, 2);
    assert.deepEqual(plain(registry.expire(12500).value), { expired: 0, stale: 2 });
    assert.equal(registry.list().length, 0);
    assert.equal(registry.list({ includeStale: true }).length, 2);
    assert.deepEqual(plain(registry.expire(14000).value), { expired: 2, stale: 0 });
    assert.equal(registry.list({ includeStale: true }).length, 0);
    assert.equal(registry.clearProvider('fics').ok, true);
    assert.equal(registry.dispose().reasonCode, 'DISPOSED');
    assert.equal(registry.ingest(snapshot(), { freshnessPolicy: policy }).reasonCode, 'DISPOSED');
});

test('hostile keys, malformed timestamps, PII-shaped fields, and unknown providers fail closed', () => {
    const w = load();
    const hostile = JSON.parse('{"provider":"fics","providerPlayerId":"x","displayName":"x","providerTimestamp":10000,"observedAt":10500,"__proto__":{"polluted":true}}');
    assert.ok(w.CaissaPlayerPresence.normalize(hostile, { freshnessPolicy: policy }));
    assert.equal({}.polluted, undefined);
    for (const invalid of [
        record({ provider: 'classic' }), record({ observedAt: 0 }),
        record({ providerTimestamp: Number.NaN }), record({ displayName: 'a@b.example' }),
        record({ country: 'United States' })
    ]) assert.equal(w.CaissaPlayerPresence.normalize(invalid, { freshnessPolicy: policy }), null);
});

test('FICS and Classic adapters truthfully remain unsupported without resources', () => {
    const w = load();
    const fics = w.CaissaFicsPresenceAdapter.create();
    const classic = w.CaissaClassicPresenceAdapter.create();
    assert.equal(fics.isSupported(), false);
    assert.equal(fics.getSnapshot(), null);
    assert.equal(fics.refresh().reasonCode, 'SNAPSHOT_UNAVAILABLE');
    assert.equal(classic.relationship, 'caissa-classic-presentation');
    assert.equal(classic.provider, 'fics');
    assert.equal(classic.getSnapshot(), null);
    assert.deepEqual(plain(fics.inspect()), {
        provider: 'fics', supported: false, relationship: null, refreshes: 1,
        listenerCount: 0, socketCount: 0, timerCount: 0, disposed: false
    });
});

test('static guardrails exclude sockets, commands, DOM scraping, resources, and persistence', () => {
    const combined = sources.join('\n');
    for (const forbidden of [
        /\bnew\s+WebSocket\b/, /\bnew\s+Worker\b/, /postMessage\s*\(/,
        /querySelector|getElementById|innerHTML|MutationObserver/,
        /localStorage|sessionStorage|indexedDB/, /setInterval|setTimeout|requestAnimationFrame/,
        /sendCommand|\.send\s*\(|seek\s+\d|observe\s+\d/,
        /\bApp\.(?:game|board)\s*=/, /FairPlayPolicy|GameLifecycle/
    ]) assert.doesNotMatch(combined, forbidden);
});

test('production pages register contracts in dependency order before PlayersPanel', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        for (const file of files) assert.equal((html.match(new RegExp(file.replaceAll('.', '\\.'), 'g')) || []).length, 1);
        assert.ok(html.indexOf('presence-freshness-policy.js') < html.indexOf('player-presence.js'));
        assert.ok(html.indexOf('presence-registry.js') < html.indexOf('players-panel.js'));
    }
});
