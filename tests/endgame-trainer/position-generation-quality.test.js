import test from 'node:test';
import assert from 'node:assert/strict';
import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { validateEndgamePosition } from '../../js/endgame-trainer/endgame-position-validator.js';
import { validateEndgameTheme } from '../../js/endgame-trainer/endgame-theme-validator.js';

const curriculum = createEndgameCurriculum();
const lessons = curriculum.getPaths().flatMap(path => curriculum.getPath(path.id).lessons.map(lesson => ({ pathId: path.id, lesson })));

test('100 seeded beta positions pass legality and their selected lesson theme', () => {
    let generated = 0;
    for (const { pathId, lesson } of lessons) {
        for (let sample = 0; sample < 5; sample += 1) {
            const options = curriculum.resolveTrainingOptions(pathId, lesson.id);
            const selection = selectBestEndgameCandidate({ ...options, seed: `season-8.1.1:${lesson.id}:${sample}` });
            assert.equal(selection.ok, true, `${lesson.id}:${sample} must produce an instructional candidate`);
            const candidate = selection.selected;
            assert.equal(candidate.metadata.sideToMove, 'white');
            assert.equal(options.userColor, 'white');
            assert.equal(validateEndgamePosition(candidate.fen, { categoryId: options.categoryId, strongSide: candidate.metadata.strongSide }).valid, true);
            const theme = validateEndgameTheme(candidate.fen, {
                categoryId: options.categoryId,
                strongSide: candidate.metadata.strongSide,
                studentColor: options.userColor,
                enforceWhiteBeta: true,
                theme: options.lesson.theme,
                trainingRole: options.lesson.trainingRole,
                features: candidate.features,
                scoring: candidate.scoring
            });
            assert.equal(theme.valid, true, `${lesson.id}:${sample} ${theme.errors.join(',')}`);
            assert.equal(candidate.scoring.accepted, true);
            assert.equal(candidate.features.terminal, false);
            assert.equal(candidate.features.immediateMateCount, 0);
            assert.equal(candidate.features.uniquePromotionOpportunityCount, 0);
            generated += 1;
        }
    }
    assert.equal(generated, 100);
});

test('debug audit records accepted and rejected positions with required context', () => {
    const events = [];
    const options = curriculum.resolveTrainingOptions('rook-essentials', 'rook-behind-pawn');
    const selection = selectBestEndgameCandidate({ ...options, candidateCount: 3, seed: 'debug-log', debugLogger: event => events.push(event) });
    assert.equal(selection.ok, true);
    assert.ok(events.some(event => event.status === 'Accepted Position'));
    assert.ok(events.some(event => event.status === 'Rejected Position'));
    for (const event of events) {
        assert.ok(Object.hasOwn(event, 'reason'));
        assert.ok(Object.hasOwn(event, 'theme'));
        assert.ok(Object.hasOwn(event, 'evaluation'));
    }
});
