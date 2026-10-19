import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { EXAMPLE_PGN, MAX_PGN_BYTES, parseGame, frameRange, fenSquares } from './game-model.js';
import { encodeGif } from './gif-encoder.js';

(function () {
  'use strict';
  const root = document.querySelector('[data-gif-studio]');
  if (!root) return;
  const $ = selector => root.querySelector(`[data-gif-${selector}]`);
  const fields = Object.freeze({
    board: root.querySelector('#gif-board'),
    pgn: $('pgn'), file: $('file'), open: $('open'), load: $('load'), example: $('example'),
    tabs: root.querySelectorAll('[data-gif-tab]'), panels: root.querySelectorAll('[data-gif-panel]'),
    white: $('white'), black: $('black'), result: $('result'), ply: $('ply'), count: $('count'),
    first: $('first'), previous: $('previous'), play: $('play'), next: $('next'), last: $('last'),
    position: $('position'), positionValue: $('position-value'),
    theme: $('theme'), pieces: $('pieces'), orientation: $('orientation'),
    start: $('start'), end: $('end'), speed: $('speed'), size: $('size'),
    create: $('create'), download: $('download'), status: $('status'), progress: $('progress')
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

  function announce(text, error = false) {
    fields.status.textContent = text;
    fields.status.classList.toggle('is-error', error);
  }

  function invalidateExport() {
    generation?.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    fields.download.hidden = true;
    fields.download.removeAttribute('href');
  }

  function setTab(id) {
    for (const tab of fields.tabs) {
      const selected = tab.dataset.gifTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of fields.panels) panel.hidden = panel.dataset.gifPanel !== id;
  }

  function settings() {
    return {
      colors: schemes[fields.theme.value] || schemes.green,
      pieces: fields.pieces.value === 'symbols' ? 'symbols' : 'wikipedia',
      orientation: fields.orientation.value === 'black' ? 'black' : 'white'
    };
  }

  function paintBoard(canvas, fen, lastMove, config) {
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
        context.fillRect(x, y, square + 0.25, square + 0.25);
        const file = String.fromCharCode(97 + c);
        const rank = String(8 - r);
        const coord = `${file}${rank}`;
        if (coord === lastMove?.from || coord === lastMove?.to) {
          context.fillStyle = 'rgba(247,211,56,0.36)';
          context.fillRect(x, y, square, square);
        }
        context.save();
        context.fillStyle = dark ? '#f1f5e6' : '#38473a';
        context.globalAlpha = 0.78;
        context.font = `600 ${Math.max(9, Math.floor(square * .16))}px system-ui, sans-serif`;
        if (visualCol === 0) { context.textAlign = 'left'; context.textBaseline = 'top'; context.fillText(rank, x + 3, y + 3); }
        if (visualRow === 7) { context.textAlign = 'right'; context.textBaseline = 'bottom'; context.fillText(file, x + square - 3, y + square - 2); }
        context.restore();
        const piece = position[r][c];
        if (!piece) continue;
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
    fields.play.querySelector('i').className = 'fas fa-play';
    fields.play.querySelector('span').textContent = 'Play';
    fields.play.setAttribute('aria-label', 'Play game');
  }

  function render() {
    const position = game?.positions[cursor] || START_FEN;
    const move = cursor > 0 ? game?.moves[cursor - 1] : null;
    paintBoard(fields.board, position, move, settings());
    fields.white.textContent = game?.white || 'White';
    fields.black.textContent = game?.black || 'Black';
    fields.result.textContent = game?.result || '—';
    fields.ply.textContent = move ? `Move ${Math.ceil(cursor / 2)}${cursor % 2 ? '. White' : '... Black'}: ${move.san}` : 'Starting position';
    fields.count.textContent = `${game?.plies || 0} half-moves`;
    fields.position.value = cursor;
    fields.positionValue.textContent = String(cursor);
    const hasGame = Boolean(game && !inputDirty);
    for (const button of [fields.first, fields.previous, fields.play, fields.next, fields.last]) button.disabled = !hasGame;
    fields.position.disabled = !hasGame;
    fields.create.disabled = !hasGame || Boolean(generation);
  }

  function moveTo(ply) {
    if (!game) return;
    cursor = Math.max(0, Math.min(game.plies, ply));
    render();
  }

  function loadPgn(source) {
    pause();
    invalidateExport();
    try {
      const loaded = parseGame(source, Chess);
      game = loaded;
      inputDirty = false;
      cursor = 0;
      fields.position.max = String(loaded.plies);
      fields.start.value = '0';
      fields.start.max = String(loaded.plies);
      fields.end.value = String(loaded.plies);
      fields.end.max = String(loaded.plies);
      announce(`Game loaded: ${loaded.white} vs ${loaded.black} · ${loaded.plies} half-moves. Customize and create your GIF.`);
    } catch (error) {
      game = null;
      inputDirty = false;
      cursor = 0;
      fields.position.max = '1';
      fields.start.value = '0';
      fields.end.value = '0';
      fields.start.max = '0';
      fields.end.max = '0';
      announce(error instanceof Error ? error.message : 'Could not load the PGN.', true);
    }
    render();
  }

  async function generate() {
    if (!game || inputDirty || generation) return;
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
        fields.create.disabled = !game || inputDirty;
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
    if (!game || inputDirty) return;
    if (timer !== null) { pause(); return; }
    if (cursor >= game.plies) moveTo(0);
    fields.play.querySelector('i').className = 'fas fa-pause';
    fields.play.querySelector('span').textContent = 'Pause';
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
  window.addEventListener('beforeunload', () => { pause(); invalidateExport(); });
  render();

  // CAISSA's existing, same-origin, license-tracked Wikipedia piece set.
  for (const id of Object.keys(glyphs)) {
    const image = new Image();
    pieceImages.set(id, image);
    image.addEventListener('load', () => render(), { once: true });
    image.src = `${imgBase}${id}.png`;
  }
})();
