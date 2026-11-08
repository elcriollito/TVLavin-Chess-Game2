(function () {
  const listView = document.getElementById('ecoListView');
  const ecoTabs = document.getElementById('ecoTabs');
  const ecoList = document.getElementById('ecoList');
  const ecoSearch = document.getElementById('ecoSearch');
  const ecoFallback = document.getElementById('ecoFallback');
  const detailPanel = document.getElementById('ecoDetailPanel');

  let ecoCodes = [];
  let openings = [];
  let ecoDetails = [];
  let activeLetter = 'A';
  let selectedCode = null;
  let detailRenderSeq = 0;
  let boardFlipped = false;
  let currentBoardFen = '';
  let boardResizeObserver = null;
  let boardResizeDebounce = null;
  let windowResizeDebounce = null;
  let ecoStatsData = null;
  let ecoContinuationsData = null;
  let theoryAvailableCodes = new Set();
  let theoryManifestPromise = null;
  let activeDetailController = null;
  let currentBoardState = 'default';
  let boardRenderSeq = 0;
  let replayCode = null;
  let replayFrames = Object.freeze([]);
  let replayPly = 0;
  let replayStatusState = 'idle';
  let replayUnavailableMessage = 'Select an opening to load move replay.';

  const MAX_MINI_BOARD_RETRIES = 5;
  const POS_STATS_URL = window.CAISSA_POS_STATS_URL || '';
  const ECO_STATS_DATA_VERSION = '2.0.0';
  const REMOTE_REQUEST_TIMEOUT_MS = 5000;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const ECO_DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

  function debugLog(...args) {
    if (!ECO_DEBUG) return;
    console.log('[ECO][debug]', ...args);
  }

  const StatsProvider = {
    async getStatsByKey(key, options = {}) {
      if (!POS_STATS_URL) return null;
      const normalized = String(key || '').toLowerCase().trim();
      if (!/^[0-9a-f]{16}$/.test(normalized)) return null;

      const controller = new AbortController();
      const abortFromExternal = () => controller.abort(options.signal?.reason || 'cancelled');
      if (options.signal?.aborted) abortFromExternal();
      else options.signal?.addEventListener('abort', abortFromExternal, { once: true });
      const timeoutId = setTimeout(() => controller.abort('timeout'), REMOTE_REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(`${POS_STATS_URL}?key=${encodeURIComponent(normalized)}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
        if (!res.ok) {
          if (res.status === 404) {
            console.warn('[ECO] Missing asset URL:', `${POS_STATS_URL}?key=${encodeURIComponent(normalized)}`);
          }
          return null;
        }
        const payload = await res.json();
        if (!payload || payload.error || !payload.found) return null;
        return payload;
      } catch (_err) {
        return null;
      } finally {
        clearTimeout(timeoutId);
        options.signal?.removeEventListener('abort', abortFromExternal);
      }
    }
  };

  function parseCode(input) {
    const value = String(input || '').toUpperCase();
    return /^[A-E]\d{2}$/.test(value) ? value : null;
  }

  function getCodeFromUrl() {
    const pathMatch = window.location.pathname.match(/^\/eco\/([A-E]\d{2})$/i);
    if (pathMatch) {
      return parseCode(pathMatch[1]);
    }
    const hashMatch = window.location.hash.match(/^#([A-E]\d{2})$/i);
    return hashMatch ? parseCode(hashMatch[1]) : null;
  }

  function isCodeQuery(q) {
    return /^[A-E]?\d{0,2}$/i.test(q);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadTabs() {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    ecoTabs.innerHTML = letters.map((letter) =>
      `<button class="eco-tab ${letter === activeLetter ? 'active' : ''}" data-letter="${letter}">${letter}</button>`
    ).join('');

    ecoTabs.querySelectorAll('.eco-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeLetter = btn.dataset.letter;
        loadTabs();
        renderList();
      });
    });
  }

  function getFilteredRows() {
    const q = (ecoSearch.value || '').trim();
    const qLower = q.toLowerCase();
    const explicitLetter = /^[A-E]/i.test(q) ? q[0].toUpperCase() : '';
    let rows = ecoCodes.filter((row) => row.code.startsWith(explicitLetter || activeLetter));

    if (q) {
      if (isCodeQuery(q)) {
        const qCode = q.toUpperCase();
        rows = rows.filter((row) => row.code.startsWith(qCode) || row.code === qCode);
      } else {
        rows = rows.filter((row) => row.name.toLowerCase().includes(qLower));
      }
    }

    return rows.sort((a, b) => a.code.localeCompare(b.code));
  }

  function renderList() {
    const rows = getFilteredRows();

    ecoList.innerHTML = rows.length
      ? rows.map((row) => {
          const moves = (row.moves && String(row.moves).trim()) ? String(row.moves).trim() : '-';
          const selectedClass = row.code === selectedCode ? ' is-selected' : '';
          return `<a class="eco-row${selectedClass}" data-code="${row.code}" href="/eco/${row.code}">
            <span class="eco-code">${row.code}</span>
            <span class="eco-name">${escapeHtml(row.name)}</span>
            <span class="eco-moves" title="${escapeHtml(moves)}">${escapeHtml(moves)}</span>
          </a>`;
        }).join('')
      : '<div class="eco-row"><span class="eco-code">--</span><span class="eco-name">No matching ECO codes.</span><span class="eco-moves">-</span></div>';
  }

  function pieceImageFromFenChar(ch) {
    const white = ch === ch.toUpperCase();
    const map = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
    const piece = map[ch.toLowerCase()];
    if (!piece) return '';
    return `/img/chesspieces/wikipedia/${white ? 'w' : 'b'}${piece}.png`;
  }

  function unicodePieceFromFenChar(ch) {
    const map = {
      p: { w: '\u2659', b: '\u265F' },
      n: { w: '\u2658', b: '\u265E' },
      b: { w: '\u2657', b: '\u265D' },
      r: { w: '\u2656', b: '\u265C' },
      q: { w: '\u2655', b: '\u265B' },
      k: { w: '\u2654', b: '\u265A' }
    };
    const key = String(ch || '').toLowerCase();
    const row = map[key];
    if (!row) return '';
    return ch === ch.toUpperCase() ? row.w : row.b;
  }

  function createPieceNode(fenChar) {
    const pieceSrc = pieceImageFromFenChar(fenChar);
    if (!pieceSrc) return null;

    const img = document.createElement('img');
    img.className = 'eco-piece';
    img.src = pieceSrc;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'eco-piece-fallback';
      fallback.textContent = unicodePieceFromFenChar(fenChar) || '';
      img.replaceWith(fallback);
      console.warn('[ECO] Missing asset URL:', pieceSrc);
    };

    return img;
  }

  function squareTone(fileIdx, rankNumber) {
    return ((fileIdx + rankNumber) % 2 === 1) ? 'dark' : 'light';
  }

  function parseFenPlacementGrid(placement) {
    const ranks = String(placement || '').split('/');
    if (ranks.length !== 8) return null;

    const grid = [];
    for (const rank of ranks) {
      const row = [];
      for (const token of rank) {
        if (/\d/.test(token)) {
          const empties = Number(token);
          for (let i = 0; i < empties; i += 1) row.push('');
        } else {
          row.push(token);
        }
      }
      if (row.length !== 8) return null;
      grid.push(row);
    }
    return grid;
  }

  function ensureBoardSized() {
    const boardEl = document.getElementById('ecoMiniBoard');
    const containerEl = document.querySelector('.eco-board-container');
    if (!boardEl || !containerEl) return false;

    const side = Math.floor(Math.min(containerEl.clientWidth, containerEl.clientHeight));
    if (!Number.isFinite(side) || side < 120) return false;

    boardEl.style.width = `${side}px`;
    boardEl.style.height = `${side}px`;
    return true;
  }

  function mountMiniBoardFromFen(fen) {
    const boardEl = document.getElementById('ecoMiniBoard');
    const fallbackEl = document.getElementById('ecoMiniBoardFallback');
    if (!boardEl || !fallbackEl) {
      console.warn('[ECO] Mini-board container missing. Board render skipped.');
      return false;
    }

    boardEl.innerHTML = '';
    boardEl.style.display = 'grid';
    boardEl.dataset.fen = fen || '';
    boardEl.dataset.positionState = currentBoardState;
    boardEl.dataset.replayCode = replayCode || '';
    boardEl.dataset.replayPly = String(replayPly);
    boardEl.dataset.replayTotal = String(Math.max(0, replayFrames.length - 1));

    if (!fen || !String(fen).trim()) {
      fallbackEl.style.display = 'block';
      boardEl.style.display = 'none';
      return true;
    }

    const placement = String(fen).split(' ')[0];
    const grid = parseFenPlacementGrid(placement);
    if (!grid) {
      fallbackEl.style.display = 'block';
      boardEl.style.display = 'none';
      return false;
    }

    ensureBoardSized();
    const rect = boardEl.getBoundingClientRect();
    if (rect.width < 160 || rect.height < 160) {
      return false;
    }

    fallbackEl.style.display = 'none';
    boardEl.style.display = 'grid';

    const frag = document.createDocumentFragment();
    const viewRanks = boardFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const viewFiles = boardFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (const rankIdx of viewRanks) {
      for (const fileIdx of viewFiles) {
        const fenChar = grid[rankIdx][fileIdx];
        const rankNumber = 8 - rankIdx;

        const sq = document.createElement('div');
        sq.className = `eco-sq ${squareTone(fileIdx, rankNumber)}`;

        const pieceNode = createPieceNode(fenChar);
        if (pieceNode) sq.appendChild(pieceNode);

        frag.appendChild(sq);
      }
    }

    boardEl.appendChild(frag);
    return true;
  }

  function renderMiniBoardFromFen(fen, attempt = 0, token = null) {
    const renderToken = token === null ? ++boardRenderSeq : token;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (renderToken !== boardRenderSeq) return;
        const boardEl = document.getElementById('ecoMiniBoard');
        if (!boardEl) return;

        ensureBoardSized();
        const ok = mountMiniBoardFromFen(fen);
        if (!ok && attempt < MAX_MINI_BOARD_RETRIES) {
          renderMiniBoardFromFen(fen, attempt + 1, renderToken);
          return;
        }

        ensureBoardSized();
        if (!ok) {
          console.warn(`[ECO] Mini board render failed after ${MAX_MINI_BOARD_RETRIES + 1} attempts.`);
        }
      });
    });
  }

  function rerenderMiniBoard() {
    renderMiniBoardFromFen(currentBoardFen);
  }

  function updateReplayControls() {
    const available = replayCode === selectedCode && replayFrames.length > 1;
    const lastPly = Math.max(0, replayFrames.length - 1);
    const states = {
      start: !available || replayPly === 0,
      prev: !available || replayPly === 0,
      next: !available || replayPly === lastPly,
      end: !available || replayPly === lastPly
    };

    const controls = document.getElementById('ecoBoardControls');
    Object.entries(states).forEach(([action, disabled]) => {
      const button = controls?.querySelector(`[data-action="${action}"]`);
      if (button) button.disabled = disabled;
    });
  }

  function renderReplayStatus() {
    const statusEl = document.getElementById('ecoReplayStatus');
    const boardEl = document.getElementById('ecoMiniBoard');
    const frame = replayFrames[replayPly] || null;
    const available = replayCode === selectedCode && replayFrames.length > 1 && frame;
    const text = available
      ? window.CaissaEcoReplay.formatFrame(frame, replayFrames.length - 1)
      : replayUnavailableMessage;

    if (statusEl) {
      statusEl.textContent = text;
      statusEl.dataset.replayState = available ? 'available' : replayStatusState;
    }
    if (boardEl) {
      boardEl.setAttribute('aria-label', `Opening preview board. ${text}`);
      boardEl.dataset.replayCode = replayCode || '';
      boardEl.dataset.replayPly = String(replayPly);
      boardEl.dataset.replayTotal = String(Math.max(0, replayFrames.length - 1));
    }
  }

  function renderDefiningMoves(fallbackMoves = '') {
    const movesEl = document.getElementById('ecoDetailMoves');
    if (!movesEl) return;

    if (replayCode === selectedCode && replayFrames.length > 1) {
      const tokens = replayFrames.slice(1).map((frame) => {
        const active = frame.ply === replayPly ? ' is-active' : '';
        const current = frame.ply === replayPly ? ' aria-current="step"' : '';
        return `<span class="eco-move-token${active}" data-replay-ply="${frame.ply}"${current}>${escapeHtml(frame.san)}</span>`;
      });
      movesEl.innerHTML = `Defining moves: ${tokens.join(' ')}`;
      return;
    }

    movesEl.textContent = fallbackMoves
      ? `Defining moves unavailable for replay: ${fallbackMoves}`
      : 'Defining moves unavailable for replay.';
  }

  function clearReplayState(message, state = 'unavailable') {
    replayCode = null;
    replayFrames = Object.freeze([]);
    replayPly = 0;
    replayStatusState = state;
    replayUnavailableMessage = message;
    updateReplayControls();
    renderReplayStatus();
  }

  function initializeReplay(code, defining, detail) {
    const replayApi = window.CaissaEcoReplay;
    if (!replayApi || typeof replayApi.createReplay !== 'function') {
      clearReplayState('Move replay unavailable: validator failed to load.');
      return null;
    }

    const result = replayApi.createReplay(window.Chess, defining?.moves, {
      canonicalFinalFen: detail?.fen
    });
    if (!result.available) {
      clearReplayState(`Move replay unavailable: ${result.reason}`);
      return null;
    }

    replayCode = code;
    replayFrames = result.frames;
    replayPly = result.totalPlies;
    replayStatusState = 'available';
    replayUnavailableMessage = '';
    return result;
  }

  function goToReplayPly(targetPly) {
    if (replayCode !== selectedCode || replayFrames.length <= 1) return false;
    const requested = Number(targetPly);
    if (!Number.isFinite(requested)) return false;

    const lastPly = replayFrames.length - 1;
    replayPly = Math.max(0, Math.min(lastPly, Math.trunc(requested)));
    const frame = replayFrames[replayPly];
    currentBoardFen = frame.fen;
    currentBoardState = 'verified';

    const boardFallbackEl = document.getElementById('ecoMiniBoardFallback');
    if (boardFallbackEl) {
      boardFallbackEl.textContent = replayPly === 0
        ? 'Verified starting position loaded.'
        : 'Verified replay position loaded.';
    }

    updateReplayControls();
    renderReplayStatus();
    renderDefiningMoves();
    ensureBoardSized();
    renderMiniBoardFromFen(currentBoardFen);
    return true;
  }

  function setupBoardResizeObserver() {
    if (boardResizeObserver || typeof ResizeObserver === 'undefined') return;
    const containerEl = document.querySelector('.eco-board-container');
    if (!containerEl) return;

    boardResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect?.width || 0;
      if (width < 160) return;
      if (!currentBoardFen) return;

      if (boardResizeDebounce) {
        clearTimeout(boardResizeDebounce);
      }
      boardResizeDebounce = setTimeout(() => {
        ensureBoardSized();
        rerenderMiniBoard();
      }, 60);
    });
    boardResizeObserver.observe(containerEl);
  }

  function showContinuationStatus(message) {
    const continuationsEl = document.getElementById('ecoContinuations');
    if (!continuationsEl) return;
    continuationsEl.innerHTML = `<li><span class="eco-cont-main eco-cont-move">${escapeHtml(message)}</span></li>`;
  }

  function normalizeWdlPercents(whiteRaw, drawRaw, blackRaw) {
    const white = Number(whiteRaw);
    const draw = Number(drawRaw);
    const black = Number(blackRaw);
    if (![white, draw, black].every((v) => Number.isFinite(v) && v >= 0)) {
      return null;
    }

    const total = white + draw + black;
    if (total <= 0) return null;

    if (total <= 101) {
      return { whitePct: white, drawPct: draw, blackPct: black };
    }

    return {
      whitePct: (white / total) * 100,
      drawPct: (draw / total) * 100,
      blackPct: (black / total) * 100
    };
  }

  function extractWdlPercents(row) {
    const fromCounts = normalizeWdlPercents(row?.whiteWins, row?.draws, row?.blackWins);
    if (fromCounts) return fromCounts;
    return normalizeWdlPercents(row?.w, row?.d, row?.l);
  }

  function renderContinuationRows(items) {
    const continuationsEl = document.getElementById('ecoContinuations');
    if (!continuationsEl) return;

    continuationsEl.innerHTML = items.map((item) => {
      const san = escapeHtml(item.san || 'Unavailable');
      const label = escapeHtml(item.label || 'Line');
      const shareNumeric = Number(item.sharePercent ?? item.percent);
      const sharePct = shareNumeric > 0 ? Math.min(100, Math.max(0, shareNumeric)) : 0;
      const shareText = sharePct > 0 ? `${sharePct.toFixed(1)}%` : 'Unavailable';
      const wdl = normalizeWdlPercents(item.whitePct, item.drawPct, item.blackPct);
      const whitePct = wdl ? wdl.whitePct : 0;
      const drawPct = wdl ? wdl.drawPct : 0;
      const blackPct = wdl ? wdl.blackPct : 0;

      return `<li class="eco-cont-row">
        <span class="eco-cont-main eco-cont-move">${san}</span>
        <div class="eco-cont-stats">
          <div class="eco-cont-meta">
            <span class="eco-cont-note">${label}</span>
            <strong class="eco-cont-pct">${shareText}</strong>
          </div>
          <span class="eco-cont-bar" aria-hidden="true">
            <span class="eco-cont-w" style="width:${whitePct}%"></span>
            <span class="eco-cont-d" style="width:${drawPct}%"></span>
            <span class="eco-cont-l" style="width:${blackPct}%"></span>
          </span>
        </div>
      </li>`;
    }).join('');
  }

  function uciToSanIfPossible(fen, uci, fallbackSan) {
    if (!window.Chess || !fen || !uci) return fallbackSan || uci || '';
    try {
      const game = new window.Chess(fen);
      const move = game.move(uci, { sloppy: true });
      return move && move.san ? move.san : (fallbackSan || uci);
    } catch (_err) {
      return fallbackSan || uci;
    }
  }

  function setStatsStatus(message, state = 'unavailable') {
    const statusEl = document.getElementById('ecoStatsStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.statsState = state;
  }

  function setStatsUnavailable(message = 'No verified aggregate is available for this ECO code.') {
    document.getElementById('ecoStatGames').textContent = 'Unavailable';
    document.getElementById('ecoStatLastPlayed').textContent = 'Unavailable';
    document.getElementById('ecoStatWhite').textContent = 'Unavailable';
    document.getElementById('ecoStatDraw').textContent = 'Unavailable';
    document.getElementById('ecoStatBlack').textContent = 'Unavailable';
    document.getElementById('ecoWdlWhiteBar').style.width = '0%';
    document.getElementById('ecoWdlDrawBar').style.width = '0%';
    document.getElementById('ecoWdlBlackBar').style.width = '0%';
    setStatsStatus(message, 'unavailable');
  }

  function applyEcoStatsByCode(code) {
    if (!ecoStatsData || !code) return false;
    const row = ecoStatsData[code];
    if (!row) return false;

    const games = Number(row.games);
    const whiteWins = Number(row.whiteWins);
    const draws = Number(row.draws);
    const blackWins = Number(row.blackWins);
    const total = whiteWins + draws + blackWins;

    if (![games, whiteWins, draws, blackWins].every((value) => Number.isFinite(value) && value >= 0)
      || games <= 0 || total !== games) {
      console.warn(`[ECO] Rejected inconsistent local statistics for ${code}.`);
      return false;
    }

    document.getElementById('ecoStatGames').textContent = String(games);
    document.getElementById('ecoStatLastPlayed').textContent = row.lastYearSeen || row.lastDate || 'Unavailable';

    const wPct = total > 0 ? (whiteWins / total) * 100 : 0;
    const dPct = total > 0 ? (draws / total) * 100 : 0;
    const bPct = total > 0 ? (blackWins / total) * 100 : 0;

    document.getElementById('ecoStatWhite').textContent = `${wPct.toFixed(1)}%`;
    document.getElementById('ecoStatDraw').textContent = `${dPct.toFixed(1)}%`;
    document.getElementById('ecoStatBlack').textContent = `${bPct.toFixed(1)}%`;

    document.getElementById('ecoWdlWhiteBar').style.width = `${wPct}%`;
    document.getElementById('ecoWdlDrawBar').style.width = `${dPct}%`;
    document.getElementById('ecoWdlBlackBar').style.width = `${bPct}%`;
    setStatsStatus('Local aggregate passed consistency checks.', 'available');

    return true;
  }

  function setStatsPlaceholders(selected = false) {
    if (selected) {
      setStatsUnavailable();
      document.getElementById('ecoStatBookWeight').textContent = 'Loading...';
      return;
    }
    document.getElementById('ecoStatGames').textContent = '-';
    document.getElementById('ecoStatBookWeight').textContent = '-';
    document.getElementById('ecoStatLastPlayed').textContent = '-';
    document.getElementById('ecoStatWhite').textContent = '-';
    document.getElementById('ecoStatDraw').textContent = '-';
    document.getElementById('ecoStatBlack').textContent = '-';
    document.getElementById('ecoWdlWhiteBar').style.width = '0%';
    document.getElementById('ecoWdlDrawBar').style.width = '0%';
    document.getElementById('ecoWdlBlackBar').style.width = '0%';
    setStatsStatus('Select an opening to load local statistics.', 'idle');
  }

  function mergeContinuations(fen, bookData, statsData) {
    const byUci = new Map();

    const statsMoves = Array.isArray(statsData?.topMoves) ? statsData.topMoves : [];
    const statsTotal = statsMoves.reduce((sum, m) => sum + (Number(m.count) || 0), 0);

    const bookMoves = Array.isArray(bookData?.moves) ? bookData.moves : [];
    const bookTotal = bookMoves.reduce((sum, m) => sum + (Number(m.weight) || 0), 0);

    for (const m of bookMoves) {
      const uci = String(m.uci || '').trim();
      if (!uci) continue;
      byUci.set(uci, { uci, book: m, stats: null });
    }

    for (const m of statsMoves) {
      const uci = String(m.uci || '').trim();
      if (!uci) continue;
      const cur = byUci.get(uci) || { uci, book: null, stats: null };
      cur.stats = m;
      byUci.set(uci, cur);
    }

    const rows = Array.from(byUci.values()).map((entry) => {
      const statsCount = Number(entry.stats?.count) || 0;
      const weight = Number(entry.book?.weight) || 0;
      const sharePercent = statsTotal > 0
        ? (statsCount / statsTotal) * 100
        : (bookTotal > 0 ? (weight / bookTotal) * 100 : 0);

      const label = statsTotal > 0
        ? `games ${statsCount}`
        : `weight ${weight}`;

      const wdl = extractWdlPercents(entry.stats);
      const san = uciToSanIfPossible(fen, entry.uci, entry.book?.san || entry.uci);
      return {
        san,
        label,
        sharePercent,
        whitePct: wdl?.whitePct ?? null,
        drawPct: wdl?.drawPct ?? null,
        blackPct: wdl?.blackPct ?? null,
        sortA: statsCount,
        sortB: weight
      };
    });

    rows.sort((a, b) => {
      if (b.sortA !== a.sortA) return b.sortA - a.sortA;
      return b.sortB - a.sortB;
    });

    return rows.slice(0, 15);
  }

  function renderEcoDbContinuations(code) {
    if (!ecoContinuationsData || !code) return false;
    const rows = ecoContinuationsData[code];
    if (!Array.isArray(rows) || rows.length === 0) return false;

    const validRows = rows.every((row) => {
      const count = Number(row?.count);
      const whiteWins = Number(row?.whiteWins);
      const draws = Number(row?.draws);
      const blackWins = Number(row?.blackWins);
      return typeof row?.move === 'string' && row.move.trim()
        && [count, whiteWins, draws, blackWins].every((value) => Number.isFinite(value) && value >= 0)
        && count > 0
        && count === whiteWins + draws + blackWins;
    });
    if (!validRows) {
      console.warn(`[ECO] Rejected inconsistent local continuations for ${code}.`);
      return false;
    }

    const top = rows.slice(0, 8);
    const totalCount = top.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    const mapped = top.map((r) => {
      const count = Number(r.count) || 0;
      const w = Number(r.whiteWins) || 0;
      const d = Number(r.draws) || 0;
      const b = Number(r.blackWins) || 0;
      const total = w + d + b;
      const wPct = total > 0 ? (w / total) * 100 : 0;
      const dPct = total > 0 ? (d / total) * 100 : 0;
      const bPct = total > 0 ? (b / total) * 100 : 0;
      const barPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
      return {
        san: r.move,
        label: `${count} games`,
        sharePercent: barPct,
        whitePct: wPct,
        drawPct: dPct,
        blackPct: bPct
      };
    });
    renderContinuationRows(mapped);
    return true;
  }

  async function loadTheoryManifest() {
    try {
      const response = await fetch('/data/openings/eco/manifest.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Theory manifest HTTP ${response.status}`);
      const manifest = await response.json();
      const codes = Array.isArray(manifest?.availableCodes)
        ? manifest.availableCodes.map(parseCode).filter(Boolean)
        : [];
      theoryAvailableCodes = new Set(codes);
    } catch (err) {
      theoryAvailableCodes = new Set();
      console.warn('[ECO] Theory manifest unavailable; individual theory requests are disabled.', err);
    }
    return theoryAvailableCodes;
  }

  async function renderTheory(code, renderSeq, signal) {
    const theoryEl = document.getElementById('ecoDetailTheory');
    if (!theoryEl) return;
    theoryEl.textContent = 'Checking verified theory availability...';
    theoryEl.dataset.theoryState = 'loading';

    await theoryManifestPromise;
    if (signal.aborted || renderSeq !== detailRenderSeq) return;

    if (!theoryAvailableCodes.has(code)) {
      theoryEl.textContent = 'Verified theory is not available for this opening yet.';
      theoryEl.dataset.theoryState = 'unavailable';
      return;
    }

    try {
      const response = await fetch(`/data/openings/eco/${code}.json`, {
        cache: 'no-cache',
        signal
      });
      if (!response.ok) throw new Error(`Theory HTTP ${response.status}`);
      const theory = await response.json();
      if (signal.aborted || renderSeq !== detailRenderSeq) return;

      const parts = [];
      if (Array.isArray(theory.principles)) parts.push(...theory.principles.filter(Boolean));
      if (Array.isArray(theory.plansWhite) && theory.plansWhite[0]) parts.push(`White: ${theory.plansWhite[0]}`);
      if (Array.isArray(theory.plansBlack) && theory.plansBlack[0]) parts.push(`Black: ${theory.plansBlack[0]}`);
      theoryEl.textContent = parts.length ? parts.join('\n') : 'Verified theory file contains no summary.';
      theoryEl.dataset.theoryState = parts.length ? 'available' : 'unavailable';
    } catch (err) {
      if (signal.aborted || renderSeq !== detailRenderSeq) return;
      theoryEl.textContent = 'Verified theory could not be loaded.';
      theoryEl.dataset.theoryState = 'error';
      console.warn(`[ECO] Theory load failed for ${code}.`, err);
    }
  }

  async function loadContinuationsAndStats(fen, renderSeq, options = {}) {
    const renderContinuations = options.renderContinuations !== false;
    const signal = options.signal;
    const weightEl = document.getElementById('ecoStatBookWeight');
    if (weightEl) weightEl.textContent = 'Loading...';
    if (renderContinuations) showContinuationStatus('Loading book...');

    if (!fen) {
      if (weightEl) weightEl.textContent = 'Unavailable';
      if (renderContinuations) showContinuationStatus('Continuations unavailable: no verified position.');
      return;
    }

    try {
      const registry = window.CAISSA_BOOK_REGISTRY;
      if (!registry || (typeof registry.getActiveBook !== 'function' && typeof registry.getDefaultOpeningBook !== 'function')) {
        throw new Error('Book registry unavailable');
      }

      const book = typeof registry.getActiveBook === 'function'
        ? await registry.getActiveBook()
        : await registry.getDefaultOpeningBook();

      if (!book || typeof book.getContinuations !== 'function' || (typeof book.isReady === 'function' && !book.isReady())) {
        throw new Error('Book adapter missing getContinuations or not ready');
      }

      const bookData = await book.getContinuations(fen, 15, { signal });
      if (signal?.aborted || renderSeq !== detailRenderSeq) return;

      const totalWeight = Number(bookData?.totalWeight) || 0;
      if (weightEl) weightEl.textContent = totalWeight > 0 ? String(totalWeight) : '0';

      const statsData = await StatsProvider.getStatsByKey(bookData?.key || '', { signal });
      if (signal?.aborted || renderSeq !== detailRenderSeq) return;

      if (renderContinuations) {
        const rows = mergeContinuations(fen, bookData, statsData);
        if (rows.length === 0) {
          showContinuationStatus('No book moves found for this position.');
          return;
        }

        renderContinuationRows(rows);
      }
    } catch (err) {
      if (signal?.aborted || renderSeq !== detailRenderSeq) return;
      if (weightEl) weightEl.textContent = 'Unavailable';

      if (window.CAISSA_BOOK_REGISTRY?.markUnavailableOnce) {
        window.CAISSA_BOOK_REGISTRY.markUnavailableOnce(err);
      } else {
        console.warn('[ECO][Book] Cloud opening book unavailable:', err);
      }

      if (renderContinuations) {
        showContinuationStatus('Book unavailable (offline).');
      }
    }
  }

  function renderDefaultDetail() {
    activeDetailController?.abort('selection-cleared');
    activeDetailController = null;
    detailRenderSeq += 1;
    const titleEl = document.getElementById('ecoDetailTitle');
    const movesEl = document.getElementById('ecoDetailMoves');
    const relatedEl = document.getElementById('ecoDetailRelated');
    const theoryEl = document.getElementById('ecoDetailTheory');

    if (titleEl) titleEl.textContent = 'Select an opening';
    if (movesEl) movesEl.textContent = 'Select an opening to preview position and stats.';
    if (relatedEl) relatedEl.innerHTML = '<li>Select an ECO code to load related lines.</li>';
    if (theoryEl) {
      theoryEl.textContent = 'Select an opening to inspect verified theory.';
      theoryEl.dataset.theoryState = 'idle';
    }

    clearReplayState('Select an opening to load move replay.', 'idle');
    currentBoardFen = START_FEN;
    currentBoardState = 'default';
    const boardFallbackEl = document.getElementById('ecoMiniBoardFallback');
    if (boardFallbackEl) boardFallbackEl.textContent = 'Select an opening to preview its verified position.';
    ensureBoardSized();
    renderMiniBoardFromFen(currentBoardFen);
    setStatsPlaceholders();
    showContinuationStatus('Select an opening to load local continuations.');
  }

  function renderDetail(code) {
    const normalized = parseCode(code);
    if (!normalized) {
      renderDefaultDetail();
      return;
    }

    activeDetailController?.abort('selection-changed');
    activeDetailController = new AbortController();
    detailRenderSeq += 1;
    const renderSeq = detailRenderSeq;
    const signal = activeDetailController.signal;

    const row = ecoCodes.find((r) => r.code === normalized) || null;
    const detail = ecoDetails.find((d) => d.code === normalized) || null;

    if (!row) {
      console.warn(`[ECO] Code ${normalized} not found in eco_codes.json`);
    }
    if (!detail) {
      console.warn(`[ECO] Code ${normalized} missing in eco_details.json, using fallback rendering`);
    }

    const titleEl = document.getElementById('ecoDetailTitle');
    const movesEl = document.getElementById('ecoDetailMoves');
    const relatedEl = document.getElementById('ecoDetailRelated');
    const theoryEl = document.getElementById('ecoDetailTheory');

    const displayName = (row && row.name) || (detail && detail.name) || 'Unknown ECO';
    if (titleEl) titleEl.textContent = `${normalized} - ${displayName}`;

    const lines = openings.filter((o) => o.eco === normalized && Array.isArray(o.moves));
    const defining = lines.length ? lines.slice().sort((a, b) => a.moves.length - b.moves.length)[0] : null;
    const fallbackMoves = (detail && detail.moves) || (row && row.moves) || '';
    const tensPrefix = `${normalized[0]}${normalized[1]}`;
    const neighboringCodes = ecoCodes
      .filter((r) => r.code !== normalized && r.code.startsWith(tensPrefix))
      .slice(0, 20);

    if (relatedEl) {
      const variationItems = lines.map((line) => {
        const variationMoves = line.moves.join(' ');
        return `<li><strong>${escapeHtml(line.name || displayName)}</strong><br><span class="eco-muted">${escapeHtml(variationMoves)}</span></li>`;
      });
      const neighborItems = neighboringCodes.map((r) =>
        `<li><a href="/eco/${r.code}" data-code="${r.code}">${r.code} - ${escapeHtml(r.name)}</a></li>`
      );
      relatedEl.innerHTML = [...variationItems, ...neighborItems].join('') || '<li>No related lines found.</li>';
    }

    void renderTheory(normalized, renderSeq, signal);

    debugLog('selected code', normalized);
    const replay = initializeReplay(normalized, defining, detail);
    const finalFen = replay?.finalFen || '';
    if (replay) {
      goToReplayPly(replay.totalPlies);
      debugLog('fen source', 'verified-move-replay', 'final fen', finalFen);
    } else {
      currentBoardFen = '';
      currentBoardState = 'unavailable';
      const boardFallbackEl = document.getElementById('ecoMiniBoardFallback');
      if (boardFallbackEl) boardFallbackEl.textContent = 'Verified opening move replay unavailable.';
      renderDefiningMoves(defining?.moves?.join(' ') || fallbackMoves);
      ensureBoardSized();
      renderMiniBoardFromFen('');
      debugLog('fen source', 'unavailable');
    }
    setStatsPlaceholders(true);
    const hasEcoStats = applyEcoStatsByCode(normalized);
    const hasEcoCont = renderEcoDbContinuations(normalized);
    if (!hasEcoCont) {
      showContinuationStatus('No verified local continuations. Checking optional cloud book...');
    }

    void loadContinuationsAndStats(finalFen, renderSeq, {
      renderContinuations: !hasEcoCont,
      signal
    });
    debugLog('stats source', hasEcoStats ? 'eco_stats.json' : 'fallback');
    debugLog('continuations source', hasEcoCont ? 'eco_popular_continuations.json' : 'book');
  }

  function selectCode(code, options = {}) {
    const { pushHistory = true, scrollMobile = false } = options;
    const normalized = parseCode(code);

    selectedCode = normalized;

    if (normalized) {
      activeLetter = normalized[0];
      loadTabs();
    }

    renderList();

    if (!normalized) {
      renderDefaultDetail();
      if (pushHistory) {
        history.pushState({}, '', '/eco');
      }
      return;
    }

    renderDetail(normalized);

    if (pushHistory) {
      history.pushState({}, '', `/eco/${normalized}`);
    }

    if (scrollMobile && window.matchMedia('(max-width: 840px)').matches && detailPanel) {
      detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function bindEvents() {
    ecoSearch.addEventListener('input', renderList);

    ecoList.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-code]');
      if (!link) return;
      event.preventDefault();
      selectCode(link.dataset.code, { pushHistory: true, scrollMobile: true });
    });

    document.getElementById('ecoDetailRelated').addEventListener('click', (event) => {
      const link = event.target.closest('a[data-code]');
      if (!link) return;
      event.preventDefault();
      selectCode(link.dataset.code, { pushHistory: true, scrollMobile: true });
    });

    window.addEventListener('popstate', () => {
      const code = getCodeFromUrl();
      selectCode(code, { pushHistory: false, scrollMobile: false });
    });

    const controls = document.getElementById('ecoBoardControls');
    controls?.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;

      const action = btn.dataset.action;
      if (action === 'start') {
        goToReplayPly(0);
      } else if (action === 'prev') {
        goToReplayPly(replayPly - 1);
      } else if (action === 'next') {
        goToReplayPly(replayPly + 1);
      } else if (action === 'end') {
        goToReplayPly(replayFrames.length - 1);
      } else if (action === 'flip') {
        boardFlipped = !boardFlipped;
        rerenderMiniBoard();
      }
    });

    window.addEventListener('resize', () => {
      if (windowResizeDebounce) {
        clearTimeout(windowResizeDebounce);
      }
      windowResizeDebounce = setTimeout(() => {
        ensureBoardSized();
        if (currentBoardFen) rerenderMiniBoard();
      }, 80);
    });

    setupBoardResizeObserver();
  }

  async function init() {
    theoryManifestPromise = loadTheoryManifest();
    try {
      const [codesRes, openingsRes, detailsRes] = await Promise.all([
        fetch('/data/eco/eco_codes.json', { cache: 'no-cache' }),
        fetch('/data/openings.json', { cache: 'no-cache' }),
        fetch('/data/eco/eco_details.json', { cache: 'no-cache' })
      ]);

      if (!codesRes.ok || !openingsRes.ok) {
        throw new Error(`Dataset fetch failed: codes ${codesRes.status}, openings ${openingsRes.status}`);
      }

      ecoCodes = await codesRes.json();
      openings = await openingsRes.json();

      if (detailsRes.ok) {
        ecoDetails = await detailsRes.json();
      } else {
        ecoDetails = [];
        console.warn(`[ECO] eco_details.json failed to load (${detailsRes.status}), using fallback detail rendering`);
      }

      const [statsRes, contRes] = await Promise.allSettled([
        fetch(`/data/eco/eco_stats.json?v=${encodeURIComponent(ECO_STATS_DATA_VERSION)}`, { cache: 'no-cache' }),
        fetch(`/data/eco/eco_popular_continuations.json?v=${encodeURIComponent(ECO_STATS_DATA_VERSION)}`, { cache: 'no-cache' })
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        ecoStatsData = await statsRes.value.json();
      }
      if (contRes.status === 'fulfilled' && contRes.value.ok) {
        ecoContinuationsData = await contRes.value.json();
      }
      loadTabs();
      bindEvents();

      const codeFromUrl = getCodeFromUrl();
      const trustedCode = codeFromUrl && ecoCodes.some(row => row.code === codeFromUrl) ? codeFromUrl : null;
      if (trustedCode) {
        selectCode(trustedCode, { pushHistory: false, scrollMobile: false });
      } else {
        renderList();
        renderDefaultDetail();
      }
    } catch (err) {
      console.error('[ECO] Failed to load dataset', err);
      if (listView) {
        ecoFallback.style.display = 'block';
        ecoFallback.textContent = 'ECO dataset failed to load.';
        ecoList.innerHTML = '<div class="eco-row"><span class="eco-code">ERR</span><span class="eco-name">ECO dataset failed to load.</span><span class="eco-moves">-</span></div>';
      }
      renderDefaultDetail();
    }
  }

  init();
})();
