import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { createMoveCoaching, createProgressiveHint } from '../../js/endgame-trainer/endgame-coach.js';

const curriculum = createEndgameCurriculum();
const targets = [
    ['pawn-foundations', 'pawn-opposition'], ['pawn-foundations', 'pawn-key-squares'],
    ['pawn-foundations', 'pawn-king-activity'], ['pawn-foundations', 'pawn-breakthrough'],
    ['defensive-technique', 'defense-stop-promotion'], ['rook-essentials', 'rook-behind-pawn'],
    ['rook-essentials', 'rook-cutoff'], ['rook-essentials', 'rook-side-checks'],
    ['rook-essentials', 'rook-lucena'], ['rook-essentials', 'rook-philidor']
];
const report = { requestedPerTheme: 20, themes: {}, totalAccepted: 0, unsafeClaims: 0, nondeterministic: 0 };

for (const [pathId, lessonId] of targets) {
    const options = curriculum.resolveTrainingOptions(pathId, lessonId);
    const counts = { accepted: 0, correct: 0, alternative: 0, inaccurate: 0, resultChanging: 0, hintSequences: 0 };
    for (let sample = 0; sample < 20; sample += 1) {
        const selection = selectBestEndgameCandidate({ ...options, seed: `season-8.1.3:${lessonId}:${sample}` });
        if (!selection.ok) throw new Error(`${lessonId}:${sample}:${selection.error.code}`);
        const candidate = selection.selected;
        const moves = ChessRulesFacade.fromFen(candidate.fen).legalMoves({ verbose: true });
        if (!moves.length) throw new Error(`${lessonId}:${sample}:no-legal-move`);
        const base = {
            ...options.lesson, studentColor: 'white', sideToMove: 'white', positionBefore: candidate.fen,
            positionAfter: candidate.fen, positionFeatures: candidate.features, bestMove: moves[0], studentMove: moves[0]
        };
        const correct = createMoveCoaching(base);
        const repeated = createMoveCoaching(base);
        if (JSON.stringify(correct) !== JSON.stringify(repeated)) report.nondeterministic += 1;
        if (!correct.themeVerified) report.unsafeClaims += 1;
        if (['BEST', 'ONLY_MOVE'].includes(correct.classification)) counts.correct += 1;
        if (createMoveCoaching({ ...base, studentMove: moves[1] ?? moves[0], bestMove: null, resultBefore: 'draw', resultAfter: 'draw' }).classification === 'GOOD') counts.alternative += 1;
        if (createMoveCoaching({ ...base, studentMove: moves[1] ?? moves[0], bestMove: null, moveFeatures: { preservesTechnique: false } }).classification === 'INACCURACY') counts.inaccurate += 1;
        if (createMoveCoaching({ ...base, studentMove: moves[1] ?? moves[0], resultBefore: 'win', resultAfter: 'draw' }).classification === 'MISTAKE') counts.resultChanging += 1;
        const hints = [1, 2, 3, 4].map(level => createProgressiveHint(base, level));
        if (hints.every((hint, index) => hint.level === index + 1) && hints[3].suggestedMove) counts.hintSequences += 1;
        counts.accepted += 1; report.totalAccepted += 1;
    }
    report.themes[options.lesson.theme] = counts;
}

console.log(JSON.stringify(report, null, 2));
const complete = Object.values(report.themes).every(counts => Object.values(counts).every(value => value === 20));
if (!complete || report.totalAccepted !== 200 || report.unsafeClaims || report.nondeterministic) process.exitCode = 1;
