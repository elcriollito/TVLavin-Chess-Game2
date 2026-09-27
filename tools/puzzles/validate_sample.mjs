#!/usr/bin/env node
import fs from 'node:fs';
import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const samplePath = process.argv[2];
if (!samplePath) {
    console.error('Usage: node tools/puzzles/validate_sample.mjs <validation-sample.json>');
    process.exit(2);
}

const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
let setupPositionsChanged = 0;

for (const puzzle of sample.puzzles) {
    const moves = puzzle.Moves.split(' ');
    const game = new Chess(puzzle.FEN);
    const beforeSetup = game.fen();
    for (const [index, uci] of moves.entries()) {
        let move;
        try {
            move = game.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci[4] || 'q',
            });
        } catch (error) {
            throw new Error(`${puzzle.PuzzleId}: illegal UCI move ${index + 1} (${uci}): ${error.message}`);
        }
        if (!move) throw new Error(`${puzzle.PuzzleId}: illegal UCI move ${index + 1} (${uci})`);
        if (index === 0 && game.fen() !== beforeSetup) setupPositionsChanged += 1;
    }
}

if (setupPositionsChanged !== sample.puzzles.length) {
    throw new Error(`Only ${setupPositionsChanged}/${sample.puzzles.length} first moves prepared a new position`);
}

console.log(`Validated ${sample.puzzles.length} complete legal move sequences; every first UCI move prepared the rival position.`);
