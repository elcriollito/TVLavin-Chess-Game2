import { performance } from 'node:perf_hooks';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { generateEndgamePosition } from '../../js/endgame-trainer/endgame-position-generator.js';
import { validateEndgamePosition } from '../../js/endgame-trainer/endgame-position-validator.js';
import { extractPositionFeatures } from '../../js/endgame-trainer/endgame-position-features.js';
import { scoreEndgamePosition } from '../../js/endgame-trainer/endgame-position-scorer.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { positionKey, boardFromFen, kingsAreAdjacent, hasPawnOnInvalidRank } from '../../js/endgame-trainer/endgame-fen-utils.js';
import { KRPVKR_TEMPLATES, matchesKrpvkrTemplateTheme } from '../../js/endgame-trainer/endgame-rook-pawn-templates.js';

const increment = (map, key, amount = 1) => { map[key] = (map[key] || 0) + amount; };
const percentile = (values, fraction) => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? 0;
const report = { total: { generated: 10000, accepted: 0, rejected: 0, exhausted: 0, unique: 0, duplicates: 0 }, rejectionReasons: {}, themes: {}, pawnFiles: {}, pawnRanks: {}, strongSides: {}, sidesToMove: {}, performanceMs: {}, templates: { verified: 0, fallbackVerified: false } };
const keys = new Set(), generationTimes = [], validationTimes = [], featureTimes = [], scoringTimes = [];
const started = performance.now();

for (let index = 0; index < 10000; index += 1) {
    let mark = performance.now();
    const result = generateEndgamePosition({ categoryId: 'KRPvKR', seed: `ET.10A-${index}` });
    generationTimes.push(performance.now() - mark);
    if (!result.ok) { report.total.rejected += 1; report.total.exhausted += result.error.code === 'generation-attempts-exhausted' ? 1 : 0; continue; }
    for (const [reason, count] of Object.entries(result.diagnostics.rejectionCounts)) increment(report.rejectionReasons, reason, count);
    mark = performance.now(); const validation = validateEndgamePosition(result.fen, result.metadata); validationTimes.push(performance.now() - mark);
    if (!validation.valid) throw new Error(`invalid:${index}:${validation.errors.join(',')}`);
    const board = boardFromFen(result.fen); if (kingsAreAdjacent(board) || hasPawnOnInvalidRank(board)) throw new Error(`invariant:${index}`);
    mark = performance.now(); const features = extractPositionFeatures(result.fen, { categoryId: 'KRPvKR', strongSide: result.metadata.strongSide }); featureTimes.push(performance.now() - mark);
    mark = performance.now(); const scoring = scoreEndgamePosition(result.fen, { categoryId: 'KRPvKR', strongSide: result.metadata.strongSide }); scoringTimes.push(performance.now() - mark);
    if (scoring.accepted) report.total.accepted += 1; else report.total.rejected += 1;
    const key = positionKey(result.fen); if (keys.has(key)) report.total.duplicates += 1; else keys.add(key);
    const pawn = board.find(piece => piece.type === 'p'); increment(report.pawnFiles, pawn.square[0]); increment(report.pawnRanks, `${pawn.color}-${pawn.square[1]}`);
    increment(report.strongSides, result.metadata.strongSide); increment(report.sidesToMove, result.metadata.sideToMove); increment(report.themes, result.metadata.theme);
}

for (const template of KRPVKR_TEMPLATES) {
    for (const reflectTemplate of [false, true]) {
        const result = generateEndgamePosition({ categoryId: 'KRPvKR', template: template.id, reflectTemplate });
        if (!result.ok) throw new Error(`template:${template.id}:${reflectTemplate}`);
        const game = ChessRulesFacade.fromFen(result.fen); if (game.isGameOver() || game.legalMoveCount() < 2) throw new Error(`template-terminal:${template.id}`);
        const features = extractPositionFeatures(result.fen, { categoryId: 'KRPvKR', strongSide: result.metadata.strongSide });
        if (!matchesKrpvkrTemplateTheme(template, features)) throw new Error(`template-geometry:${template.id}:${reflectTemplate}`);
        report.templates.verified += 1;
    }
}

report.total.unique = keys.size;
const fallback = selectBestEndgameCandidate({ categoryId: 'KRPvKR', seed: 'campaign-fallback', candidateCount: 2, generatorOptions: { rng: () => 0.5 } });
report.templates.fallbackVerified = fallback.ok && fallback.fallbackUsed && fallback.selected.metadata.source === 'template';
for (const [name, values] of Object.entries({ generation: generationTimes, validation: validationTimes, features: featureTimes, scoring: scoringTimes })) report.performanceMs[name] = { median: percentile(values, 0.5), p95: percentile(values, 0.95), maximum: Math.max(...values) };
report.performanceMs.total = performance.now() - started;
if (report.total.accepted < 5000) throw new Error(`acceptance-too-low:${report.total.accepted}`);
if (!report.templates.fallbackVerified) throw new Error('template-fallback-failed');
const requiredPawnRanks = ['white', 'black'].flatMap(color => [2, 3, 4, 5, 6, 7].map(rank => `${color}-${rank}`));
if (Object.keys(report.pawnFiles).length !== 8 || requiredPawnRanks.some(key => !report.pawnRanks[key]) || Object.keys(report.strongSides).length !== 2 || Object.keys(report.sidesToMove).length !== 2) throw new Error('coverage-failed');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
