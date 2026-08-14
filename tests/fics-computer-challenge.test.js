import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'js', 'fics-computer-challenge.js'), 'utf8');

function load(overrides = {}) {
    const wire = [];
    const client = {
        authenticated: true,
        sessionGeneration: 1,
        ws: { readyState: 1 },
        activeTables: [],
        seekActions: [],
        send(command) {
            wire.push(command);
            return { ok: true, code: 'SENT', socketState: 'OPEN', webSocketSendInvoked: true };
        },
        ...overrides.client
    };
    const context = { console, setTimeout, clearTimeout,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, dispatchEvent() {} };
    context.globalThis = context;
    vm.runInNewContext(source, context, { filename: 'fics-computer-challenge.js' });
    const events = [];
    const challenge = context.createClassicComputerChallenge({ getClient: () => client, emit: value => events.push(value),
        validationTimeoutMs: overrides.validationTimeoutMs, setTimeout: overrides.setTimeout, clearTimeout: overrides.clearTimeout });
    return { context, client, challenge, wire, events };
}

const availableBlock = [
    '3041^ArasanX(C)         ----:Director(TD)         1351 inemuri(C)(TD)',
    '1209.rusalka(C)        ++++ GuestABCD(U)',
    '3 players displayed (of 3).',
    'fics%'
].join('\n');

const withoutInemuriBlock = [
    '3041^ArasanX(C)         ----:Director(TD)         1209.rusalka(C)',
    '2 players displayed (of 2).',
    'fics%'
].join('\n');

function ready(fixture) {
    assert.equal(fixture.challenge.requestAvailableComputers().ok, true);
    fixture.challenge.observeRawInbound(availableBlock);
    assert.equal(fixture.challenge.snapshot().directoryState, 'READY');
}

test('structural titles classify C, exclude TD alone, and preserve multi-title C/TD', () => {
    const { challenge } = load();
    const computers = challenge.parseAvailableComputers(availableBlock, 7);
    assert.deepEqual(Array.from(computers, value => value.handle), ['ArasanX', 'inemuri', 'rusalka']);
    assert.equal(computers.some(value => value.handle === 'Director'), false);
    assert.deepEqual(Array.from(computers.find(value => value.handle === 'inemuri').titles), ['C', 'TD']);
    assert.equal(computers.every(value => value.available && value.sessionGeneration === 7), true);
});

test('available directory is populated only by current WHO_AVAILABLE evidence', () => {
    const fixture = load();
    ready(fixture);
    assert.deepEqual(fixture.wire, ['who a']);
    assert.equal(fixture.challenge.requestAvailableComputers().code, 'AVAILABILITY_ALREADY_REQUESTED');
    assert.equal(fixture.challenge.snapshot().computers.some(value => value.handle === 'GuestABCD'), false);
});

test('fresh target remains available and guest 3+2 serializes exactly one unrated MATCH', async () => {
    const fixture = load();
    ready(fixture);
    const pendingResult = fixture.challenge.challenge('inemuri', '3+2');
    assert.deepEqual(fixture.wire, ['who a', 'who a']);
    fixture.challenge.observeRawInbound(availableBlock);
    const result = await pendingResult;
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.intent)), {
        targetHandle: 'inemuri', minutes: 3, increment: 2, rated: false, sessionGeneration: 1
    });
    assert.deepEqual(fixture.wire, ['who a', 'who a', 'match inemuri 3 2 unrated']);
});

test('malicious, CRLF, unknown, and unavailable targets are rejected', async () => {
    for (const target of ['inemuri;quit', 'inemuri\r\nquit', 'Director', 'MissingComputer']) {
        const fixture = load(); ready(fixture);
        const pendingResult = fixture.challenge.challenge(target, '3+2');
        const syntacticallyValid = /^[A-Za-z][A-Za-z0-9]{0,16}$/.test(target);
        if (syntacticallyValid) fixture.challenge.observeRawInbound(availableBlock);
        assert.equal((await pendingResult).ok, false, target);
        assert.deepEqual(fixture.wire, syntacticallyValid ? ['who a', 'who a'] : ['who a']);
    }
    const badTime = load(); ready(badTime);
    assert.equal((await badTime.challenge.challenge('inemuri', '3+2\nquit')).ok, false);
});

test('fresh target that is playing or has a suitable seek cannot be directly challenged', async () => {
    const playing = load({ client: { activeTables: [{ white: 'inemuri', black: 'Human' }] } }); ready(playing);
    const playingResult = playing.challenge.challenge('inemuri', '3+2'); playing.challenge.observeRawInbound(availableBlock);
    assert.equal((await playingResult).code, 'TARGET_PLAYING');
    const seeking = load({ client: { seekActions: [{ details: { player: 'inemuri' } }] } }); ready(seeking);
    const seekingResult = seeking.challenge.challenge('inemuri', '3+2'); seeking.challenge.observeRawInbound(availableBlock);
    assert.equal((await seekingResult).code, 'TARGET_HAS_SEEK');
    assert.equal(seeking.wire.some(command => command.startsWith('match ')), false);
});

test('double click during validation starts one refresh and emits only one MATCH', async () => {
    const fixture = load(); ready(fixture);
    const first = fixture.challenge.challenge('inemuri', '3+2');
    assert.equal((await fixture.challenge.challenge('inemuri', '3+2')).code, 'VALIDATION_IN_PROGRESS');
    assert.equal(fixture.wire.filter(command => command === 'who a').length, 2);
    fixture.challenge.observeRawInbound(availableBlock);
    assert.equal((await first).ok, true);
    assert.equal(fixture.wire.filter(command => command.startsWith('match ')).length, 1);
});

test('selected computer disappearing from fresh evidence emits zero MATCH', async () => {
    const fixture = load(); ready(fixture);
    const result = fixture.challenge.challenge('inemuri', '3+2');
    fixture.challenge.observeRawInbound(withoutInemuriBlock);
    assert.equal((await result).code, 'TARGET_NO_LONGER_AVAILABLE');
    assert.equal(fixture.wire.filter(command => command.startsWith('match ')).length, 0);
    assert.equal(fixture.challenge.snapshot().failureCode, 'TARGET_NO_LONGER_AVAILABLE');
});

test('session generation changing during validation emits zero MATCH', async () => {
    const fixture = load(); ready(fixture);
    const result = fixture.challenge.challenge('inemuri', '3+2');
    fixture.client.sessionGeneration = 2;
    fixture.challenge.observeRawInbound(availableBlock);
    assert.equal((await result).code, 'SESSION_OR_DIRECTORY_STALE');
    assert.equal(fixture.wire.filter(command => command.startsWith('match ')).length, 0);
});

test('bounded validation timeout emits zero MATCH and fails closed', async () => {
    let timeoutCallback = null;
    const fixture = load({ setTimeout(callback) { timeoutCallback = callback; return 7; }, clearTimeout() {}, validationTimeoutMs: 500 });
    ready(fixture);
    const result = fixture.challenge.challenge('inemuri', '3+2');
    assert.equal(typeof timeoutCallback, 'function');
    timeoutCallback();
    assert.equal((await result).code, 'AVAILABILITY_CONFIRMATION_TIMEOUT');
    assert.equal(fixture.wire.filter(command => command.startsWith('match ')).length, 0);
});

test('remote unavailable race clears pending, refreshes once, and leaves form state reusable', async () => {
    const fixture = load(); ready(fixture);
    const result = fixture.challenge.challenge('inemuri', '3+2');
    fixture.challenge.observeRawInbound(availableBlock);
    assert.equal((await result).ok, true);
    assert.equal(fixture.challenge.observeRawInbound('inemuri is not available.\nfics%'), true);
    assert.equal(fixture.challenge.snapshot().pending, null);
    assert.equal(fixture.challenge.snapshot().failureCode, 'REMOTE_CHALLENGE_UNAVAILABLE');
    assert.equal(fixture.wire.filter(command => command === 'who a').length, 3);
    assert.equal(fixture.wire.filter(command => command.startsWith('match ')).length, 1);
    fixture.challenge.observeRawInbound(withoutInemuriBlock);
    assert.equal(fixture.challenge.snapshot().directoryState, 'READY');
    assert.equal(fixture.challenge.snapshot().state, 'FAILED');
});

test('stale session generation blocks MATCH and reconnect invalidates ephemeral state', async () => {
    const fixture = load(); ready(fixture);
    fixture.client.sessionGeneration = 2;
    assert.equal((await fixture.challenge.challenge('inemuri', '3+2')).code, 'SESSION_OR_DIRECTORY_STALE');
    assert.deepEqual(fixture.wire, ['who a']);
    fixture.challenge.handleClientEvent({ event: 'disconnected', payload: {} });
    assert.deepEqual(JSON.parse(JSON.stringify(fixture.challenge.snapshot())), {
        state: 'IDLE', directoryState: 'EMPTY', directoryGeneration: null, requestedGeneration: null,
        computers: [], pending: null, failureCode: null, validatingTarget: null
    });
});

test('accepted challenge hands matching Style12 to the existing game runtime boundary', async () => {
    const fixture = load(); ready(fixture);
    const result = fixture.challenge.challenge('inemuri', '3+2');
    fixture.challenge.observeRawInbound(availableBlock);
    assert.equal((await result).ok, true);
    fixture.challenge.observeRawInbound('inemuri accepts the match offer.\n');
    assert.equal(fixture.challenge.snapshot().state, 'ACCEPTED');
    assert.equal(fixture.challenge.handleClientEvent({ event: 'style12', payload: {
        style12: { relation: 1, whiteName: 'GuestABCD', blackName: 'inemuri' }
    } }), true);
    assert.equal(fixture.challenge.snapshot().state, 'GAME_STARTED');
    assert.equal(fixture.challenge.snapshot().pending, null);
    assert.equal(fixture.challenge.handleClientEvent({ event: 'game-ended', payload: {} }), true);
    assert.equal(fixture.challenge.snapshot().state, 'IDLE');
    assert.equal(fixture.challenge.snapshot().directoryState, 'EMPTY');
});

test('Computer Hall UI is compact, accessible, text-safe, and preserves seek/table paths', () => {
    const yahoo = fs.readFileSync(path.join(rootDir, 'js', 'yahoo-classic-section.js'), 'utf8');
    const css = fs.readFileSync(path.join(rootDir, 'css', 'yahoo-classic.css'), 'utf8');
    assert.match(yahoo, /createComputerChallengePanel/);
    assert.match(yahoo, /aria-label', 'Available FICS computer'/);
    assert.match(yahoo, /setAttribute\('role', 'status'\)/);
    assert.match(yahoo, /option\.textContent/);
    assert.match(yahoo, /cell\.textContent/);
    assert.match(yahoo, /buildTableRows\(\)/);
    assert.match(yahoo, /selectedComputerTarget/);
    assert.match(yahoo, /selectedStillEligible/);
    assert.match(yahoo, /container\.contains\(this\.computerHallView\.challengePanel\)/);
    assert.match(yahoo, /if \(snapshot\.directoryState === 'LOADING'\) return;/);
    const computerHallSource = yahoo.slice(yahoo.indexOf('renderComputerHall(container)'), yahoo.indexOf('renderTeachingHall(container)'));
    assert.doesNotMatch(computerHallSource, /scrollIntoView|scrollTop\s*=|\.focus\s*\(/);
    assert.match(yahoo, /seekActions\.map/);
    assert.match(yahoo, /activeTables\.map/);
    assert.match(css, /\.yc-computer-challenge-form/);
    assert.doesNotMatch(css.match(/\.yc-computer-hero \{[\s\S]*?\}/)?.[0] || '', /gradient/);
});

test('integration uses the existing singleton raw/event hooks and no second socket', () => {
    const client = fs.readFileSync(path.join(rootDir, 'js', 'fics-client.js'), 'utf8');
    assert.match(client, /ClassicComputerChallenge\?\.observeRawInbound/);
    assert.match(client, /ClassicComputerChallenge\?\.handleClientEvent/);
    assert.doesNotMatch(source, /new\s+WebSocket|\.connect\s*\(/);
    assert.doesNotMatch(source, /setInterval|automaticRetry|retryMatch/i);
});
