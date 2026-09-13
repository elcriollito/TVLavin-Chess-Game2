import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const analyze = fs.readFileSync(new URL('../js/analyze-section.js', import.meta.url), 'utf8');
const projection = fs.readFileSync(new URL('../js/analyze-board-projection.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/analyze-v2-shell.css', import.meta.url), 'utf8');

test('M2-002 routes Analyze through one persistent presentation seam', () => {
    assert.match(projection, /caissa-board-adapter\.js/);
    assert.match(projection, /createBoardAdapter\(container/);
    assert.match(analyze, /projectAnalyzeBoard\(\{ fen, move/);
    assert.match(analyze, /renderedFen === move\.fenBefore/);
    assert.match(analyze, /this\.board\.applyMove\(move, targetFen/);
    assert.match(analyze, /this\.board\.setPosition\(targetFen/);
    assert.doesNotMatch(analyze, /Chessboard\s*\(|\.position\s*\(|\.orientation\s*\(/);
    assert.equal((html.match(/id="analyzeChessboard"/g) || []).length, 1);
    assert.match(html, /id="analyzeChessboard"[^>]*data-analyze-board-host/);
});

test('M2-002 keeps rules, navigation, engine, and setup outside the renderer', () => {
    for (const forbidden of [
        /new\s+Chess\s*\(/, /new\s+Worker\s*\(/, /loadedGame/, /currentMoveIndex/,
        /movesSan/, /movesVerbose/, /analysisResults/, /session\s*=/, /\.move\s*\(/
    ]) assert.doesNotMatch(projection, forbidden);
    assert.match(analyze, /const game = this\.getGame\(\);[\s\S]*game\.move\(\{ from, to, promotion \}\)/);
    assert.match(analyze, /currentMoveIndex = safeIndex;[\s\S]*updateBoardAndUI\(\{ reason: 'navigation' \}\)/);
    assert.match(analyze, /currentMoveIndex < loadedMoves\.length - 1[\s\S]*historical-move-rejected/);
    assert.match(projection, /setMode\(mode\)[\s\S]*mode === 'setup'/);
});

test('M2-002 exposes tap, drag, overlays, accessibility, and deliberate landscape CSS', () => {
    assert.match(projection, /onSquareTap/);
    assert.match(projection, /onMoveAttempt/);
    assert.match(projection, /onDragStart/);
    assert.match(projection, /onDragEnd/);
    assert.match(projection, /showSelection\(square, legalSquares/);
    assert.match(projection, /highlightSquares\(highlights\)/);
    assert.match(projection, /CAISSA Analyze interactive chessboard/);
    assert.match(css, /orientation:\s*landscape[\s\S]*max-height:\s*560px/);
    assert.match(css, /#analyzeChessboard\s*>\s*\.caissa-board/);
});
