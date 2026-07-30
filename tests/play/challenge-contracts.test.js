import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'challenge-contracts.js', 'challenge-lifecycle.js', 'challenge-registry.js',
    'challenge-provider-adapter.js', 'fics-challenge-adapter.js',
    'classic-challenge-adapter.js', 'caissa-challenge-adapter.js'
];
const sources = files.map(file => fs.readFileSync(
    new URL(`../../js/play/players/${file}`, import.meta.url), 'utf8'));
function load() {
    const window = {};
    for (const source of sources) vm.runInNewContext(source, {
        window, globalThis: window, JSON, Map, Set, Promise
    });
    return window;
}
const plain = value => JSON.parse(JSON.stringify(value));
function request(overrides = {}) {
    return {
        provider: 'fics', requestId: 'request-1', direction: 'outgoing',
        challengerId: 'fics:me', challengedId: 'fics:opponent',
        challengerName: 'Me', challengedName: 'Opponent',
        timeControl: {
            initialSeconds: 300, incrementSeconds: 3,
            category: 'blitz', providerRepresentation: '5+3'
        },
        rated: 'casual', colorPreference: 'random', variant: 'standard',
        createdAt: 10000, expiresAt: 20000, providerReference: 'seek-42',
        capabilities: {
            submit: true, accept: false, decline: false,
            cancel: true, reconnect: false, activeGame: true
        },
        ...overrides
    };
}
function event(record, eventType, observedAt, overrides = {}) {
    return {
        challengeId: record.challengeId, provider: record.provider, eventType,
        observedAt, providerTimestamp: observedAt,
        sourceConfidence: eventType.startsWith('PROVIDER_') ? 'provider' : 'local-observed',
        reasonCode: null, correlationId: `event-${observedAt}`, ...overrides
    };
}
function created(w, overrides = {}) {
    const result = w.CaissaChallengeLifecycle.createChallenge(request(overrides));
    assert.equal(result.ok, true);
    return result.value;
}
function move(w, record, type, at, overrides = {}) {
    const result = w.CaissaChallengeLifecycle.transition(record, event(record, type, at, overrides));
    assert.equal(result.ok, true, result.reasonCode);
    return result.value;
}

test('contracts expose exact frozen schemas, states, events, directions, and actions', () => {
    const w = load();
    for (const api of [
        w.CaissaChallengeRequest, w.CaissaChallengeRecord, w.CaissaChallengeEvent,
        w.CaissaChallengeLifecycle, w.CaissaChallengeRegistry,
        w.CaissaChallengeProviderAdapter, w.CaissaFicsChallengeAdapter,
        w.CaissaClassicChallengeAdapter, w.CaissaChallengeAdapter
    ]) {
        assert.equal(api.schemaVersion, '1.0.0');
        assert.ok(Object.isFrozen(api));
    }
    assert.deepEqual([...w.CaissaChallengeRecord.states], [
        'created', 'pending', 'accepted', 'declined', 'canceled',
        'expired', 'connecting', 'active', 'disconnected', 'completed'
    ]);
    assert.deepEqual([...w.CaissaChallengeRecord.directions], ['incoming', 'outgoing']);
    assert.ok(Object.isFrozen(w.CaissaChallengeLifecycle.transitionTable));
});

test('request contract is provider-qualified, bounded, immutable, and never defaults rated', () => {
    const w = load();
    const normalized = w.CaissaChallengeRequest.normalize(request({ rated: undefined }));
    assert.equal(normalized.rated, 'unknown');
    assert.equal(normalized.challengerId, 'fics:me');
    assert.ok(Object.isFrozen(normalized.timeControl));
    for (const invalid of [
        request({ challengerId: 'local:me' }),
        request({ challengedId: 'fics:me' }),
        request({ timeControl: { initialSeconds: -1, incrementSeconds: 0, category: 'blitz' } }),
        request({ variant: 'atomic' }),
        request({ providerReference: 'play 42' })
    ]) assert.equal(w.CaissaChallengeRequest.normalize(invalid), null);
});

test('outgoing lifecycle follows explicit transitions and provider evidence', () => {
    const w = load();
    let record = created(w);
    assert.deepEqual([...record.availableActions], ['submit', 'cancel']);
    record = move(w, record, 'CHALLENGE_SUBMITTED', 11000);
    assert.equal(record.state, 'pending');
    assert.deepEqual([...record.availableActions], ['cancel']);
    const denied = w.CaissaChallengeLifecycle.transition(record,
        event(record, 'PROVIDER_ACCEPTED', 12000, { sourceConfidence: 'derived' }));
    assert.equal(denied.reasonCode, 'PROVIDER_EVIDENCE_REQUIRED');
    record = move(w, record, 'PROVIDER_ACCEPTED', 12000);
    record = move(w, record, 'PROVIDER_CONNECTING', 13000);
    record = move(w, record, 'PROVIDER_ACTIVE', 14000);
    assert.equal(record.state, 'active');
    assert.deepEqual([...record.availableActions], ['open-provider']);
    record = move(w, record, 'PROVIDER_COMPLETED', 15000);
    assert.equal(record.state, 'completed');
    assert.deepEqual([...record.availableActions], []);
    assert.equal(w.CaissaChallengeLifecycle.transition(
        record, event(record, 'PROVIDER_ACTIVE', 16000)).reasonCode, 'TERMINAL_STATE');
    assert.equal(w.CaissaChallengeLifecycle.transition(
        record, event(record, 'PROVIDER_COMPLETED', 15000)).reasonCode, 'DUPLICATE_SUPPRESSED');
});

test('incoming challenge exposes accept and decline while outgoing never does', () => {
    const w = load();
    let incoming = created(w, {
        direction: 'incoming', capabilities: {
            submit: false, accept: true, decline: true,
            cancel: false, reconnect: false, activeGame: true
        }
    });
    incoming = move(w, incoming, 'PROVIDER_PENDING', 11000);
    assert.deepEqual([...incoming.availableActions], ['accept', 'decline']);
    const outgoing = move(w, created(w), 'CHALLENGE_SUBMITTED', 11000);
    assert.equal(outgoing.availableActions.includes('accept'), false);
    assert.equal(move(w, incoming, 'PROVIDER_DECLINED', 12000).state, 'declined');
});

test('disconnect and explicit provider reconnect never create or resurrect challenges', () => {
    const w = load();
    let record = move(w, move(w, created(w), 'CHALLENGE_SUBMITTED', 11000), 'PROVIDER_ACCEPTED', 12000);
    record = move(w, record, 'PROVIDER_ACTIVE', 13000);
    record = move(w, record, 'PROVIDER_DISCONNECTED', 14000);
    assert.equal(record.state, 'disconnected');
    record = move(w, record, 'PROVIDER_RECONNECTED', 15000);
    assert.equal(record.state, 'connecting');
    record = move(w, record, 'PROVIDER_ACTIVE', 16000);
    assert.equal(record.state, 'active');
});

test('expiration is deterministic and preserves accepted, active, and terminal state', () => {
    const w = load();
    const pending = move(w, created(w), 'CHALLENGE_SUBMITTED', 11000);
    assert.equal(w.CaissaChallengeLifecycle.expireRecord(pending, 20001).value.state, 'expired');
    const repeated = w.CaissaChallengeLifecycle.expireRecord(
        w.CaissaChallengeLifecycle.expireRecord(pending, 20001).value, 30000);
    assert.equal(repeated.value.state, 'expired');
    const accepted = move(w, pending, 'PROVIDER_ACCEPTED', 12000);
    assert.equal(w.CaissaChallengeLifecycle.expireRecord(accepted, 30000).value.state, 'accepted');
    const active = move(w, accepted, 'PROVIDER_ACTIVE', 13000);
    assert.equal(w.CaissaChallengeLifecycle.expireRecord(active, 30000).value.state, 'active');
});

test('registry isolates providers, rejects duplicate provider IDs, suppresses duplicates, and disposes', () => {
    const w = load();
    const registry = w.CaissaChallengeRegistry.create();
    const first = created(w);
    assert.equal(registry.ingest(first).ok, true);
    assert.equal(registry.ingest(first).reasonCode, 'DUPLICATE_SUPPRESSED');
    assert.equal(registry.ingest({
        ...plain(first), challengeId: 'fics:other'
    }).reasonCode, 'DUPLICATE_PROVIDER_ID');
    const local = created(w, {
        provider: 'local', requestId: 'local-request',
        challengerId: 'local:me', challengedId: 'local:opponent',
        providerReference: 'seek-42'
    });
    assert.equal(registry.ingest(local).ok, true);
    assert.equal(registry.list({ provider: 'fics' }).length, 1);
    assert.equal(registry.clearProvider('local').value.removed, 1);
    assert.equal(registry.dispose().reasonCode, 'DISPOSED');
    assert.equal(registry.ingest(first).reasonCode, 'DISPOSED');
});

test('registry enforces active and terminal bounds with deterministic retention', () => {
    const w = load();
    const active = w.CaissaChallengeRegistry.create();
    for (let index = 0; index < 32; index += 1) {
        assert.equal(active.ingest(created(w, {
            requestId: `active-${index}`, providerReference: `active-${index}`,
            createdAt: 10000 + index, expiresAt: 30000 + index
        })).ok, true);
    }
    assert.equal(active.ingest(created(w, {
        requestId: 'active-overflow', providerReference: 'active-overflow'
    })).reasonCode, 'REGISTRY_LIMIT');

    const terminal = w.CaissaChallengeRegistry.create();
    for (let index = 0; index < 32; index += 1) {
        const value = created(w, {
            requestId: `terminal-${index}`, providerReference: `terminal-${index}`,
            createdAt: 10000 + index, expiresAt: 30000 + index
        });
        assert.equal(terminal.ingest(move(w, value, 'CHALLENGE_CANCELED', 20000 + index)).ok, true);
    }
    const overflow = move(w, created(w, {
        requestId: 'terminal-overflow', providerReference: 'terminal-overflow'
    }), 'CHALLENGE_CANCELED', 25000);
    assert.equal(terminal.ingest(overflow).ok, true);
    assert.equal(terminal.getSnapshot().terminalCount, 32);
    assert.equal(terminal.inspect().registryEvictions, 1);
});

test('stale events and malformed or hostile data fail closed', () => {
    const w = load();
    const pending = move(w, created(w), 'CHALLENGE_SUBMITTED', 11000);
    assert.equal(w.CaissaChallengeLifecycle.transition(
        pending, event(pending, 'PROVIDER_ACCEPTED', 10001)).reasonCode, 'STALE_EVENT');
    const hostile = JSON.parse('{"provider":"fics","requestId":"x","__proto__":{"polluted":true}}');
    assert.equal(w.CaissaChallengeRequest.normalize(hostile), null);
    assert.equal({}.polluted, undefined);
    assert.equal(w.CaissaChallengeEvent.normalize({
        ...event(pending, 'PROVIDER_ACCEPTED', 12000), schemaVersion: '9.0.0'
    }), null);
});

test('production adapters are explicit, entry-only, relationship-only, and resource-free', async () => {
    const w = load();
    const fics = w.CaissaFicsChallengeAdapter.create();
    const classic = w.CaissaClassicChallengeAdapter.create();
    const caissa = w.CaissaChallengeAdapter.create();
    assert.equal(fics.isSupported(), false);
    assert.equal(fics.decision, 'entry-only-no-normalized-challenge-events');
    assert.equal((await fics.acceptChallenge('fics:x')).reasonCode, 'PROVIDER_UNAVAILABLE');
    assert.equal(classic.relationship, 'caissa-classic-presentation');
    assert.equal(classic.provider, 'fics');
    assert.equal(caissa.provider, 'future-caissa-network');
    assert.deepEqual(plain(fics.inspect()), {
        provider: 'fics', supported: false, calls: 1,
        listenerCount: 0, socketCount: 0, timerCount: 0, disposed: false
    });
});

test('static guardrails exclude sockets, raw commands, DOM, games, workers, timers, and storage', () => {
    const combined = sources.join('\n');
    for (const forbidden of [
        /\bnew\s+WebSocket\b/, /\bnew\s+Worker\b/, /postMessage\s*\(/,
        /querySelector|getElementById|innerHTML|MutationObserver/,
        /localStorage|sessionStorage|indexedDB/, /setInterval|setTimeout|requestAnimationFrame/,
        /pendingSeek|seekActions|activeTables|\.send\s*\(|sendCommand/,
        /\bApp\.|GameLifecycle|FairPlayPolicy|EvaluationRail|GameRecord/
    ]) assert.doesNotMatch(combined, forbidden);
});

test('production pages register challenge modules once in dependency order', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        for (const file of files)
            assert.equal((html.match(new RegExp(file.replaceAll('.', '\\.'), 'g')) || []).length, 1);
        assert.ok(html.indexOf('challenge-contracts.js') < html.indexOf('challenge-lifecycle.js'));
        assert.ok(html.indexOf('challenge-registry.js') < html.indexOf('players-panel.js'));
    }
});
