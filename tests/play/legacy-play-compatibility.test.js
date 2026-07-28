import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/legacy-play-compatibility.js', import.meta.url), 'utf8');

function classes(active = true) {
    return { contains: name => name === 'active' && active };
}

function fixture({ mounted = true } = {}) {
    const calls = [];
    const storage = new Map();
    const game = {
        fen: () => '8/8/8/8/8/8/4P3/4K2k w - - 0 1',
        pgn: () => '1. e4',
        turn: () => 'w'
    };
    const board = { id: 'legacy-board' };
    const play = mounted ? { id: 'playSection', classList: classes() } : null;
    const App = {
        game,
        board,
        engine: { id: 'legacy-worker-owner', analyzing: false },
        gameMode: 'analysis',
        playerColor: 'white',
        engineId: 'stockfish',
        gameActive: true,
        analyzing: false,
        isFlipped: false,
        moveHistory: [{ color: 'w', from: 'e2', to: 'e4', piece: 'p', san: 'e4', flags: 'b' }],
        gameStatus: { state: 'In Progress', result: '', message: '' },
        pendingPromotion: null,
        timeControl: 300,
        whiteTime: 300,
        blackTime: 300,
        whiteTimeMs: 300000,
        blackTimeMs: 300000,
        clockRunning: false,
        lastEvalCp: null,
        lastEvalMate: null
    };
    const document = {
        getElementById: id => id === 'playSection' ? play : null,
        querySelector: () => play
    };
    const window = {
        App,
        document,
        CaissaNavigation: {
            currentSection: 'play',
            navigateToSection: section => calls.push(['openAnalyze', section])
        },
        newGame: options => calls.push(['newGame', options]),
        makeMoveFromSquares: (from, to) => {
            calls.push(['move', from, to]);
            return from === 'e2' && to === 'e4';
        },
        handlePromotion: piece => calls.push(['promote', piece]),
        resignGame: () => calls.push(['resign']),
        flipBoard: () => calls.push(['flip']),
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        }
    };
    vm.runInNewContext(source, { window, Date, Object, WeakSet, Number, Set });
    return { api: window.CaissaPlayCompatibility, window, App, game, board, calls, storage, play };
}

test('public API is frozen, versioned, minimal, and supports stable repeated installation', () => {
    const value = fixture();
    const before = value.api;
    vm.runInNewContext(source, { window: value.window, Date, Object, WeakSet, Number, Set });
    assert.equal(value.window.CaissaPlayCompatibility, before);
    assert.equal(before.schemaVersion, '1.0.0');
    assert.equal(Object.isFrozen(before), true);
    assert.deepEqual(
        Object.keys(before).sort(),
        [
            'commands', 'execute', 'getBoardOrientation', 'getClockSnapshot', 'getCurrentFen',
            'getCurrentPgn', 'getEvaluationSnapshot', 'getGameStatus', 'getMoveHistory',
            'getPendingPromotion', 'getSnapshot', 'getState', 'isAvailable', 'isGameActive',
            'isPlayMounted', 'resultStatuses', 'schemaVersion'
        ].sort()
    );
});

test('snapshot has deterministic JSON-safe shape without legacy object references', () => {
    const { api, App, game, board } = fixture();
    const snapshot = api.getSnapshot();
    assert.doesNotThrow(() => JSON.stringify(snapshot));
    assert.equal(snapshot.schemaVersion, '1.0.0');
    assert.equal(snapshot.position.fen, game.fen());
    assert.equal(snapshot.position.moveCount, 1);
    assert.equal(snapshot.board.available, true);
    assert.equal(snapshot.engine.available, true);
    assert.notEqual(snapshot.position.moveHistory, App.moveHistory);
    const values = new Set();
    const collect = value => {
        if (!value || typeof value !== 'object' || values.has(value)) return;
        values.add(value);
        Object.values(value).forEach(collect);
    };
    collect(snapshot);
    assert.equal(values.has(game), false);
    assert.equal(values.has(board), false);
    assert.equal(values.has(App.engine), false);
});

test('snapshot and every nested value are deeply frozen', () => {
    const snapshot = fixture().api.getSnapshot();
    const verify = value => {
        if (!value || typeof value !== 'object') return;
        assert.equal(Object.isFrozen(value), true);
        Object.values(value).forEach(verify);
    };
    verify(snapshot);
});

test('snapshot mutation cannot alter legacy history, clocks, status, or promotion', () => {
    const { api, App } = fixture();
    App.pendingPromotion = { from: 'a7', to: 'a8' };
    const snapshot = api.getSnapshot();
    assert.throws(() => snapshot.position.moveHistory.push({ san: 'h4' }), TypeError);
    assert.throws(() => { snapshot.clocks.whiteMilliseconds = 1; }, TypeError);
    assert.throws(() => { snapshot.game.status.result = '1-0'; }, TypeError);
    assert.throws(() => { snapshot.game.pendingPromotion.from = 'h2'; }, TypeError);
    assert.equal(App.moveHistory.length, 1);
    assert.equal(App.whiteTimeMs, 300000);
    assert.equal(App.gameStatus.result, '');
    assert.equal(App.pendingPromotion.from, 'a7');
});

test('focused selectors return detached immutable values and current primitive state', () => {
    const { api } = fixture();
    assert.equal(api.isAvailable(), true);
    assert.equal(api.isPlayMounted(), true);
    assert.equal(api.isGameActive(), true);
    assert.match(api.getCurrentFen(), /^8\//);
    assert.equal(api.getCurrentPgn(), '1. e4');
    assert.equal(api.getBoardOrientation(), 'white');
    assert.equal(Object.isFrozen(api.getMoveHistory()), true);
    assert.equal(Object.isFrozen(api.getClockSnapshot()), true);
    assert.equal(Object.isFrozen(api.getGameStatus()), true);
});

test('idle and unavailable snapshots use explicit nulls instead of fabricated state', () => {
    const { api, App } = fixture({ mounted: false });
    App.game = null;
    App.board = null;
    App.engine = null;
    App.moveHistory = null;
    const snapshot = api.getSnapshot();
    assert.equal(api.isAvailable(), false);
    assert.equal(snapshot.mounted, false);
    assert.equal(snapshot.position.fen, null);
    assert.equal(snapshot.position.turn, null);
    assert.equal(snapshot.board.orientation, null);
    assert.equal(snapshot.engine.available, false);
    assert.equal(snapshot.game.termination, null);
    assert.equal(snapshot.storageVersion, null);
});

test('evaluation and clock snapshots expose evidence-backed legacy state', () => {
    const { api, App } = fixture();
    App.lastEvalCp = -210;
    App.clockRunning = true;
    const snapshot = api.getSnapshot();
    assert.deepEqual(
        JSON.parse(JSON.stringify(snapshot.evaluation)),
        { available: true, scorePawns: -2.1, mate: null, perspective: 'white' }
    );
    assert.equal(snapshot.clocks.activeColor, 'white');
    assert.equal(snapshot.clocks.running, true);
});

test('startNewGame validates and routes exactly one legacy action', () => {
    const { api, calls } = fixture();
    const accepted = api.execute('startNewGame', { mode: 'analysis', color: 'black', timeControl: 300 });
    assert.deepEqual(JSON.parse(JSON.stringify(accepted)), {
        ok: true, status: 'accepted', command: 'startNewGame', reason: null, value: null
    });
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['newGame', { mode: 'analysis', color: 'black', timeControl: 300 }]]);
});

test('resetGame routes once with current settings', () => {
    const { api, calls } = fixture();
    assert.equal(api.execute('resetGame').ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['newGame', { mode: 'analysis', color: 'white', timeControl: 300 }]]);
});

test('legal and illegal moves are normalized without duplicate submissions', () => {
    const { api, calls } = fixture();
    assert.equal(api.execute('submitMove', { from: 'e2', to: 'e4' }).status, 'accepted');
    assert.equal(api.execute('submitMove', { from: 'e2', to: 'e5' }).status, 'rejected');
    assert.deepEqual(calls, [['move', 'e2', 'e4'], ['move', 'e2', 'e5']]);
});

test('malformed commands cannot reach legacy actions', () => {
    const { api, calls } = fixture();
    for (const [command, input] of [
        ['submitMove', { from: 'e9', to: 'e4' }],
        ['submitMove', { from: '<b>', to: 'e4' }],
        ['submitMove', { from: 'e2', to: 'e4', promotion: 'k' }],
        ['startNewGame', { mode: 'online' }],
        ['startNewGame', { color: 'random' }],
        ['startNewGame', { timeControl: -1 }],
        ['startNewGame', { mode: 'analysis', injected: true }],
        ['resetGame', { injected: true }],
        ['promote', { piece: 'q', injected: true }]
    ]) assert.equal(api.execute(command, input).status, 'rejected');
    assert.deepEqual(calls, []);
});

test('promotion requires pending legacy state and routes once', () => {
    const { api, App, calls } = fixture();
    assert.equal(api.execute('promote', { piece: 'q' }).status, 'rejected');
    App.pendingPromotion = { from: 'a7', to: 'a8' };
    assert.equal(api.execute('promote', { piece: 'n' }).status, 'accepted');
    assert.deepEqual(calls, [['promote', 'n']]);
});

test('flip, resign, Analyze, and PGN commands route existing behavior', () => {
    const { api, calls } = fixture();
    assert.equal(api.execute('flipBoard').status, 'accepted');
    assert.equal(api.execute('resign').status, 'accepted');
    const analyze = api.execute('openAnalyze');
    assert.equal(analyze.status, 'accepted');
    assert.equal(analyze.reason, null);
    const pgn = api.execute('requestPgn');
    assert.equal(pgn.value, '1. e4');
    assert.deepEqual(calls, [['flip'], ['resign'], ['openAnalyze', 'analyze']]);
});

test('unsupported and unavailable commands return stable non-throwing results', () => {
    const available = fixture().api;
    assert.equal(available.execute('offerDraw').status, 'unsupported');
    assert.equal(available.execute(null).status, 'unsupported');
    const unavailable = fixture({ mounted: false }).api;
    assert.equal(unavailable.execute('submitMove', { from: 'e2', to: 'e4' }).status, 'unavailable');
});

test('legacy failures are normalized and raw errors are not exposed', () => {
    const { api, window } = fixture();
    window.resignGame = () => { throw new Error('private runtime detail'); };
    assert.deepEqual(JSON.parse(JSON.stringify(api.execute('resign'))), {
        ok: false, status: 'failed', command: 'resign', reason: 'legacy-action-failed', value: null
    });
});

test('static single-writer guard forbids resource creation and legacy assignments', () => {
    for (const pattern of [
        /\bnew\s+Worker\b/,
        /\brequestAnimationFrame\s*\(/,
        /\.addEventListener\s*\(/,
        /\blocalStorage\.(?:setItem|removeItem)\s*\(/,
        /\bApp\.(?:game|board|engine|whiteTime|blackTime|whiteTimeMs|blackTimeMs|clockRunning|pendingPromotion|moveHistory|gameStatus)\s*=/,
        /\.(?:innerHTML|textContent|className|style)\s*=/
    ]) assert.doesNotMatch(source, pattern);
});

test('both legacy SPA pages load the boundary exactly once after App', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/js\/play\/legacy-play-compatibility\.js/g) || []).length, 1);
        assert.ok(
            html.indexOf('app.js?v=2.0.12') < html.indexOf('js/play/legacy-play-compatibility.js?v=1.0.0'),
            `${page} must load compatibility after App`
        );
    }
});

test('production module is passive and contains no migration diagnostics or storage keys', () => {
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)|__caissa|diagnostic|STORAGE_KEY/);
    assert.doesNotMatch(source, /createElement|appendChild|insertAdjacentHTML|replaceChildren/);
});
