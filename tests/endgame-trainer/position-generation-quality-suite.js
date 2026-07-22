import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { validateEndgamePosition } from '../../js/endgame-trainer/endgame-position-validator.js';
import { validateEndgameTheme } from '../../js/endgame-trainer/endgame-theme-validator.js';

const curriculum = createEndgameCurriculum();
const lessons = curriculum.getPaths().flatMap(path => curriculum.getPath(path.id).lessons.map(lesson => ({ pathId: path.id, lesson })));
const report = { requested: 100, accepted: 0, rejectedDuringSearch: 0, rejectionReasons: {}, impossible: 0, themeMismatches: 0, instantlyLostOrTrivial: 0 };

for (const { pathId, lesson } of lessons) {
    for (let sample = 0; sample < 5; sample += 1) {
        const options = curriculum.resolveTrainingOptions(pathId, lesson.id);
        const selection = selectBestEndgameCandidate({ ...options, seed: `season-8.1.1:${lesson.id}:${sample}` });
        if (!selection.ok) throw new Error(`${lesson.id}:${sample}:${selection.error.code}`);
        for (const [reason, count] of Object.entries(selection.rejectionSummary)) {
            report.rejectionReasons[reason] = (report.rejectionReasons[reason] ?? 0) + count;
            report.rejectedDuringSearch += count;
        }
        const candidate = selection.selected;
        const legal = validateEndgamePosition(candidate.fen, { categoryId: options.categoryId, strongSide: candidate.metadata.strongSide });
        const theme = validateEndgameTheme(candidate.fen, { categoryId: options.categoryId, strongSide: candidate.metadata.strongSide, studentColor: 'white', enforceWhiteBeta: true, theme: options.lesson.theme, trainingRole: options.lesson.trainingRole, features: candidate.features, scoring: candidate.scoring });
        if (!legal.valid) report.impossible += 1;
        if (!theme.valid) report.themeMismatches += 1;
        if (!candidate.scoring.accepted || candidate.features.terminal || candidate.features.immediateMateCount || candidate.features.uniquePromotionOpportunityCount) report.instantlyLostOrTrivial += 1;
        report.accepted += 1;
    }
}

console.log(JSON.stringify(report, null, 2));
if (report.accepted !== report.requested || report.impossible || report.themeMismatches || report.instantlyLostOrTrivial) process.exitCode = 1;
