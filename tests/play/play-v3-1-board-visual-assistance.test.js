import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Play board visual assistance uses one adapter-owned presentation pipeline', () => {
    const app = read('app.js');
    const adapter = read('js/play/chessboard-adapter.js');
    const css = read('css/play-simplified-shell.css');
    const legacyCss = read('styles.css');

    assert.match(app, /const legalMoves = App\.game\.moves\(\{ square, verbose: true \}\)/);
    assert.match(app, /legalMoves\.filter\(\(move\) => move\.captured\)/);
    assert.match(app, /handlePlayBoardSquareSelection\(event\.square\)/);
    assert.match(app, /setLegalTargets\(shouldShowLegalMoves\(\) \? App\.mobileTapTargets : \[\], \{/);
    assert.match(app, /captureTargets:/);
    assert.doesNotMatch(legacyCss, /#playSection #chessboard \.mobile-tap-target/);
    assert.match(adapter, /caissa-board-legal-capture/);
    assert.match(css, /caissa-board-legal-target::after/);
    assert.match(css, /caissa-board-legal-capture::after/);
});

test('last move comes from authoritative history and review keeps AnalyzeSection ownership', () => {
    const app = read('app.js');
    const analyze = read('js/analyze-section.js');

    assert.match(app, /function authoritativeOpponentLastMove\(index = App\.currentMoveIndex\)/);
    assert.match(app, /App\.playerColor === 'black' \? 'b' : App\.playerColor === 'white' \? 'w'/);
    assert.match(app, /for \(let moveIndex = Math\.min\(index, App\.moveHistory\.length - 1\); moveIndex >= 0;/);
    assert.match(app, /syncLastMovePresentation\(\)/);
    assert.match(app, /App\.boardAdapter\?\.setLastMove\(null\)/);
    assert.match(analyze, /displayedMoveIndex = showsFenBefore \? this\.currentMoveIndex - 1 : this\.currentMoveIndex/);
    assert.match(analyze, /getLoadedMoves\(\{ verbose: true \}\)\[displayedMoveIndex\]/);
    for (const duplicateOwner of ['reviewLastMoveIndex', 'reviewMoveIndex', 'coachReviewMove']) {
        assert.doesNotMatch(app + analyze, new RegExp(duplicateOwner));
    }
});

test('settings dispatch immediate presentation updates and styles define deterministic precedence', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const app = read('app.js');
    const css = read('css/play-simplified-shell.css');

    assert.match(shell, /caissa-play-visual-assistance-setting/g);
    assert.match(app, /clearLegalMovePresentation\(\)/);
    assert.match(app, /else if \(setting === 'last-move' && enabled\)/);
    assert.match(app, /!document\.body\?\.classList\?\.contains\('caissa-coach-hint-active'\)/);
    assert.match(css, /last move < selection < legal target < future arrows < Coach Hint < move feedback/);
    assert.match(css, /caissa-hide-legal-moves[\s\S]*display: none !important/);
    assert.match(css, /caissa-hide-last-move[\s\S]*display: none !important/);
    assert.match(css, /\.caissa-board-last-move::before[\s\S]*z-index: 1[\s\S]*background: rgba\(235, 180, 39, \.32\)/);
    assert.match(css, /\.caissa-board-last-move::before[\s\S]*box-shadow: inset 0 0 0 2px rgba\(255, 197, 35, \.95\)/);
    assert.match(css, /\.caissa-board-last-move > \.piece-417db[\s\S]*z-index: 2 !important/);
    assert.match(css, /\.caissa-board-last-move > \.notation-322f9[\s\S]*z-index: 3/);
});
