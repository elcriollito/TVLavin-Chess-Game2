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
const denied = () => { networkAttempts += 1; throw new Error('R2_NETWORK_DENIED'); };
const originals = { netConnect: net.connect, netCreate: net.createConnection, tlsConnect: tls.connect,
    httpRequest: http.request, httpsRequest: https.request, dnsLookup: dns.lookup, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
net.connect = denied; net.createConnection = denied; tls.connect = denied; http.request = denied; https.request = denied;
dns.lookup = denied; globalThis.fetch = denied; globalThis.WebSocket = class { constructor() { denied(); } };
process.on('exit', () => {
    net.connect = originals.netConnect; net.createConnection = originals.netCreate; tls.connect = originals.tlsConnect;
    http.request = originals.httpRequest; https.request = originals.httpsRequest; dns.lookup = originals.dnsLookup;
    globalThis.fetch = originals.fetch; globalThis.WebSocket = originals.WebSocket;
});

const source = fs.readFileSync(new URL('../js/fics-research-actions.js', import.meta.url), 'utf8');
const observerSource = fs.readFileSync(new URL('../js/fics-observability.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const classicSectionSource = fs.readFileSync(new URL('../js/yahoo-classic-section.js', import.meta.url), 'utf8');

function fixture(overrides = {}) {
    const sent = [];
    const observer = { requested: 0, armed: 0, stopped: 0,
        requestActivation() { this.requested += 1; return true; },
        onAuthenticated() { this.armed += 1; return true; },
        stop() { this.stopped += 1; } };
    const client = { authenticated: true, ws: { readyState: 1 }, send(command) { sent.push(command); } };
    const root = {};
    vm.runInNewContext(source, { globalThis: root, window: root, Object, Set });
    const actions = root.createClassicFicsResearchActions({ getClient: () => overrides.client || client,
        getObserver: () => overrides.observer || observer });
    return { actions, client, observer, sent };
}

test('each approved research action requires explicit authorization and sends exactly once', () => {
    for (const [action, command] of Object.entries({ WHO: 'who', WHO_FREE: 'who f', WHO_AVAILABLE: 'who a', PENDING: 'pending' })) {
        const f = fixture();
        assert.deepEqual({ ...f.actions.execute(action) }, { ok: false, code: 'EXACT_AUTHORIZATION_REQUIRED' });
        const g = fixture();
        assert.equal(g.actions.authorize(action).ok, true);
        assert.deepEqual({ ...g.actions.execute(action) }, { ok: true, action, command });
        assert.deepEqual(g.sent, [command]);
        assert.deepEqual(Array.from(g.actions.snapshot().sentActions), [action]);
    }
});

test('wrong, repeated, concurrent, and unlisted commands fail closed without a send', () => {
    for (const action of ['MATCH', 'ACCEPT', 'DECLINE', 'WITHDRAW', 'SOUGHT', 'OPEN']) {
        const f = fixture(); assert.equal(f.actions.authorize(action).ok, false); assert.deepEqual(f.sent, []);
    }
    const concurrent = fixture(); concurrent.actions.authorize('WHO');
    assert.equal(concurrent.actions.authorize('PENDING').ok, false); assert.deepEqual(concurrent.sent, []);
    const wrong = fixture(); wrong.actions.authorize('WHO'); assert.equal(wrong.actions.execute('PENDING').ok, false); assert.deepEqual(wrong.sent, []);
    const repeated = fixture(); repeated.actions.authorize('WHO'); repeated.actions.execute('WHO');
    assert.equal(repeated.actions.authorize('WHO').ok, false); assert.deepEqual(repeated.sent, ['who']);
});

test('authentication, existing open socket, observer activation, and arming are mandatory', () => {
    for (const client of [{ authenticated: false, ws: { readyState: 1 }, send() {} },
        { authenticated: true, ws: { readyState: 0 }, send() {} }]) {
        const f = fixture({ client });
        if (!client.authenticated) assert.equal(f.actions.authorize('WHO').ok, false);
        else { assert.equal(f.actions.authorize('WHO').ok, true); assert.equal(f.actions.execute('WHO').ok, false); }
    }
    for (const observer of [
        { requestActivation: () => false, onAuthenticated: () => true },
        { requestActivation: () => true, onAuthenticated: () => false }
    ]) assert.equal(fixture({ observer }).actions.authorize('WHO').ok, false);
});

test('cancel is idempotent, stops capture, and consumes no command', () => {
    const f = fixture(); f.actions.authorize('PENDING');
    assert.equal(f.actions.cancel(), true); assert.equal(f.actions.cancel(), true);
    assert.equal(f.observer.stopped, 2); assert.deepEqual(f.sent, []);
    assert.equal(f.actions.execute('PENDING').ok, false);
});

test('research actions reuse Classic client and own no connection, parser, storage, retry, or mutation command', () => {
    assert.doesNotMatch(source, /new\s+WebSocket|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|sendBeacon|setTimeout|setInterval|reconnect|parseStyle12/i);
    for (const forbiddenCommand of ['match', 'accept', 'decline', 'withdraw', 'sought', 'play', 'seek', 'set', 'open', 'observe', 'unobserve']) {
        assert.equal(source.includes(`'${forbiddenCommand}'`), false);
    }
    assert.match(source, /getClient.*CaissaFICSClient/);
    assert.match(source, /client\.send\(command\)/);
    assert.doesNotMatch(observerSource, /\.send\s*\(/);
    assert.match(clientSource, /new WebSocket\(this\.gatewayUrl\)/);
    const observerAt = html.indexOf('js/fics-observability.js');
    const clientAt = html.indexOf('js/fics-client.js');
    const actionsAt = html.indexOf('js/fics-research-actions.js');
    assert.ok(observerAt > 0 && observerAt < clientAt && clientAt < actionsAt);
});

test('existing Classic singleton is globally bound by identity before lifecycle initialization', () => {
    let socketConstructions = 0;
    const root = { location: { hostname: 'example.test' }, addEventListener() {} };
    const document = { readyState: 'complete' };
    const instrumented = clientSource.replace(
        'window.CaissaFICSClient = CaissaFICSClient;',
        'window.CaissaFICSClient = CaissaFICSClient; window.__sameFicsReference = window.CaissaFICSClient === CaissaFICSClient;'
    );
    assert.throws(() => vm.runInNewContext(instrumented, {
        window: root, document, console: { log() {}, warn() {}, error() {} },
        WebSocket: class { constructor() { socketConstructions += 1; } }, Set, Object, String, Number, Math
    }));
    assert.equal(!!root.CaissaFICSClient, true);
    assert.equal(root.__sameFicsReference, true);
    assert.equal(socketConstructions, 0);
    assert.ok(clientSource.indexOf('window.CaissaFICSClient = CaissaFICSClient;') < clientSource.indexOf('initializeFicsSectionOwner()'));
});

test('Yahoo Classic and ResearchActions resolve the same exposed singleton without sending', () => {
    const ficsClient = { authenticated: true, ws: { readyState: 1 }, connect() {}, send() { throw new Error('AUTO_SEND'); } };
    let registeredSection = null;
    const root = {
        CaissaFICSClient: ficsClient,
        CaissaNavigation: { registerSection(name, section) { if (name === 'yahooClassic') registeredSection = section; } },
        addEventListener() {}
    };
    vm.runInNewContext(classicSectionSource, { window: root, document: {}, console, Object, String, Number, Math, Set });
    assert.strictEqual(registeredSection.getFicsClient(), ficsClient);

    root.ClassicFicsObservability = { requestActivation: () => true, onAuthenticated: () => true, stop() {} };
    vm.runInNewContext(source, { globalThis: root, window: root, Object, Set });
    assert.equal(root.ClassicFicsResearchActions.authorize('WHO').ok, true);
    assert.equal(root.ClassicFicsResearchActions.snapshot().state, 'AUTHORIZED');
    root.ClassicFicsResearchActions.cancel();
    assert.deepEqual(Array.from(root.ClassicFicsResearchActions.snapshot().sentActions), []);
});

test('R2 offline suite attempts no DNS, TCP, TLS, HTTP, HTTPS, fetch, or WebSocket', () => {
    assert.equal(networkAttempts, 0);
});
