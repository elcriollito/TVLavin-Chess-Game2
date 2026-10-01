import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { parseEcoCatalog, prepareEcoLesson } from '../js/mentor/mentor-openings.js';
const source = JSON.parse(fs.readFileSync(new URL('../data/eco/eco_codes.json', import.meta.url), 'utf8'));
const catalog = parseEcoCatalog(source);

test('shared ECO catalog preserves all entries and admits only fully legal lines', () => {
    assert.equal(catalog.length, source.length);
    assert.equal(catalog.filter(entry => !entry.playable).length, 19);
    for (const entry of catalog) {
        if (!entry.playable) { assert.throws(() => prepareEcoLesson(entry)); continue; }
        const lesson = prepareEcoLesson(entry), game = new Chess();
        assert.equal(lesson.positions.length, lesson.moves.length + 1);
        assert.equal(lesson.notes.length, lesson.positions.length);
        lesson.moves.forEach((move, index) => { game.move(move); assert.equal(game.fen(), lesson.positions[index + 1]); });
    }
});

test('Ruy Lopez and Sicilian use the existing ECO moves and actual side to move', () => {
    const ruy = prepareEcoLesson(catalog.find(entry => entry.code === 'C60'));
    assert.deepEqual(ruy.moves.map(move => move.san), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    assert.equal(new Chess(ruy.positions.at(-1)).turn(), 'b');
    const sicilian = catalog.find(entry => entry.code === 'B20');
    assert.equal(sicilian.group, 'e4'); assert.equal(prepareEcoLesson(sicilian).moves.length, 2);
});

test('corrupt schema, duplicate code and illegal partial line cannot become loadable openings', () => {
    assert.throws(() => parseEcoCatalog({}));
    assert.throws(() => parseEcoCatalog([source[0], source[0]]));
    assert.throws(() => parseEcoCatalog([{ code: 'Z99', name: 'Bad', moves: '1. e4' }]));
    const bad = parseEcoCatalog([{ code: 'A00', name: 'Bad line', moves: '1. e4 e5 2. Ke8' }])[0];
    assert.equal(bad.playable, false); assert.throws(() => prepareEcoLesson(bad));
});

test('catalog snapshots are detached from mutable source input', () => {
    const raw = [{ code: 'B20', name: 'Sicilian Defense', moves: '1. e4 c5' }];
    const result = parseEcoCatalog(raw); raw[0].name = 'Changed';
    assert.equal(result[0].name, 'Sicilian Defense');
    assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result[0].san));
});
