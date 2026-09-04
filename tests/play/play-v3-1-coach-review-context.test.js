import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');

class Element {
    constructor(tag = 'div') {
        this.tag = tag; this.className = ''; this.children = []; this.attributes = {};
        this.dataset = {}; this.textContent = '';
        this.classList = {
            values: new Set(),
            add: (...values) => values.forEach(value => this.classList.values.add(value)),
            remove: (...values) => values.forEach(value => this.classList.values.delete(value))
        };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(node) { this.children.unshift(node); }
    remove() { this.removed = true; }
}

function fixture() {
    const window = { document: { createElement: tag => new Element(tag) } };
    const context = vm.createContext({ window, globalThis: window, Object });
    for (const file of [
        'js/play/native-coach/coach-review-context.js',
        'js/play/native-coach/coach-review-presentation.js'
    ]) vm.runInContext(read(file), context, { filename: file });
    return window;
}

test('Coach Review context is admitted only from Coach post-game', () => {
    const window = fixture();
    const api = window.CaissaCoachReviewContext;
    for (const sourceMode of ['games', 'bots', null]) {
        assert.equal(api.create({ owner: 'post-game-core', sourceMode }).ok, false);
    }
    assert.equal(api.create({ owner: 'unknown', sourceMode: 'coach' }).ok, false);
    const created = api.create({ owner: 'post-game-core', sourceMode: 'coach' });
    assert.equal(created.ok, true);
    assert.equal(api.isCoachReview(created.value), true);
    assert.equal(Object.isFrozen(created.value), true);
});

test('isolated presentation mounts only with a valid Coach Review context and owns no ply', () => {
    const window = fixture();
    const section = new Element('section');
    assert.equal(window.CaissaCoachReviewPresentation.mount({ section, context: null }).ok, false);
    const context = window.CaissaCoachReviewContext.create({ owner: 'post-game-core', sourceMode: 'coach' }).value;
    const mounted = window.CaissaCoachReviewPresentation.mount({ section, context });
    assert.equal(mounted.ok, true);
    assert.equal(section.dataset.caissaReviewContext, 'coach');
    assert.equal(section.children[0].attributes['data-caissa-coach-review-shell'], '');
    const snapshot = window.CaissaCoachReviewPresentation.getSnapshot();
    assert.equal(snapshot.activePlyOwner, 'AnalyzeSection.currentMoveIndex');
    assert.equal(Object.hasOwn(snapshot, 'currentMoveIndex'), false);
    assert.equal(Object.hasOwn(snapshot, 'reviewMoveIndex'), false);
    assert.equal(window.CaissaCoachReviewPresentation.unmount().ok, true);
    assert.equal(section.dataset.caissaReviewContext, undefined);
});

test('boundary integration is Coach-scoped and AnalyzeSection remains unmodified', () => {
    const postGame = read('js/play/post-game-core.js');
    const inline = read('js/play/play-v2-inline-analyze.js');
    const presentation = read('js/play/native-coach/coach-review-presentation.js');
    assert.match(postGame, /sourceMode[\s\S]*CaissaCoachReviewContext\?\.create/);
    assert.match(inline, /isCoachReview\?\.\(input\.reviewContext\)/);
    assert.match(inline, /reviewPresentation\?\.unmount/);
    for (const forbidden of [/reviewMoveIndex/, /new\s+Chess/, /\.move\s*\(/, /EngineRegistry/, /Stockfish/]) {
        assert.doesNotMatch(presentation, forbidden);
    }
});
