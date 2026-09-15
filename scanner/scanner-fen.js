(function (global) {
  'use strict';

  const PIECE_CODES = { K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP', k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP' };
  const PIECE_BASE = '/img/chesspieces/wikipedia/';

  function pieceSrc(piece) {
    const code = PIECE_CODES[piece];
    return code ? PIECE_BASE + code + '.png' : '';
  }

  function parseBoard(boardPart) {
    const ranks = boardPart.split('/');
    if (ranks.length !== 8) throw new Error('FEN must contain 8 ranks.');
    return ranks.map((rank) => {
      const row = [];
      for (const char of rank) {
        if (/[1-8]/.test(char)) {
          for (let i = 0; i < Number(char); i += 1) row.push('');
        } else if (PIECE_CODES[char]) row.push(char);
        else throw new Error('FEN contains an invalid board character.');
      }
      if (row.length !== 8) throw new Error('Each FEN rank must contain exactly 8 squares.');
      return row;
    });
  }

  function boardToPart(board) {
    return board.map((row) => {
      let out = '';
      let empty = 0;
      for (const piece of row) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) {
          out += empty;
          empty = 0;
        }
        out += piece;
      }
      if (empty) out += empty;
      return out;
    }).join('/');
  }

  function validateDraft(fen) {
    if (typeof fen !== 'string' || !fen.trim()) return { ok: false, error: 'Enter a FEN first.' };
    const parts = fen.trim().split(/\s+/);
    if (parts.length !== 6) return { ok: false, error: 'FEN must contain 6 fields.' };
    let board;
    try {
      board = parseBoard(parts[0]);
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (!/^[wb]$/.test(parts[1])) return { ok: false, error: 'Side to move must be w or b.' };
    if (!/^(-|K?Q?k?q?)$/.test(parts[2])) return { ok: false, error: 'Castling field is invalid.' };
    if (!/^(-|[a-h][36])$/.test(parts[3])) return { ok: false, error: 'En-passant field is invalid.' };
    if (!/^\d+$/.test(parts[4]) || !/^[1-9]\d*$/.test(parts[5])) return { ok: false, error: 'Move counters are invalid.' };
    return { ok: true, fen: parts.join(' '), board };
  }

  function validate(fen) {
    const result = validateDraft(fen);
    if (!result.ok) return result;
    const flat = result.board.flat();
    if (flat.filter((piece) => piece === 'K').length !== 1 || flat.filter((piece) => piece === 'k').length !== 1) {
      return { ok: false, error: 'Position must contain exactly one white king and one black king.' };
    }
    return result;
  }

  function mutateSquare(fen, row, col, piece) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length !== 6) return null;
    let board;
    try {
      board = parseBoard(parts[0]);
    } catch (_) {
      return null;
    }
    if (row < 0 || row > 7 || col < 0 || col > 7 || !(piece === '' || PIECE_CODES[piece])) return null;
    board[row][col] = piece;
    parts[0] = boardToPart(board);
    return parts.join(' ');
  }

  function clearBoard(fen) {
    const result = validateDraft(fen);
    if (!result.ok) return null;
    const parts = result.fen.split(' ');
    parts[0] = '8/8/8/8/8/8/8/8';
    parts[3] = '-';
    return parts.join(' ');
  }

  function setSideToMove(fen, side) {
    const result = validateDraft(fen);
    if (!result.ok || !/^[wb]$/.test(side || '')) return null;
    const parts = result.fen.split(' ');
    parts[1] = side;
    parts[3] = '-';
    return parts.join(' ');
  }

  function setCastling(fen, rights) {
    const result = validateDraft(fen);
    if (!result.ok) return null;
    const requested = typeof rights === 'string' ? rights : '';
    const normalized = ['K', 'Q', 'k', 'q'].filter((key) => requested.includes(key)).join('') || '-';
    const parts = result.fen.split(' ');
    parts[2] = normalized;
    return parts.join(' ');
  }

  function squareName(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  function coordsFromSquare(square) {
    if (!/^[a-h][1-8]$/.test(square || '')) return null;
    return { row: 8 - Number(square[1]), col: square.charCodeAt(0) - 97 };
  }

  function ensureSquares(boardElement) {
    let squares = [...boardElement.children];
    if (squares.length === 64 && squares.every((square) => square.classList.contains('sq'))) return squares;
    boardElement.innerHTML = '';
    squares = [];
    for (let i = 0; i < 64; i += 1) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = 'sq';
      const image = document.createElement('img');
      image.className = 'piece-img';
      image.alt = '';
      image.draggable = false;
      square.appendChild(image);
      boardElement.appendChild(square);
      squares.push(square);
    }
    return squares;
  }

  function syncPiece(square, piece) {
    let image = square.querySelector('.piece-img');
    if (!image) {
      image = document.createElement('img');
      image.className = 'piece-img';
      image.alt = '';
      image.draggable = false;
      square.appendChild(image);
    }
    const src = piece ? pieceSrc(piece) : '';
    if (src) {
      if (image.getAttribute('src') !== src) image.src = src;
      image.hidden = false;
      image.dataset.piece = piece;
    } else {
      image.hidden = true;
      image.removeAttribute('src');
      delete image.dataset.piece;
    }
  }

  function syncCoordinates(square, displayRow, displayCol, row, col) {
    if (displayRow === 7) square.dataset.file = String.fromCharCode(97 + col);
    else delete square.dataset.file;
    if (displayCol === 7) square.dataset.rank = String(8 - row);
    else delete square.dataset.rank;
  }

  function renderEmpty(boardElement) {
    const squares = ensureSquares(boardElement);
    squares.forEach((square, index) => {
      const row = Math.floor(index / 8);
      const col = index % 8;
      square.className = 'sq ' + (((row + col) % 2 === 0) ? 'light' : 'dark');
      square.dataset.row = String(row);
      square.dataset.col = String(col);
      square.setAttribute('aria-label', squareName(row, col) + ' empty');
      square.onclick = null;
      square.tabIndex = -1;
      syncCoordinates(square, row, col, row, col);
      syncPiece(square, '');
    });
    return true;
  }

  function renderPosition(boardElement, fen, flipped, onSquareClick, selected, extraClassForSquare, validator) {
    const result = validator(fen);
    if (!result.ok) return result;
    const squares = ensureSquares(boardElement);
    squares.forEach((square, index) => {
      const displayRow = Math.floor(index / 8);
      const displayCol = index % 8;
      const row = flipped ? 7 - displayRow : displayRow;
      const col = flipped ? 7 - displayCol : displayCol;
      const piece = result.board[row][col];
      square.className = 'sq ' + (((row + col) % 2 === 0) ? 'light' : 'dark');
      square.dataset.row = String(row);
      square.dataset.col = String(col);
      square.setAttribute('aria-label', squareName(row, col) + (piece ? ' ' + PIECE_CODES[piece] : ' empty'));
      syncCoordinates(square, displayRow, displayCol, row, col);
      if (selected && selected.row === row && selected.col === col) square.classList.add('selected');
      if (typeof extraClassForSquare === 'function') {
        const extra = extraClassForSquare(row, col, piece);
        if (extra) String(extra).split(/\s+/).filter(Boolean).forEach((name) => square.classList.add(name));
      }
      syncPiece(square, piece);
      if (typeof onSquareClick === 'function') {
        square.onclick = () => onSquareClick(row, col);
        square.tabIndex = 0;
      } else {
        square.onclick = null;
        square.tabIndex = -1;
      }
    });
    return result;
  }

  function render(boardElement, fen, flipped = false, onSquareClick = null, selected = null, extraClassForSquare = null) {
    return renderPosition(boardElement, fen, flipped, onSquareClick, selected, extraClassForSquare, validate);
  }

  function renderDraft(boardElement, fen, flipped = false, onSquareClick = null, selected = null, extraClassForSquare = null) {
    return renderPosition(boardElement, fen, flipped, onSquareClick, selected, extraClassForSquare, validateDraft);
  }

  global.CaissaScannerFen = Object.freeze({
    validate,
    validateDraft,
    render,
    renderDraft,
    renderEmpty,
    mutateSquare,
    clearBoard,
    setSideToMove,
    setCastling,
    squareName,
    coordsFromSquare,
    pieceSrc,
    pieces: Object.freeze({ ...PIECE_CODES })
  });
})(window);
