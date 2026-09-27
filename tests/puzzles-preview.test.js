import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PuzzleSession, labelFor, poolFor } from '../js/puzzles/model.js';

const dataset = JSON.parse(fs.readFileSync(new URL('../public/data/puzzles/lichess-curated-preview.json', import.meta.url)));

test('curated positions preserve Lichess setup move and solve legally', () => {
    assert.ok(dataset.puzzles.length >= 1000);
    for (const puzzle of dataset.puzzles) {
        const session = new PuzzleSession(puzzle);
        assert.equal(session.index, 1, `${puzzle.id}: first move belongs to the opponent`);
        assert.notEqual(session.game.fen(), puzzle.fen);
        while (!session.solved) {
            const uci = session.moves[session.index];
            const result = session.attempt(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
            assert.ok(['correct', 'solved'].includes(result.status), puzzle.id);
        }
    }
});

test('wrong attempt leaves the position intact; reveal does not masquerade as a solve', () => {
    const puzzle = dataset.puzzles.find(entry => entry.moves.split(' ').length > 3);
    const session = new PuzzleSession(puzzle);
    const before = session.game.fen();
    assert.equal(session.attempt('a1', 'a8').status, 'illegal');
    const legalWrongMove = session.game.moves({ verbose: true }).find(move =>
        `${move.from}${move.to}${move.promotion || ''}` !== session.moves[session.index]);
    assert.ok(legalWrongMove);
    assert.equal(session.attempt(legalWrongMove.from, legalWrongMove.to, legalWrongMove.promotion).status, 'incorrect');
    assert.equal(session.game.fen(), before);
    assert.equal(session.index, 1);
    assert.ok(session.reveal().length > 0);
    assert.equal(session.solved, true);
    assert.equal(session.revealed, true);
});

test('category, theme, and difficulty filters use the selected rating range', () => {
    const category = dataset.categories.Motifs;
    const normal = poolFor(dataset.puzzles, { category, theme: 'fork', target: 1800, difficulty: 'normal' });
    assert.ok(normal.length > 0);
    assert.ok(normal.every(puzzle => puzzle.themes.includes('fork') && puzzle.rating >= 1600 && puzzle.rating <= 2000));
    const challenge = poolFor(dataset.puzzles, { category, theme: 'fork', target: 1800, difficulty: 'challenge' });
    assert.ok(challenge.length > 0);
    assert.ok(challenge.every(puzzle => puzzle.rating >= 1800 && puzzle.rating <= 2200));
    for (const [name, tags] of Object.entries(dataset.categories)) {
        assert.ok(tags.some(tag => dataset.puzzles.some(puzzle => puzzle.themes.includes(tag))), name);
    }
});

test('Goals appears between Special moves and Lengths with all four Lichess goals available', () => {
    const categories = Object.keys(dataset.categories);
    assert.deepEqual(categories.slice(categories.indexOf('Special moves'), categories.indexOf('Lengths') + 1),
        ['Special moves', 'Goals', 'Lengths']);
    assert.deepEqual(dataset.categories.Goals, ['equality', 'advantage', 'crushing', 'mate']);
    assert.equal(labelFor('mate'), 'Checkmate');
    assert.ok(dataset.puzzles.filter(puzzle => puzzle.themes.includes('equality')).length >= 30,
        'Equality needs enough variety for an initial training session');
    for (const theme of dataset.categories.Goals) {
        for (const difficulty of ['easier', 'normal', 'challenge']) {
            assert.ok(poolFor(dataset.puzzles, { category: dataset.categories.Goals, theme, target: 1800, difficulty }).length > 0,
                `${theme} needs a ${difficulty} puzzle near the initial rating target`);
        }
    }
});

test('the native preview route and dataset are separate from the ChessBase gateway', () => {
    const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)));
    assert.ok(config.rewrites.some(rule => rule.source === '/puzzles' && rule.destination === '/puzzles.html'));
    assert.ok(config.rewrites.some(rule => rule.source === '/data/:path*' && rule.destination === '/public/data/:path*'));
    assert.ok(config.rewrites.some(rule => rule.source === '/puzzles/chessbase-tactics' && rule.destination === '/tactics.html'));
    const page = fs.readFileSync(new URL('../puzzles.html', import.meta.url), 'utf8');
    assert.match(page, /id="puzzle-board"/);
    assert.match(page, /role="tab" id="tab-engine"/);
    assert.match(page, /role="tab" id="tab-themes"/);
    assert.match(page, /role="tab" id="tab-stats"/);
    assert.ok(page.indexOf('id="tab-themes"') < page.indexOf('id="tab-engine"'));
    assert.ok(page.indexOf('id="tab-engine"') < page.indexOf('id="tab-stats"'));
    assert.doesNotMatch(page, /livetactics\.chessbase\.com/);
});
