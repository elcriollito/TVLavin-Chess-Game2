import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { EXAMPLE_PGN, MAX_PGN_BYTES, parseGame, frameRange, fenSquares } from './game-model.js';
import { SETUP_PRESETS, createDraft, draftFen, pieceAt, editDraft, moveDraftPiece, createPositionGame, commitDraft, appendLegalMove, moveLabel } from './setup-model.js';
import { encodeGif } from './gif-encoder.js';

(function () {
  'use strict';
  const root = document.querySelector('[data-gif-studio]');
  if (!root) return;
  const $ = selector => root.querySelector(`[data-gif-${selector}]`);
  const fields = Object.freeze({
    board: root.querySelector('#gif-board'), boardWrap: root.querySelector('.gif-board-wrap'), dragPiece: $('drag-piece'), boardGuide: $('board-guide'),
    pgn: $('pgn'), fen: $('fen'), loadFen: $('load-fen'), file: $('file'), open: $('open'), load: $('load'), example: $('example'),
    tabs: root.querySelectorAll('[data-gif-tab]'), panels: root.querySelectorAll('[data-gif-panel]'),
    white: $('white'), black: $('black'), result: $('result'), ply: $('ply'), count: $('count'),
    first: $('first'), previous: $('previous'), play: $('play'), next: $('next'), last: $('last'),
    position: $('position'), positionValue: $('position-value'),
    theme: $('theme'), pieces: $('pieces'), orientation: $('orientation'),
    start: $('start'), end: $('end'), speed: $('speed'), size: $('size'),
    create: $('create'), download: $('download'), status: $('status'), progress: $('progress'),
    setupEdit: $('setup-edit'), setupRecord: $('setup-record'), setupHint: $('setup-hint'),
    setupTools: root.querySelectorAll('[data-gif-setup-tool]'), setupPieces: root.querySelectorAll('[data-gif-setup-piece]'),
    preset: $('setup-preset'), presetLoad: $('preset-load'), turn: $('setup-turn'), castling: root.querySelectorAll('[data-gif-castling]'),
    applyPosition: $('apply-position'), clearSetup: $('setup-clear'), discardDraft: $('discard-draft'), editPosition: $('edit-position'), undoMove: $('undo-move'),
    promotion: $('setup-promotion'), selection: $('selection'), setupFen: $('setup-fen'), copyFen: $('copy-fen'),
    moves: $('moves'), movesCount: $('moves-count')
  });
  const schemes = Object.freeze({
    green: ['#eeeed2', '#769656'], walnut: ['#f2dfc1', '#a47859'], blue: ['#dbe4ee', '#597993']
  });
  const glyphs = Object.freeze({
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
  });
  const imgBase = '/img/chesspieces/wikipedia/';
  const pieceImages = new Map();
  const START_FEN = new Chess().fen();
  let game = null;
  let cursor = 0;
  let timer = null;
  let objectUrl = null;
  let generation = null;
  let inputDirty = false;
  let activeTab = 'import';
  let setupInitialized = false;
  let setupMode = 'edit';
  let draft = null;
  let selectedTool = 'move';
  let selectedSquare = null;
  let keyboardSquare = 'e4';
  let dragging = null;

  function announce(message, error = false) {
    fields.status.textContent = message;
    fields.status.classList.toggle('is-error', error);
  }

  function invalidateExport() {
    generation?.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    fields.download.hidden = true;
    fields.download.removeAttribute('href');
  }

  function isEditing() { return setupInitialized && setupMode === 'edit'; }
  function isInteractive() { return activeTab === 'setup' && setupInitialized && (setupMode === 'edit' || setupMode === 'record'); }

  function initializeSetup() {
    if (setupInitialized) return;
    draft = createDraft(game?.positions[cursor] || START_FEN);
    setupMode = 'edit';
    selectedTool = 'move';
    setupInitialized = true;
    selectedSquare = null;
  }

  function setTab(id) {
    if (id === 'setup') { pause(); initializeSetup(); }
    selectedSquare = null;
    cancelDragging();
    activeTab = id;
    for (const tab of fields.tabs) {
      const selected = tab.dataset.gifTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of fields.panels) panel.hidden = panel.dataset.gifPanel !== id;
    if (id === 'export' && isEditing()) announce('Setup draft is not applied. Return to Setup Position and apply it before export.');
    render();
  }

  function settings() {
    return {
      colors: schemes[fields.theme.value] || schemes.green,
      pieces: fields.pieces.value === 'symbols' ? 'symbols' : 'wikipedia',
      orientation: fields.orientation.value === 'black' ? 'black' : 'white'
    };
  }

  function paintBoard(canvas, fen, lastMove, config, options = {}) {
    const size = canvas.width;
    const square = size / 8;
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('Your browser could not initialize the chessboard.');
    const position = fenSquares(fen);
    const flipped = config.orientation === 'black';
    context.clearRect(0, 0, size, size);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let visualRow = 0; visualRow < 8; visualRow++) {
      for (let visualCol = 0; visualCol < 8; visualCol++) {
        const r = flipped ? 7 - visualRow : visualRow;
        const c = flipped ? 7 - visualCol : visualCol;
        const x = visualCol * square;
        const y = visualRow * square;
        const dark = (r + c) % 2 === 1;
        context.fillStyle = config.colors[dark ? 1 : 0];
        context.fillRect(x, y, square + .25, square + .25);
        const file = String.fromCharCode(97 + c);
        const rank = String(8 - r);
        const coord = `${file}${rank}`;
        if (coord === lastMove?.from || coord === lastMove?.to) {
          context.fillStyle = 'rgba(247,211,56,0.36)';
          context.fillRect(x, y, square, square);
        }
        if (coord === options.selectedSquare) {
          context.strokeStyle = '#ffe07a';
          context.lineWidth = Math.max(3, size / 110);
          context.strokeRect(x + 2, y + 2, square - 4, square - 4);
        }
        context.save();
        context.fillStyle = dark ? '#f1f5e6' : '#38473a';
        context.globalAlpha = .78;
        context.font = `600 ${Math.max(9, Math.floor(square * .16))}px system-ui, sans-serif`;
        if (visualCol === 0) { context.textAlign = 'left'; context.textBaseline = 'top'; context.fillText(rank, x + 3, y + 3); }
        if (visualRow === 7) { context.textAlign = 'right'; context.textBaseline = 'bottom'; context.fillText(file, x + square - 3, y + square - 2); }
        context.restore();
        const piece = position[r][c];
        if (!piece || coord === options.hiddenSquare) continue;
        const id = `${piece.color}${piece.type}`;
        const image = pieceImages.get(id);
        if (config.pieces === 'wikipedia' && image?.complete && image.naturalWidth > 0) {
          const inset = square * .08;
          context.drawImage(image, x + inset, y + inset, square - inset * 2, square - inset * 2);
        } else {
          const white = piece.color === 'w';
          context.font = `${Math.round(square * .78)}px 'DejaVu Sans', 'Noto Sans Symbols 2', 'Segoe UI Symbol', serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.lineWidth = Math.max(1.2, size / 450);
          context.strokeStyle = white ? '#243143' : '#eff5e5';
          context.fillStyle = white ? '#f9fbf9' : '#202634';
          context.strokeText(glyphs[id], x + square / 2, y + square * .53);
          context.fillText(glyphs[id], x + square / 2, y + square * .53);
        }
      }
    }
  }

  function pause() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    root.querySelector('[data-gif-play-icon]').textContent = '▶';
    root.querySelector('[data-gif-play-label]').textContent = 'Play';
    fields.play.setAttribute('aria-label', 'Play game');
  }

  function syncTimeline({ reset = false } = {}) {
    const count = game?.plies || 0;
    fields.position.max = String(Math.max(count, 1));
    fields.start.max = String(count);
    fields.end.max = String(count);
    if (reset) { fields.start.value = '0'; fields.end.value = String(count); }
    else {
      fields.start.value = String(Math.min(Number(fields.start.value) || 0, Math.max(0, count - 1)));
      fields.end.value = String(count);
    }
  }

  function renderMoves() {
    fields.moves.replaceChildren();
    fields.movesCount.textContent = `${game?.plies || 0} half-moves`;
    if (setupMode !== 'record' || !game || game.source === 'pgn') {
      const note = document.createElement('p');
      note.className = 'gif-fineprint';
      note.textContent = 'Apply a position first, then play moves directly on the board.';
      fields.moves.appendChild(note);
      return;
    }
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'gif-move-chip';
    start.textContent = 'Start';
    start.setAttribute('aria-label', 'Go to custom starting position');
    start.setAttribute('aria-current', String(cursor === 0));
    start.addEventListener('click', () => { pause(); moveTo(0); });
    fields.moves.appendChild(start);
    for (let i = 0; i < game.moves.length; i++) {
      const entry = game.moves[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gif-move-chip';
      button.textContent = moveLabel(game.startFen, i, entry.san);
      button.setAttribute('aria-label', `Go to ${button.textContent}`);
      button.setAttribute('aria-current', String(cursor === i + 1));
      button.addEventListener('click', () => { pause(); moveTo(i + 1); });
      fields.moves.appendChild(button);
    }
  }

  function syncSetupInputs() {
    if (!draft) return;
    fields.turn.value = draft.turn;
    for (const input of fields.castling) input.checked = draft.castling.includes(input.dataset.gifCastling);
    for (const control of fields.setupTools) {
      const selected = control.dataset.gifSetupTool === selectedTool;
      control.classList.toggle('is-selected', selected);
      control.setAttribute('aria-pressed', String(selected));
    }
    for (const control of fields.setupPieces) {
      const selected = control.dataset.gifSetupPiece === selectedTool;
      control.classList.toggle('is-selected', selected);
      control.setAttribute('aria-pressed', String(selected));
    }
    fields.setupEdit.hidden = setupMode !== 'edit';
    fields.setupRecord.hidden = setupMode !== 'record';
    fields.setupHint.textContent = setupMode === 'edit'
      ? 'Build a custom position. Drag pieces with Move, or select a piece and click a square. Apply it to record legal moves.'
      : 'Record legal moves from your starting position. Click a move below to review it or branch from that position.';
    fields.setupFen.textContent = setupMode === 'edit' ? draftFen(draft) : (game?.positions[cursor] || draftFen(draft));
    fields.undoMove.disabled = !(game && game.plies > 0);
    if (setupMode === 'edit') {
      fields.selection.textContent = selectedTool === 'move'
        ? (selectedSquare ? `${selectedSquare} selected. Choose a destination.` : 'Move: drag an existing piece, or tap its source and destination.')
        : selectedTool === 'erase' ? 'Erase: tap a square to remove its piece.'
          : `Place ${selectedTool[0] === 'w' ? 'white' : 'black'} ${pieceName(selectedTool[1])}: tap a square.`;
    } else {
      fields.selection.textContent = selectedSquare
        ? `${selectedSquare} selected. Choose a legal destination.`
        : `Move ${game?.positions[cursor]?.split(' ')[1] === 'b' ? 'Black' : 'White'}: drag or tap a piece to move.`;
    }
    renderMoves();
  }

  function pieceName(letter) {
    return ({ P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' })[letter] || 'piece';
  }

  function render() {
    const showDraft = isInteractive() && setupMode === 'edit';
    const position = showDraft ? draftFen(draft) : (game?.positions[cursor] || START_FEN);
    const lastMove = showDraft ? null : (cursor > 0 ? game?.moves[cursor - 1] : null);
    paintBoard(fields.board, position, lastMove, settings(), { selectedSquare: isInteractive() ? selectedSquare : null, hiddenSquare: dragging?.from || null });
    fields.boardWrap.classList.toggle('is-interactive', isInteractive());
    fields.board.setAttribute('role', isInteractive() ? 'application' : 'img');
    fields.board.setAttribute('aria-label', isInteractive()
      ? 'Interactive Setup Position chessboard. Use arrow keys and Enter to edit or move pieces, or drag with a pointer.'
      : 'Chessboard preview. Choose Setup Position to edit or record moves.');
    fields.white.textContent = showDraft ? 'Setup · White' : (game?.white || 'White');
    fields.black.textContent = showDraft ? 'Setup · Black' : (game?.black || 'Black');
    fields.result.textContent = showDraft ? 'Draft' : (game?.result || '—');
    fields.ply.textContent = showDraft ? 'Free position editing · not yet applied'
      : lastMove ? moveLabel(game.startFen || START_FEN, cursor - 1, lastMove.san)
        : game?.source === 'fen' || game?.source === 'setup' || game?.source === 'setup-line' ? 'Custom starting position' : 'Starting position';
    fields.count.textContent = `${game?.plies || 0} half-moves`;
    fields.position.value = String(cursor);
    fields.positionValue.textContent = String(cursor);
    const hasGame = Boolean(game && !inputDirty && !isEditing());
    for (const button of [fields.first, fields.previous, fields.play, fields.next, fields.last]) button.disabled = !hasGame || game.plies === 0;
    fields.position.disabled = !hasGame || game.plies === 0;
    fields.create.disabled = !hasGame || game.plies === 0 || Boolean(generation);
    fields.boardGuide.hidden = !isInteractive();
    fields.boardGuide.textContent = setupMode === 'record'
      ? 'Setup line: drag or tap the moving side’s pieces; legal moves are recorded in the right panel.'
      : 'Setup editor: select a palette piece to place it, or drag an existing piece to rearrange the board.';
    if (setupInitialized) syncSetupInputs();
  }

  function moveTo(ply) {
    if (!game || isEditing()) return;
    selectedSquare = null;
    cursor = Math.max(0, Math.min(game.plies, Number(ply) || 0));
    render();
  }

  function resetSession() {
    pause();
    invalidateExport();
    inputDirty = false;
    cursor = 0;
    selectedSquare = null;
    cancelDragging();
    setupInitialized = false;
    draft = null;
    setupMode = 'edit';
    syncTimeline({ reset: true });
  }

  function loadPgn(source) {
    pause();
    invalidateExport();
    try {
      const loaded = parseGame(source, Chess);
      game = loaded;
      resetSession();
      announce(`Game loaded: ${loaded.white} vs ${loaded.black} · ${loaded.plies} half-moves. Customize and create your GIF.`);
    } catch (error) {
      game = null;
      resetSession();
      announce(error instanceof Error ? error.message : 'Could not load the PGN.', true);
    }
    render();
  }

  function loadFen(source) {
    pause();
    invalidateExport();
    try {
      const loaded = createPositionGame(source, Chess, { source: 'fen' });
      game = loaded;
      resetSession();
      setupInitialized = true;
      setupMode = 'record';
      draft = createDraft(loaded.startFen);
      setTab('setup');
      announce('FEN loaded. Play legal moves on the board to record an animated line.');
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not load the FEN.', true);
    }
    render();
  }

  function updateDraft(next) {
    draft = next;
    selectedSquare = null;
    invalidateExport();
    render();
  }

  function chooseTool(value) {
    selectedTool = value;
    selectedSquare = null;
    render();
  }

  function applyDraft() {
    pause();
    let next;
    try { next = commitDraft(draft, Chess); }
    catch (error) { announce(error.message, true); return; }
    invalidateExport();
    game = next;
    inputDirty = false;
    setupMode = 'record';
    selectedSquare = null;
    cursor = 0;
    fields.fen.value = game.startFen;
    syncTimeline({ reset: true });
    announce('Position applied. Drag pieces or tap a source and destination to record legal moves.');
    render();
  }

  function recordMove(from, to) {
    if (!game || from === to) return;
    let next;
    try { next = appendLegalMove(game, cursor, from, to, fields.promotion.value, Chess); }
    catch (error) { announce(error.message, true); return; }
    pause();
    invalidateExport();
    game = next;
    cursor += 1;
    selectedSquare = null;
    syncTimeline();
    announce(`Recorded ${moveLabel(game.startFen, cursor - 1, next.moves[cursor - 1].san)} · ${game.plies} half-moves.`);
    render();
  }

  function handleBoardSquare(square, sourceOverride = null) {
    if (!isInteractive() || !square) return;
    if (setupMode === 'edit') {
      if (selectedTool === 'erase') { updateDraft(editDraft(draft, square)); return; }
      if (/^[wb][KQRBNP]$/.test(selectedTool)) { updateDraft(editDraft(draft, square, selectedTool)); return; }
      const from = sourceOverride || selectedSquare;
      if (from && from !== square) { updateDraft(moveDraftPiece(draft, from, square)); return; }
      selectedSquare = (from === square && !sourceOverride) ? null : pieceAt(draft, square) ? square : null;
      render();
      return;
    }
    if (!game) return;
    const from = sourceOverride || selectedSquare;
    if (from && from !== square) { recordMove(from, square); selectedSquare = null; render(); return; }
    const current = new Chess(game.positions[cursor]);
    const piece = current.get(square);
    const side = current.turn();
    selectedSquare = from === square && !sourceOverride ? null : piece?.color === side ? square : null;
    if (!selectedSquare && piece && piece.color !== side) announce(`It is ${side === 'w' ? 'White' : 'Black'} to move.`, true);
    render();
  }

  function squareAt(clientX, clientY, rect) {
    const col = Math.floor((clientX - rect.left) / (rect.width / 8));
    const row = Math.floor((clientY - rect.top) / (rect.height / 8));
    if (col < 0 || row < 0 || col >= 8 || row >= 8) return null;
    const flip = fields.orientation.value === 'black';
    return `${String.fromCharCode(97 + (flip ? 7 - col : col))}${flip ? row + 1 : 8 - row}`;
  }

  function dragAllowed(square) {
    if (setupMode === 'edit') return selectedTool === 'erase' ? null : pieceAt(draft, square);
    const current = new Chess(game.positions[cursor]);
    const piece = current.get(square);
    return piece?.color === current.turn() ? piece : null;
  }

  function cancelDragging() {
    if (dragging?.raf !== null && dragging?.raf !== undefined) cancelAnimationFrame(dragging.raf);
    dragging = null;
    fields.dragPiece.hidden = true;
    fields.dragPiece.replaceChildren();
  }

  function beginDrag(event) {
    if (!isInteractive() || event.button !== 0 || generation) return;
    const rect = fields.board.getBoundingClientRect();
    const square = squareAt(event.clientX, event.clientY, rect);
    if (!square) return;
    const piece = dragAllowed(square);
    dragging = { pointerId: event.pointerId, from: square, x: event.clientX, y: event.clientY, rect, piece, moved: false, raf: null, dx: 0, dy: 0 };
    fields.board.setPointerCapture(event.pointerId);
    if (piece) {
      const flipped = fields.orientation.value === 'black';
      const col = flipped ? 7 - (square.charCodeAt(0) - 97) : square.charCodeAt(0) - 97;
      const row = flipped ? Number(square[1]) - 1 : 8 - Number(square[1]);
      const side = rect.width / 8;
      const layer = fields.dragPiece;
      layer.style.left = `${col * side}px`;
      layer.style.top = `${row * side}px`;
      layer.style.width = `${side}px`;
      layer.style.height = `${side}px`;
      layer.style.transform = 'translate3d(0,0,0)';
      const id = `${piece.color}${piece.type.toUpperCase()}`;
      if (fields.pieces.value === 'wikipedia') {
        const image = document.createElement('img');
        image.src = `${imgBase}${id}.png`;
        image.draggable = false;
        image.alt = '';
        layer.appendChild(image);
      } else {
        const symbol = document.createElement('span');
        symbol.textContent = glyphs[id];
        symbol.className = piece.color === 'w' ? 'is-white' : 'is-black';
        layer.appendChild(symbol);
      }
      layer.hidden = false;
      // Origin disappears while the one dragged piece follows the pointer.
      render();
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    const current = dragging;
    if (!current || event.pointerId !== current.pointerId || !current.piece) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) < 4 && !current.moved) return;
    current.moved = true;
    current.dx = dx;
    current.dy = dy;
    if (current.raf !== null) return;
    current.raf = requestAnimationFrame(() => {
      if (dragging !== current) return;
      fields.dragPiece.style.transform = `translate3d(${current.dx}px,${current.dy}px,0)`;
      current.raf = null;
    });
  }

  function finishDrag(event, cancelled = false) {
    const current = dragging;
    if (!current || event.pointerId !== current.pointerId) return;
    try { if (fields.board.hasPointerCapture(event.pointerId)) fields.board.releasePointerCapture(event.pointerId); } catch (_) {}
    const target = cancelled ? null : squareAt(event.clientX, event.clientY, current.rect);
    const move = current.moved && current.piece && target && target !== current.from;
    cancelDragging();
    if (cancelled) { render(); return; }
    if (move && setupMode === 'edit') updateDraft(moveDraftPiece(draft, current.from, target));
    else if (move) handleBoardSquare(target, current.from);
    else handleBoardSquare(target);
    render();
  }

  function onBoardKey(event) {
    if (!isInteractive()) return;
    const file = keyboardSquare.charCodeAt(0) - 97;
    const rank = Number(keyboardSquare[1]);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const flip = fields.orientation.value === 'black';
      const column = Math.max(0, Math.min(7, file + (event.key === 'ArrowLeft' ? (flip ? 1 : -1) : event.key === 'ArrowRight' ? (flip ? -1 : 1) : 0)));
      const row = Math.max(1, Math.min(8, rank + (event.key === 'ArrowUp' ? (flip ? -1 : 1) : event.key === 'ArrowDown' ? (flip ? 1 : -1) : 0)));
      keyboardSquare = `${String.fromCharCode(97 + column)}${row}`;
      fields.board.setAttribute('aria-label', `Setup chessboard, selected square ${keyboardSquare}. Press Enter to ${setupMode === 'edit' ? 'edit' : 'play'}.`);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleBoardSquare(keyboardSquare); }
    else if (event.key === 'Escape') { selectedSquare = null; render(); }
    else if ((event.key === 'Backspace' || event.key === 'Delete') && setupMode === 'edit') {
      event.preventDefault(); updateDraft(editDraft(draft, keyboardSquare));
    }
  }

  async function generate() {
    if (!game || game.plies === 0 || inputDirty || isEditing() || generation) return;
    pause();
    let frames;
    try { frames = frameRange(game.plies, fields.start.valueAsNumber, fields.end.valueAsNumber); }
    catch (error) { announce(error.message, true); setTab('export'); return; }
    const size = Number(fields.size.value);
    const delay = Number(fields.speed.value);
    const config = settings();
    const sourceGame = game;
    invalidateExport();
    const controller = new AbortController();
    generation = controller;
    fields.progress.hidden = false;
    fields.progress.value = 0;
    fields.create.disabled = true;
    announce(`Creating GIF… 0 of ${frames.length} frames`);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    try {
      if (!ctx) throw new Error('Your browser does not support canvas-based GIF export.');
      const blob = await encodeGif({
        width: size, height: size, frameCount: frames.length, signal: controller.signal,
        durationAt: index => index === frames.length - 1 ? Math.min(delay * 2, 4500) : delay,
        frameAt: index => {
          const ply = frames[index];
          paintBoard(canvas, sourceGame.positions[ply], ply ? sourceGame.moves[ply - 1] : null, config);
          return ctx.getImageData(0, 0, size, size).data;
        },
        onProgress: (done, total) => {
          fields.progress.value = done / total * 100;
          if (done === total || done % 5 === 0) announce(`Creating GIF… ${done} of ${total} frames`);
        }
      });
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      const slug = `${sourceGame.white}-vs-${sourceGame.black}`.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'chess-game';
      fields.download.href = objectUrl;
      fields.download.download = `caissa-${slug}.gif`;
      fields.download.hidden = false;
      announce(`GIF ready! ${frames.length} frames · ${(blob.size / 1024 / 1024).toFixed(2)} MiB. Download it below.`);
    } catch (error) {
      if (error?.name !== 'AbortError') announce(error?.message || 'GIF generation failed. Please try again.', true);
    } finally {
      if (generation === controller) {
        generation = null;
        fields.progress.hidden = true;
        render();
      }
    }
  }

  for (const tab of fields.tabs) {
    tab.addEventListener('click', () => setTab(tab.dataset.gifTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = Array.from(fields.tabs);
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      setTab(tabs[next].dataset.gifTab);
      tabs[next].focus();
    });
  }
  fields.load.addEventListener('click', () => loadPgn(fields.pgn.value));
  fields.loadFen.addEventListener('click', () => loadFen(fields.fen.value));
  fields.fen.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); loadFen(fields.fen.value); } });
  fields.open.addEventListener('click', () => fields.file.click());
  fields.example.addEventListener('click', () => { fields.pgn.value = EXAMPLE_PGN; loadPgn(EXAMPLE_PGN); });
  fields.file.addEventListener('change', async () => {
    const file = fields.file.files?.[0];
    if (!file) return;
    if (file.size > MAX_PGN_BYTES) { announce('This PGN file is too large (maximum 256 KiB).', true); fields.file.value = ''; return; }
    try { fields.pgn.value = await file.text(); loadPgn(fields.pgn.value); }
    catch { announce('Could not read the selected PGN file.', true); }
    fields.file.value = '';
  });
  fields.pgn.addEventListener('input', () => {
    inputDirty = true;
    pause();
    invalidateExport();
    announce('PGN changed. Select Load PGN to use the new game.');
    render();
  });

  fields.first.addEventListener('click', () => { pause(); moveTo(0); });
  fields.previous.addEventListener('click', () => { pause(); moveTo(cursor - 1); });
  fields.next.addEventListener('click', () => { pause(); moveTo(cursor + 1); });
  fields.last.addEventListener('click', () => { pause(); moveTo(game?.plies || 0); });
  fields.position.addEventListener('input', () => { pause(); moveTo(fields.position.valueAsNumber); });
  fields.play.addEventListener('click', () => {
    if (!game || !game.plies || inputDirty || isEditing()) return;
    if (timer !== null) { pause(); return; }
    if (cursor >= game.plies) moveTo(0);
    root.querySelector('[data-gif-play-icon]').textContent = 'Ⅱ';
    root.querySelector('[data-gif-play-label]').textContent = 'Pause';
    fields.play.setAttribute('aria-label', 'Pause game');
    timer = setInterval(() => {
      if (cursor >= game.plies) { pause(); return; }
      moveTo(cursor + 1);
      if (cursor >= game.plies) pause();
    }, Number(fields.speed.value));
  });
  for (const element of [fields.theme, fields.pieces, fields.orientation, fields.start, fields.end, fields.speed, fields.size]) {
    element.addEventListener('change', () => {
      invalidateExport();
      if (game && !inputDirty) announce('Settings updated. Create a GIF to export these choices.');
      if ([fields.theme, fields.pieces, fields.orientation].includes(element)) render();
      if (element === fields.speed && timer !== null) pause();
    });
  }
  fields.create.addEventListener('click', generate);

  fields.presetLoad.addEventListener('click', () => {
    const preset = fields.preset.value;
    updateDraft(createDraft(preset === 'empty' ? '8/8/8/8/8/8/8/8 w - - 0 1' : SETUP_PRESETS[preset]));
    announce('Position preset loaded into the editor. Apply it when ready.');
  });
  fields.clearSetup.addEventListener('click', () => {
    updateDraft(createDraft('8/8/8/8/8/8/8/8 w - - 0 1'));
    announce('Board cleared. Place one king per side before applying.');
  });
  for (const button of fields.setupTools) button.addEventListener('click', () => chooseTool(button.dataset.gifSetupTool));
  for (const button of fields.setupPieces) button.addEventListener('click', () => chooseTool(button.dataset.gifSetupPiece));
  fields.turn.addEventListener('change', () => {
    updateDraft({ ...draft, turn: fields.turn.value, ep: '-' });
  });
  for (const input of fields.castling) input.addEventListener('change', () => {
    const rights = [...'KQkq'].filter(flag => flag === input.dataset.gifCastling ? input.checked : draft.castling.includes(flag)).join('');
    updateDraft({ ...draft, castling: rights, ep: '-' });
  });
  fields.applyPosition.addEventListener('click', applyDraft);
  fields.discardDraft.addEventListener('click', () => {
    setupInitialized = false;
    draft = null;
    setupMode = 'edit';
    selectedSquare = null;
    setTab('import');
    announce('Draft discarded. The previously loaded game or line remains unchanged.');
  });
  fields.editPosition.addEventListener('click', () => {
    pause();
    draft = createDraft(game?.positions[cursor] || START_FEN);
    setupMode = 'edit';
    selectedTool = 'move';
    selectedSquare = null;
    announce('Editing a separate draft. Apply position to replace the recorded line.');
    render();
  });
  fields.undoMove.addEventListener('click', () => {
    if (!game?.plies || setupMode !== 'record') return;
    pause();
    invalidateExport();
    game = { ...game, positions: game.positions.slice(0, -1), moves: game.moves.slice(0, -1), plies: game.plies - 1 };
    cursor = game.plies;
    syncTimeline();
    announce('Last move removed.');
    render();
  });
  fields.copyFen.addEventListener('click', async () => {
    const value = fields.setupFen.textContent;
    try { await navigator.clipboard.writeText(value); announce('FEN copied to clipboard.'); }
    catch { announce('Could not copy FEN. Select and copy the displayed FEN manually.', true); }
  });
  fields.board.addEventListener('pointerdown', beginDrag);
  fields.board.addEventListener('pointermove', onPointerMove);
  fields.board.addEventListener('pointerup', event => finishDrag(event));
  fields.board.addEventListener('pointercancel', event => finishDrag(event, true));
  fields.board.addEventListener('lostpointercapture', () => { if (dragging) { cancelDragging(); render(); } });
  fields.board.addEventListener('keydown', onBoardKey);
  fields.board.addEventListener('contextmenu', event => { if (isInteractive()) event.preventDefault(); });
  window.addEventListener('beforeunload', () => { pause(); cancelDragging(); invalidateExport(); });
  render();

  // CAISSA's existing, same-origin Wikipedia piece images.
  for (const id of Object.keys(glyphs)) {
    const image = new Image();
    pieceImages.set(id, image);
    image.addEventListener('load', () => render(), { once: true });
    image.src = `${imgBase}${id}.png`;
  }
})();
