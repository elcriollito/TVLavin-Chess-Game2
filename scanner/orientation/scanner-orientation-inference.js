import { analyzeStructuralPosition } from '../beta/scanner-structural-guardrails.js';

export const ORIENTATION_INFERENCE_VERSION = 'caissa-scanner-orientation-inference/1';

export const ORIENTATION_WEIGHTS = Object.freeze({
  pawnDirection: 0.34,
  pawnHomeDistribution: 0.22,
  pieceSideDistribution: 0.12,
  kingHomeDistribution: 0.07,
  heavyPieceHomeDistribution: 0.05,
  structuralGuardrails: 0.14,
  promotionPlausibility: 0.06
});

export const ORIENTATION_THRESHOLDS = Object.freeze({
  highMinimumScore: 0.64,
  highMinimumMargin: 0.28,
  highMinimumPawns: 4,
  highMinimumPawnSeparation: 0.24,
  mediumMinimumMargin: 0.14
});

const PIECES = new Set(['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
const clamp = (value) => Math.max(0, Math.min(1, value));
const round = (value) => Number(value.toFixed(4));

function parseFen(fen) {
  if (typeof fen !== 'string' || !fen.trim()) throw new Error('FEN_REQUIRED');
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw new Error('FEN_FIELD_COUNT');
  const board = fields[0].split('/').map((rank) => {
    const row = [];
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) row.push(...Array(Number(token)).fill(''));
      else if (PIECES.has(token)) row.push(token);
      else throw new Error('FEN_PIECE_CLASS');
    }
    if (row.length !== 8) throw new Error('FEN_RANK_WIDTH');
    return row;
  });
  if (board.length !== 8) throw new Error('FEN_RANK_COUNT');
  return { fields, board };
}

function boardPart(board) {
  return board.map((row) => {
    let result = '';
    let empty = 0;
    for (const piece of row) {
      if (!piece) empty += 1;
      else {
        if (empty) result += empty;
        result += piece;
        empty = 0;
      }
    }
    return result + (empty || '');
  }).join('/');
}

export function canonicalFenForOrientation(rawFen, orientation) {
  if (!['white-bottom', 'black-bottom'].includes(orientation)) throw new Error('ORIENTATION_INVALID');
  const { fields, board } = parseFen(rawFen);
  const canonical = orientation === 'black-bottom'
    ? [...board].reverse().map((row) => [...row].reverse())
    : board.map((row) => [...row]);
  fields[0] = boardPart(canonical);
  fields[2] = '-';
  fields[3] = '-';
  return fields.join(' ');
}

function entries(board, predicate) {
  const result = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && predicate(piece)) result.push({ piece, rank: 8 - row, col });
    }
  }
  return result;
}

function average(values, fallback = 0.5) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function ownSideScore(items) {
  return average(items.map(({ piece, rank }) => piece === piece.toUpperCase()
    ? (8 - rank) / 7
    : (rank - 1) / 7));
}

function pawnFeatures(board) {
  const white = entries(board, (piece) => piece === 'P');
  const black = entries(board, (piece) => piece === 'p');
  const all = [...white, ...black];
  const reliability = clamp(all.length / 6) * (white.length && black.length ? 1 : 0.55);
  const whiteMean = average(white.map((item) => item.rank), 4.5);
  const blackMean = average(black.map((item) => item.rank), 4.5);
  const separation = (blackMean - whiteMean) / 5;
  const direction = clamp(0.5 + separation / 2);
  const home = average([
    ...white.map((item) => clamp((8 - item.rank) / 6)),
    ...black.map((item) => clamp((item.rank - 1) / 6))
  ]);
  const backRankCount = all.filter((item) => item.rank === 1 || item.rank === 8).length;
  const terminalPenalty = all.length ? backRankCount / all.length : 0;
  const advanced = [
    ...white.map((item) => item.rank >= 6 ? clamp((item.rank - 5) / 3) : 0),
    ...black.map((item) => item.rank <= 3 ? clamp((4 - item.rank) / 3) : 0)
  ];
  const promotion = clamp(1 - terminalPenalty - Math.max(0, average(advanced, 0) - 0.72) * 0.3);
  return { white, black, count: all.length, reliability, separation, direction, home, promotion, backRankCount };
}

function structuralScore(fen) {
  const report = analyzeStructuralPosition(fen);
  const hard = report.warnings.filter((item) => item.severity === 'HARD').length;
  const soft = report.warnings.length - hard;
  return { report, score: clamp(1 - hard * 0.34 - soft * 0.07), hard, soft };
}

function scoreHypothesis(fen) {
  const { board } = parseFen(fen);
  const pawns = pawnFeatures(board);
  const nonPawnPieces = entries(board, (piece) => !['P', 'p'].includes(piece));
  const kings = entries(board, (piece) => ['K', 'k'].includes(piece));
  const heavy = entries(board, (piece) => ['Q', 'R', 'q', 'r'].includes(piece));
  const structural = structuralScore(fen);
  const features = Object.freeze({
    pawnDirection: round(0.5 + (pawns.direction - 0.5) * pawns.reliability),
    pawnHomeDistribution: round(0.5 + (pawns.home - 0.5) * pawns.reliability),
    pieceSideDistribution: round(0.5 + (ownSideScore(nonPawnPieces) - 0.5) * clamp(nonPawnPieces.length / 8)),
    kingHomeDistribution: round(0.5 + (ownSideScore(kings) - 0.5) * clamp(kings.length / 2)),
    heavyPieceHomeDistribution: round(0.5 + (ownSideScore(heavy) - 0.5) * clamp(heavy.length / 4)),
    structuralGuardrails: round(structural.score),
    promotionPlausibility: round(pawns.promotion)
  });
  const score = Object.entries(ORIENTATION_WEIGHTS)
    .reduce((sum, [name, weight]) => sum + features[name] * weight, 0);
  return Object.freeze({
    score: round(score),
    features,
    pawnCount: pawns.count,
    pawnSeparation: round(Math.abs(pawns.separation)),
    structuralStatus: structural.report.status,
    structuralWarningCodes: structural.report.warningCodes
  });
}

function evidenceFor(recommended, best, other) {
  const prefix = recommended === 'white-bottom' ? 'WHITE_BOTTOM' : 'BLACK_BOTTOM';
  const evidence = [];
  const delta = (name) => best.features[name] - other.features[name];
  if (delta('pawnDirection') >= 0.16) evidence.push(`${prefix}_PAWN_DIRECTION_STRONG`);
  if (delta('pawnHomeDistribution') >= 0.12) evidence.push(`${prefix}_PAWN_DISTRIBUTION_STRONG`);
  if (delta('pieceSideDistribution') >= 0.1) evidence.push(`${prefix}_PIECE_SIDE_DISTRIBUTION_MEDIUM`);
  if (delta('kingHomeDistribution') >= 0.1) evidence.push(`${prefix}_KING_DISTRIBUTION_WEAK`);
  if (delta('heavyPieceHomeDistribution') >= 0.1) evidence.push(`${prefix}_HEAVY_PIECE_DISTRIBUTION_WEAK`);
  if (delta('structuralGuardrails') >= 0.1) evidence.push(`${prefix}_FEWER_STRUCTURAL_WARNINGS`);
  if (delta('promotionPlausibility') >= 0.1) evidence.push(`${prefix}_PROMOTION_PLAUSIBILITY`);
  if (!evidence.length) evidence.push('ORIENTATION_EVIDENCE_AMBIGUOUS');
  return Object.freeze(evidence);
}

export function inferOrientation(rawFen) {
  const whiteFen = canonicalFenForOrientation(rawFen, 'white-bottom');
  const blackFen = canonicalFenForOrientation(rawFen, 'black-bottom');
  const white = scoreHypothesis(whiteFen);
  const black = scoreHypothesis(blackFen);
  const recommendedOrientation = black.score > white.score ? 'black-bottom' : 'white-bottom';
  const best = recommendedOrientation === 'black-bottom' ? black : white;
  const other = recommendedOrientation === 'black-bottom' ? white : black;
  const margin = round(best.score - other.score);
  const pawnDelta = Math.abs(best.features.pawnDirection - other.features.pawnDirection);
  const high = best.score >= ORIENTATION_THRESHOLDS.highMinimumScore
    && margin >= ORIENTATION_THRESHOLDS.highMinimumMargin
    && best.pawnCount >= ORIENTATION_THRESHOLDS.highMinimumPawns
    && pawnDelta >= ORIENTATION_THRESHOLDS.highMinimumPawnSeparation;
  const orientationConfidence = high ? 'HIGH'
    : margin >= ORIENTATION_THRESHOLDS.mediumMinimumMargin ? 'MEDIUM' : 'LOW_AMBIGUOUS';
  return Object.freeze({
    orientationInferenceVersion: ORIENTATION_INFERENCE_VERSION,
    whiteBottomScore: white.score,
    blackBottomScore: black.score,
    recommendedOrientation,
    orientationConfidence,
    heuristicConfidence: round(clamp(0.5 + margin / 2)),
    orientationEvidence: evidenceFor(recommendedOrientation, best, other),
    scoreMargin: margin,
    autoSelected: orientationConfidence === 'HIGH',
    canonicalFens: Object.freeze({ 'white-bottom': whiteFen, 'black-bottom': blackFen }),
    hypotheses: Object.freeze({ 'white-bottom': white, 'black-bottom': black })
  });
}
