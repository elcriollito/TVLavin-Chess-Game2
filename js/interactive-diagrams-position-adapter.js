(function (global) {
  'use strict';
  const square = /^[a-h][1-8]$/;
  const arrow = /^[a-h][1-8][a-h][1-8]$/;
  function validateFen(fen) {
    if (typeof fen !== 'string' || fen.length > 100) throw new Error('ICD_FEN_INVALID');
    const fields = fen.trim().split(/\s+/);
    if (fields.length !== 6 || !/^[wb]$/.test(fields[1])) throw new Error('ICD_FEN_FIELDS_INVALID');
    const ranks = fields[0].split('/');
    if (ranks.length !== 8) throw new Error('ICD_FEN_RANKS_INVALID');
    const pieces = [];
    let whiteKings = 0; let blackKings = 0;
    ranks.forEach((rank, rankIndex) => {
      let file = 0;
      for (const token of rank) {
        if (/^[1-8]$/.test(token)) file += Number(token);
        else {
          if (!/^[prnbqkPRNBQK]$/.test(token) || file > 7) throw new Error('ICD_FEN_PIECE_INVALID');
          const at = `${'abcdefgh'[file]}${8 - rankIndex}`;
          pieces.push({ token, square: at });
          if (token === 'K') whiteKings += 1;
          if (token === 'k') blackKings += 1;
          file += 1;
        }
      }
      if (file !== 8) throw new Error('ICD_FEN_WIDTH_INVALID');
    });
    if (whiteKings !== 1 || blackKings !== 1) throw new Error('ICD_FEN_KINGS_INVALID');
    return { fen: fields.join(' '), sideToMove: fields[1] === 'w' ? 'white' : 'black', pieces, unsupportedDataPosFields: { castling: fields[2], enPassant: fields[3], halfmove: fields[4], fullmove: fields[5] } };
  }
  function fenToDataPos(fen) {
    const parsed = validateFen(fen);
    const order = { K: 0, Q: 1, R: 2, B: 3, N: 4, P: 5 };
    const groups = ['white', 'black'].map(color => {
      const entries = parsed.pieces.filter(piece => color === 'white' ? /[A-Z]/.test(piece.token) : /[a-z]/.test(piece.token)).sort((a, b) => order[a.token.toUpperCase()] - order[b.token.toUpperCase()] || a.square.localeCompare(b.square));
      let last = '';
      return entries.map(piece => { const type = piece.token.toUpperCase(); const value = `${type === last ? '' : type}${piece.square}`; last = type; return value; }).join(',');
    });
    return `w${groups[0]}/b${groups[1]}`;
  }
  function validateList(values, pattern, limit, code) {
    if (!Array.isArray(values) || values.length > limit || values.some(value => typeof value !== 'string' || !pattern.test(value))) throw new Error(code);
    return [...new Set(values)];
  }
  function validateManifest(manifest) {
    if (!manifest || manifest.schema !== 'CaissaInteractiveDiagramManifest@1.0.0' || manifest.collectionId !== 'caissa-knowledge-diagram-pilot' || !Array.isArray(manifest.diagrams) || manifest.diagrams.length < 1 || manifest.diagrams.length > 4) throw new Error('ICD_MANIFEST_INVALID');
    return manifest.diagrams.map((item, index) => {
      if (item.order !== index + 1 || item.buttons !== false || item.playMode !== false || typeof item.title !== 'string' || item.title.length > 80 || typeof item.legend !== 'string' || item.legend.length > 180 || !item.sourceUnitId?.startsWith('ku:') || !item.sourcePositionId?.startsWith('pos:')) throw new Error('ICD_MANIFEST_ITEM_INVALID');
      if (/[<>]/.test(item.title + item.legend + item.purpose) || 'hint' in item || 'solution' in item || 'url' in item) throw new Error('ICD_MANIFEST_UNSAFE');
      const parsed = validateFen(item.fen);
      if (parsed.sideToMove !== item.sideToMove) throw new Error('ICD_SIDE_TO_MOVE_MISMATCH');
      return { ...item, arrows: validateList(item.arrows, arrow, 4, 'ICD_ARROWS_INVALID'), squares: validateList(item.squares, square, 8, 'ICD_SQUARES_INVALID') };
    });
  }
  global.CaissaInteractiveDiagramAdapter = Object.freeze({ validateFen, fenToDataPos, validateManifest });
}(window));
