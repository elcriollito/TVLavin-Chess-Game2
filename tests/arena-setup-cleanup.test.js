import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const arena = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');
const registry = fs.readFileSync(new URL('../js/engine-registry.js', import.meta.url), 'utf8');

function method(name, nextName) {
    const start = arena.indexOf(`    ${name}(`);
    const end = arena.indexOf(`    ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `${name} must exist before ${nextName}`);
    return arena.slice(start, end);
}

test('applied FEN is validated before live/setup state changes', () => {
    const apply = method('applyArenaPosition', 'setFenMessage');
    const validation = apply.indexOf('candidate.load');
    const stateChange = apply.indexOf('this.state.customStartFen = normalizedFen');
    assert.ok(validation >= 0 && stateChange > validation);
    assert.match(apply, /if \(candidate\.load\(String\(fen \|\| ''\)\.trim\(\)\) === false\) return false/);
    assert.match(apply, /this\.state\.customStartFen = normalizedFen/);
    assert.match(apply, /this\.resetBoard\(\)/);
});

test('visual board receives piece placement while Chess state retains full FEN', () => {
    const update = method('updateBoardPosition', 'getBoardPlacement');
    const placement = method('getBoardPlacement', 'resetBoard');
    const resetStart = arena.indexOf('    resetBoard()');
    const reset = arena.slice(resetStart, arena.indexOf('\n    }\n};', resetStart));
    assert.match(update, /this\.board\.position\(this\.getBoardPlacement\(fen\), false\)/);
    assert.match(placement, /split\(\/\\s\+\/\)\[0\]/);
    assert.match(reset, /this\.game\.load\(this\.state\.customStartFen\)/);
    assert.match(reset, /this\.board\.position\(this\.getBoardPlacement\(this\.game\?\.fen\(\)\), false\)/);
    assert.match(arena, /position: this\.getBoardPlacement\(this\.game\?\.fen\(\)\)/);
});

test('manual setup supports drag and accessible click-click relocation without game moves', () => {
    const open = method('openManualSetup', 'closeManualSetup');
    const activate = method('activateManualSetupSquare', 'onManualSetupDragStart');
    const drop = method('onManualSetupDrop', 'getSetupPieceLabel');
    const accessibility = method('refreshManualSetupSquares', 'clearManualSetup');
    assert.match(open, /draggable: true/);
    assert.match(open, /onDragStart:/);
    assert.match(open, /onDrop:/);
    assert.match(activate, /position\[square\] = movedPiece/);
    assert.match(activate, /delete position\[source\]/);
    assert.match(drop, /return 'snapback'/);
    assert.match(accessibility, /squareElement\.tabIndex = 0/);
    assert.match(accessibility, /setAttribute\('aria-pressed'/);
    assert.doesNotMatch(`${activate}\n${drop}`, /this\.game\.(?:move|load|undo)|runtimeManager|startTournament|runEngineLoop/);
});

test('manual setup keeps explicit turn and castling controls authoritative', () => {
    const apply = method('applyManualSetup', 'renderEngineSelectors');
    assert.match(apply, /const turn = this\.elements\.setupTurn\?\.value \|\| 'w'/);
    assert.match(apply, /setupCastleWK\?\.checked/);
    assert.match(apply, /setupCastleWQ\?\.checked/);
    assert.match(apply, /setupCastleBK\?\.checked/);
    assert.match(apply, /setupCastleBQ\?\.checked/);
    assert.match(apply, /generateFENFromPosition\(position\)/);
    assert.match(apply, /this\.applyArenaPosition\(candidate\.fen\(\), 'Manual position'\)/);
});

test('standard Arena providers are capability-filtered and Fairy remains owned by Variants', () => {
    assert.match(registry, /'fairy-stockfish': \{/);
    assert.match(registry, /productOwner: 'caissa-variants'/);
    assert.match(registry, /chessFamilies: 'non-standard'/);
    assert.match(registry, /\.filter\(provider => provider\.supportsStandardArena === true\)/);
    assert.doesNotMatch(registry, /const ARENA_PROVIDER_IDS = Object\.freeze\(\[\s*'stockfish'/);
});
