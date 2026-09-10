import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const parserSource = fs.readFileSync(new URL('../js/fics-players-protocol.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/fics/players/rd009-live-sanitized.json', import.meta.url), 'utf8'));
const liveVerbose = fixture.verboseSamples.find((sample) => sample.command === 'who v').response;

const border = `+${'-'.repeat(76)}+`;
const header = '|        User              Standard    Blitz       Lightning   On for   Idle |';

function responseFor(rows) {
    const blank = `|${' '.repeat(76)}|`;
    const footer = `|${`    ${rows.length} Players Displayed`.padEnd(76)}|`;
    const rowBlock = rows.length ? `${rows.join('\n')}\n` : '';
    return `\n${border}\n${header}\n${border}\n${rowBlock}${blank}\n${footer}\n${border}\nfics%`;
}

function row({ handle = 'PlayerOne', standard = '1500', blitz = '1600', lightning = '1700',
    onFor = '12', idle = '', game = '', open = true, account = ' ', observing = false } = {}) {
    const prefix = `${String(game).padStart(3)} ${open ? ' ' : 'X'}${account}${observing ? 'o' : ' '}`;
    const content = `${prefix} ${handle} ${standard} ${blitz} ${lightning} ${onFor}${idle ? ` ${idle}` : ''}`;
    return `|${content.padEnd(76)}|`;
}

function createHarness() {
    const timeoutTasks = [];
    class FakeWebSocket {
        static OPEN = 1;
        static CLOSED = 3;
    }
    const events = [];
    const root = {
        location: { hostname: '127.0.0.1', protocol: 'http:' },
        addEventListener() {},
        dispatchEvent(event) { events.push(event); }
    };
    class FakeCustomEvent {
        constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
    const context = {
        window: root,
        document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
        console,
        WebSocket: FakeWebSocket,
        CustomEvent: FakeCustomEvent,
        performance: { now: () => 42 },
        setTimeout(callback, delay) {
            const task = { callback, delay, cancelled: false };
            timeoutTasks.push(task);
            return timeoutTasks.length;
        },
        clearTimeout(id) { if (timeoutTasks[id - 1]) timeoutTasks[id - 1].cancelled = true; },
        setInterval() { return 1; },
        clearInterval() {},
        Chess: class { load() { return true; } reset() {} }
    };
    context.globalThis = root;
    vm.runInNewContext(parserSource, context, { filename: 'fics-players-protocol.js' });
    vm.runInNewContext(clientSource, context, { filename: 'fics-client.js' });
    const client = root.CaissaFICSClient;
    client.elements = {};
    client.connected = true;
    client.authenticated = true;
    client.connectionState = 'connected';
    client.sessionGeneration = 7;
    client.playersDirectory = client.createEmptyPlayersDirectory(7);
    const sent = [];
    client.ws = { readyState: FakeWebSocket.OPEN, send(command) { sent.push(command); }, close() {} };
    return { client, parser: root.CaissaFICSPlayersProtocol, sent, timeoutTasks, events };
}

test('verified live who v parses incrementally only after footer, closing border, and prompt', () => {
    const { parser } = createHarness();
    const state = parser.createResponseParser();
    let result;
    for (let index = 0; index < liveVerbose.length; index += 37) {
        result = parser.push(state, liveVerbose.slice(index, index + 37));
        if (index + 37 < liveVerbose.length) assert.notEqual(result.status, 'complete');
    }
    assert.equal(result.status, 'complete');
    assert.equal(result.count, 175);
    assert.equal(result.entries.length, 175);
});

test('player model preserves numeric/unrated/guest ratings and documented P/E markers', () => {
    const { parser } = createHarness();
    assert.deepEqual({ ...parser.parseRating('1842') }, { value: 1842, state: 'established', marker: null });
    assert.deepEqual({ ...parser.parseRating('1842P') }, { value: 1842, state: 'provisional', marker: 'P' });
    assert.deepEqual({ ...parser.parseRating('1842E') }, { value: 1842, state: 'estimated', marker: 'E' });
    assert.deepEqual({ ...parser.parseRating('----') }, { value: null, state: 'registered-unrated', marker: null });
    assert.deepEqual({ ...parser.parseRating('++++') }, { value: null, state: 'unregistered', marker: null });
    assert.equal(parser.parseRating('unknown'), null);
});

test('verbose flags expose only verified playing/open/unrated/registration/observing semantics', () => {
    const { parser } = createHarness();
    const playing = parser.parsePlayerRow(row({ game: 23, open: false, observing: true }), 0);
    assert.deepEqual({
        gameNumber: playing.gameNumber, playing: playing.playing, open: playing.open,
        available: playing.available, observing: playing.observing
    }, { gameNumber: 23, playing: true, open: false, available: false, observing: true });
    const unratedOnly = parser.parsePlayerRow(row({ account: 'u' }), 1);
    assert.equal(unratedOnly.unratedOnly, true);
    assert.equal(unratedOnly.registered, true);
    const guest = parser.parsePlayerRow(row({ account: 'U', standard: '++++', blitz: '++++', lightning: '++++' }), 2);
    assert.equal(guest.registered, false);
    assert.equal(guest.available, true);
    assert.equal(Object.hasOwn(guest, 'terseStatus'), false);
});

test('on-time, idle, complete codes, and clipped annotations remain truthful', () => {
    const { parser } = createHarness();
    const state = parser.createResponseParser();
    const result = parser.push(state, liveVerbose);
    const idle = result.entries.find((entry) => entry.idle);
    const clipped = result.entries.find((entry) => !entry.annotationsComplete);
    assert.ok(idle.onFor);
    assert.ok(idle.idle);
    assert.deepEqual(Array.from(clipped.codes), ['*', 'SR']);
    assert.equal(clipped.annotationsUnknown, true);
    assert.equal(clipped.handle, 'P000140');
});

test('only complete documented account and title codes are exposed', () => {
    const { parser } = createHarness();
    const documented = ['*', 'B', 'C', 'T', 'U', 'CA', 'SR', 'TD', 'TM', 'FM', 'IM', 'GM', 'WIM', 'WGM'];
    const parsed = documented.map((code, index) => parser.parsePlayerRow(row({ handle: `Title${index}(${code})` }), index));
    assert.deepEqual(parsed.flatMap((entry) => Array.from(entry.codes)), documented);
    const unknown = parser.parsePlayerRow(row({ handle: 'SafeUser(GM)(ZZ)' }), 1);
    assert.deepEqual(Array.from(unknown.codes), ['GM']);
    assert.equal(unknown.annotationsUnknown, true);
});

test('zero, ten, 175, and 500 verified-shape responses complete with exact counts', () => {
    const { parser } = createHarness();
    const cases = [0, 10, 500];
    for (const count of cases) {
        const rows = Array.from({ length: count }, (_, index) => row({
            handle: `P${String(index).padStart(6, '0')}`,
            blitz: String(1000 + (index % 2000))
        }));
        const state = parser.createResponseParser();
        const startedAt = performance.now();
        const result = parser.push(state, responseFor(rows));
        assert.equal(result.status, 'complete', String(count));
        assert.equal(result.count, count);
        if (count === 500) assert.ok(performance.now() - startedAt < 250, '500 rows parse within 250ms');
    }
    const liveState = parser.createResponseParser();
    assert.equal(parser.push(liveState, liveVerbose).count, 175);
});

test('malformed rows, count mismatch, and terse response family fail closed', () => {
    const { parser } = createHarness();
    let state = parser.createResponseParser();
    assert.equal(parser.push(state, responseFor([row({ blitz: '???' })])).code, 'MALFORMED_PLAYER_ROW');
    state = parser.createResponseParser();
    const mismatch = responseFor([row()]).replace('1 Players Displayed', '2 Players Displayed');
    assert.equal(parser.push(state, mismatch).code, 'PLAYER_COUNT_MISMATCH');
    state = parser.createResponseParser();
    assert.equal(parser.push(state, '1600 PlayerOne\n 1 players displayed (of 1).\nfics%').code, 'UNEXPECTED_RESPONSE_FAMILY');
});

test('cumulative response bytes are bounded even when delivered as complete lines', () => {
    const { parser } = createHarness();
    const state = parser.createResponseParser();
    let result = parser.push(state, `${border}\n${header}\n${border}\n`);
    for (let index = 0; index < 4000 && result.status === 'pending'; index += 1) {
        result = parser.push(state, `${row({ handle: `Bound${index}` })}\n`);
    }
    assert.equal(result.code, 'PLAYER_RESPONSE_TOO_LARGE');
});

test('prompt alone cannot complete and timeout never establishes success', () => {
    const { client, timeoutTasks } = createHarness();
    assert.equal(client.requestPlayers().ok, true);
    assert.equal(client.consumePlayersData('fics%').status, 'pending');
    const timeout = timeoutTasks.find((task) => task.delay === client.playersRequestTimeoutMs);
    timeout.callback();
    assert.equal(client.playersRequest, null);
    assert.equal(client.playersDirectory.refreshedAt, null);
    assert.equal(client.playersError, 'PLAYERS_TIMEOUT');
});

test('requestPlayers serializes exact who v and suppresses duplicate refreshes', () => {
    const { client, sent } = createHarness();
    const first = client.requestPlayers();
    const duplicate = client.requestPlayers();
    assert.equal(first.ok, true);
    assert.match(first.token, /^players:7:1$/);
    assert.equal(duplicate.code, 'PLAYERS_REQUEST_IN_FLIGHT');
    assert.deepEqual(sent, ['who v']);
});

test('complete response commits one canonical snapshot and emits truthful Console messages', () => {
    const { client, events } = createHarness();
    client.messageBuffer = [];
    client.requestPlayers();
    client.consumePlayersData(responseFor([row({ handle: 'Alpha' }), row({ handle: 'Beta', game: 9 })]));
    assert.equal(client.playersDirectory.count, 2);
    assert.equal(client.playersDirectory.entries[1].playing, true);
    assert.ok(client.playersDirectory.refreshedAt);
    assert.deepEqual(Array.from(client.messageBuffer), [
        '[CAISSA] Loading FICS players...', '[COMMAND] > who v',
        '[CAISSA] Player directory updated: 2 players.'
    ]);
    assert.ok(events.some((event) => event.type === 'caissa:fics:players-updated'));
});

test('the production raw-chunk ingestion path commits the same canonical snapshot', () => {
    const { client } = createHarness();
    client.parseGameLine = () => {};
    client.requestPlayers();
    const response = responseFor([row({ handle: 'RawChunkUser' })]);
    for (let index = 0; index < response.length; index += 11) {
        client.handleRawGatewayData(response.slice(index, index + 11));
    }
    assert.equal(client.playersDirectory.count, 1);
    assert.equal(client.playersDirectory.entries[0].handle, 'RawChunkUser');
});

test('failed refresh preserves prior same-session data', () => {
    const { client } = createHarness();
    client.playersDirectory = { entries: [{ handle: 'Retained' }], count: 1, refreshedAt: 10, sessionGeneration: 7 };
    client.requestPlayers();
    client.consumePlayersData(responseFor([row({ blitz: '?' })]));
    assert.equal(client.playersError, 'MALFORMED_PLAYER_ROW');
    assert.equal(client.playersDirectory.entries[0].handle, 'Retained');
});

test('session change and disconnect invalidate an in-flight request and all stale players', () => {
    const { client } = createHarness();
    client.playersDirectory = { entries: [{ handle: 'OldSession' }], count: 1, refreshedAt: 10, sessionGeneration: 7 };
    client.requestPlayers();
    client.sessionGeneration = 8;
    assert.equal(client.consumePlayersData(responseFor([row()])).code, 'SESSION_CHANGED');
    assert.equal(client.playersDirectory.count, 0);
    client.sessionGeneration = 9;
    client.authenticated = true;
    client.playersDirectory = { entries: [{ handle: 'AnotherOldSession' }], count: 1, refreshedAt: 11, sessionGeneration: 9 };
    client.requestPlayers();
    client.disconnect();
    assert.equal(client.playersRequest, null);
    assert.equal(client.playersDirectory.count, 0);
});

test('disconnected refresh fails closed without creating parser state', () => {
    const { client, sent } = createHarness();
    client.authenticated = false;
    client.connected = false;
    client.connectionState = 'disconnected';
    assert.equal(client.requestPlayers().code, 'NOT_CONNECTED');
    assert.equal(client.playersRequest, null);
    assert.deepEqual(sent, []);
});

test('line-framed local gateway representation is accepted without relaxing grammar', () => {
    const { client } = createHarness();
    client.requestPlayers();
    const lines = responseFor([row({ handle: 'FramedUser' })]).split('\n');
    for (const line of lines) client.consumePlayersData(line.trim(), { lineFramed: true });
    assert.equal(client.playersDirectory.entries[0].handle, 'FramedUser');
});
