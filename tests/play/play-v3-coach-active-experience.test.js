import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');

test('active Coach presents Caissa above the board and keeps narration synchronized', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const panel = read('js/play/native-coach/coach-panel.js');
    const css = read('css/play-simplified-shell.css');
    assert.match(shell, /data-active-coach-narrator/);
    assert.match(shell, /sourcePortrait\.cloneNode\(true\)/);
    assert.match(panel, /caissa-coach-goddess\.png/);
    assert.match(shell, /caissa-coach-narration/);
    assert.match(panel, /caissa-coach-narration/);
    assert.match(panel, /caissa-coach-observation/);
    assert.match(css, /caissa-simplified-shell__coach-narrator/);
});

test('Coach active controls are Resign, Hint and Undo while PGN and Menu are hidden', () => {
    const shell = read('js/play/simplified-play-shell.js');
    assert.match(shell, /\['resign', 'Resign'\]/);
    assert.match(shell, /\['coach-hint', '💡 Hint'\]/);
    assert.match(shell, /\['coach-undo', '↶ Undo'\]/);
    assert.match(shell, /if \(pgn\) pgn\.hidden = coachMode/);
    assert.match(shell, /if \(menu\) menu\.hidden = coachMode/);
    assert.match(shell, /global\.requestCoachHint/);
    assert.match(shell, /global\.undoMove/);
});

test('Coach evaluation, hint and undo remain local to the existing engine game', () => {
    const app = read('app.js');
    assert.match(app, /function scheduleCoachLiveEvaluation\(\)/);
    assert.match(app, /App\.currentEvaluation\?\.fen === fen/);
    assert.match(app, /App\.boardAdapter\?\.setSelection/);
    assert.match(app, /App\.boardAdapter\?\.setLegalTargets/);
    assert.match(app, /window\.CaissaEngineRequestIsolation\?\.cancelPurpose\?\.\('opponent-move'\)/);
    assert.match(app, /window\.requestCoachHint = requestCoachHint/);
    assert.doesNotMatch(app, /requestCoachHint[\s\S]{0,1200}(?:fetch\(|WebSocket|localStorage|sessionStorage)/);
});
