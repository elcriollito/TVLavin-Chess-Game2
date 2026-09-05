import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');

test('Coach setup exposes approved aliases while preserving existing level IDs', () => {
    const panel = read('js/play/native-coach/coach-panel.js');
    assert.match(panel, /id: 'casual', label: 'Casual'/);
    assert.match(panel, /id: 'intermediate', label: 'Balanced'/);
    assert.match(panel, /id: 'advanced', label: 'Challenging'/);
    assert.match(panel, /A relaxed game with more room to explore\./);
    assert.match(panel, /A steady challenge with balanced guidance\./);
    assert.match(panel, /A stronger test that rewards careful play\./);
    assert.match(panel, /Show All Levels ↓/);
    assert.match(panel, /publicOptions\.filter\(item => !featuredIds\.has\(item\.id\)\)/);
});

test('complete seven-level ladder and strength policy remain unchanged', () => {
    const context = vm.createContext({ window: null, globalThis: null, Object, Number, Map });
    context.window = context; context.globalThis = context;
    for (const file of ['js/play/opponent-strength.js', 'js/play/native-coach/coach-configuration.js',
        'js/play/native-coach/coach-levels.js']) vm.runInContext(read(file), context, { filename: file });
    assert.deepEqual(Array.from(context.CaissaNativeCoachLevels.publicOptions, item => item.id),
        ['casual', 'beginner', 'intermediate', 'advanced', 'expert', 'master', 'grandmaster']);
    assert.deepEqual(Array.from(context.CaissaNativeCoachLevels.levels, item => item.opponentStrength.targetElo),
        [500, 800, 1200, 1600, 2000, 2400, 2800]);
});

test('color choices and Coach start boundary remain unchanged', () => {
    const panel = read('js/play/native-coach/coach-panel.js');
    assert.match(panel, /value: 'white', label: 'White'/);
    assert.match(panel, /value: 'random', label: 'Random'/);
    assert.match(panel, /value: 'black', label: 'Black'/);
    assert.match(panel, /targetElo: level\.opponentStrength\.targetElo/);
    assert.doesNotMatch(panel, /reviewMoveIndex|new\s+Chess|Stockfish|classification/i);
});

test('primary Coach choices remain vertically stacked at every breakpoint', () => {
    const css = read('css/play-coach-review.css');
    const featuredRule = css.match(/\.caissa-native-coach-panel__featured-levels\s*\{[^}]+\}/)?.[0] || '';
    assert.match(featuredRule, /grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.doesNotMatch(css, /caissa-native-coach-panel__featured-levels[^}]*repeat\(3/);
    assert.doesNotMatch(css, /@media[\s\S]*caissa-native-coach-panel__featured-levels[^}]*grid-template-columns:\s*(?:repeat\(|[^;]*fr\s+[^;]*fr)/);
});

test('expanded Coach levels use compact full-width rows in one vertical stack', () => {
    const css = read('css/play-coach-review.css');
    const expandedRule = css.match(/\.caissa-native-coach-panel__more-levels\s*\{[^}]+\}/)?.[0] || '';
    assert.match(expandedRule, /display:\s*flex/);
    assert.match(expandedRule, /flex-direction:\s*column/);
    assert.doesNotMatch(css, /caissa-native-coach-panel__more-levels[^}]*grid-template-columns/);
});
