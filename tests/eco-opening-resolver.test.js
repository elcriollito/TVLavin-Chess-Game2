import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('data/eco/eco_codes.json'));

function loadResolver(overrides = {}) {
    const context = { console, Chess, ...overrides };
    vm.runInNewContext(read('js/eco-opening-resolver.js'), context);
    return context.CaissaEcoOpeningResolver;
}

const resolver = loadResolver();
const moves = (line) => line.split(/\s+/).filter((token) => !/^\d+\./.test(token));

test('canonical ECO catalog is reused without a parallel copy', async () => {
    assert.equal(catalog.length, 364);
    assert.equal(resolver.CATALOG_URL, '/data/eco/eco_codes.json');
    let requests = 0;
    const rows = await loadResolver({
        fetch: async (url) => {
            requests += 1;
            assert.equal(url, '/data/eco/eco_codes.json');
            return { ok: true, json: async () => catalog };
        }
    }).loadCatalog();
    assert.equal(requests, 1);
    assert.equal(rows.length, catalog.length);
});

test('recognizes known openings across ECO ranges A through E', () => {
    const cases = [
        ['A00', '1. g4'],
        ['B12', '1. e4 c6 2. d4 d5'],
        ['C60', '1. e4 e5 2. Nf3 Nc6 3. Bb5'],
        ['D37', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3'],
        ['E70', '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4']
    ];
    cases.forEach(([eco, line]) => {
        const result = resolver.resolve(moves(line), catalog, { ChessConstructor: Chess });
        assert.equal(result.status, 'recognized');
        assert.equal(result.eco, eco);
        assert.equal(result.href, `/eco/${eco}`);
    });
});

test('chooses the deepest confirmed match and keeps it after later moves', () => {
    const history = moves('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    const result = resolver.resolve(history, catalog, { ChessConstructor: Chess });
    assert.deepEqual(
        { eco: result.eco, name: result.name, depth: result.matchedDepth },
        { eco: 'C60', name: 'Ruy Lopez', depth: 5 }
    );
});

test('returns explicit fallbacks for unknown and insufficient histories', () => {
    assert.deepEqual(
        { ...resolver.resolve(['a4'], catalog, { ChessConstructor: Chess }) },
        { status: 'unknown', name: 'Unknown opening', eco: '', href: null, matchedDepth: 0 }
    );
    assert.deepEqual(
        { ...resolver.resolve([], catalog, { ChessConstructor: Chess }) },
        { status: 'insufficient', name: 'Detecting…', eco: '', href: null, matchedDepth: 0 }
    );
});

test('normalizes annotated SAN and UCI histories through chess.js', () => {
    const san = ['e4!', 'e5', 'Nf3', 'Nc6?!', 'Bb5+'];
    const uci = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
    assert.equal(resolver.resolve(san, catalog, { ChessConstructor: Chess }).eco, 'C60');
    assert.equal(resolver.resolve(uci, catalog, { ChessConstructor: Chess }).eco, 'C60');
});

function loadFicsClient() {
    const context = {
        console,
        performance,
        setTimeout,
        clearTimeout,
        window: null,
        document: { readyState: 'loading', addEventListener() {} }
    };
    context.window = context;
    vm.runInNewContext(read('js/fics-client.js'), context);
    return context.CaissaFICSClient;
}

test('FICS movelist history uses the existing command channel once and rejects late data', () => {
    const client = loadFicsClient();
    const wire = [];
    const events = [];
    client.authenticated = true;
    client.connected = true;
    client.sessionGeneration = 7;
    client.liveGame = { observedGame: true, gameNumber: 42 };
    client.moveHistory = [];
    client.send = (command) => { wire.push(command); return { ok: true, code: 'COMMAND_SENT' }; };
    client.logToConsole = () => {};
    client.renderMoveList = () => {};
    client.notifySpectator = (event, payload) => events.push({ event, payload });

    assert.equal(client.requestObservedGameHistory('42', 3).ok, true);
    assert.equal(client.requestObservedGameHistory('42', 3).code, 'HISTORY_ALREADY_REQUESTED');
    assert.deepEqual(wire, ['moves 42']);

    const response = [
        'Movelist for game 42:\n\n',
        'Move  White                   Black\n',
        '----  -----                   -----\n',
        '  1.  e4      (0:01)     e5      (0:01)\n',
        '  2.  Nf3     (0:01)     Nc6     (0:01)\n',
        '  3.  Bb5     (0:01)\n      {Still in progress} *\nfics%'
    ];
    response.forEach((chunk) => client.consumeObservedGameHistoryData(chunk));
    assert.equal(client.moveHistory.length, 5);
    assert.equal(client.moveHistory.at(-1).san, 'Bb5');
    assert.equal(events.filter(({ event }) => event === 'observed-history').length, 1);
    assert.equal(events.at(-1).payload.selectionGeneration, 3);

    client.invalidateObservedGameHistory('SELECTION_EXITED');
    const snapshot = JSON.stringify(client.moveHistory);
    assert.equal(client.consumeObservedGameHistoryData('Movelist for game 42:\n  1. d4 (0:01) d5 (0:01)\nfics%'), false);
    assert.equal(JSON.stringify(client.moveHistory), snapshot);
});
