import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');

test('active Coach presents Caissa responsively and keeps narration synchronized', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const panel = read('js/play/native-coach/coach-panel.js');
    const css = read('css/play-simplified-shell.css');
    assert.match(shell, /data-active-coach-narrator/);
    assert.match(shell, /sourcePortrait\.cloneNode\(true\)/);
    assert.match(panel, /caissa-coach-goddess\.png/);
    assert.match(shell, /caissa-coach-narration/);
    assert.match(shell, /data-active-coach-opening/);
    assert.match(panel, /caissa-coach-narration/);
    assert.match(panel, /caissa-coach-narration-request/);
    assert.match(panel, /caissa-coach-observation/);
    assert.match(css, /caissa-simplified-shell__coach-narrator/);
    assert.match(shell, /#syncActivePlacement\(active, coachMode\)/);
    assert.match(shell, /this\.#root\.dataset\.layout === 'desktop-split'/);
    assert.match(shell, /this\.#activeContext\.appendChild\(this\.#actionBar\)/);
    assert.match(shell, /boardStage\.appendChild\(this\.#actionBar\)/);
    assert.match(shell, /data-active-game-opening/);
    assert.match(shell, /data-active-game-moves/);
    assert.match(css, /data-layout="desktop-split"[\s\S]*caissa-simplified-shell__active-context/);
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
    assert.match(app, /function scheduleCoachLiveEvaluation\(attempt = 0\)/);
    assert.match(app, /function isCoachPlayerTurn\(\)/);
    assert.match(app, /turn === App\.playerColor/);
    assert.match(app, /caissa-simplified-shell\[data-mode="coach"\]/);
    assert.match(app, /attempt < 8/);
    assert.match(app, /App\.currentEvaluation\?\.fen === fen/);
    assert.match(app, /App\.boardAdapter\?\.setSelection/);
    assert.match(app, /App\.boardAdapter\?\.setLegalTargets/);
    assert.match(app, /App\.pendingCoachHint = true/);
    assert.match(app, /if \(App\.pendingCoachHint && App\.currentEvaluation\.bestMove\) presentCoachHint/);
    assert.match(app, /function announceCoachOpening\(opening\)/);
    assert.match(app, /function narrateCoachMove\(move, actor\)/);
    assert.match(app, /updateEvalBar\(info\.score \* 100, null\)/);
    assert.match(read('css/play-simplified-shell.css'), /caissa-coach-hint-active[\s\S]*caissa-board-legal-target::after/);
    assert.match(app, /window\.CaissaEngineRequestIsolation\?\.cancelPurpose\?\.\('opponent-move'\)/);
    assert.match(app, /window\.requestCoachHint = requestCoachHint/);
    assert.doesNotMatch(app, /requestCoachHint[\s\S]{0,1200}(?:fetch\(|WebSocket|localStorage|sessionStorage)/);
});
