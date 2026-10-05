import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    ENDGAME_ROOT_THEME,
    discoverEndgameThemes,
    endgameCount,
    endgameSelection,
    isEndgamePuzzle,
} from '../../js/endgame-trainer/puzzle-database/endgame-catalog.js';

const preview = JSON.parse(fs.readFileSync(new URL('../../public/data/puzzles/lichess-curated-preview.json', import.meta.url)));
const counts = JSON.parse(fs.readFileSync(new URL('../../public/data/puzzles/lichess-full-counts.json', import.meta.url)));

test('discovers only canonical counted material endgame themes from catalog metadata', () => {
    assert.deepEqual(discoverEndgameThemes(preview).map(theme => theme.id), [
        'rookEndgame', 'bishopEndgame', 'pawnEndgame', 'knightEndgame', 'queenEndgame',
    ]);
    for (const { id } of discoverEndgameThemes(preview)) {
        assert.ok(counts.counts[`theme:${id}`]);
        assert.equal(preview.puzzles.filter(puzzle => puzzle.themes.includes(id))
            .every(puzzle => puzzle.themes.includes(ENDGAME_ROOT_THEME)), true);
    }
});

test('root and material selections retain an explicit endgame intersection', () => {
    assert.deepEqual(endgameSelection({ target: 1700, difficulty: 'easier' }), {
        category: 'Phases', theme: 'endgame', requiredThemes: [], target: 1700, difficulty: 'easier',
    });
    assert.deepEqual(endgameSelection({ theme: 'rookEndgame', target: 1900, difficulty: 'challenge' }), {
        category: 'Phases', theme: 'rookEndgame', requiredThemes: ['endgame'], target: 1900, difficulty: 'challenge',
    });
    assert.equal(isEndgamePuzzle({ themes: ['endgame', 'rookEndgame'] }, 'rookEndgame'), true);
    assert.equal(isEndgamePuzzle({ themes: ['rookEndgame'] }, 'rookEndgame'), false);
    assert.equal(isEndgamePuzzle({ themes: ['endgame'] }, 'rookEndgame'), false);
});

test('theme counts use generated endgame intersections rather than UI constants', () => {
    const catalog = { countFor: (category, theme, target, difficulty, requiredThemes) => ({
        category, theme, target, difficulty, requiredThemes,
    }) };
    assert.deepEqual(endgameCount(catalog, 'pawnEndgame', 1800, 'normal'), {
        category: 'Phases', theme: 'pawnEndgame', target: 1800, difficulty: 'normal', requiredThemes: ['endgame'],
    });
    assert.equal(counts.counts['theme:endgame'].total, 3_061_498);
    assert.equal(counts.counts['intersection:endgame+rookEndgame'].ranges['1600:challenge:standard'], 30_888);
    assert.equal(counts.counts['theme:bishopEndgame'].total, 83_604);
    assert.equal(counts.counts['intersection:endgame+bishopEndgame'].total, 83_603);
});
