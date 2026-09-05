import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');
const context = vm.createContext({ window: null, globalThis: null, Object, Map });
context.window = context; context.globalThis = context;
for (const file of ['js/play/play-v2-post-game-policy.js',
    'js/play/native-coach/coach-game-over-presentation.js']) vm.runInContext(read(file), context, { filename: file });

const record = (winner, termination, player = 'white') => ({
    status: 'completed', player: { color: player },
    result: { complete: true, winner, termination, value: winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : '1/2-1/2' }
});
const model = (game, annotations = []) => context.CaissaCoachGameOverPresentation.createModel({
    owner: 'post-game-core', sourceMode: 'coach', record: game,
    description: context.CaissaPlayV2PostGamePolicy.describe(game), annotations
});

test('Coach game-over model preserves authoritative outcomes and termination text', () => {
    const won = model(record('white', 'checkmate'));
    assert.equal(won.value.title, 'You Won'); assert.equal(won.value.reason, 'By Checkmate');
    const coachWon = model(record('black', 'resignation'));
    assert.equal(coachWon.value.title, 'Coach Won'); assert.equal(coachWon.value.reason, 'By Resignation');
    const draw = model(record(null, 'repetition'));
    assert.equal(draw.value.title, 'Draw'); assert.equal(draw.value.reason, 'By Repetition');
    const timeout = model(record('black', 'timeout'));
    assert.equal(timeout.value.title, 'Coach Won'); assert.equal(timeout.value.reason, 'On Time');
});

test('preview uses only nonzero evidence-backed live Coach annotations', () => {
    const result = model(record('white', 'checkmate'), [
        { key: 'good' }, { key: 'good' }, { key: 'book' }, { key: 'blunder' },
        { key: 'brilliant' }, null
    ]);
    assert.deepEqual(Array.from(result.value.categories, item => ({ ...item })), [
        { key: 'blunder', label: 'Blunder', count: 1 },
        { key: 'good', label: 'Good', count: 2 },
        { key: 'book', label: 'Book', count: 1 }
    ]);
    assert.doesNotMatch(JSON.stringify(result.value), /Brilliant|Great|Miss|"count":0/);
});

test('Coach game-over context rejects every non-Coach or non-core caller', () => {
    const game = record('white', 'checkmate');
    for (const input of [
        { owner: 'other', sourceMode: 'coach' },
        { owner: 'post-game-core', sourceMode: 'games' },
        { owner: 'post-game-core', sourceMode: 'bots' }
    ]) assert.equal(context.CaissaCoachGameOverPresentation.createModel({ ...input, record: game }).ok, false);
});

test('presentation and integration add no engine, chess, route, or duplicate state owner', () => {
    const presentation = read('js/play/native-coach/coach-game-over-presentation.js');
    const core = read('js/play/post-game-core.js');
    assert.match(core, /sourceMode === 'coach'[\s\S]*CaissaCoachGameOverPresentation\?\.mount/);
    assert.match(core, /annotations: root\.App\?\.coachMoveAnnotations \|\| \[\]/);
    for (const forbidden of [/Stockfish/i, /new\s+Worker/, /new\s+Chess/, /\.move\s*\(/,
        /reviewMoveIndex/, /currentMoveIndex/, /history\.push/, /location\.(?:href|pathname)/]) {
        assert.doesNotMatch(presentation, forbidden);
    }
});
