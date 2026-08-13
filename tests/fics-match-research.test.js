import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';

let networkAttempts = 0;
const denied = () => { networkAttempts += 1; throw new Error('R26B_NETWORK_DENIED'); };
const originals = { nc: net.connect, nn: net.createConnection, tc: tls.connect, hr: http.request, hsr: https.request,
    dl: dns.lookup, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
net.connect = denied; net.createConnection = denied; tls.connect = denied; http.request = denied; https.request = denied;
dns.lookup = denied; globalThis.fetch = denied; globalThis.WebSocket = class { constructor() { denied(); } };
process.on('exit', () => { net.connect = originals.nc; net.createConnection = originals.nn; tls.connect = originals.tc;
    http.request = originals.hr; https.request = originals.hsr; dns.lookup = originals.dl;
    globalThis.fetch = originals.fetch; globalThis.WebSocket = originals.WebSocket; });

const source = fs.readFileSync(new URL('../js/fics-match-research.js', import.meta.url), 'utf8');
const observerSource = fs.readFileSync(new URL('../js/fics-observability.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const style12Source = fs.readFileSync(new URL('../js/fics-style12.js', import.meta.url), 'utf8');

function fixture(options = {}) {
    const root = {}; let now = 10; const wire = []; const listeners = new Set();
    vm.runInNewContext(observerSource, { globalThis: root, window: root, Object, String, Number, Math, JSON, Set,
        TextEncoder, performance: { now: () => now++ } });
    const client = { authenticated: true, sessionGeneration: 7, ficsUsername: 'CurrentUser', ws: { readyState: 1 },
        send(command) { wire.push(command); return Object.freeze({ ok: true, code: 'SENT', socketState: 'OPEN',
            webSocketSendInvoked: true, monotonicTimestamp: now++ }); },
        addSpectatorListener(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
    vm.runInNewContext(source, { globalThis: root, window: root, Object, String, Number, Math, Set });
    const harness = root.createClassicFicsMatchResearch({ getClient: () => client,
        getObserver: () => root.ClassicFicsObservability, extractObservedOffer: options.extractObservedOffer });
    const evidence = { handle: 'ComputerOne', isComputer: true, online: true, available: true, playing: false,
        hasSuitableSeek: false, snapshotGeneration: 7 };
    return { root, client, wire, listeners, harness, evidence };
}

function baseline(f) {
    assert.equal(f.harness.sendBaselinePending().ok, true);
    const first = f.harness.observeRawInbound('There are no offers pending to other players.\n');
    assert.equal(first.complete, false);
    const done = f.harness.observeRawInbound('There are no offers pending from other players.\nfics%');
    assert.equal(done.complete, true); assert.equal(done.empty, true);
}

test('validated target serializes one canonical MATCH and bounded PENDING slots', () => {
    const f = fixture(); assert.equal(f.harness.begin(f.evidence, 'CurrentUser').ok, true);
    baseline(f);
    assert.equal(f.harness.authorizeMatch().ok, true); assert.equal(f.harness.sendMatch().ok, true);
    assert.equal(f.harness.sendPostMatchPending().ok, true);
    assert.equal(f.harness.observePendingInbound('POST_MATCH', 'There are no offers pending to other players.\nThere are no offers pending from other players.\nfics%').complete, true);
    assert.deepEqual(f.wire, ['pending', 'match ComputerOne 5 0 unrated', 'pending']);
    assert.equal(f.harness.sendMatch().ok, false); assert.equal(f.wire.filter(x => x.startsWith('match ')).length, 1);
});

test('target evidence is exact, same-generation, computer, available, idle, and without suitable seek', () => {
    for (const patch of [{ isComputer: false }, { online: false }, { available: false }, { playing: true },
        { hasSuitableSeek: true }, { snapshotGeneration: 6 }]) {
        const f = fixture(); assert.equal(f.harness.begin({ ...f.evidence, ...patch }, 'CurrentUser').ok, false); assert.deepEqual(f.wire, []);
    }
    for (const handle of ['CurrentUser', 'bad handle', 'bad\tname', 'bad\rname', 'bad\nname', 'bad;name', 'bad"name',
        "bad'name", 'match suffix', 'withdraw 4', 'A'.repeat(18), '\u0001bad']) {
        const f = fixture(); assert.equal(f.harness.begin({ ...f.evidence, handle }, 'CurrentUser').ok, false); assert.deepEqual(f.wire, []);
    }
});

test('failed delivery consumes MATCH with no retry', () => {
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch();
    f.client.send = command => { f.wire.push(command); return Object.freeze({ ok: false, code: 'SEND_THROWN', socketState: 'OPEN',
        webSocketSendInvoked: true, monotonicTimestamp: 20 }); };
    assert.equal(f.harness.sendMatch().ok, false); assert.equal(f.harness.sendMatch().ok, false);
    assert.equal(f.wire.filter(command => command.startsWith('match ')).length, 1);
    assert.equal(f.harness.snapshot().matchDelivered, false); assert.equal(f.harness.authorizeWithdraw().ok, false);
});

test('clean baseline and one delivered MATCH authorize exactly one immutable target-bound cleanup', () => {
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
    assert.deepEqual({ ...f.harness.authorizeWithdraw() }, { ok: true, mode: 'TARGET' });
    assert.equal(f.harness.snapshot().withdrawTarget, 'ComputerOne');
    assert.equal(f.harness.sendWithdraw('InjectedOtherPlayer').ok, true);
    assert.equal(f.harness.sendWithdraw().ok, false); assert.equal(f.harness.authorizeWithdraw().ok, false);
    assert.deepEqual(f.wire, ['pending', 'match ComputerOne 5 0 unrated', 'withdraw ComputerOne']);
    assert.equal(f.harness.snapshot().used.withdraw, true);
});

test('a safely observed offer ID takes precedence over target-bound cleanup', () => {
    const f = fixture({ extractObservedOffer: (raw, target) => raw.startsWith(`offer 73 ${target}\n`) ? 73 : null });
    f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
    f.harness.sendPostMatchPending(); f.harness.observePendingInbound('POST_MATCH', 'offer 73 ComputerOne\nfics%');
    assert.deepEqual({ ...f.harness.authorizeWithdraw() }, { ok: true, mode: 'OFFER_ID' });
    assert.equal(f.harness.sendWithdraw().ok, true); assert.equal(f.harness.sendWithdraw().ok, false);
    assert.deepEqual(f.wire, ['pending', 'match ComputerOne 5 0 unrated', 'pending', 'withdraw 73']);
});

test('non-empty or incomplete baseline blocks MATCH and target cleanup', () => {
    const nonempty = fixture(); nonempty.harness.begin(nonempty.evidence, 'CurrentUser'); nonempty.harness.sendBaselinePending();
    assert.equal(nonempty.harness.observeRawInbound('1: offer to ExistingPlayer\nfics%').ok, false);
    assert.equal(nonempty.harness.authorizeMatch().ok, false); assert.deepEqual(nonempty.wire, ['pending']);
    const unknown = fixture(); unknown.harness.begin(unknown.evidence, 'CurrentUser'); unknown.harness.sendBaselinePending();
    assert.equal(unknown.harness.observeRawInbound('There are no offers pending to other players.\n').complete, false);
    assert.equal(unknown.harness.authorizeMatch().ok, false); assert.deepEqual(unknown.wire, ['pending']);
});

test('immediate Style12 uses existing event path and blocks PENDING and WITHDRAW', () => {
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
    assert.equal(f.listeners.size, 1);
    for (const listener of f.listeners) listener({ event: 'style12', payload: { style12: {
        relation: 1, whiteName: 'CurrentUser', blackName: 'ComputerOne', gameNumber: 9 } }, client: f.client });
    assert.equal(f.harness.snapshot().state, 'GAME_STARTED');
    assert.equal(f.harness.sendPostMatchPending().ok, false); assert.equal(f.harness.authorizeWithdraw().ok, false);
    assert.deepEqual(f.wire, ['pending', 'match ComputerOne 5 0 unrated']);
});

test('synthetic immediate acceptance is parsed by existing Style12 path before harness handoff', () => {
    const styleRoot = {}; vm.runInNewContext(style12Source, { globalThis: styleRoot, window: styleRoot, Set, String, Number, Math });
    const line = '<12> rnbqkbnr pppppppp -------- -------- -------- -------- PPPPPPPP RNBQKBNR W -1 1 1 1 1 0 9 CurrentUser ComputerOne 1 300 0 39 39 300 300 1 none (0:00) none 0';
    const parsed = styleRoot.FICSStyle12.parseStyle12(line); assert.ok(parsed); assert.equal(parsed.relation, 1);
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
    assert.equal(f.harness.handleClientEvent({ event: 'style12', payload: { style12: parsed }, client: f.client }), true);
    assert.equal(f.harness.snapshot().state, 'GAME_STARTED');
    assert.match(clientSource, /parseStyle12\(line\)[\s\S]*this\.handleStyle12\(style12\)/);
    assert.match(clientSource, /this\.gameActive = playing/);
});

test('disconnect invalidates generation, late events, and old cleanup correlation', () => {
    const f = fixture({ extractObservedOffer: () => 17 }); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f);
    f.harness.authorizeMatch(); f.harness.sendMatch(); f.harness.sendPostMatchPending(); f.harness.observePendingInbound('POST_MATCH', 'synthetic\nfics%');
    f.harness.handleClientEvent({ event: 'disconnected', payload: {} }); f.client.sessionGeneration = 8;
    assert.equal(f.harness.snapshot().state, 'FAILED'); assert.equal(f.harness.snapshot().offerId, null);
    assert.equal(f.harness.authorizeWithdraw().ok, false); assert.equal(f.wire.some(x => x.startsWith('withdraw ')), false);
});

test('only explicit terminal classes block post-MATCH queries without speculative text regex', () => {
    for (const kind of ['REJECTED', 'DECLINED']) {
        const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
        assert.equal(f.harness.recordExplicitTerminal(kind).ok, true); assert.equal(f.harness.sendPostMatchPending().ok, false);
        assert.equal(f.harness.authorizeWithdraw().ok, false);
        assert.deepEqual(f.wire, ['pending', 'match ComputerOne 5 0 unrated']);
    }
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
    assert.equal(f.harness.recordExplicitTerminal('UNKNOWN').ok, false);
});

test('cleanup is idempotent and creates no client, socket, transport, retry, or generic command API', () => {
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); assert.equal(f.harness.cleanup(), true); assert.equal(f.harness.cleanup(), true);
    assert.equal(f.listeners.size, 0);
    assert.doesNotMatch(source, /new\s+WebSocket|fetch\s*\(|XMLHttpRequest|setTimeout|setInterval|localStorage|sessionStorage|sendBeacon/);
    assert.doesNotMatch(source, /executeCommand|sendCommand|rawCommand|commandText|accept\s+|decline\s+|play\s+/i);
    assert.equal((clientSource.match(/new WebSocket\(this\.gatewayUrl\)/g) || []).length, 2);
    assert.match(clientSource, /ClassicFicsMatchResearch\?\.observeRawInbound\(String\(text\)\)/);
});

test('typed capture contains bounded metadata and no raw MATCH/WITHDRAW commands or credentials', () => {
    const f = fixture({ extractObservedOffer: () => 12 }); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f);
    f.harness.authorizeMatch(); f.harness.sendMatch(); f.harness.sendPostMatchPending(); f.harness.observePendingInbound('POST_MATCH', 'safe\nfics%'); f.harness.authorizeWithdraw(); f.harness.sendWithdraw();
    const exported = f.root.ClassicFicsObservability.exportCapture(); assert.equal(exported.ok, true);
    assert.doesNotMatch(exported.json, /match ComputerOne|withdraw 12|password|credential|secret|token/i);
    const records = JSON.parse(exported.json).records.filter(r => r.kind === 'TYPED_OUTBOUND');
    assert.deepEqual(records.map(r => r.action), ['PENDING_BASELINE', 'MATCH', 'PENDING_POST_MATCH', 'WITHDRAW_MATCH']);
    assert.equal(records[1].targetHandle, 'ComputerOne'); assert.equal(records[3].offerId, 12);
});

test('target cleanup emits typed bounded metadata without raw command text', () => {
    const f = fixture(); f.harness.begin(f.evidence, 'CurrentUser'); baseline(f); f.harness.authorizeMatch(); f.harness.sendMatch();
    f.harness.authorizeWithdraw(); f.harness.sendWithdraw();
    const json = f.root.ClassicFicsObservability.exportCapture().json;
    assert.doesNotMatch(json, /withdraw ComputerOne|password|credential|token/i);
    const record = JSON.parse(json).records.find(item => item.action === 'WITHDRAW_MATCH_TARGET');
    assert.deepEqual({ action: record.action, commandClass: record.commandClass, targetHandle: record.targetHandle,
        sessionGeneration: record.sessionGeneration }, { action: 'WITHDRAW_MATCH_TARGET', commandClass: 'WITHDRAW',
        targetHandle: 'ComputerOne', sessionGeneration: 7 });
});

test('numeric and metadata validators reject unsafe construction', () => {
    const f = fixture(); const observer = f.root.ClassicFicsObservability;
    const delivery = { ok: true, code: 'SENT', socketState: 'OPEN', webSocketSendInvoked: true, monotonicTimestamp: 1 };
    for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_VALUE, '5']) {
        observer.stop(); observer.requestActivation('MATCH'); observer.onAuthenticated();
        assert.equal(observer.observeMatchResearchOutbound('MATCH', 'MATCH', { targetHandle: 'ComputerOne', minutes: value,
            increment: 0, rated: 'UNRATED', color: 'SERVER_ASSIGNED', variant: 'STANDARD', sessionGeneration: 7 }, delivery), false);
    }
});

test('offline R2.6B suite attempts zero DNS, TCP, TLS, HTTP, HTTPS, fetch, and WebSocket', () => assert.equal(networkAttempts, 0));
