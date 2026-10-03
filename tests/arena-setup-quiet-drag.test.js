import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

test('Arena Setup reuses the canonical Quiet Drag adapter only for the editor', () => {
    const html = read('index.html');
    const arena = read('js/caissa-arena.js');
    const adapter = read('js/board/caissa-legacy-quiet-drag-adapter.js');
    assert.equal((html.match(/caissa-legacy-quiet-drag\.css/g) || []).length, 1);
    assert.match(arena, /ARENA_SETUP_QUIET_DRAG_URL\s*=\s*'\/js\/board\/caissa-legacy-quiet-drag-adapter\.js'/);
    assert.match(arena, /mode:\s*'position-editor'/);
    assert.match(arena, /quietDragModule\.create\(this\.elements\.setupBoard/);
    assert.doesNotMatch(arena, /class\s+CaissaArenaQuietDrag/);
    assert.match(adapter, /new CaissaPointerController/);
    assert.match(adapter, /pieceId/);
});

test('live Arena remains read-only and Setup owns arbitrary position editing', () => {
    const arena = read('js/caissa-arena.js');
    assert.match(arena, /draggable:\s*false,\s*\/\/ Arena boards are view-only/);
    assert.match(arena, /dropOffBoard:\s*'snapback'/);
    assert.match(arena, /onManualSetupQuietDrop\(source, target, metadata/);
    assert.match(arena, /delete position\[source\];[\s\S]*position\[target\] = piece/);
    assert.match(arena, /setupDraftFen/);
    assert.match(arena, /setupFenSyncCount/);
    assert.match(arena, /candidate\.load\(fen\)/);
});

test('Setup lifecycle tears down adapter and board and gates the lab to loopback', () => {
    const arena = read('js/caissa-arena.js');
    assert.match(arena, /setupQuietDragAdapter\?\.destroy\?\.\(\)/);
    assert.match(arena, /setupBoardInstance\?\.destroy\?\.\(\)/);
    assert.match(arena, /\['127\.0\.0\.1', 'localhost', '::1'\]/);
    assert.match(arena, /setup-quiet-drag-lab/);
    assert.match(arena, /requestAnimationFrame\(\(\) => this\.openManualSetup\(\)\)/);
});

test('modern Arena controls and certified provider path remain present', () => {
    const html = read('index.html');
    const arena = read('js/caissa-arena.js');
    const registry = read('js/engine-registry.js');
    for (const label of ['Advanced Match Options', 'Opening mode', 'Flip Board', 'Save PGN', 'Swap Colors']) {
        assert.match(html, new RegExp(label));
    }
    assert.match(arena, /arenaMoveDelay/);
    assert.match(registry, /stockfish-18-lite/);
    assert.match(registry, /stockfish-19-lite/);
});
