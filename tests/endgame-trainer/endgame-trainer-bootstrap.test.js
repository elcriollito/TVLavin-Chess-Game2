import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../css/endgame-trainer.css', import.meta.url), 'utf8');
const entry = await readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');

test('document begins in a neutral pending mode before any script can run', () => {
    assert.match(html, /class="endgame-trainer-page is-empty trainer-mode-pending caissa-trainer-sidebar-host"/);
    assert.match(html, /data-state="pending"/);
    assert.match(html, /data-trainer-bootstrap/);
    assert.match(html, /Loading Endgame Trainer…/);
    assert.ok(
        html.indexOf('trainer-mode-pending') < html.indexOf('endgame-trainer-page.js'),
        'pending state must be present before the module entrypoint'
    );
});

test('blocking stylesheet hides every interactive view while mode is pending', () => {
    assert.match(css, /\.endgame-trainer-page\.trainer-mode-pending \.endgame-trainer-page__header/);
    assert.match(css, /\.endgame-trainer-page\.trainer-mode-pending \.endgame-trainer-page__workspace/);
    assert.match(css, /\.endgame-trainer-page\.trainer-mode-pending > dialog/);
    assert.doesNotMatch(css, /trainer-mode-pending[^{]*\{[^}]*opacity\s*:\s*0/);
    assert.match(css, /\.endgame-trainer-page__bootstrap \{ min-height:/);
});

test('resolved presentation is revealed only after its mount completes', () => {
    assert.match(entry, /await mountEndgameTrainerV2Page\(\{ route \}\);\s*revealEndgameTrainerPresentation\('v2'\)/);
    assert.match(entry, /await mountEndgameTrainerPage\(\);\s*revealEndgameTrainerPresentation\('legacy'\)/);
    assert.match(entry, /classList\.remove\('trainer-mode-pending'/);
    assert.match(entry, /data-trainer-bootstrap/);
});

test('no-JS and technical failure remain honest without exposing legacy', () => {
    assert.match(html, /requires JavaScript to load the interactive board/);
    assert.match(html, /data-trainer-bootstrap],\.endgame-trainer-page__workspace/);
    assert.match(entry, /renderEndgameTrainerLoadError/);
    assert.match(entry, /root\.classList\.remove\('trainer-mode-pending'/);
});
