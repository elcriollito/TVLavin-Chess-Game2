import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');
const context = vm.createContext({ window: null, globalThis: null, Object, Number, Map });
context.window = context; context.globalThis = context;
for (const file of ['js/play/opponent-strength.js', 'js/play/native-coach/coach-configuration.js',
    'js/play/native-coach/coach-levels.js']) vm.runInContext(read(file), context, { filename: file });

test('seven progressive public Coach levels map to separate hidden policies', () => {
    const api = context.CaissaNativeCoachLevels;
    assert.equal(api.schemaVersion, '1.0.0');
    assert.deepEqual(Array.from(api.publicOptions, item => item.id),
        ['casual', 'beginner', 'intermediate', 'advanced', 'expert', 'master', 'grandmaster']);
    assert.deepEqual(Array.from(api.levels, item => item.opponentStrength.targetElo),
        [500, 800, 1200, 1600, 2000, 2400, 2800]);
    for (const level of api.levels) {
        assert.equal(api.validate(level), true);
        assert.ok(level.teachingStrength.id);
        assert.ok(level.coachPersonality.id);
    }
    assert.equal(Object.isFrozen(api.levels[0].opponentStrength), true);
});

test('unknown levels fail closed and public options reveal no internal mapping', () => {
    const api = context.CaissaNativeCoachLevels;
    assert.equal(api.get('legend'), null);
    assert.equal(api.validate({ id: 'casual' }), false);
    for (const option of api.publicOptions) assert.deepEqual(Object.keys(option).sort(), ['id', 'label']);
});

test('Coach panel sends its selected opponent target into the game boundary', () => {
    const panel = read('js/play/native-coach/coach-panel.js');
    const app = read('app.js');
    const registry = read('js/play/performance/play-load-registry.js');
    assert.match(panel, /CaissaNativeCoachLevels\.get\(this\.#experience\)/);
    assert.match(panel, /targetElo: level\.opponentStrength\.targetElo/);
    assert.match(app, /botRoute\?\.mode === 'coach'[\s\S]*?CaissaOpponentStrengthSession\?\.beginGame/);
    assert.ok(registry.indexOf('coach-levels.js?v=1.0.0') < registry.indexOf('coach-panel.js?v=2.6.0'));
});

test('Coach level contract owns no UI, storage, network, board, Worker, or moves', () => {
    const source = read('js/play/native-coach/coach-levels.js');
    for (const forbidden of [/document/i, /localStorage|sessionStorage|indexedDB/i, /fetch\s*\(/i,
        /new\s+Worker/i, /Chessboard/i, /\.move\s*\(/i]) assert.doesNotMatch(source, forbidden);
});
