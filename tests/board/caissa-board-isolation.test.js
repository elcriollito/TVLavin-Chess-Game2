import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

async function collectFiles(directory, predicate) {
    const output = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) output.push(...await collectFiles(path, predicate));
        else if (predicate(path)) output.push(path);
    }
    return output;
}

test('foundation adds no Chessground or cm-chessboard dependency', async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    assert.equal(packages['@lichess-org/chessground'], undefined);
    assert.equal(packages.chessground, undefined);
    assert.equal(packages['cm-chessboard'], undefined);
});

test('Play, Analyze, PGN and non-pilot FICS sources do not import the foundation', async () => {
    const approvedFicsPilot = resolve(root, 'js/fics-board-view.js');
    const candidates = [
        resolve(root, 'index.html'),
        resolve(root, 'app.js'),
        ...await collectFiles(resolve(root, 'js/play'), path => path.endsWith('.js')),
        ...await collectFiles(resolve(root, 'js/pgn-replayer'), path => path.endsWith('.js')),
        ...await collectFiles(resolve(root, 'js'), path => /[\\/](?:fics|analyze)[^\\/]*\.js$/i.test(path))
    ];
    for (const path of candidates) {
        if (path === approvedFicsPilot) continue;
        const source = await readFile(path, 'utf8');
        assert.doesNotMatch(source, /js\/board\/caissa-|board\/caissa-board-adapter/i, path);
        assert.doesNotMatch(source, /tests\/fixtures\/caissa-board/i, path);
    }
});

test('FICS Observe pilot is the only approved product import seam for the adapter', async () => {
    const source = await readFile(resolve(root, 'js/fics-board-view.js'), 'utf8');
    assert.match(source, /const ADAPTER_URL = '\/js\/board\/caissa-board-adapter\.js'/);
    assert.match(source, /import\(ADAPTER_URL\)/);
    assert.doesNotMatch(source, /js\/board\/(?:caissa-board-state|caissa-persistent-renderer)\.js/);
});

test('renderer runtime imports stay inside the CAISSA board presentation boundary', async () => {
    const runtimeFiles = await collectFiles(resolve(root, 'js/board'), path => path.endsWith('.js'));
    for (const path of runtimeFiles) {
        const source = await readFile(path, 'utf8');
        const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
        assert.ok(imports.every(specifier => specifier.startsWith('./')), `${path}: ${imports.join(', ')}`);
        assert.doesNotMatch(source, /Chessboard\(|global\.Chessboard|Stockfish|WebSocket|fetch\(/, path);
    }
});
