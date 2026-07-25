import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
const entry = await readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../../js/endgame-trainer/v2/endgame-trainer-v2-page.js', import.meta.url), 'utf8');

test('V2 shell is present but hidden for default and cold V1 loads', () => {
    assert.match(html, /data-endgame-v2-shell hidden/);
    assert.match(html, />Start Challenge</);
    assert.doesNotMatch(html.match(/data-endgame-v2-shell[\s\S]*?<\/section>/)?.[0] || '', /Prepare Position/);
    assert.match(entry, /shouldActivateEndgameV2/);
    assert.match(entry, /mountEndgameTrainerPage\(\)/);
});

test('accessible modes surface contains four non-duplicated destinations and close control', () => {
    assert.equal((html.match(/data-v2-mode="/g) || []).length, 3);
    assert.match(html, /data-v2-close-modes aria-label="Close modes"/);
    assert.match(html, /Endgame Run/);
    assert.match(html, /Coming later/);
    assert.match(page, /dialog\?\.addEventListener\('close'/);
    assert.match(page, /opener\?\.focus/);
    assert.match(page, /activeSession/);
});

test('V2 creates one board adapter and does not import engine or persistence modules', () => {
    assert.equal((page.match(/new EndgameBoardView/g) || []).length, 1);
    assert.doesNotMatch(page, /Stockfish|safe-engine|progress-store|training-memory|localStorage/);
    assert.match(html, /Results stay on this page/);
    assert.match(html, /data-v2-summary/);
    assert.match(html, /data-v2-replay/);
});
