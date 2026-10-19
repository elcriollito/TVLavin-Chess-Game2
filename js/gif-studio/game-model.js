/** CAISSA GIF Studio — validated, read-only PGN timeline. */
export const MAX_PGN_BYTES = 256 * 1024;
export const MAX_PLIES = 180;
export const EXAMPLE_PGN = `[Event "Opera Game"]
[Site "Paris, France"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke of Brunswick & Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export function parseGame(input, Chess) {
  if (typeof Chess !== 'function') throw new TypeError('Chess.js must be available.');
  const source = String(input || '').replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('Paste a PGN or open a PGN file to begin.');
  if (/^https?:\/\//i.test(source)) {
    throw new Error('Game URL import is planned for a later release. For now, paste the game PGN.');
  }
  if (new TextEncoder().encode(source).length > MAX_PGN_BYTES) {
    throw new Error('This PGN is too large (maximum 256 KiB).');
  }
  const game = new Chess();
  try { game.loadPgn(source); }
  catch { throw new Error('The PGN could not be loaded. Check the notation and try again.'); }
  const history = game.history({ verbose: true });
  if (!history.length) throw new Error('The PGN has no moves to animate.');
  if (history.length > MAX_PLIES) {
    throw new Error(`This version supports up to ${MAX_PLIES} half-moves per GIF.`);
  }
  const headers = typeof game.getHeaders === 'function' ? game.getHeaders() : {};
  const positions = [history[0].before];
  const moves = [];
  for (const [index, move] of history.entries()) {
    if (typeof move?.before !== 'string' || typeof move?.after !== 'string') {
      throw new Error('Could not reconstruct the positions for this game.');
    }
    if (positions[index] !== move.before) {
      throw new Error('The PGN has an inconsistent position history.');
    }
    positions.push(move.after);
    moves.push({ san: String(move.san || ''), from: String(move.from || ''), to: String(move.to || '') });
  }
  return {
    positions,
    moves,
    white: String(headers.White || 'White').slice(0, 70),
    black: String(headers.Black || 'Black').slice(0, 70),
    result: String(headers.Result || '*').slice(0, 12),
    plies: moves.length, source: 'pgn', startFen: positions[0]
  };
}

export function frameRange(plies, from, to) {
  if (!Number.isInteger(plies) || plies < 1) throw new RangeError('No game is loaded.');
  const start = Number(from);
  const end = Number(to);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > plies || start >= end) {
    throw new RangeError('Choose a valid range: the end must follow the start.');
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function fenSquares(fen) {
  const ranks = String(fen || '').split(' ')[0].split('/');
  if (ranks.length !== 8) throw new Error('Invalid board position.');
  return ranks.map(rank => {
    const squares = [];
    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) {
        for (let i = 0; i < Number(symbol); i++) squares.push(null);
      } else if (/^[prnbqkPRNBQK]$/.test(symbol)) {
        squares.push({ color: symbol === symbol.toUpperCase() ? 'w' : 'b', type: symbol.toUpperCase() });
      } else throw new Error('Invalid piece in board position.');
    }
    if (squares.length !== 8) throw new Error('Invalid rank in board position.');
    return squares;
  });
}
