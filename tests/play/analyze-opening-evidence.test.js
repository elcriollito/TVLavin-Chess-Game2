import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(new URL('../../js/play/analyze-opening-evidence.js', import.meta.url), 'utf8');
const positionMap = JSON.parse(fs.readFileSync(new URL('../../public/data/eco/eco_position_map.json', import.meta.url), 'utf8')).entries;
const load = () => { const window = {}; vm.runInNewContext(source, { window, globalThis: window }); return window.CaissaAnalyzeOpeningEvidence; };
function evidence(sans, overrides = {}) {
    const game = new Chess(); let last;
    for (const san of sans) last = game.move(san);
    return load().lookup({ ply: sans.length, playedSan: last.san,
        playedUci: `${last.from}${last.to}${last.promotion || ''}`, legal: true,
        fenAfter: game.fen(), positionMap, lookupComplete: true,
        recordId: 'local-play:test', generation: 1, ...overrides });
}

test('canonical first moves have attributed repository continuations', () => {
    for (const san of ['e4', 'd4', 'c4', 'Nf3']) {
        const result = evidence([san]); assert.equal(result.ok, true, san);
        assert.match(result.eco, /^[A-E]\d{2}$/); assert(result.name); assert.equal(result.depth, 1);
    }
});
test('multiple families, final beta ply and supported continuations are recognized', () => {
    for (const line of [
        ['e4','e5','Nf3','Nc6','Bb5'], ['e4','e6','d4'], ['e4','c5'],
        ['d4','d5','c4','e6','Nc3'], ['d4','Nf6','c4','g6','Nc3','Bg7'],
        ['c4','Nf6','Nf3'], ['Nf3','d5','c4']
    ]) assert.equal(evidence(line).ok, true, line.join(' '));
    const longLine=['d4','Nf6','c4','c5','d5','e6','Nc3','exd5','cxd5','d6','e4','g6','Nf3','Bg7','Be2','O-O','O-O','a6','a4','b6'];
    assert.equal(evidence(longLine).ok, true);
    assert.equal(evidence([...longLine,'h3']).reasonCode, 'PLY_OUT_OF_WINDOW');
});
test('position lookup supports verified transposition and rejects false positions', () => {
    const transposed=evidence(['Nf3','d5','d4','Nf6'], { ply: 4 });
    assert.equal(transposed.ok, true); assert.equal(typeof transposed.transposition, 'boolean');
    assert.equal(evidence(['a3']).ok, false);
});
test('malformed, stale, missing, contradictory and generic evidence fail closed', () => {
    assert.equal(evidence(['e4'], { playedSan: '' }).reasonCode, 'SAN_INVALID');
    assert.equal(evidence(['e4'], { playedUci: 'e9e4' }).reasonCode, 'UCI_INVALID');
    assert.equal(evidence(['e4'], { stale: true }).reasonCode, 'STALE_EVIDENCE');
    assert.equal(evidence(['e4'], { positionMap: {} }).reasonCode, 'CONTINUATION_UNRECOGNIZED');
    const policy=load(), game=new Chess(); const move=game.move('e4'); const hash=policy.hashFen(game.fen());
    assert.equal(policy.lookup({ply:1,playedSan:move.san,playedUci:'e2e4',legal:true,fenAfter:game.fen(),
        positionMap:{[hash]:{eco:'bad',name:'Injected',depth:1,source:'remote'}},lookupComplete:true,
        recordId:'r',generation:1}).reasonCode,'EVIDENCE_CONTRADICTORY');
});
