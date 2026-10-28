(function (global) {
  'use strict';

  const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

  function resolvePrimaryMove(fen, pv) {
    if (typeof global.Chess !== 'function' || typeof fen !== 'string' || !Array.isArray(pv) || !pv.length) return null;
    const uci = String(pv[0] || '').trim().toLowerCase();
    const match = uci.match(UCI_MOVE);
    if (!match) return null;
    try {
      const game = new global.Chess(fen);
      const requestedPromotion = match[3] || null;
      const move = game.move({ from: match[1], to: match[2], promotion: requestedPromotion || 'q' });
      if (!move) return null;
      if (Boolean(move.promotion) !== Boolean(requestedPromotion)) return null;
      return Object.freeze({ uci, from: match[1], to: match[2], promotion: requestedPromotion });
    } catch (_) {
      return null;
    }
  }

  function create(options = {}) {
    const board = options.board;
    const overlay = options.overlay;
    const line = options.line;
    const fenTools = options.fenTools;
    if (!board || !overlay || !line || !fenTools?.coordsFromSquare) return null;

    let enabled = options.enabled !== false;
    let engineActive = false;
    let currentFen = '';
    let currentMove = null;
    let frame = 0;

    function hide() {
      overlay.setAttribute("hidden", "");
      delete overlay.dataset.move;
      delete overlay.dataset.from;
      delete overlay.dataset.to;
    }

    function squareElement(square) {
      const coords = fenTools.coordsFromSquare(square);
      if (!coords) return null;
      return board.querySelector(`.sq[data-row="${coords.row}"][data-col="${coords.col}"]`);
    }

    function draw() {
      frame = 0;
      if (!enabled || !engineActive || !currentMove || currentMove.fen !== currentFen || board.hidden) {
        hide();
        return;
      }
      const source = squareElement(currentMove.from);
      const destination = squareElement(currentMove.to);
      if (!source || !destination || board.offsetWidth <= 0 || board.offsetHeight <= 0) {
        hide();
        return;
      }
      const boardRect = board.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const destinationRect = destination.getBoundingClientRect();
      overlay.style.left = board.offsetLeft + 'px';
      overlay.style.top = board.offsetTop + 'px';
      overlay.style.width = board.offsetWidth + 'px';
      overlay.style.height = board.offsetHeight + 'px';
      overlay.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
      line.setAttribute('x1', String(sourceRect.left - boardRect.left + (sourceRect.width / 2)));
      line.setAttribute('y1', String(sourceRect.top - boardRect.top + (sourceRect.height / 2)));
      line.setAttribute('x2', String(destinationRect.left - boardRect.left + (destinationRect.width / 2)));
      line.setAttribute('y2', String(destinationRect.top - boardRect.top + (destinationRect.height / 2)));
      overlay.dataset.move = currentMove.uci;
      overlay.dataset.from = currentMove.from;
      overlay.dataset.to = currentMove.to;
      overlay.removeAttribute("hidden");
    }

    function scheduleDraw() {
      if (frame) return;
      frame = global.requestAnimationFrame(draw);
    }

    function clear() {
      currentMove = null;
      hide();
    }

    function setPosition(fen) {
      currentFen = typeof fen === 'string' ? fen : '';
      clear();
    }

    function showPrimaryVariation({ fen, pv } = {}) {
      if (!engineActive || fen !== currentFen) return false;
      const move = resolvePrimaryMove(fen, pv);
      if (!move) {
        clear();
        return false;
      }
      if (currentMove?.fen === fen && currentMove.uci === move.uci) return true;
      currentMove = Object.freeze({ ...move, fen });
      if (enabled) scheduleDraw();
      else hide();
      return true;
    }

    function setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) hide();
      else if (engineActive && currentMove) scheduleDraw();
    }

    function setEngineActive(value) {
      engineActive = Boolean(value);
      if (!engineActive) hide();
      else if (enabled && currentMove) scheduleDraw();
    }

    const refresh = () => {
      if (enabled && engineActive && currentMove) scheduleDraw();
      else hide();
    };
    const resizeObserver = typeof global.ResizeObserver === 'function' ? new global.ResizeObserver(refresh) : null;
    resizeObserver?.observe(board);
    global.addEventListener?.('resize', refresh, { passive: true });
    hide();

    return Object.freeze({
      clear,
      refresh,
      setPosition,
      showPrimaryVariation,
      setEnabled,
      setEngineActive,
      isEnabled: () => enabled,
      destroy: () => {
        if (frame) global.cancelAnimationFrame(frame);
        frame = 0;
        resizeObserver?.disconnect();
        global.removeEventListener?.('resize', refresh);
        hide();
      }
    });
  }

  global.CaissaScannerBestMoveArrow = Object.freeze({ create, resolvePrimaryMove });
})(window);
