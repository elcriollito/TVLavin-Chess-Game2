import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const arena = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');

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
