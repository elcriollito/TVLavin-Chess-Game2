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

test('4TN7E preserves a2-a4 as move zero and allows Black en passant', () => {
    const puzzle = dataset.puzzles.find(entry => entry.id === '4TN7E');
    const session = new PuzzleSession(puzzle);
    assert.deepEqual({ from: session.setupMove.from, to: session.setupMove.to, san: session.setupMove.san },
        { from: 'a2', to: 'a4', san: 'a4' });
    assert.equal(session.setupFen.split(' ')[3], 'a3', 'the setup FEN must preserve the en-passant target');
    const result = session.attempt('b4', 'a3');
    assert.equal(result.status, 'correct');
    assert.equal(result.moves[0].flags.includes('e'), true);
    assert.equal(session.game.get('a4'), undefined);
});

test('setup highlighting and en passant also work when White is the capturing side', () => {
    const puzzle = dataset.puzzles.find(entry => entry.id === 'G0HRE');
    const session = new PuzzleSession(puzzle);
    assert.deepEqual({ from: session.setupMove.from, to: session.setupMove.to, san: session.setupMove.san },
        { from: 'f7', to: 'f5', san: 'f5' });
    assert.equal(session.setupFen.split(' ')[3], 'f6');
    const result = session.attempt('e5', 'f6');
    assert.equal(result.status, 'correct');
    assert.equal(result.moves[0].flags.includes('e'), true);
    assert.equal(session.game.get('f5'), undefined);
});

test('all four explicit promotion choices are accepted without an incidental failure', () => {
    for (const promotion of ['q', 'r', 'b', 'n']) {
        const session = new PuzzleSession({
            id: `promo-${promotion}`, fen: '7k/P7/8/8/7p/8/8/7K b - - 0 1',
            moves: `h4h3 a7a8${promotion}`, themes: ['promotion'], rating: 1800,
        });
        const result = session.attempt('a7', 'a8', promotion);
        assert.equal(result.status, 'solved', promotion);
        assert.equal(result.moves[0].promotion, promotion);
    }
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

test('the native preview route replaces the retired ChessBase gateway', () => {
    const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)));
    assert.ok(config.rewrites.some(rule => rule.source === '/puzzles' && rule.destination === '/puzzles.html'));
    assert.ok(config.rewrites.some(rule => rule.source === '/data/:path*' && rule.destination === '/public/data/:path*'));
    assert.ok(config.redirects.some(rule => rule.source === '/puzzles/chessbase-tactics' && rule.destination === '/puzzles' && rule.permanent));
    const page = fs.readFileSync(new URL('../puzzles.html', import.meta.url), 'utf8');
    assert.match(page, /id="puzzle-board"/);
    assert.match(page, /role="tab" id="tab-training"[^>]*>Training<\/button>/);
    assert.match(page, /role="tab" id="tab-themes"/);
    assert.match(page, /role="tab" id="tab-stats"/);
    assert.match(page, /id="tab-stats"[^>]*>Progress<\/button>/);
    assert.ok(page.indexOf('id="tab-themes"') < page.indexOf('id="tab-training"'));
    assert.ok(page.indexOf('id="tab-training"') < page.indexOf('id="tab-stats"'));
    assert.match(page, /id="panel-training"[\s\S]*id="move-list"[\s\S]*id="engine-toggle"[\s\S]*id="continue-position"[\s\S]*id="engine-match-start"[\s\S]*id="review-start"/);
    assert.match(page, /id="engine-toggle"[^>]*>Analyze with Stockfish<\/button>/);
    assert.deepEqual([...page.matchAll(/data-promotion="([qrbn])"/g)].map(match => match[1]), ['q', 'r', 'b', 'n']);
    assert.doesNotMatch(fs.readFileSync(new URL('../js/puzzles/page.js', import.meta.url), 'utf8'), /window\.prompt/);
    assert.match(page, /id="panel-stats"[\s\S]*id="progress-puzzle-id"[\s\S]*id="progress-themes"[\s\S]*id="session-rating"/);
    assert.doesNotMatch(page, /livetactics\.chessbase\.com/);
});
