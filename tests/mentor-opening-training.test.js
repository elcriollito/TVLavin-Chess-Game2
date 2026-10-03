import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { prepareOpeningLine, createOpeningTraining } from '../js/mentor/mentor-opening-training.js';

const snapshot = { rootFen: new Chess().fen(), title: 'Explicit line', source: 'explorer', moves: ['e4', 'e5', 'Nf3', 'Nc6'] };

test('line validation is atomic/legal/bounded and rejects missing roots and invented continuations', () => {
    const training = createOpeningTraining();
    training.load(snapshot);
    assert.equal(training.read().total, 4);
    assert.throws(() => training.load({ ...snapshot, moves: ['e4', 'e4'] }));
    assert.equal(training.read().total, 4);
    assert.throws(() => prepareOpeningLine({ moves: ['e4'] }));
    assert.throws(() => prepareOpeningLine({ ...snapshot, moves: [] }));
    assert.throws(() => prepareOpeningLine({ ...snapshot, moves: Array(513).fill('e4') }));
    assert.ok(Object.isFrozen(prepareOpeningLine(snapshot).moves[0]));
});

test('White guesses selected turns and only explicit Black moves are automatic; future SAN stays hidden', () => {
    const training = createOpeningTraining();
    training.load(snapshot);
    assert.equal(training.start('white'), true);
    assert.equal(training.read().visibleMoves.length, 0);
    assert.equal(training.automatic(), null);
    assert.equal(training.guess({ from: 'e2', to: 'e4' }).correct, true);
    assert.equal(training.read().phase, 'next');
    training.next();
    assert.equal(training.automatic().san, 'e5');
    assert.equal(training.automatic(), null);
    assert.deepEqual(training.read().visibleMoves.map(move => move.san), ['e4', 'e5']);
    assert.equal(training.guess({ from: 'g1', to: 'f3' }).correct, true);
    training.next();
    assert.equal(training.automatic().san, 'Nc6');
    assert.equal(training.read().phase, 'complete');
});

test('Black first consumes White from known line; Both never invents automatic responses', () => {
    const black = createOpeningTraining();
    black.load(snapshot);
    black.start('black');
    assert.equal(black.automatic().san, 'e4');
    assert.equal(black.automatic(), null);
    black.guess({ from: 'e7', to: 'e5' });
    black.next();
    assert.equal(black.automatic().san, 'Nf3');
    black.guess({ from: 'b8', to: 'c6' });
    assert.equal(black.read().phase, 'complete');
    const both = createOpeningTraining();
    both.load(snapshot);
    both.start('both');
    assert.equal(both.automatic(), null);
    both.guess({ from: 'e2', to: 'e4' });
    both.next();
    assert.equal(both.automatic(), null);
    assert.equal(both.read().step, 1);
});

test('wrong/retry never advances; correct feedback describes the line, not move quality; next cannot skip unknown user moves', () => {
    const training = createOpeningTraining();
    training.load(snapshot);
    training.start('both');
    assert.equal(training.guess({ from: 'd2', to: 'd4' }).correct, false);
    assert.equal(training.read().step, 0);
    assert.match(training.read().feedback.text, /in this opening line/);
    assert.equal(training.retry(), true);
    assert.equal(training.read().feedback, null);
    assert.equal(training.next(), false);
    training.illegal();
    assert.match(training.read().feedback.text, /not legal/);
    training.guess({ from: 'e2', to: 'e4' });
    assert.match(training.read().feedback.text, /correct for this line/);
    assert.equal(training.retry(), false);
});

test('arbitrary Black-to-move root and promotion choice are preserved without relying on board orientation', () => {
    const training = createOpeningTraining();
    training.load({ rootFen: '4k3/8/8/8/8/8/p7/7K b - - 0 37', source: 'explorer', moves: ['a1=Q+'] });
    assert.equal(training.start('white'), false);
    assert.equal(training.start('black'), true);
    assert.equal(training.guess({ from: 'a2', to: 'a1', promotion: 'r' }).correct, false);
    assert.equal(training.read().step, 0);
    assert.equal(training.guess({ from: 'a2', to: 'a1', promotion: 'Q' }).correct, true);
    assert.equal(training.read().visibleMoves[0].before.split(' ')[5], '37');
    assert.equal(training.read().phase, 'complete');
});

test('preview, stop-to-study, clear and immutable read do not persist or award ratings', () => {
    const training = createOpeningTraining();
    training.load(snapshot, 2);
    assert.equal(training.read().previewIndex, 2);
    assert.equal(training.preview(3).length, 3);
    training.start();
    assert.equal(training.preview(4), null);
    assert.ok(Object.isFrozen(training.read().visibleMoves));
    training.study();
    assert.equal(training.read().phase, 'study');
    assert.equal(training.read().visibleMoves.length, 4);
    training.clear();
    assert.equal(training.read().phase, 'empty');
    assert.equal(training.guess({ from: 'e2', to: 'e4' }), null);
    const source = fs.readFileSync(new URL('../js/mentor/mentor-opening-training.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /fetch\(|localStorage|EngineAdapter|setTimeout|board\.create/);
});
