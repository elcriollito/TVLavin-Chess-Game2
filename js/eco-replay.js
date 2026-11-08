(function (root) {
  'use strict';

  const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function freezeFrame(frame) {
    return Object.freeze({
      fen: frame.fen,
      san: frame.san,
      ply: frame.ply,
      moveNumber: frame.moveNumber,
      color: frame.color,
      notation: frame.notation
    });
  }

  function normalizeFen(ChessConstructor, fen) {
    if (typeof ChessConstructor !== 'function' || !fen) return '';
    try {
      return new ChessConstructor(String(fen)).fen();
    } catch (_error) {
      return '';
    }
  }

  function auditedPositionFieldsMatch(firstFen, secondFen) {
    const first = String(firstFen || '').split(' ');
    const second = String(secondFen || '').split(' ');
    return first.length >= 6
      && second.length >= 6
      && [0, 1, 2, 4, 5].every((index) => first[index] === second[index]);
  }

  function unavailable(reason) {
    return Object.freeze({
      available: false,
      reason,
      startFen: '',
      finalFen: '',
      totalPlies: 0,
      moves: Object.freeze([]),
      frames: Object.freeze([])
    });
  }

  function createReplay(ChessConstructor, rawMoves, options = {}) {
    if (typeof ChessConstructor !== 'function') {
      return unavailable('Chess move validator is unavailable.');
    }
    if (!Array.isArray(rawMoves) || rawMoves.length === 0) {
      return unavailable('No verified defining move sequence is available.');
    }

    const moves = rawMoves.map((move) => String(move || '').trim());
    if (moves.some((move) => !move)) {
      return unavailable('The defining move sequence contains an empty move.');
    }

    const requestedStartFen = options.startFen || STANDARD_START_FEN;
    let game;
    try {
      game = new ChessConstructor(String(requestedStartFen));
    } catch (_error) {
      return unavailable('The replay starting position is invalid.');
    }

    const startFen = game.fen();
    const frames = [freezeFrame({
      fen: startFen,
      san: '',
      ply: 0,
      moveNumber: 0,
      color: '',
      notation: 'Starting position'
    })];

    for (let index = 0; index < moves.length; index += 1) {
      let played;
      try {
        played = game.move(moves[index], { sloppy: true });
      } catch (_error) {
        played = null;
      }
      if (!played) {
        return unavailable(`Illegal or unverifiable move at ply ${index + 1}: ${moves[index]}.`);
      }

      const ply = index + 1;
      const moveNumber = Math.ceil(ply / 2);
      const color = played.color === 'b' ? 'b' : 'w';
      frames.push(freezeFrame({
        fen: game.fen(),
        san: played.san,
        ply,
        moveNumber,
        color,
        notation: color === 'w' ? `${moveNumber}. ${played.san}` : `${moveNumber}... ${played.san}`
      }));
    }

    const replayedFinalFen = frames[frames.length - 1].fen;
    const canonicalFinalFen = normalizeFen(ChessConstructor, options.canonicalFinalFen);
    let finalFen = replayedFinalFen;
    if (canonicalFinalFen) {
      if (!auditedPositionFieldsMatch(replayedFinalFen, canonicalFinalFen)) {
        return unavailable('The stored final position does not match the verified move replay.');
      }
      finalFen = canonicalFinalFen;
      frames[frames.length - 1] = freezeFrame({
        ...frames[frames.length - 1],
        fen: canonicalFinalFen
      });
    }

    return Object.freeze({
      available: true,
      reason: '',
      startFen,
      finalFen,
      totalPlies: moves.length,
      moves: Object.freeze(moves.slice()),
      frames: Object.freeze(frames.slice())
    });
  }

  function formatFrame(frame, totalPlies) {
    if (!frame || !Number.isInteger(frame.ply)) return 'Move replay unavailable.';
    const label = frame.ply === 0 ? 'Starting position' : frame.notation;
    return `${label} — Ply ${frame.ply} of ${Number(totalPlies) || 0}`;
  }

  root.CaissaEcoReplay = Object.freeze({
    STANDARD_START_FEN,
    auditedPositionFieldsMatch,
    createReplay,
    formatFrame,
    normalizeFen
  });
})(typeof window !== 'undefined' ? window : globalThis);
