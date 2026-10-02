import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const setup = source.slice(source.indexOf('function setupInsightModal() {'), source.indexOf('// ===== PERFORMANCE MONITORING ====='));
const clearSetup = source.slice(source.indexOf('function setupClearInsightHandlers() {'), source.indexOf('// Clear Insight session'));
const gameSource = source.slice(source.indexOf('function getLichessProxyUrl()'), source.indexOf('// ===== COACH REPORT MODULE ====='));
function harness() {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { id, dataset: {}, value: '', style: {}, disabled: false, listeners: {},
            classList: { add() {}, remove() {} }, querySelectorAll: () => [],
            addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); },
            async fire(name, event = {}) { for (const handler of this.listeners[name] || []) await handler({target:this, preventDefault(){},stopPropagation(){},...event}); }
        });
        return nodes.get(id);
    };
    const tabs = ['online', 'local'].map(name => { const tab = node(name); tab.dataset.tab = name; return tab; });
    node('insightModal').querySelectorAll = () => [node('close')];
    let fetches = 0; const errors = [], dismissed = [];
    const context = vm.createContext({document: {getElementById: node, querySelectorAll: () => tabs}, console: {log(){},warn(){},error(){}},
        showErrorNotification: message => errors.push(message), hideModal: id => dismissed.push(id),
        GameSourceService: {async fetchFromLichess() {fetches++;return [];}}});
    vm.runInContext(setup, context);
    return {nodes,node,tabs,context,errors,dismissed,fetches:()=>fetches};
}
test('standalone Insight initializes before deferred Play bootstrap', () => {
    assert.ok(source.indexOf('    setupInsightModal();') < source.indexOf("    ensurePlayInitialized('bootstrap');"));
    assert.ok(source.indexOf('    setupClearInsightHandlers();') < source.indexOf("    ensurePlayInitialized('bootstrap');"));
});
test('direct-route controls attach once and fetch responds without any Play initialization', async () => {
    const h = harness();
    for (let i=0;i<3;i++) h.context.setupInsightModal();
    h.node('importProvider').value = 'lichess'; h.node('importUsername').value = 'example';
    h.node('importGameCount').value = '10'; h.node('importTimeControl').value = 'all';
    await h.node('importFetchBtn').fire('click');
    assert.equal(h.fetches(), 1);
    assert.deepEqual(h.errors, ['No games found with the specified filters']);
    assert.equal(h.node('importFetchBtn').disabled, false);
    assert.equal(h.tabs[1].listeners.click.length, 1);
    await h.tabs[1].fire('click');
    assert.equal(h.node('importLocalPanel').style.display, 'block');
    assert.equal(h.node('importOnlinePanel').style.display, 'none');
    assert.equal(h.node('importCorsMessage').style.display, 'none');
    assert.equal(h.node('insightPgnFile').listeners.change.length, 1);
    assert.equal(h.node('insightAnalyzeBtn').listeners.click.length, 1);
});
test('Insight closes without entering Play using button, backdrop or Escape', async () => {
    const h = harness();h.context.setupInsightModal();h.context.setupInsightModal();
    await h.node('close').fire('click');await h.node('insightModal').fire('click');
    await h.node('insightModal').fire('keydown', {key:'Escape'});
    assert.deepEqual(h.dismissed, ['insightModal','insightModal','insightModal']);
});
test('Clear Insight controls initialize once without Play and cancellation does not delete data', async () => {
    const h = harness();
    h.node('clearInsightModal').querySelectorAll = () => [h.node('clearClose')];
    vm.runInContext(clearSetup, h.context);
    for (let i = 0; i < 3; i++) h.context.setupClearInsightHandlers();
    assert.equal(h.node('clearCancelBtn').listeners.click.length, 1);
    await h.node('clearCancelBtn').fire('click');
    await h.node('clearClose').fire('click');
    await h.node('clearInsightModal').fire('click');
    await h.node('clearInsightModal').fire('keydown', {key:'Escape'});
    assert.deepEqual(h.dismissed, [
        'clearInsightModal', 'clearInsightModal', 'clearInsightModal', 'clearInsightModal'
    ]);
});
test('local PGN validation happens before any Insight credit is consumed', () => {
    const analyzeHandler = setup.slice(
        setup.indexOf("analyzeBtn.addEventListener('click'"),
        setup.indexOf('// Refresh button handler')
    );
    assert.ok(analyzeHandler.indexOf('parseMultiGamePGN(pgnText)') < analyzeHandler.indexOf("consumeCredits('insight')"));
    assert.ok(analyzeHandler.indexOf('parsedData.stats.total === 0') < analyzeHandler.indexOf("consumeCredits('insight')"));
});
test('Insight copy does not attribute PGN-only summaries to Stockfish or AI', () => {
    const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /PGN-based performance summary/);
    assert.doesNotMatch(html, /Stockfish-powered position evaluation|<h3>AI Coach Report<\/h3>/);
    assert.match(setup, /game\.source = provider/);
    assert.match(setup, /game\.source = 'local'/);
});
test('Chess.com import selects the genuinely most recent completed games', async () => {
    const archiveGames = [
        { url: 'oldest', end_time: 100, pgn: '[Event "Oldest"]', time_class: 'blitz' },
        { url: 'newest', end_time: 300, pgn: '[Event "Newest"]', time_class: 'blitz' },
        { url: 'middle', end_time: 200, pgn: '[Event "Middle"]', time_class: 'blitz' }
    ];
    let request = 0;
    const context = vm.createContext({
        window: { location: { origin: 'https://caissa.test' } },
        console: { log() {}, error() {} },
        fetch: async () => request++ === 0
            ? { ok: true, async json() { return { archives: ['https://api.chess.com/archive'] }; } }
            : { ok: true, async json() { return { games: archiveGames }; } }
    });
    vm.runInContext(`${gameSource}; this.GameSourceService = GameSourceService;`, context);
    const games = await context.GameSourceService.fetchFromChessCom('player', 2, { timeControl: 'all' });
    assert.deepEqual(Array.from(games, game => game.id), ['newest', 'middle']);
});
