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

  const MAX_MINI_BOARD_RETRIES = 5;
  const POS_STATS_URL = window.CAISSA_POS_STATS_URL || '/api/pos-stats';

  const StatsProvider = {
    async getStatsByKey(key) {
      const normalized = String(key || '').toLowerCase().trim();
      if (!/^[0-9a-f]{16}$/.test(normalized)) return null;

      try {
        const res = await fetch(`${POS_STATS_URL}?key=${encodeURIComponent(normalized)}`, {
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) return null;
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
      console.warn(`[ECO] Piece image failed to load: ${pieceSrc}`);
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

  function mountMiniBoardFromFen(fen) {
    const boardEl = document.getElementById('ecoMiniBoard');
    const fallbackEl = document.getElementById('ecoMiniBoardFallback');
    if (!boardEl || !fallbackEl) return true;

    boardEl.innerHTML = '';

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

    if (boardEl.clientWidth < 50 || boardEl.clientHeight < 50) {
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

        const ok = mountMiniBoardFromFen(fen);
        if (!ok && attempt < MAX_MINI_BOARD_RETRIES) {
          renderMiniBoardFromFen(fen, attempt + 1);
          return;
        }

        if (!ok) {
          console.warn(`[ECO] Mini board render failed after ${MAX_MINI_BOARD_RETRIES + 1} attempts.`);
        }
      });
    });
  }

  function showContinuationStatus(message) {
    const continuationsEl = document.getElementById('ecoContinuations');
    if (!continuationsEl) return;
    continuationsEl.innerHTML = `<li><span class="eco-cont-main">${escapeHtml(message)}</span></li>`;
  }

  function renderContinuationRows(items) {
    const continuationsEl = document.getElementById('ecoContinuations');
    if (!continuationsEl) return;

    continuationsEl.innerHTML = items.map((item) => {
      const san = escapeHtml(item.san || 'TBD');
      const label = escapeHtml(item.label || 'Line');
      const numeric = Number(item.percent);
      const percent = numeric > 0 ? `${numeric.toFixed(1)}%` : 'TBD%';
      const fill = numeric > 0 ? Math.min(100, Math.max(0, numeric)) : 0;
      return `<li>
        <span class="eco-cont-main"><span>${san}</span> - <span>${label}</span></span>
        <strong class="eco-cont-pct">${percent}</strong>
        <span class="eco-cont-bar"><span class="eco-cont-fill" style="width:${fill}%"></span></span>
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

  function resolveFenForCode(detail, defining) {
    if (detail && detail.fen) return String(detail.fen);
    if (defining && Array.isArray(defining.moves)) {
      return fenFromMoveList(defining.moves);
    }
    return '';
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
      const percent = statsTotal > 0
        ? (statsCount / statsTotal) * 100
        : (bookTotal > 0 ? (weight / bookTotal) * 100 : 0);

      const label = statsTotal > 0
        ? `games ${statsCount}`
        : `weight ${weight}`;

      const san = uciToSanIfPossible(fen, entry.uci, entry.book?.san || entry.uci);
      return { san, label, percent, sortA: statsCount, sortB: weight };
    });

    rows.sort((a, b) => {
      if (b.sortA !== a.sortA) return b.sortA - a.sortA;
      return b.sortB - a.sortB;
    });

    return rows.slice(0, 15);
  }

  async function loadContinuationsAndStats(fen, renderSeq) {
    const weightEl = document.getElementById('ecoStatBookWeight');
    if (weightEl) weightEl.textContent = 'Loading...';
    showContinuationStatus('Loading book...');

    if (!fen) {
      if (weightEl) weightEl.textContent = 'TBD';
      showContinuationStatus('No book moves found for this position.');
      return;
    }

    try {
      const registry = window.CAISSA_BOOK_REGISTRY;
      if (!registry || typeof registry.getDefaultOpeningBook !== 'function') {
        throw new Error('Book registry unavailable');
      }

      const book = await registry.getDefaultOpeningBook();
      const bookData = await book.lookupPosition(fen, 15);
      if (renderSeq !== detailRenderSeq) return;

      const totalWeight = Number(bookData?.totalWeight) || 0;
      if (weightEl) weightEl.textContent = totalWeight > 0 ? String(totalWeight) : '0';

      const statsData = await StatsProvider.getStatsByKey(bookData?.key || '');
      if (renderSeq !== detailRenderSeq) return;
      if (statsData) {
        applyStatsToPanel(statsData);
      }

      const rows = mergeContinuations(fen, bookData, statsData);
      if (rows.length === 0) {
        showContinuationStatus('No book moves found for this position.');
        return;
      }

      renderContinuationRows(rows);
    } catch (err) {
      if (renderSeq !== detailRenderSeq) return;
      if (weightEl) weightEl.textContent = 'TBD';

      if (window.CAISSA_BOOK_REGISTRY?.markUnavailableOnce) {
        window.CAISSA_BOOK_REGISTRY.markUnavailableOnce(err);
      } else {
        console.warn('[ECO][Book] Cloud opening book unavailable:', err);
      }

      showContinuationStatus('Book unavailable (offline).');
    }
  }

  function renderDefaultDetail() {
    const titleEl = document.getElementById('ecoDetailTitle');
    const movesEl = document.getElementById('ecoDetailMoves');
    const relatedEl = document.getElementById('ecoDetailRelated');
    const theoryEl = document.getElementById('ecoDetailTheory');

    if (titleEl) titleEl.textContent = 'Select an opening';
    if (movesEl) movesEl.textContent = 'Pick an ECO code from the left list to see details.';
    if (relatedEl) relatedEl.innerHTML = '<li>Select an ECO code to load related lines.</li>';
    if (theoryEl) theoryEl.textContent = 'Theory summary will appear here.';

    currentBoardFen = '';
    renderMiniBoardFromFen('');
    setStatsPlaceholders();

    renderContinuationRows([
      { san: 'TBD', label: 'Main line', percent: 0 },
      { san: 'TBD', label: 'Positional plan', percent: 0 },
      { san: 'TBD', label: 'Tactical option', percent: 0 },
      { san: 'TBD', label: 'Sideline', percent: 0 },
      { san: 'TBD', label: 'Flexible setup', percent: 0 }
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

    const resolvedFen = resolveFenForCode(detail, defining);
    currentBoardFen = resolvedFen;
    renderMiniBoardFromFen(currentBoardFen);
    setStatsPlaceholders();
    showContinuationStatus('Loading book...');

    loadContinuationsAndStats(resolvedFen, renderSeq);
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
        renderMiniBoardFromFen(currentBoardFen);
      }
    });
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

      loadTabs();
      bindEvents();

      const codeFromUrl = getCodeFromUrl();
      if (codeFromUrl) {
        selectCode(codeFromUrl, { pushHistory: false, scrollMobile: false });
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
