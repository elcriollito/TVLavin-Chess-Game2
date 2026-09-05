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
    assert.doesNotMatch(shell, /sourcePortrait\.cloneNode\(true\)/);
    assert.match(shell, /this\.#coachPanel\.present\(/);
    assert.match(panel, /data-caissa-coach-persistent/);
    assert.match(panel, /data-caissa-coach-phase-host/);
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

test('Bots and Coach share only Resign, Hint and Undo', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const css = read('css/play-simplified-shell.css');
    assert.match(shell, /\['resign', 'Resign'\]/);
    assert.match(shell, /\['coach-hint', '💡 Hint'\]/);
    assert.match(shell, /\['coach-undo', '↶ Undo'\]/);
    assert.match(shell, /if \(pgn\) pgn\.hidden = assistedMode/);
    assert.match(shell, /if \(menu\) menu\.hidden = assistedMode/);
    assert.match(shell, /global\.requestCoachHint/);
    assert.match(shell, /global\.undoMove/);
    assert.match(shell, /\['bots', 'coach'\]\.includes\(this\.#mode\)/);
    assert.match(shell, /caissa-coach-hint-clear/);
    assert.match(shell, /previous\.textContent = ''/);
    assert.match(shell, /caissa-coach-move-annotation/);
    assert.match(shell, /#renderCoachBoardAnnotation\(\)/);
    assert.match(shell, /caissa-coach-move-symbol--\$\{annotation\.key\}/);
    assert.match(shell, /place\(evalScore, opponent\)/);
    assert.match(css, /caissa-simplified-shell__player \.eval-score-badge/);
    assert.match(css, /position: static/);
    assert.match(css, /#chessboard \.caissa-coach-move-annotation/);
    assert.match(css, /caissa-coach-move-symbol--blunder/);
});

test('assisted games expose honest CAISSA resources and utility actions', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const bots = read('js/play/bots-panel.js');
    const coach = read('js/play/native-coach/coach-panel.js');
    const css = read('css/play-simplified-shell.css');
    assert.match(shell, /data-active-opening-link/);
    assert.match(shell, /`\/eco\/\$\{current\.eco\.toUpperCase\(\)\}`/);
    assert.match(shell, /Explorer · Coming soon/);
    assert.match(shell, /disabled: ''/);
    for (const action of ['share', 'download', 'settings'])
        assert.match(shell, new RegExp(`\\['${action}'`));
    assert.match(shell, /caissa-simplified-shell__settings-dialog/);
    assert.match(shell, /Show legal moves/);
    assert.match(shell, /Highlight last move/);
    assert.match(shell, /btnDownload/);
    assert.match(css, /caissa-simplified-shell__utility-bar/);
    assert.match(bots, /caissa-color-token--\$\{item\.value\}/);
    assert.match(coach, /caissa-color-token--\$\{item\.value\}/);
    assert.match(css, /caissa-color-token--white/);
    assert.match(css, /caissa-color-token--black/);
});

test('Coach evaluation, hint and undo remain local to the existing engine game', () => {
    const app = read('app.js');
    assert.match(app, /function scheduleCoachLiveEvaluation\(attempt = 0\)/);
    assert.match(app, /function isCoachPlayerTurn\(\)/);
    assert.match(app, /turn === App\.playerColor/);
    assert.match(app, /caissa-simplified-shell\[data-mode="coach"\]/);
    assert.match(app, /attempt < 8/);
    assert.match(app, /function settleCoachLiveEvaluation\(\)/);
    assert.match(app, /info\.depth >= 12/);
    assert.match(app, /App\.engine\.start\(\)\.then/);
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
    assert.match(app, /function isAssistedLocalEngineGame\(\)/);
    assert.match(app, /caissa-coach-hint-clear/);
    assert.match(app, /App\.game\.history\(\)\.length === 0/);
    assert.match(app, /\? 20 : rawCp/);
    assert.doesNotMatch(app, /requestCoachHint[\s\S]{0,1200}(?:fetch\(|WebSocket|localStorage|sessionStorage)/);
});
