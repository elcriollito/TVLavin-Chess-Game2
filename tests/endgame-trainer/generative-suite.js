import { performance } from 'node:perf_hooks';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { ENDGAME_MATERIAL_CATALOG, materialFor } from '../../js/endgame-trainer/endgame-material-catalog.js';
import { generateEndgamePosition } from '../../js/endgame-trainer/endgame-position-generator.js';
import { validateEndgamePosition } from '../../js/endgame-trainer/endgame-position-validator.js';
import { boardFromFen, countPieces, hasPawnOnInvalidRank, kingsAreAdjacent, materialSignature, positionKey } from '../../js/endgame-trainer/endgame-fen-utils.js';

function fail(message) { throw new Error(message); }
function inspectFenIndependently(fen) {
    const [placement, turn, castling, enPassant, halfmove, fullmove] = fen.split(' ');
    const pieces = [...placement].filter((token) => /[prnbqk]/i.test(token));
    const signatureFor = (isWhite) => ['k', 'q', 'r', 'b', 'n', 'p'].flatMap((type) =>
        pieces.filter((token) => token === (isWhite ? type.toUpperCase() : type)).map(() => type.toUpperCase())
    ).join('');
    return {
        fields: { placement, turn, castling, enPassant, halfmove, fullmove },
        pieceCount: pieces.length,
        whiteKings: pieces.filter((token) => token === 'K').length,
        blackKings: pieces.filter((token) => token === 'k').length,
        invalidRankPawn: placement.split('/').some((rank, index) => (index === 0 || index === 7) && /p/i.test(rank)),
        signature: `w:${signatureFor(true)}|b:${signatureFor(false)}`
    };
}
function expectedSignature(category, strongSide) {
    const material = materialFor(category, strongSide);
    const order = ['k', 'q', 'r', 'b', 'n', 'p'];
    const side = (color) => order.flatMap((type) => material[color].filter((piece) => piece === type).map(() => type.toUpperCase())).join('');
    return `w:${side('white')}|b:${side('black')}`;
}

const suiteStart = performance.now();
const report = { total: { generated: 0, accepted: 0, rejected: 0, exhausted: 0, unique: 0, collisions: 0 }, categories: {} };

for (const category of Object.values(ENDGAME_MATERIAL_CATALOG)) {
    const started = performance.now();
    const stats = { generationCalls: 0, generated: 0, accepted: 0, rejected: 0, exhausted: 0, unique: 0, collisions: 0, totalAttempts: 0, internallyRejectedCandidates: 0, rejectionCounts: {}, collisionDetails: [] };
    const keys = new Map();
    const attempts = [];
    for (let index = 0; index < 1000; index += 1) {
        stats.generated += 1;
        stats.generationCalls += 1;
        const seed = `ET.1-${category.id}-${index}`;
        const result = generateEndgamePosition({ categoryId: category.id, seed });
        if (!result.ok) {
            stats.exhausted += result.error.code === 'generation-attempts-exhausted' ? 1 : 0;
            stats.rejected += 1;
            for (const [reason, count] of Object.entries(result.error.rejectionCounts || {})) {
                stats.rejectionCounts[reason] = (stats.rejectionCounts[reason] || 0) + count;
            }
            continue;
        }
        attempts.push({ seed, attempts: result.metadata.attempts });
        stats.totalAttempts += result.metadata.attempts;
        stats.internallyRejectedCandidates += result.metadata.attempts - 1;
        for (const [reason, count] of Object.entries(result.diagnostics.rejectionCounts)) {
            stats.rejectionCounts[reason] = (stats.rejectionCounts[reason] || 0) + count;
        }
        const validation = validateEndgamePosition(result.fen, result.metadata);
        if (!validation.valid) fail(`${category.id} accepted invalid FEN: ${result.fen}: ${validation.errors}`);
        const board = boardFromFen(result.fen);
        const independent = inspectFenIndependently(result.fen);
        if (independent.pieceCount !== category.exactPieceCount) fail(`${category.id}: independent wrong count`);
        if (independent.signature !== expectedSignature(category, result.metadata.strongSide)) fail(`${category.id}: independent wrong material`);
        if (independent.whiteKings !== 1 || independent.blackKings !== 1) fail(`${category.id}: independent wrong kings`);
        if (independent.invalidRankPawn) fail(`${category.id}: independent invalid pawn rank`);
        if (independent.fields.turn !== (result.metadata.sideToMove === 'white' ? 'w' : 'b')) fail(`${category.id}: independent wrong turn`);
        if (independent.fields.castling !== '-' || independent.fields.enPassant !== '-') fail(`${category.id}: unexpected FEN rights`);
        if (independent.fields.halfmove !== '0' || independent.fields.fullmove !== '1') fail(`${category.id}: unexpected FEN counters`);
        if (countPieces(board) !== category.exactPieceCount) fail(`${category.id}: wrong count`);
        if (materialSignature(board) !== expectedSignature(category, result.metadata.strongSide)) fail(`${category.id}: wrong material`);
        if (board.filter((piece) => piece.type === 'k').length !== 2) fail(`${category.id}: wrong king count`);
        if (kingsAreAdjacent(board)) fail(`${category.id}: adjacent kings`);
        if (hasPawnOnInvalidRank(board)) fail(`${category.id}: invalid pawn rank`);
        const facade = ChessRulesFacade.fromFen(result.fen);
        if (facade.isGameOver() || facade.legalMoveCount() === 0) fail(`${category.id}: terminal position`);
        const key = positionKey(result.fen);
        if (keys.has(key)) {
            stats.collisions += 1;
            stats.collisionDetails.push({ key, first: keys.get(key), second: { seed, fen: result.fen, metadata: result.metadata } });
        } else {
            keys.set(key, { seed, fen: result.fen, metadata: result.metadata });
        }
        stats.accepted += 1;
    }
    stats.unique = keys.size;
    attempts.sort((a, b) => a.attempts - b.attempts);
    const percentile = (fraction) => attempts[Math.ceil(attempts.length * fraction) - 1]?.attempts || 0;
    const maximum = attempts[attempts.length - 1] || { seed: null, attempts: 0 };
    stats.averageAttempts = Number((stats.totalAttempts / stats.generationCalls).toFixed(6));
    stats.medianAttempts = percentile(0.5);
    stats.p95Attempts = percentile(0.95);
    stats.maximumAttempts = maximum.attempts;
    stats.seedWithMaximumAttempts = maximum.seed;
    stats.timeMs = Number((performance.now() - started).toFixed(3));
    stats.averageMs = Number((stats.timeMs / stats.generated).toFixed(6));
    report.categories[category.id] = stats;
    for (const key of ['generated', 'accepted', 'rejected', 'exhausted', 'unique', 'collisions']) report.total[key] += stats[key];
}

report.total.timeMs = Number((performance.now() - suiteStart).toFixed(3));
report.total.averageMs = Number((report.total.timeMs / report.total.generated).toFixed(6));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
