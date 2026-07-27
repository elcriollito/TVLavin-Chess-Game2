import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    getTrainerReturnTarget, TRAINER_RETURN_TARGETS
} from '../../js/endgame-trainer/v2/endgame-trainer-return-target.js';

const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
const v2Page = await readFile(new URL('../../js/endgame-trainer/v2/endgame-trainer-v2-page.js', import.meta.url), 'utf8');
const runPage = await readFile(new URL('../../js/endgame-trainer/v2/endgame-run-page.js', import.meta.url), 'utf8');
const pilotPage = await readFile(new URL('../../js/endgame-trainer/v2/multi-move-pilot-page.js', import.meta.url), 'utf8');

test('all V2 return modes resolve to the clean canonical Trainer route', () => {
    for (const mode of [
        'public-v2', 'explicit-v2', 'private-objective', 'historical-run', 'multi-move-pilot'
    ]) assert.equal(getTrainerReturnTarget(mode), '/endgame-trainer', mode);
});

test('legacy and approved Practice exits remain isolated', () => {
    assert.equal(getTrainerReturnTarget('explicit-legacy'), '/endgame-trainer?legacy=1');
    assert.equal(getTrainerReturnTarget('private-five-item-run'), '/endgame-trainer');
    assert.equal(getTrainerReturnTarget('private-five-item-run', { fromPractice: true }), '/endgame-practice');
    assert.throws(() => getTrainerReturnTarget('unknown'), /trainer-return-mode-invalid/);
    assert.deepEqual(TRAINER_RETURN_TARGETS, {
        canonical: '/endgame-trainer',
        legacy: '/endgame-trainer?legacy=1',
        practice: '/endgame-practice'
    });
});

test('visible V2 returns use the canonical destination and human label', () => {
    assert.match(html, /href="\/endgame-trainer" data-v2-exit>Return to Endgame Trainer</);
    assert.doesNotMatch(html, /data-v2-exit[^>]*legacy=1/);
    assert.doesNotMatch(html, /data-v2-href="\/endgame-trainer\?legacy=1"/);
    assert.match(html, /href="\/endgame-trainer\?legacy=1">Open Compatibility View</);
});

test('runtime returns consume the shared helper and do not generate historical aliases', () => {
    for (const source of [v2Page, runPage, pilotPage]) {
        assert.match(source, /endgame-trainer-return-target/);
        assert.doesNotMatch(source, /section=endgame(?:Trainer)?/);
    }
    assert.doesNotMatch(`${v2Page}\n${runPage}\n${pilotPage}`, /location\.assign\('\/endgame-trainer\?trainerV2=1'/);
});

test('public V2 runtime has no persistence or analytics dependency', () => {
    assert.doesNotMatch(v2Page, /localStorage|sessionStorage|indexedDB|analytics|rating|cloud/i);
});
