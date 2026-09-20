const STRUCTURAL_GUARDRAIL_VERSION = 'caissa-scanner-structural-guardrails/1';
const PIECES = new Set(['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function placementLabels(fen) {
  invariant(typeof fen === 'string' && fen.trim(), 'FEN_REQUIRED');
  const ranks = fen.trim().split(/\s+/)[0].split('/');
  invariant(ranks.length === 8, 'FEN_RANK_COUNT');
  const labels = [];
  for (const rank of ranks) {
    const row = [];
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) row.push(...Array(Number(token)).fill('empty'));
      else {
        invariant(PIECES.has(token), 'FEN_PIECE_CLASS');
        row.push(token);
      }
    }
    invariant(row.length === 8, 'FEN_RANK_WIDTH');
    labels.push(...row);
  }
  invariant(labels.length === 64, 'FEN_SQUARE_COUNT');
  return labels;
}

function warning(code, severity, message, count) {
  return Object.freeze({ code, severity, message, count });
}

function analyzeStructuralPosition(fen) {
  const labels = placementLabels(fen);
  const count = (piece) => labels.filter((label) => label === piece).length;
  const counts = Object.freeze(Object.fromEntries([...PIECES].map((piece) => [piece, count(piece)])));
  const warnings = [];
  const add = (code, severity, message, value) => warnings.push(warning(code, severity, message, value));

  if (counts.K === 0) add('MISSING_WHITE_KING', 'HARD', 'White king is missing.', 0);
  if (counts.K > 1) add('MULTIPLE_WHITE_KINGS', 'HARD', 'More than one white king detected.', counts.K);
  if (counts.k === 0) add('MISSING_BLACK_KING', 'HARD', 'Black king is missing.', 0);
  if (counts.k > 1) add('MULTIPLE_BLACK_KINGS', 'HARD', 'More than one black king detected.', counts.k);
  const totalKings = counts.K + counts.k;
  if (totalKings !== 2) add('INVALID_TOTAL_KINGS', 'HARD', 'The position does not contain exactly two kings.', totalKings);
  if (counts.P > 8) add('TOO_MANY_WHITE_PAWNS', 'HARD', 'More than eight white pawns detected.', counts.P);
  if (counts.p > 8) add('TOO_MANY_BLACK_PAWNS', 'HARD', 'More than eight black pawns detected.', counts.p);

  const backRanks = [...labels.slice(0, 8), ...labels.slice(56, 64)];
  const whiteBackRankPawns = backRanks.filter((piece) => piece === 'P').length;
  const blackBackRankPawns = backRanks.filter((piece) => piece === 'p').length;
  if (whiteBackRankPawns) add('WHITE_PAWN_ON_BACK_RANK', 'HARD', 'White pawn detected on rank 1 or rank 8.', whiteBackRankPawns);
  if (blackBackRankPawns) add('BLACK_PAWN_ON_BACK_RANK', 'HARD', 'Black pawn detected on rank 1 or rank 8.', blackBackRankPawns);

  const softRules = [
    ['Q', 2, 'UNUSUAL_WHITE_QUEEN_COUNT', 'Unusually many white queens detected.'],
    ['q', 2, 'UNUSUAL_BLACK_QUEEN_COUNT', 'Unusually many black queens detected.'],
    ['R', 3, 'UNUSUAL_WHITE_ROOK_COUNT', 'Unusually many white rooks detected.'],
    ['r', 3, 'UNUSUAL_BLACK_ROOK_COUNT', 'Unusually many black rooks detected.'],
    ['B', 3, 'UNUSUAL_WHITE_BISHOP_COUNT', 'Unusually many white bishops detected.'],
    ['b', 3, 'UNUSUAL_BLACK_BISHOP_COUNT', 'Unusually many black bishops detected.'],
    ['N', 3, 'UNUSUAL_WHITE_KNIGHT_COUNT', 'Unusually many white knights detected.'],
    ['n', 3, 'UNUSUAL_BLACK_KNIGHT_COUNT', 'Unusually many black knights detected.']
  ];
  for (const [piece, limit, code, message] of softRules) {
    if (counts[piece] > limit) add(code, 'SOFT', message, counts[piece]);
  }

  const whitePieces = labels.filter((piece) => piece !== 'empty' && piece === piece.toUpperCase()).length;
  const blackPieces = labels.filter((piece) => piece !== 'empty' && piece === piece.toLowerCase()).length;
  if (whitePieces > 16) add('UNUSUAL_WHITE_PIECE_COUNT', 'SOFT', 'More than sixteen white pieces detected.', whitePieces);
  if (blackPieces > 16) add('UNUSUAL_BLACK_PIECE_COUNT', 'SOFT', 'More than sixteen black pieces detected.', blackPieces);

  const frozenWarnings = Object.freeze(warnings);
  const status = warnings.some((item) => item.severity === 'HARD')
    ? 'REVIEW_REQUIRED'
    : warnings.length ? 'REVIEW_RECOMMENDED' : 'NORMAL';
  return Object.freeze({
    schemaVersion: STRUCTURAL_GUARDRAIL_VERSION,
    status,
    warnings: frozenWarnings,
    warningCodes: Object.freeze(warnings.map((item) => item.code))
  });
}

export { STRUCTURAL_GUARDRAIL_VERSION, analyzeStructuralPosition };
