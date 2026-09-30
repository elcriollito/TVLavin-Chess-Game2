import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function loadRuntime() {
    const context = vm.createContext({ console, Map, Set, Object, Number, TextEncoder });
    context.window = context;
    context.globalThis = context;
    for (const file of [
        'assets/vendor/chess.js/chess-0.10.3.min.js',
        'assets/vendor/pgn-parser/pgn-parser-1.4.19.umd.js',
        'js/pgn-replayer/pgn-core.js',
        'js/analyze-variation-tree.js'
    ]) new vm.Script(read(file), { filename: file }).runInContext(context);
    return context;
}

const collectionPgn = `[Event "First"]
[Date "2026.09.30"]
[Round "1"]
[White "Alpha"]
[Black "Beta"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Second"]
[Date "2026.09.30"]
[Round "2"]
[White "Gamma"]
[Black "Delta"]
[Result "*"]

1. d4 d5 (1... Nf6 2. c4) 2. c4 e6 *`;

test('PGN collection parsing preserves game-list metadata and imported RAV', () => {
    const runtime = loadRuntime();
    const collection = runtime.CaissaAnalyzeVariationTree.parseCollection(collectionPgn);
    assert.equal(collection.games.length, 2);
    assert.deepEqual(
        ['White', 'Black', 'Result', 'Event', 'Date', 'Round'].map(key => collection.games[1].headers[key]),
        ['Gamma', 'Delta', '*', 'Second', '2026.09.30', '2']
    );
    const tree = runtime.CaissaAnalyzeVariationTree.create({ parsedGame: collection.games[1] });
    assert.deepEqual(Array.from(tree.getMainLine(), node => node.san), ['d4', 'd5', 'c4', 'e6']);
    const d4 = tree.getMainLine()[0];
    const state = tree.inspect();
    const branch = state.nodes.find(node => node.parentId === d4.id && node.san === 'Nf6');
    assert.ok(branch);
    assert.equal(state.nodes.find(node => node.parentId === branch.id)?.san, 'c4');
});

test('historical moves create reusable nested branches without replacing the main line', () => {
    const runtime = loadRuntime();
    const parsed = runtime.CaissaAnalyzeVariationTree.parseCollection(collectionPgn).games[0];
    const tree = runtime.CaissaAnalyzeVariationTree.create({ parsedGame: parsed, originalResult: '1-0' });
    const mainBefore = tree.getMainLine().map(node => node.san);
    tree.selectNode(tree.getMainLine()[1].id);
    const d4 = tree.insertOrSelectMove({ san: 'd4', from: 'd2', to: 'd4', color: 'w', moveNumber: 2 }).node;
    tree.insertOrSelectMove({ san: 'exd4', from: 'e5', to: 'd4', color: 'b', moveNumber: 2 });
    tree.selectNode(d4.id);
    const duplicate = tree.insertOrSelectMove({ san: 'exd4', from: 'e5', to: 'd4', color: 'b', moveNumber: 2 });
    assert.equal(duplicate.created, false);
    tree.selectNode(d4.id);
    const c5 = tree.insertOrSelectMove({ san: 'c5', from: 'c7', to: 'c5', color: 'b', moveNumber: 2 }).node;
    tree.insertOrSelectMove({ san: 'Nf3', from: 'g1', to: 'f3', color: 'w', moveNumber: 3 });
    assert.deepEqual(Array.from(tree.getMainLine(), node => node.san), Array.from(mainBefore));
    assert.ok(tree.inspect().nodes.find(node => node.id === c5.id));
    assert.equal(tree.inspect().localNodeCount, 4);
});

test('RAV serialization preserves headers, main line, sibling branches, and nested branches', () => {
    const runtime = loadRuntime();
    const parsed = runtime.CaissaAnalyzeVariationTree.parseCollection(collectionPgn).games[0];
    const tree = runtime.CaissaAnalyzeVariationTree.create({ parsedGame: parsed, originalResult: '1-0' });
    tree.selectNode(tree.getMainLine()[1].id);
    const d4 = tree.insertOrSelectMove({ san: 'd4', from: 'd2', to: 'd4', color: 'w', moveNumber: 2 }).node;
    tree.insertOrSelectMove({ san: 'exd4', from: 'e5', to: 'd4', color: 'b', moveNumber: 2 });
    tree.selectNode(d4.id);
    tree.insertOrSelectMove({ san: 'd5', from: 'd7', to: 'd5', color: 'b', moveNumber: 2 });
    const exported = tree.serialize({ headers: parsed.headers, result: '1-0' });
    assert.match(exported, /1\. e4 e5 2\. Nf3[\s\S]*Nc6/);
    assert.match(exported, /\(2\. d4 exd4/);
    assert.match(exported, /\(2\.\.\. d5\)/);
    assert.match(exported, /\[White "Alpha"\]/);
    const reparsed = runtime.CaissaAnalyzeVariationTree.parseCollection(exported);
    assert.equal(reparsed.games.length, 1);
    assert.equal(reparsed.games[0].headers.Result, '1-0');
});

test('variation tree has no transport, engine, clock, or gameplay authority', () => {
    const source = read('js/analyze-variation-tree.js');
    for (const forbidden of [
        /WebSocket/, /CaissaFICSClient/, /sendCommand/, /sendMove/, /pendingMove/,
        /CaissaClockService/, /Stockfish/, /fetch\s*\(/
    ]) assert.doesNotMatch(source, forbidden);
});
