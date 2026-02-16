(function () {
  const state = {
    game: null,
    board: null,
    boardFlipped: false,
    boardScale: 1,
    ecoStats: null,
    ecoContinuations: null,
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

    const total = rows.reduce((sum, r) => sum + (Number(r.count) || Number(r.n) || 0), 0);
    els.statsBody.innerHTML = rows.map((row) => {
      const n = Number(row.count) || Number(row.n) || 0;
      const w = Number(row.whiteWins) || Number(row.w) || 0;
      const d = Number(row.draws) || Number(row.d) || 0;
      const l = Number(row.blackWins) || Number(row.l) || 0;
      const sample = w + d + l;
      const wPct = toPercent(w, sample);
      const dPct = toPercent(d, sample);
      const lPct = toPercent(l, sample);
      const value = sample > 0 ? ((w + 0.5 * d) / sample) * 100 : 0;
      const perc = total > 0 ? toPercent(n, total) : 0;

      return `
        <tr class="${dominantClass(wPct, dPct, lPct)}">
          <td class="col-move">${row.move || row.san || 'TBD'}</td>
          <td>${sample > 0 ? `${value.toFixed(1)}%` : 'TBD'}</td>
          <td>${n > 0 ? n : 'TBD'}</td>
          <td class="col-perc">${total > 0 ? `${perc.toFixed(1)}%` : 'TBD'}</td>
          <td>TBD</td>
          <td>TBD</td>
          <td>${row.year || 'TBD'}</td>
          <td>${sample > 0 ? `${wPct.toFixed(1)}%` : 'TBD'}</td>
          <td>${sample > 0 ? `${dPct.toFixed(1)}%` : 'TBD'}</td>
          <td>${sample > 0 ? `${lPct.toFixed(1)}%` : 'TBD'}</td>
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

  function buildRowsForPosition(opening, hash, normalizedFen) {
    if (!state.ecoContinuations) return [];

    // Primary adapter lookup by exact key if dataset ever includes exact position keys.
    const exactRows = state.ecoContinuations[hash] || state.ecoContinuations[normalizedFen];
    if (Array.isArray(exactRows) && exactRows.length > 0) {
      return exactRows.slice(0, 12);
    }

    // Fallback by ECO code (current available dataset shape).
    if (opening && opening.eco) {
      const byEco = state.ecoContinuations[opening.eco];
      if (Array.isArray(byEco) && byEco.length > 0) {
        const year = state.ecoStats && state.ecoStats[opening.eco]
          ? (state.ecoStats[opening.eco].lastYearSeen || state.ecoStats[opening.eco].lastDate || 'TBD')
          : 'TBD';
        return byEco.slice(0, 12).map((row) => ({ ...row, year }));
      }
    }

    return [];
  }

  async function updatePositionView() {
    const requestId = (state.positionRequestId || 0) + 1;
    state.positionRequestId = requestId;

    const fen = state.game.fen();
    const normalizedFen = normalizeFenForHash(fen);
    const hash = hashFen(fen);
    debugLog('updatePosition key', { requestId, fen: normalizedFen, hash });

    await Promise.resolve();
    if (requestId !== state.positionRequestId) return;

    const ply = state.game.history({ verbose: false }).length;
    els.moveList.value = formatMoveList() || '(start position)';
    if (els.turnPly) {
      els.turnPly.textContent = `Turn: ${state.game.turn() === 'w' ? 'White' : 'Black'} | Ply: ${ply}`;
    }

    const opening = resolveOpeningByPosition(fen);
    const openingText = opening.eco ? `${opening.name} (${opening.eco})` : opening.name;
    els.openingLabel.textContent = openingText || 'Opening: (TBD)';

    const rows = buildRowsForPosition(opening, hash, normalizedFen);
    renderStatsRows(rows);

    if (!state.datasetsLoaded) {
      els.lookupStatus.textContent = state.datasetsError || 'Loading datasets...';
    } else if (rows.length > 0) {
      els.lookupStatus.textContent = `Position lookup: match (${opening.source})`;
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
    let statsLoaded = false;
    let continuationsLoaded = false;
    let ecoCodesLoaded = false;

    try {
      const [statsRes, contRes, ecoCodesRes] = await Promise.allSettled([
        fetch('/data/eco/eco_stats.json', { cache: 'force-cache' }),
        fetch('/data/eco/eco_popular_continuations.json', { cache: 'force-cache' }),
        fetch('/data/eco/eco_codes.json', { cache: 'force-cache' })
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        state.ecoStats = await statsRes.value.json();
        statsLoaded = true;
      }

      if (contRes.status === 'fulfilled' && contRes.value.ok) {
        state.ecoContinuations = await contRes.value.json();
        continuationsLoaded = true;
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
      if (!statsLoaded) missing.push('eco_stats.json');
      if (!continuationsLoaded) missing.push('eco_popular_continuations.json');
      if (!ecoCodesLoaded) missing.push('eco_codes.json');
      if (missing.length > 0) {
        showDatasetBanner(`Lookup unavailable: missing ${missing.join(', ')}`);
      } else {
        showDatasetBanner('');
      }

      debugLog('datasets loaded', {
        ecoStatsLoaded: statsLoaded,
        ecoContinuationsLoaded: continuationsLoaded,
        ecoCodesLoaded,
        ecoPositionMapLoaded: false
      });
    } catch (error) {
      state.datasetsLoaded = false;
      state.datasetsError = 'Dataset fetch failed. Showing placeholders.';
      showDatasetBanner('Lookup unavailable');
      console.warn('[OpeningDB] dataset load error', error);
      debugLog('datasets loaded', {
        ecoStatsLoaded: statsLoaded,
        ecoContinuationsLoaded: continuationsLoaded,
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
