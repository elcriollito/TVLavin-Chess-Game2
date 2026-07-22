import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';

const curriculum = createEndgameCurriculum(), lessons = curriculum.getSnapshot().paths.flatMap(path => path.lessons.map(lesson => ({ pathId: path.id, lesson }))).filter(item => [3, 4, 5].includes(item.lesson.pieceCount));
const report = { total: 0, byPieceCount: { 3: 0, 4: 0, 5: 0 }, templates: 0, reflected: 0, colorSwaps: 0, inconsistencies: [] };
for (const pieceCount of [3, 4, 5]) {
    const pool = lessons.filter(item => item.lesson.pieceCount === pieceCount);
    for (let index = 0; index < 100; index += 1) {
        const { pathId, lesson } = pool[index % pool.length], options = curriculum.resolveTrainingOptions(pathId, lesson.id);
        const reflectTemplate = pieceCount === 5 && index % 2 === 1;
        const selection = selectBestEndgameCandidate({ ...options, seed: `season-8.1.5:${lesson.id}:${index}`, generatorOptions: { ...options.generatorOptions, ...(pieceCount === 5 ? { reflectTemplate } : {}) } });
        if (!selection.ok) throw new Error(`${lesson.id}:${index}:${selection.error.code}`);
        const candidate = selection.selected, pieces = ChessRulesFacade.fromFen(candidate.fen).pieces(), expectedStrong = lesson.trainingRole === 'defense' ? 'black' : 'white';
        const errors = [];
        if (options.userColor !== 'white' || candidate.metadata.sideToMove !== 'white') errors.push('white-beta-role');
        if (candidate.metadata.strongSide !== expectedStrong) errors.push('strong-side-role');
        if (pieceCount === 5) {
            const pawn = pieces.find(piece => piece.type === 'p'); if (pawn?.color !== candidate.metadata.strongSide) errors.push('pawn-owner');
            if (candidate.metadata.source === 'template') report.templates += 1; if (candidate.metadata.reflected) report.reflected += 1;
            if (candidate.metadata.strongSide !== (reflectTemplate ? 'black' : 'white')) report.colorSwaps += 1;
        }
        if (errors.length) report.inconsistencies.push({ fen: candidate.fen, lessonId: lesson.id, theme: lesson.theme, studentColor: options.userColor, sideToMove: candidate.metadata.sideToMove, strongSide: candidate.metadata.strongSide, defendingSide: candidate.metadata.strongSide === 'white' ? 'black' : 'white', templateId: candidate.metadata.id ?? null, reflectionApplied: Boolean(candidate.metadata.reflected), colorSwapApplied: candidate.metadata.strongSide !== expectedStrong, errors });
        report.total += 1; report.byPieceCount[pieceCount] += 1;
    }
}
console.log(JSON.stringify(report, null, 2));
if (report.total !== 300 || report.inconsistencies.length) process.exitCode = 1;
