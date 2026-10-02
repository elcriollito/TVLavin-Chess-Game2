import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { moveRows, createStudyAnalysis, evaluationLabel } from '../js/mentor/mentor-moves.js';
import { parseMentorPgn } from '../js/mentor/mentor-pgn.js';

const pgn = '[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';

test('move rows preserve SAN indexes and Black-first FEN numbering', () => {
    assert.deepEqual(moveRows(parseMentorPgn(pgn)[0]), [{ number: 1, white: 0, black: 1 }, { number: 2, white: 2, black: 3 }]);
    const game = parseMentorPgn('[Event "Custom"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4p3/4K3 b - - 0 23"]\n[Result "0-1"]\n\n23... Kd7 24. Kd2 e1=Q+ 0-1')[0];
    assert.deepEqual(moveRows(game), [{ number: 23, white: null, black: 0 }, { number: 24, white: 1, black: 2 }]);
});

function fakeEngine(mode = 'complete') {
    return { searches: [], terminated: [], start: async () => {}, terminate(reason) { this.terminated.push(reason); },
        getBestMove(fen, callback, { depth }) {
            this.searches.push(fen);
            if (mode === 'hang') return;
            this.onInfo({ score: 1.25, mate: null, depth, multipv: 1 });
            this.onInfo({ score: 99, mate: null, depth, multipv: 2 });
            this.onInfo({ score: 88, mate: null, depth, multipv: 1, rawLine: 'info score cp 8800 lowerbound' });
            callback('e2e4');
        } };
}

test('analysis starts lazily, sequentially evaluates actual FENs, keeps White scores and disposes once', async () => {
    const engine = fakeEngine(), values = []; let factories = 0;
    const analysis = createStudyAnalysis(() => { factories++; return engine; });
    assert.equal(factories, 0);
    const positions = parseMentorPgn(pgn)[0].positions;
    await analysis.run(positions, 12, (value, index) => values.push({ ...value, index }));
    assert.deepEqual(engine.searches, positions); assert.equal(values.length, 5);
    assert.equal(values[1].score, 1.25);
    assert.equal(values.at(-1).index, 4); assert.equal(engine.terminated.length, 1); assert.equal(analysis.isIdle(), true);
});

test('cancelled search cannot publish evidence or destroy a replacement engine', async () => {
    const first = fakeEngine('hang'), second = fakeEngine(); let count = 0;
    const analysis = createStudyAnalysis(() => count++ ? second : first), seen = [];
    const pending = analysis.run(['first'], 12, value => seen.push(value));
    await Promise.resolve(); analysis.cancel();
    const replacement = analysis.run(['second'], 12, value => seen.push(value));
    await assert.rejects(pending, /cancelled/); await replacement;
    assert.equal(seen.length, 1); assert.equal(first.terminated.length, 1); assert.equal(second.terminated.length, 1);
});

test('timeout is an error with no invented zero evaluation and engine cleanup', async () => {
    const engine = fakeEngine('hang'), seen = [];
    const analysis = createStudyAnalysis(() => engine, { timeoutMs: 5 });
    await assert.rejects(analysis.run(['fen'], 12, value => seen.push(value)), /time limit/);
    assert.deepEqual(seen, []); assert.equal(engine.terminated.length, 1); assert.equal(analysis.isIdle(), true);
});

test('failed startup and depth shortfall never publish an evaluation', async () => {
    const failed = fakeEngine(); failed.start = async () => { throw new Error('WASM unavailable'); };
    await assert.rejects(createStudyAnalysis(() => failed).run(['fen'], 12, () => assert.fail()), /WASM/);
    assert.equal(failed.terminated.length, 1);
    const shallow = fakeEngine(); shallow.getBestMove = function (fen, done) { this.onInfo({ score: 0.3, depth: 5, multipv: 1 }); done(); };
    await assert.rejects(createStudyAnalysis(() => shallow).run(['fen'], 12, () => assert.fail()), /selected depth/);
});

test('evaluation labels disclose depth and preserve signed mates', () => {
    assert.equal(evaluationLabel({ score: -0.32, mate: null, depth: 12 }), '-0.32 · depth 12');
    assert.equal(evaluationLabel({ score: null, mate: -3, depth: 16 }), '−M3 · depth 16');
    assert.equal(evaluationLabel({ score: null, mate: -0, depth: 12 }), '−M0 · depth 12');
});

test('layout owns one shared footer, five panels, and no controls beneath the board', () => {
    const html = fs.readFileSync(new URL('../mentor.html', import.meta.url), 'utf8');
    const board = html.slice(html.indexOf('<section class="board-region"'), html.indexOf('<section class="right-workspace"'));
    assert.doesNotMatch(board, /board-foot|id="lesson-notation"|id="practice"|id="repeat"/);
    assert.equal((html.match(/id="panel-[^"]+" role="tabpanel"/g) || []).length, 5);
    assert.equal((html.match(/id="training-[^"]+-body" role="tabpanel"/g) || []).length, 3);
    assert.equal((html.match(/id="opening-[^"]+-body" role="tabpanel"/g) || []).length, 2);
    assert.equal((html.match(/class="workspace-foot"/g) || []).length, 1);
    assert.ok(html.indexOf('id="lesson-instruction"') > html.indexOf('id="panel-learn"'));
    const foot = html.slice(html.indexOf('id="workspace-footer"'), html.indexOf('class="page-note"'));
    for (const id of ['chat-footer', 'study-settings', 'study-engine', 'game-first', 'game-previous', 'game-next', 'game-last']) assert.ok(foot.includes(`id="${id}"`));
});

test('terminal attributed engine scores retain actual depth and recover mate-zero White perspective from FEN', async () => {
    const seen = [];
    const engine = { terminated: [], start: async () => {}, terminate(reason) { this.terminated.push(reason); },
        getBestMoveAttributed(fen, done, options) {
            options.onInfo({ score: null, mate: 0, depth: 0, multipv: 1 }); done(null);
        } };
    await createStudyAnalysis(() => engine).run(['8/8/8/8/8/8/8/8 w - - 0 1'], 12, value => seen.push(value));
    assert.equal(seen[0].depth, 0); assert.ok(Object.is(seen[0].mate, -0));
    assert.deepEqual(engine.terminated, ['mentor-study-complete']);
});

test('terminal mate-zero is positive from White perspective when Black is mated', async () => {
    const seen = [];
    const engine = { start: async () => {}, terminate() {},
        getBestMoveAttributed(fen, done, options) {
            options.onInfo({ score: null, mate: -0, depth: 0, multipv: 1 }); done(null);
        } };
    await createStudyAnalysis(() => engine).run(['8/8/8/8/8/8/8/8 b - - 0 1'], 12, value => seen.push(value));
    assert.equal(seen[0].depth, 0); assert.ok(Object.is(seen[0].mate, 0)); assert.ok(!Object.is(seen[0].mate, -0));
});
