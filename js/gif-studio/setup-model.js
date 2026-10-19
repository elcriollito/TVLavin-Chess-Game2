/**
 * CAISSA GIF Studio — isolated position-editing draft and legal study line.
 * A draft can be temporarily illegal. Only an explicit Apply promotes it into
 * a valid chess.js timeline. Imported PGNs are never mutated by draft edits.
 */
import { fenSquares, MAX_PLIES } from './game-model.js';

export const SETUP_PRESETS = Object.freeze({
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pawn: '8/8/4k3/8/3P4/4K3/8/8 w - - 0 1',
  rook: '8/5k2/8/8/4K3/8/6R1/8 w - - 0 1'
});

function index(square) {
  if (!/^[a-h][1-8]$/.test(square)) throw new RangeError('Invalid chess square.');
  return [8 - Number(square[1]), square.charCodeAt(0) - 97];
}

export function createDraft(fen = SETUP_PRESETS.start) {
  const tokens = String(fen).trim().split(/\s+/);
  if (tokens.length !== 6) throw new Error('FEN requires six space-separated fields.');
  return {
    squares: fenSquares(tokens[0]),
    turn: tokens[1] === 'b' ? 'b' : 'w',
    castling: tokens[2] === '-' ? '' : tokens[2],
    ep: tokens[3],
    halfmove: Number(tokens[4]) || 0,
    fullmove: Number(tokens[5]) || 1
  };
}

export function draftFen(draft) {
  const board = draft.squares.map(rank => {
    let empty = 0;
    let output = '';
    for (const piece of rank) {
      if (!piece) { empty += 1; continue; }
      if (empty) { output += empty; empty = 0; }
      const char = piece.type.toLowerCase();
      output += piece.color === 'w' ? char.toUpperCase() : char;
    }
    if (empty) output += empty;
    return output;
  }).join('/');
  const rights = [...'KQkq'].filter(flag => draft.castling.includes(flag)).join('') || '-';
  return `${board} ${draft.turn} ${rights} ${draft.ep || '-'} ${draft.halfmove} ${draft.fullmove}`;
}

export function pieceAt(draft, square) {
  const [row, col] = index(square);
  return draft.squares[row][col];
}

function copyDraft(draft) {
  return { ...draft, squares: draft.squares.map(row => row.map(piece => piece ? { ...piece } : null)) };
}

export function editDraft(draft, square, pieceId = null) {
  if (pieceId !== null && !/^[wb][KQRBNP]$/.test(pieceId)) throw new Error('Unknown piece selected.');
  const [row, col] = index(square);
  const updated = copyDraft(draft);
  updated.squares[row][col] = pieceId ? { color: pieceId[0], type: pieceId[1] } : null;
  updated.ep = '-';
  updated.halfmove = 0;
  return updated;
}

export function moveDraftPiece(draft, from, to) {
  const source = pieceAt(draft, from);
  if (!source || from === to) return draft;
  const updated = editDraft(editDraft(draft, from), to, `${source.color}${source.type}`);
  return updated;
}

export function createPositionGame(fen, Chess, options = {}) {
  if (typeof Chess !== 'function') throw new TypeError('Chess.js is required.');
  let instance;
  try { instance = new Chess(String(fen || '').trim()); }
  catch { throw new Error('Invalid FEN. Check the kings, piece placement, turn and castling rights.'); }
  const canonical = instance.fen();
  return {
    positions: [canonical], moves: [], plies: 0,
    white: options.white || 'White', black: options.black || 'Black',
    result: '*', source: options.source || 'setup', startFen: canonical
  };
}

export function commitDraft(draft, Chess) {
  const kings = { w: 0, b: 0 };
  draft.squares.flat().forEach(piece => { if (piece?.type === 'K') kings[piece.color]++; });
  if (kings.w !== 1 || kings.b !== 1) {
    throw new Error('Add exactly one white king and one black king before starting a line.');
  }
  return createPositionGame(draftFen(draft), Chess);
}

/** Legal move recording is explicitly distinct from free placement. */
export function appendLegalMove(game, atPly, from, to, promotion, Chess) {
  if (!game || !Array.isArray(game.positions) || !Number.isInteger(atPly) || atPly < 0 || atPly > game.plies) {
    throw new Error('There is no position to play from.');
  }
  if (atPly >= MAX_PLIES) throw new Error(`Study lines are limited to ${MAX_PLIES} half-moves.`);
  let instance;
  try { instance = new Chess(game.positions[atPly]); }
  catch { throw new Error('Cannot resume the position at this move.'); }
  let applied;
  try { applied = instance.move({ from, to, promotion: promotion || 'q' }); }
  catch { throw new Error('Illegal move. Choose a legal destination for the side to move.'); }
  if (!applied) throw new Error('Illegal move. Choose a legal destination for the side to move.');
  const positions = [...game.positions.slice(0, atPly + 1), instance.fen()];
  const moves = [...game.moves.slice(0, atPly), {
    san: applied.san, from: applied.from, to: applied.to, promotion: applied.promotion || null
  }];
  return { ...game, positions, moves, plies: moves.length, result: '*', source: 'setup-line' };
}

export function moveLabel(startFen, index, san) {
  const tokens = startFen.split(' ');
  const turnOffset = tokens[1] === 'b' ? 1 : 0;
  const firstMove = Math.max(1, Number(tokens[5]) || 1);
  const absolute = (firstMove - 1) * 2 + turnOffset + index;
  const prefix = `${Math.floor(absolute / 2) + 1}${absolute % 2 ? '...' : '.'}`;
  return `${prefix} ${san}`;
}
