(function () {
  const state = {
    game: null,
    board: null,
    boardFlipped: false,
    boardScale: 1,
    openingPositionIndex: null,
    ecoCodeDefs: [],
    datasetsLoaded: false,
    datasetsError: '',
    positionRequestId: 0
  };

  const els = {
    board: document.getElementById('openingDbBoard'),
    moveList: document.getElementById('odbMoveList'),
    turnPly: document.getElementById('odbTurnPly'),
    openingLabel: document.getElementById('odbOpeningLabel'),
    lookupStatus: document.getElementById('odbLookupStatus'),
    datasetBanner: document.getElementById('odbDatasetBanner'),
    statsBody: document.getElementById('odbStatsBody'),
    boardShell: document.querySelector('.openingdb-board-shell'),
    smallerBtn: document.getElementById('odbSmallerBtn'),
    biggerBtn: document.getElementById('odbBiggerBtn'),
    startBtn: document.getElementById('odbStartBtn'),
    takebackBtn: document.getElementById('odbTakebackBtn'),
    flipBtn: document.getElementById('odbFlipBtn'),
    fenToggleBtn: document.getElementById('odbFenToggleBtn'),
    fenPanel: document.getElementById('odbFenPanel'),
    fenInput: document.getElementById('odbFenInput'),
    applyFenBtn: document.getElementById('odbApplyFenBtn'),
    cancelFenBtn: document.getElementById('odbCancelFenBtn'),
    fenError: document.getElementById('odbFenError')
  };

  const DEBUG = (() => {
    const qs = new URLSearchParams(window.location.search).get('debug') === '1';
    let ls = false;
    try {
      ls = window.localStorage && localStorage.getItem('caissa.openingdb.debug') === '1';
    } catch (_err) {
      ls = false;
    }
    return qs || ls;
  })();

  function debugLog(...args) {
    if (!DEBUG) return;
    console.log('[OpeningDB]', ...args);
  }

  function renderBoardFatal(message) {
    if (!els.board) return;
    els.board.innerHTML = `<div class="openingdb-board-error" role="alert">${message}</div>`;
  }

  function showDatasetBanner(message) {
    if (!els.datasetBanner) return;
    if (!message) {
      els.datasetBanner.hidden = true;
      els.datasetBanner.textContent = '';
      return;
    }
    els.datasetBanner.hidden = false;
    els.datasetBanner.textContent = message;
  }

  function normalizeFenForHash(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) return String(fen || '').trim();
    return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
  }

  function fnv1a64(input) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const text = String(input || '');

    for (let i = 0; i < text.length; i += 1) {
      hash ^= BigInt(text.charCodeAt(i));
      hash = (hash * prime) & 0xffffffffffffffffn;
    }

    return hash.toString(16).padStart(16, '0');
  }

  function hashFen(fen) {
    return fnv1a64(normalizeFenForHash(fen));
  }

  function normalizeSanToken(token) {
    return String(token || '')
      .replace(/^\d+\.(\.\.)?/, '')
      .replace(/^\.\.\./, '')
      .replace(/[!?+#]+$/g, '')
      .trim();
  }

  function parseDefiningMoves(moveText) {
    const txt = String(moveText || '')
      .replace(/\r/g, '\n')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/;[^\n]*/g, ' ')
      .replace(/\$\d+/g, ' ');

    return txt
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !(t === '1-0' || t === '0-1' || t === '1/2-1/2' || t === '*' || /^\d+\.(\.\.)?$/.test(t) || t === '...'))
      .map(normalizeSanToken)
      .filter(Boolean);
  }

  function isPrefix(prefix, full) {
    if (!Array.isArray(prefix) || !Array.isArray(full)) return false;
    if (prefix.length === 0 || prefix.length > full.length) return false;
    for (let i = 0; i < prefix.length; i += 1) {
      if (prefix[i] !== full[i]) return false;
    }
    return true;
  }

  function formatMoveList() {
    const moves = state.game.history({ verbose: false });
    const chunks = [];
    for (let i = 0; i < moves.length; i += 2) {
      const turn = Math.floor(i / 2) + 1;
      const white = moves[i] || '';
      const black = moves[i + 1] || '';
      chunks.push(`${turn}.${white}${black ? ` ${black}` : ''}`);
    }
    return chunks.join(' ');
  }

  function toPercent(numerator, denominator) {
    const n = Number(numerator) || 0;
    const d = Number(denominator) || 0;
    if (d <= 0) return 0;
    return (n / d) * 100;
  }

  function dominantClass(wPct, dPct, lPct) {
    if (wPct >= dPct && wPct >= lPct) return 'row-win';
    if (dPct >= wPct && dPct >= lPct) return 'row-draw';
    return 'row-loss';
  }

  function renderStatsRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      els.statsBody.innerHTML = '<tr><td colspan="10" class="openingdb-empty">No data for this position yet (TBD).</td></tr>';
      return;
    }

    const total = rows.reduce((sum, r) => sum + (Number(r.games) || Number(r.count) || Number(r.n) || 0), 0);
    els.statsBody.innerHTML = rows.map((row) => {
      const n = Number(row.games) || Number(row.count) || Number(row.n) || 0;
      const w = Number(row.whiteWins) || Number(row.w) || Number(row.winsCount) || 0;
      const d = Number(row.drawsCount) || Number(row.d) || Number(row.drawCount) || 0;
      const l = Number(row.blackWins) || Number(row.l) || Number(row.lossesCount) || 0;
      const sample = w + d + l;
      const winsPctFromIndex = Number(row.wins);
      const drawsPctFromIndex = Number(row.draws);
      const lossesPctFromIndex = Number(row.losses);
      const percFromIndex = Number(row.perc);
      const valueFromIndex = Number(row.value);
      const wPct = sample > 0 ? toPercent(w, sample) : (Number.isFinite(winsPctFromIndex) ? winsPctFromIndex : 0);
      const dPct = sample > 0 ? toPercent(d, sample) : (Number.isFinite(drawsPctFromIndex) ? drawsPctFromIndex : 0);
      const lPct = sample > 0 ? toPercent(l, sample) : (Number.isFinite(lossesPctFromIndex) ? lossesPctFromIndex : 0);
      const value = Number.isFinite(valueFromIndex)
        ? valueFromIndex
        : (sample > 0 ? ((w + 0.5 * d) / sample) * 100 : 0);
      const perc = Number.isFinite(percFromIndex) ? percFromIndex : (total > 0 ? toPercent(n, total) : 0);
      const year = row.year || row.lastYearSeen || 'TBD';

      return `
        <tr class="${dominantClass(wPct, dPct, lPct)}">
          <td class="col-move">${row.move || row.san || row.uci || 'TBD'}</td>
          <td>${Number.isFinite(value) ? `${value.toFixed(1)}%` : 'TBD'}</td>
          <td>${n > 0 ? n : 'TBD'}</td>
          <td class="col-perc">${Number.isFinite(perc) ? `${perc.toFixed(1)}%` : 'TBD'}</td>
          <td>TBD</td>
          <td>TBD</td>
          <td>${year}</td>
          <td>${Number.isFinite(wPct) ? `${wPct.toFixed(1)}%` : 'TBD'}</td>
          <td>${Number.isFinite(dPct) ? `${dPct.toFixed(1)}%` : 'TBD'}</td>
          <td>${Number.isFinite(lPct) ? `${lPct.toFixed(1)}%` : 'TBD'}</td>
        </tr>
      `;
    }).join('');
  }

  function resolveOpeningByPosition(fen) {
    const hash = hashFen(fen);
    const played = state.game.history({ verbose: false }).map(normalizeSanToken);

    let best = null;
    for (const def of state.ecoCodeDefs || []) {
      if (isPrefix(def.moves, played)) {
        if (!best || def.moves.length > best.moves.length) best = def;
      }
    }

    if (best) {
      return {
        hash,
        eco: best.eco || '',
        name: best.name || 'Opening: (TBD)',
        source: 'eco_codes_prefix'
      };
    }

    return {
      hash,
      eco: '',
      name: 'Opening: (TBD)',
      source: 'unknown'
    };
  }

  function getOpeningIndexEntry(fenKey) {
    if (!state.openingPositionIndex) return null;
    if (state.openingPositionIndex.positions && state.openingPositionIndex.positions[fenKey]) {
      return state.openingPositionIndex.positions[fenKey];
    }
    if (state.openingPositionIndex[fenKey]) {
      return state.openingPositionIndex[fenKey];
    }
    return null;
  }

  async function updatePositionView() {
    const requestId = (state.positionRequestId || 0) + 1;
    state.positionRequestId = requestId;

    const fen = state.game.fen();
    const fenKey = normalizeFenForHash(fen);
    const hash = hashFen(fen);
    debugLog('updatePosition key', { requestId, fen: fenKey, hash });

    await Promise.resolve();
    if (requestId !== state.positionRequestId) return;

    const ply = state.game.history({ verbose: false }).length;
    els.moveList.value = formatMoveList() || '(start position)';
    if (els.turnPly) {
      els.turnPly.textContent = `Turn: ${state.game.turn() === 'w' ? 'White' : 'Black'} | Ply: ${ply}`;
    }

    const opening = resolveOpeningByPosition(fen);
    const positionEntry = getOpeningIndexEntry(fenKey);
    const hasExact = !!(positionEntry && Array.isArray(positionEntry.moves) && positionEntry.moves.length > 0);

    let openingText = 'Opening: (TBD)';
    if (positionEntry && positionEntry.opening) {
      openingText = positionEntry.opening;
    } else if (opening.eco || opening.name !== 'Opening: (TBD)') {
      openingText = opening.eco ? `${opening.name} (${opening.eco})` : opening.name;
    }
    els.openingLabel.textContent = openingText;

    const rows = hasExact
      ? positionEntry.moves.slice(0, 12).map((row) => ({ ...row, year: positionEntry.year || row.year || null }))
      : [];
    renderStatsRows(rows);

    if (!state.datasetsLoaded) {
      els.lookupStatus.textContent = state.datasetsError || 'Loading datasets...';
    } else if (hasExact) {
      els.lookupStatus.textContent = 'Position lookup: exact match';
    } else {
      els.lookupStatus.textContent = 'Position lookup: no exact match (placeholders)';
    }
  }

  function validateFenInput(rawFen) {
    const fen = String(rawFen || '').trim();
    if (!fen) return { ok: false, message: 'FEN is empty.' };
    const parts = fen.split(/\s+/);
    if (parts.length !== 6) {
      return { ok: false, message: 'FEN must contain 6 fields.' };
    }
    return { ok: true, fen };
  }

  function setBoardScale(nextScale) {
    const clamped = Math.max(0.7, Math.min(1.45, nextScale));
    state.boardScale = clamped;
    els.boardShell.style.setProperty('--odb-board-scale', clamped.toFixed(2));
    setTimeout(() => {
      if (state.board && typeof state.board.resize === 'function') {
        state.board.resize();
      }
    }, 20);
  }

  async function loadDatasets() {
    let indexLoaded = false;
    let ecoCodesLoaded = false;

    try {
      const [indexRes, ecoCodesRes] = await Promise.allSettled([
        fetch('/data/opening_position_index.json', { cache: 'force-cache' }),
        fetch('/data/eco/eco_codes.json', { cache: 'force-cache' })
      ]);

      if (indexRes.status === 'fulfilled' && indexRes.value.ok) {
        state.openingPositionIndex = await indexRes.value.json();
        indexLoaded = true;
      }

      if (ecoCodesRes.status === 'fulfilled' && ecoCodesRes.value.ok) {
        const ecoCodes = await ecoCodesRes.value.json();
        if (Array.isArray(ecoCodes)) {
          state.ecoCodeDefs = ecoCodes
            .filter((row) => row && row.code && row.name)
            .map((row) => ({
              eco: String(row.code),
              name: String(row.name),
              moves: parseDefiningMoves(row.moves || '')
            }))
            .filter((row) => row.moves.length > 0);
          ecoCodesLoaded = true;
        }
      }

      state.datasetsLoaded = true;
      state.datasetsError = '';

      const missing = [];
      if (!indexLoaded) missing.push('opening_position_index.json');
      if (!ecoCodesLoaded) missing.push('eco_codes.json');
      if (missing.length > 0) {
        showDatasetBanner(`Lookup unavailable: missing ${missing.join(', ')}`);
      } else {
        showDatasetBanner('');
      }

      debugLog('datasets loaded', {
        openingPositionIndexLoaded: indexLoaded,
        ecoCodesLoaded,
        ecoPositionMapLoaded: false
      });
    } catch (error) {
      state.datasetsLoaded = false;
      state.datasetsError = 'Dataset fetch failed. Showing placeholders.';
      showDatasetBanner('Lookup unavailable');
      console.warn('[OpeningDB] dataset load error', error);
      debugLog('datasets loaded', {
        openingPositionIndexLoaded: indexLoaded,
        ecoCodesLoaded,
        ecoPositionMapLoaded: false
      });
    }

    updatePositionView();
  }

  function bindEvents() {
    els.startBtn.addEventListener('click', () => {
      state.game.reset();
      state.board.position('start', false);
      updatePositionView();
    });

    els.takebackBtn.addEventListener('click', () => {
      const undone = state.game.undo();
      if (!undone) return;
      state.board.position(state.game.fen(), false);
      updatePositionView();
    });

    els.flipBtn.addEventListener('click', () => {
      state.boardFlipped = !state.boardFlipped;
      state.board.orientation(state.boardFlipped ? 'black' : 'white');
      if (typeof state.board.resize === 'function') {
        state.board.resize();
      }
    });

    els.fenToggleBtn.addEventListener('click', () => {
      const open = !els.fenPanel.hidden;
      els.fenPanel.hidden = open;
      els.fenError.hidden = true;
      if (!open) {
        els.fenInput.value = state.game.fen();
      }
    });

    els.cancelFenBtn.addEventListener('click', () => {
      els.fenPanel.hidden = true;
      els.fenError.hidden = true;
    });

    els.applyFenBtn.addEventListener('click', () => {
      const check = validateFenInput(els.fenInput.value);
      if (!check.ok) {
        els.fenError.hidden = false;
        els.fenError.textContent = check.message;
        return;
      }

      try {
        state.game.load(check.fen);
      } catch (_err) {
        els.fenError.hidden = false;
        els.fenError.textContent = 'Invalid FEN.';
        return;
      }

      els.fenError.hidden = true;
      els.fenPanel.hidden = true;
      state.board.position(state.game.fen(), false);
      updatePositionView();
    });

    els.smallerBtn.addEventListener('click', () => setBoardScale(state.boardScale - 0.08));
    els.biggerBtn.addEventListener('click', () => setBoardScale(state.boardScale + 0.08));

    window.addEventListener('resize', () => {
      if (state.board && typeof state.board.resize === 'function') {
        state.board.resize();
      }
    });
  }

  function initBoard() {
    state.game = new Chess();

    try {
      state.board = Chessboard('openingDbBoard', {
        draggable: true,
        position: 'start',
        showNotation: true,
        pieceTheme: '/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: (source, piece) => {
          if (state.game.game_over()) return false;
          if ((state.game.turn() === 'w' && String(piece || '').startsWith('b')) ||
              (state.game.turn() === 'b' && String(piece || '').startsWith('w'))) {
            return false;
          }
          return true;
        },
        onDrop: (source, target, piece, newPos, oldPos, orientation) => {
          console.log('[OpeningDB] onDrop', { source, target, piece, fenBefore: state.game.fen(), orientation });

          if ((state.game.turn() === 'w' && String(piece || '').startsWith('b')) ||
              (state.game.turn() === 'b' && String(piece || '').startsWith('w'))) {
            console.warn('[OpeningDB] illegal move: wrong turn piece', { source, target, piece });
            return 'snapback';
          }

          const move = state.game.move({ from: source, to: target, promotion: 'q' });
          if (move === null) {
            console.warn('[OpeningDB] illegal move', { source, target, piece });
            return 'snapback';
          }

          console.log('[OpeningDB] legal move', { san: move.san, fenAfter: state.game.fen() });
          state.board.position(state.game.fen(), false);
          updatePositionView();
          return undefined;
        },
        onSnapEnd: () => {
          state.board.position(state.game.fen(), false);
        }
      });
    } catch (err) {
      console.error('[OpeningDB] Board failed to initialize', err);
      renderBoardFatal(`Board failed to initialize: ${err && err.message ? err.message : String(err)}`);
      throw err;
    }

    setTimeout(() => {
      if (state.board && typeof state.board.resize === 'function') {
        state.board.resize();
      }
      const childCount = els.board ? els.board.children.length : 0;
      console.log('[OpeningDB] board child count', childCount);
      if (childCount === 0) {
        const msg = 'Chessboard did not render markup';
        console.error('[OpeningDB] ' + msg);
        renderBoardFatal(msg);
      }
    }, 60);
  }

  function runInit() {
    console.log('[OpeningDB] init start');
    console.log('[OpeningDB] Chessboard typeof:', typeof window.Chessboard);
    console.log('[OpeningDB] Chess typeof:', typeof window.Chess);
    console.log('[OpeningDB] jQuery typeof:', typeof window.jQuery);
    console.log('[OpeningDB] jQuery.fn typeof:', window.jQuery ? typeof window.jQuery.fn : 'undefined');
    console.log('[OpeningDB] boardEl exists:', !!document.getElementById('openingDbBoard'));

    if (!els.board) {
      console.error('[OpeningDB] Board element missing');
      return;
    }

    if (!window.Chess || !window.Chessboard) {
      const msg = 'Board failed to initialize: Chess dependencies not available';
      console.error('[OpeningDB] ' + msg);
      renderBoardFatal(msg);
      return;
    }

    try {
      initBoard();
      bindEvents();
      updatePositionView();
      loadDatasets();
    } catch (err) {
      console.error('[OpeningDB] init fatal', err);
      renderBoardFatal(`Board failed to initialize: ${err && err.message ? err.message : String(err)}`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit, { once: true });
  } else {
    runInit();
  }
})();

