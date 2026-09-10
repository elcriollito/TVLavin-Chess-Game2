import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const transportSource = read('js/play/analyze-handoff.js');
const adapterSource = read('js/fics-analyze-handoff.js');
const navigationSource = read('js/caissa-navigation.js');
const analyzeSource = read('js/analyze-section.js');
const pages = [read('index.html'), read('yahoo-classic.html')];

function memoryStorage() {
    const data = new Map();
    return {
        get length() { return data.size; },
        key: index => [...data.keys()][index] ?? null,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
    };
}

function fixture({ partial = false, ended = true, analyze = true } = {}) {
    const window = {
        sessionStorage: memoryStorage(),
        crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' }
    };
    vm.runInNewContext(transportSource, { window, Object, JSON, Date, Number, Math });
    vm.runInNewContext(adapterSource, { window, Object });
    const snapshot = {
        schemaVersion: '1.4.0',
        game: {
            ended, gameNumber: 88, currentFen: 'final-fen', myColor: 'white', orientation: 'white',
            moves: [{ san: 'e4', fen: 'after-e4' }], replay: { initialFen: 'start-fen', latestPly: 1 },
            pgn: { mayBePartial: partial }, result: { result: '1-0', terminationReason: 'CHECKMATE' },
            identities: { white: { name: 'Alpha' }, black: { name: 'Beta' } }
        },
        capabilities: { analyze }
    };
    const client = { buildPGN: () => '[Result "1-0"]\n\n1. e4 1-0\n' };
    return { window, snapshot, client };
}

test('completed FICS game uses the existing opaque Analyze handoff transport', () => {
    const { window, snapshot, client } = fixture();
    const prepared = window.CaissaFICSAnalyzeHandoff.prepare(snapshot, client);
    assert.equal(prepared.ok, true);
    const resolved = window.CaissaAnalyzeHandoff.resolve(prepared.value.token);
    assert.equal(resolved.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(resolved.value.payload)), {
        recordId: 'fics-game:88', initialFen: 'start-fen', finalFen: 'final-fen',
        pgn: '[Result "1-0"]\n\n1. e4 1-0\n', selectedPly: 1,
        playerColor: 'white', boardOrientation: 'white', result: '1-0', termination: 'CHECKMATE',
        whiteLabel: 'Alpha', blackLabel: 'Beta', recordStatus: 'complete', mode: 'fics-played'
    });
    assert.equal(resolved.value.source, 'fics');
    assert.equal(resolved.value.provenance.sourceSection, 'fics');
});

test('partial observed record remains explicitly partial through Analyze ingestion', () => {
    const { window, snapshot, client } = fixture({ partial: true });
    const prepared = window.CaissaFICSAnalyzeHandoff.prepare(snapshot, client);
    assert.equal(prepared.ok, true);
    assert.equal(prepared.value.payload.recordStatus, 'partial');
    assert.equal(prepared.value.payload.mode, 'fics-observed');
    assert.match(analyzeSource, /FICS partial handoff/);
    assert.match(analyzeSource, /recordStatus: payload\.recordStatus \|\| null/);
    assert.match(analyzeSource, /recordStatus: metadata\.recordStatus \|\| null/);
});

test('active incomplete or unavailable FICS records fail closed before storage', () => {
    for (const options of [{ ended: false }, { analyze: false }]) {
        const { window, snapshot, client } = fixture(options);
        assert.equal(window.CaissaFICSAnalyzeHandoff.prepare(snapshot, client).ok, false);
        assert.equal(window.sessionStorage.length, 0);
    }
    const missing = fixture();
    missing.client.buildPGN = () => '';
    assert.equal(missing.window.CaissaFICSAnalyzeHandoff.prepare(missing.snapshot, missing.client).ok, false);
    assert.equal(missing.window.sessionStorage.length, 0);
});

test('FICS adapter owns no game board engine parser navigation or durable state', () => {
    assert.doesNotMatch(adapterSource, /new\s+(?:Chess|Worker)|Chessboard\s*\(|WebSocket|localStorage|document|fetch\s*\(/);
    assert.doesNotMatch(adapterSource, /liveGame\s*=|moveHistory\s*=|navigateToSection|location\s*=/);
    assert.match(adapterSource, /CaissaAnalyzeHandoff/);
    assert.match(adapterSource, /createTransport\(\)/);
});

test('legacy pages load the FICS adapter between projection and shell and navigation carries opaque tokens from any section', () => {
    for (const html of pages) {
        assert.equal((html.match(/js\/fics-analyze-handoff\.js/g) || []).length, 1);
        assert.ok(html.indexOf('fics-presentation-contract.js') < html.indexOf('fics-analyze-handoff.js'));
        assert.ok(html.indexOf('fics-analyze-handoff.js') < html.indexOf('fics-layout-shell.js'));
    }
    assert.match(navigationSource, /sectionId === 'analyze' && window\.CaissaAnalyzeHandoff/);
    assert.match(navigationSource, /options\.handoffToken/);
    assert.match(navigationSource, /query, \{ handoff: options\.handoffToken \}/);
});
