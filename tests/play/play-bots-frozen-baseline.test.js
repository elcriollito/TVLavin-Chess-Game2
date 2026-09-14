import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const read = file => fs.readFileSync(`${process.cwd()}/${file}`, 'utf8');
const sha256 = file => crypto.createHash('sha256').update(read(file).replace(/\r\n/g, '\n')).digest('hex');

test('COACH-GUARD-001 keeps the direct Play and Bots setup owners byte-identical to production', () => {
    const productionOwners = new Map([
        ['js/play/games-panel.js', 'b65c35eab85e217dbbf2e4deda5d60a3e83cdd014702951a931a7ac12295d46d'],
        ['js/play/bots-panel.js', '5775e49868f9f0bdf681ed739267496bb46283529e62050a9f47e5f8c74e9b1e']
    ]);
    for (const [file, digest] of productionOwners) assert.equal(sha256(file), digest, file);
});

test('COACH-GUARD-001 records all four physical mobile reference viewports for both frozen modes', async () => {
    const { PLAY_BOTS_FROZEN_MOBILE_BASELINE: baseline } = await import(
        '../browser/fixtures/play-bots-frozen-mobile-baseline.js');
    assert.equal(baseline.source.originMainSha, '1ec19ae9abcb3d5afee9c446e6eaaf871c895ab1');
    assert.deepEqual(Object.keys(baseline.play.boxes), ['390x844', '430x932', '844x390', '932x430']);
    assert.deepEqual(Object.keys(baseline.bots.boxes), ['390x844', '430x932', '844x390', '932x430']);
    assert.deepEqual(Object.keys(baseline.play.webkitBoxes), ['390x844', '430x932', '844x390', '932x430']);
    assert.deepEqual(Object.keys(baseline.bots.webkitBoxes), ['390x844', '430x932', '844x390', '932x430']);
    assert.equal(baseline.play.mode, 'games');
    assert.equal(baseline.bots.mode, 'bots');
});

test('Coach composition remains mode-scoped at the shared shell boundary', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const css = read('css/play-coach-review.css');
    assert.match(shell, /this\.#mode === 'coach'/);
    assert.match(shell, /mode === 'coach' \? phaseActionSlot : boardStage/);
    assert.match(shell, /this\.#coachPanel\?\.setMobilePhaseShell\?\.\(coachPhone\)/);
    assert.match(css, /\[data-mode="coach"\]\[data-layout\^="phone-"\]/);
    assert.doesNotMatch(css, /\[data-mode="(?:games|bots)"\]/);
});
