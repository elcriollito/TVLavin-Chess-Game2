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
  let ecoFenData = null;

  const MAX_MINI_BOARD_RETRIES = 5;
  const POS_STATS_URL = window.CAISSA_POS_STATS_URL || '';
  const ECO_STATS_DATA_VERSION = '1.9.0';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const ECO_DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

  function debugLog(...args) {
    if (!ECO_DEBUG) return;
    console.log('[ECO][debug]', ...args);
  }

  const StatsProvider = {
    async getStatsByKey(key) {
      if (!POS_STATS_URL) return null;
      const normalized = String(key || '').toLowerCase().trim();
      if (!/^[0-9a-f]{16}$/.test(normalized)) return null;

      try {
        const res = await fetch(`${POS_STATS_URL}?key=${encodeURIComponent(normalized)}`, {
          headers: { Accept: 'application/json' }
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
    let rows = ecoCodes.filter((row) => row.code.startsWith(activeLetter));

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

  function renderMiniBoardFromFen(fen, attempt = 0) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const boardEl = document.getElementById('ecoMiniBoard');
        if (!boardEl) return;

        ensureBoardSized();
        const ok = mountMiniBoardFromFen(fen);
        if (!ok && attempt < MAX_MINI_BOARD_RETRIES) {
          renderMiniBoardFromFen(fen, attempt + 1);
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
      const san = escapeHtml(item.san || 'TBD');
      const label = escapeHtml(item.label || 'Line');
      const shareNumeric = Number(item.sharePercent ?? item.percent);
      const sharePct = shareNumeric > 0 ? Math.min(100, Math.max(0, shareNumeric)) : 0;
      const shareText = sharePct > 0 ? `${sharePct.toFixed(1)}%` : 'TBD';
      const wdl = normalizeWdlPercents(item.whitePct, item.drawPct, item.blackPct);
      const whitePct = wdl ? wdl.whitePct : 33;
      const drawPct = wdl ? wdl.drawPct : 34;
      const blackPct = wdl ? wdl.blackPct : 33;

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

  function fenFromMoveList(moves) {
    if (!window.Chess || !Array.isArray(moves) || moves.length === 0) return '';
    try {
      const game = new window.Chess();
      for (const san of moves) {
        const ok = game.move(san, { sloppy: true });
        if (!ok) return '';
      }
      return game.fen();
    } catch (_err) {
      return '';
    }
  }

  function resolveFenForCode(code, detail, defining) {
    if (detail && detail.fen) {
      return { fen: String(detail.fen), source: 'fen' };
    }
    if (code && ecoFenData && ecoFenData[code]) {
      return { fen: String(ecoFenData[code]), source: 'eco_fen' };
    }
    if (defining && Array.isArray(defining.moves)) {
      const fenFromMoves = fenFromMoveList(defining.moves);
      if (fenFromMoves) {
        return { fen: fenFromMoves, source: 'moves' };
      }
    }
    return { fen: START_FEN, source: 'start' };
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

  function applyStatsToPanel(stats) {
    const whitePct = Number(stats?.w) || 0;
    const drawPct = Number(stats?.d) || 0;
    const blackPct = Number(stats?.l) || 0;
    const total = whitePct + drawPct + blackPct;
    const showPct = (v) => (Number(v) > 0 ? `${v}%` : 'TBD');

    document.getElementById('ecoStatGames').textContent = Number(stats?.games) > 0 ? String(stats.games) : 'TBD';
    document.getElementById('ecoStatLastPlayed').textContent = stats?.lastPlayed || 'TBD';
    document.getElementById('ecoStatWhite').textContent = showPct(whitePct);
    document.getElementById('ecoStatDraw').textContent = showPct(drawPct);
    document.getElementById('ecoStatBlack').textContent = showPct(blackPct);

    if (total > 0) {
      document.getElementById('ecoWdlWhiteBar').style.width = `${(whitePct / total) * 100}%`;
      document.getElementById('ecoWdlDrawBar').style.width = `${(drawPct / total) * 100}%`;
      document.getElementById('ecoWdlBlackBar').style.width = `${(blackPct / total) * 100}%`;
    } else {
      document.getElementById('ecoWdlWhiteBar').style.width = '33%';
      document.getElementById('ecoWdlDrawBar').style.width = '34%';
      document.getElementById('ecoWdlBlackBar').style.width = '33%';
    }
  }

  function applyEcoStatsByCode(code) {
    if (!ecoStatsData || !code) return false;
    const row = ecoStatsData[code];
    if (!row) return false;

    const games = Number(row.games) || 0;
    const whiteWins = Number(row.whiteWins) || 0;
    const draws = Number(row.draws) || 0;
    const blackWins = Number(row.blackWins) || 0;
    const total = whiteWins + draws + blackWins;

    document.getElementById('ecoStatGames').textContent = games > 0 ? String(games) : 'TBD';
    document.getElementById('ecoStatLastPlayed').textContent = row.lastYearSeen || row.lastDate || 'TBD';

    const wPct = total > 0 ? (whiteWins / total) * 100 : 0;
    const dPct = total > 0 ? (draws / total) * 100 : 0;
    const bPct = total > 0 ? (blackWins / total) * 100 : 0;

    document.getElementById('ecoStatWhite').textContent = total > 0 ? `${wPct.toFixed(1)}%` : 'TBD';
    document.getElementById('ecoStatDraw').textContent = total > 0 ? `${dPct.toFixed(1)}%` : 'TBD';
    document.getElementById('ecoStatBlack').textContent = total > 0 ? `${bPct.toFixed(1)}%` : 'TBD';

    document.getElementById('ecoWdlWhiteBar').style.width = total > 0 ? `${wPct}%` : '33%';
    document.getElementById('ecoWdlDrawBar').style.width = total > 0 ? `${dPct}%` : '34%';
    document.getElementById('ecoWdlBlackBar').style.width = total > 0 ? `${bPct}%` : '33%';

    return true;
  }

  function setStatsPlaceholders() {
    applyStatsToPanel(null);
    document.getElementById('ecoStatBookWeight').textContent = 'TBD';
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
        san: r.move || 'TBD',
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

  async function loadContinuationsAndStats(fen, renderSeq, options = {}) {
    const renderContinuations = options.renderContinuations !== false;
    const weightEl = document.getElementById('ecoStatBookWeight');
    if (weightEl) weightEl.textContent = 'Loading...';
    if (renderContinuations) showContinuationStatus('Loading book...');

    if (!fen) {
      if (weightEl) weightEl.textContent = 'TBD';
      if (renderContinuations) showContinuationStatus('No book moves found for this position.');
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

      const bookData = await book.getContinuations(fen, 15);
      if (renderSeq !== detailRenderSeq) return;

      const totalWeight = Number(bookData?.totalWeight) || 0;
      if (weightEl) weightEl.textContent = totalWeight > 0 ? String(totalWeight) : '0';

      const statsData = await StatsProvider.getStatsByKey(bookData?.key || '');
      if (renderSeq !== detailRenderSeq) return;
      if (statsData && !applyEcoStatsByCode(selectedCode)) {
        applyStatsToPanel(statsData);
      }

      if (renderContinuations) {
        const rows = mergeContinuations(fen, bookData, statsData);
        if (rows.length === 0) {
          showContinuationStatus('No book moves found for this position.');
          return;
        }

        renderContinuationRows(rows);
      }
    } catch (err) {
      if (renderSeq !== detailRenderSeq) return;
      if (weightEl) weightEl.textContent = 'TBD';

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
    const titleEl = document.getElementById('ecoDetailTitle');
    const movesEl = document.getElementById('ecoDetailMoves');
    const relatedEl = document.getElementById('ecoDetailRelated');
    const theoryEl = document.getElementById('ecoDetailTheory');

    if (titleEl) titleEl.textContent = 'Select an opening';
    if (movesEl) movesEl.textContent = 'Select an opening to preview position and stats.';
    if (relatedEl) relatedEl.innerHTML = '<li>Select an ECO code to load related lines.</li>';
    if (theoryEl) theoryEl.textContent = 'Theory summary will appear here.';

    currentBoardFen = START_FEN;
    ensureBoardSized();
    renderMiniBoardFromFen(currentBoardFen);
    setStatsPlaceholders();

    renderContinuationRows([
      { san: 'TBD', label: 'Main line', sharePercent: 0 },
      { san: 'TBD', label: 'Positional plan', sharePercent: 0 },
      { san: 'TBD', label: 'Tactical option', sharePercent: 0 },
      { san: 'TBD', label: 'Sideline', sharePercent: 0 },
      { san: 'TBD', label: 'Flexible setup', sharePercent: 0 }
    ]);
  }

  async function renderDetail(code) {
    const normalized = parseCode(code);
    if (!normalized) {
      renderDefaultDetail();
      return;
    }

    detailRenderSeq += 1;
    const renderSeq = detailRenderSeq;

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
    if (movesEl) {
      movesEl.textContent = defining
        ? `Defining moves: ${defining.moves.join(' ')}`
        : (fallbackMoves ? `Defining moves: ${fallbackMoves}` : 'Moves not added yet');
    }

    const tensPrefix = `${normalized[0]}${normalized[1]}`;
    const related = ecoCodes
      .filter((r) => r.code !== normalized && r.code.startsWith(tensPrefix))
      .slice(0, 20);

    if (relatedEl) {
      relatedEl.innerHTML = related.length
        ? related.map((r) => `<li><a href="/eco/${r.code}" data-code="${r.code}">${r.code} - ${escapeHtml(r.name)}</a></li>`).join('')
        : '<li>No related lines found.</li>';
    }

    let theoryText = 'Theory coming soon.';
    try {
      const tRes = await fetch(`/data/openings/eco/${normalized}.json`, { cache: 'no-cache' });
      if (tRes.ok) {
        const theory = await tRes.json();
        const parts = [];
        if (Array.isArray(theory.principles)) parts.push(...theory.principles);
        if (Array.isArray(theory.plansWhite) && theory.plansWhite[0]) parts.push(`White: ${theory.plansWhite[0]}`);
        if (Array.isArray(theory.plansBlack) && theory.plansBlack[0]) parts.push(`Black: ${theory.plansBlack[0]}`);
        if (parts.length) theoryText = parts.join('\n');
      }
    } catch (_err) {
      // Keep fallback text
    }
    if (theoryEl) theoryEl.textContent = theoryText;

    debugLog('selected code', normalized);
    const fenResolution = resolveFenForCode(normalized, detail, defining);
    currentBoardFen = fenResolution.fen || START_FEN;
    debugLog('fen source', fenResolution.source, 'final fen', currentBoardFen);
    ensureBoardSized();
    renderMiniBoardFromFen(currentBoardFen);
    setStatsPlaceholders();
    const hasEcoStats = applyEcoStatsByCode(normalized);
    const hasEcoCont = renderEcoDbContinuations(normalized);
    if (!hasEcoCont) {
      showContinuationStatus('Loading book...');
    }

    loadContinuationsAndStats(currentBoardFen, renderSeq, { renderContinuations: !hasEcoCont });
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
      if (action === 'flip') {
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

      const [statsRes, contRes, fenRes] = await Promise.allSettled([
        fetch(`/data/eco/eco_stats.json?v=${encodeURIComponent(ECO_STATS_DATA_VERSION)}`, { cache: 'no-cache' }),
        fetch(`/data/eco/eco_popular_continuations.json?v=${encodeURIComponent(ECO_STATS_DATA_VERSION)}`, { cache: 'no-cache' }),
        fetch(`/data/eco/eco_fen.json?v=${encodeURIComponent(ECO_STATS_DATA_VERSION)}`, { cache: 'no-cache' })
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        ecoStatsData = await statsRes.value.json();
      }
      if (contRes.status === 'fulfilled' && contRes.value.ok) {
        ecoContinuationsData = await contRes.value.json();
      }
      if (fenRes.status === 'fulfilled' && fenRes.value.ok) {
        ecoFenData = await fenRes.value.json();
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
