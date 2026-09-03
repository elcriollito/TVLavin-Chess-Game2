import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const context = vm.createContext({ globalThis: null }); context.globalThis = context;
vm.runInContext(fs.readFileSync(`${root}/js/play/native-coach/coach-move-review.js`, 'utf8'), context);
const review = input => context.CaissaCoachMoveReview.createReview(input);
const base = {
    playedUci: 'g1f3', playedSan: 'Nf3', bestUci: 'g1f3', bestSan: 'Nf3',
    playerColor: 'white', beforeScore: 0.3, afterScore: 0.3
};

test('Coach move review is versioned, immutable and identifies the engine choice', () => {
    assert.equal(context.CaissaCoachMoveReview.schemaVersion, '1.2.0');
    assert.equal(Object.isFrozen(context.CaissaCoachMoveReview), true);
    const result = review(base);
    assert.equal(result.reasonCode, 'BEST_MOVE');
    assert.deepEqual({ ...result.annotation }, { key: 'best', symbol: '★', label: 'Best move' });
    assert.equal(Object.isFrozen(result.annotation), true);
    assert.match(result.message, /matches my favorite move/i);
    assert.doesNotMatch(result.message, /Stockfish/i);
});

test('known opening theory receives a book mark without requiring an engine alternative', () => {
    const result = review({ playedUci: 'e2e4', playedSan: 'e4', playerColor: 'white', bookMove: true });
    assert.equal(result.reasonCode, 'BOOK_MOVE');
    assert.equal(result.annotation.key, 'book');
    assert.equal(result.annotation.symbol, '📖');
});

test('Coach says the better SAN move without exposing evaluation numbers', () => {
    const result = review({ ...base, playedUci: 'a2a3', playedSan: 'a3', bestUci: 'g1f3',
        bestSan: 'Nf3', beforeScore: 0.4, afterScore: -0.8 });
    assert.equal(result.reasonCode, 'BETTER_MOVE');
    assert.match(result.message, /I would have chosen Nf3/);
    assert.doesNotMatch(result.message, /[+-]\d|evaluation|centipawn|depth/i);
});

test('near-equivalent choices are described without calling them mistakes', () => {
    const result = review({ ...base, playedUci: 'e2e4', playedSan: 'e4', bestUci: 'd2d4',
        bestSan: 'd4', beforeScore: 0.25, afterScore: 0.12 });
    assert.equal(result.reasonCode, 'STRONG_ALTERNATIVE');
    assert.equal(result.annotation.symbol, '✓');
    assert.doesNotMatch(result.message, /mistake|blunder|better was/i);
});

test('Stockfish loss thresholds produce conservative standard chess symbols', () => {
    const input = loss => ({ ...base, playedUci: 'a2a3', playedSan: 'a3', bestUci: 'g1f3',
        bestSan: 'Nf3', beforeScore: 0.5, afterScore: 0.5 - loss });
    assert.equal(review(input(0.08)).annotation.symbol, '!');
    assert.equal(review(input(0.2)).annotation.symbol, '✓');
    assert.equal(review(input(0.5)).annotation.symbol, '?!');
    assert.equal(review(input(1.0)).annotation.symbol, '?');
    assert.equal(review(input(2.0)).annotation.symbol, '??');
    assert.equal(review(input(2.0)).reasonCode, 'BLUNDER');
});

test('loss is measured from the player perspective when playing Black', () => {
    const result = review({ ...base, playerColor: 'black', playedUci: 'a7a6', playedSan: 'a6',
        bestUci: 'g8f6', bestSan: 'Nf6', beforeScore: -0.2, afterScore: 0.8 });
    assert.equal(result.reasonCode, 'BETTER_MOVE');
});

test('opening alternatives receive extra tolerance without hiding meaningful mistakes', () => {
    const opening = loss => review({ ...base, ply: 8, playedUci: 'f1e2', playedSan: 'Be2',
        bestUci: 'c2c4', bestSan: 'c4', beforeScore: 0.4, afterScore: 0.4 - loss });
    assert.equal(opening(0.5).annotation.key, 'good');
    assert.match(opening(0.5).message, /Be2 is playable, although I slightly preferred c4/);
    assert.equal(opening(0.8).annotation.key, 'inaccuracy');
    assert.equal(opening(1.5).annotation.key, 'mistake');
    assert.equal(opening(2.8).annotation.key, 'blunder');
});

test('known ECO alternatives remain book moves and mate transitions remain decisive', () => {
    assert.equal(review({ ...base, ply: 10, playedUci: 'c2c4', playedSan: 'c4', bookMove: true })
        .annotation.key, 'book');
    const tactical = review({ ...base, ply: 6, playedUci: 'f2f3', playedSan: 'f3',
        beforeScore: 0.2, afterScore: null, afterMate: -3 });
    assert.equal(tactical.annotation.key, 'blunder');
});

test('opening loss uses the player perspective for both colors', () => {
    const white = review({ ...base, ply: 7, playedUci: 'f1e2', playedSan: 'Be2', bestUci: 'c2c4',
        bestSan: 'c4', playerColor: 'white', beforeScore: 0.4, afterScore: -0.1 });
    const black = review({ ...base, ply: 8, playedUci: 'f8e7', playedSan: 'Be7', bestUci: 'c7c5',
        bestSan: 'c5', playerColor: 'black', beforeScore: -0.4, afterScore: 0.1 });
    assert.equal(white.annotation.key, 'good');
    assert.equal(black.annotation.key, 'good');
    assert.equal(white.loss, black.loss);
});

test('malformed engine review data fails closed', () => {
    assert.equal(review({ ...base, bestUci: 'Nf3' }).reasonCode, 'INVALID_REVIEW');
    assert.equal(review({ ...base, playerColor: 'random' }).reasonCode, 'INVALID_REVIEW');
});

test('Play orchestration reviews before the opponent search and preserves local boundaries', () => {
    const app = fs.readFileSync(`${root}/app.js`, 'utf8');
    const registry = fs.readFileSync(`${root}/js/play/performance/play-load-registry.js`, 'utf8');
    assert.match(app, /const preMoveEvaluation/);
    assert.match(app, /scheduleCoachMoveReview\(move, preMoveEvaluation\)/);
    assert.match(app, /info\.depth >= 11[\s\S]*finishCoachMoveReview\(info\)/);
    assert.match(app, /if \(coachReviewState !== 'pending'\) maybeTriggerEngineMove\(\)/);
    assert.match(registry, /coach-move-review\.js\?v=1\.2\.0/);
    const reviewSource = fs.readFileSync(`${root}/js/play/native-coach/coach-move-review.js`, 'utf8');
    assert.match(reviewSource, /I would have chosen/);
    assert.match(app, /isCurrentCoachBookPosition\(\)/);
    assert.match(app, /caissa-coach-move-annotation/);
    assert.match(app, /coachMoveAnnotations/);
    assert.match(app, /afterMate: info\?\.mate,[\s\S]*ply: pending\.ply/);
    for (const forbidden of [/fetch\s*\(/, /WebSocket/, /localStorage/, /sessionStorage/, /new\s+Worker/])
        assert.doesNotMatch(reviewSource, forbidden);
});
