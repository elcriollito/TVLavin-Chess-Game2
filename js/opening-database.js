(function () {
  const state = {
    game: null,
    board: null,
    boardFlipped: false,
    openingPositionIndex: null,
    ecoCodeDefs: [],
    bookChunkIndex: null,
    bookChunkCache: new Map(),
    cloudBookCache: new Map(),
    datasetsLoaded: false,
    datasetsError: '',
    positionRequestId: 0,
    lastDebugFenKey: '',
    currentRows: []
  };

  const CLOUD_BOOK_URL = 'https://caissa-game-fetcher.elcriollito.workers.dev/api/book';

  const els = {
    board: document.getElementById('openingDbBoard'),
    moveList: document.getElementById('odbMoveList'),
    turnPly: document.getElementById('odbTurnPly'),
    openingLabel: document.getElementById('odbOpeningLabel'),
    lookupStatus: document.getElementById('odbLookupStatus'),
    datasetBanner: document.getElementById('odbDatasetBanner'),
    statsBody: document.getElementById('odbStatsBody'),
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
    console.debug('[OpeningDB]', ...args);
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

  function sanitizeNextMoveText(txt) {
    if (!txt) return '';
    const compact = String(txt).replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    let sanitized = compact
      .replace(/^\d+\.(\.\.)?\s*/g, '')
      .replace(/^\.\.\.\s*/g, '')
      .trim();
    if (!sanitized) return '';
    if (sanitized.includes(' ')) {
      sanitized = sanitized.split(' ')[0];
    }
    return sanitized;
  }

  function sanitizeMoveCellToken(rawToken) {
    return sanitizeNextMoveText(rawToken);
  }

  function normalizeSanToken(token) {
    return sanitizeNextMoveText(String(token || '')
      .replace(/^\d+\.(\.\.)?/, '')
      .replace(/^\.\.\./, '')
      .replace(/[!?+#]+$/g, '')
      .trim());
  }

  function parseDefiningMoves(moveText) {
    const txt = String(moveText || '')
      .replace(/\r/g, '\n')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/;[^\n]*/g, ' ')
      .replace(/\$\d+/g, ' ')
      .replace(/\([^)]*\)/g, ' ');

    return txt
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !(t === '1-0' || t === '0-1' || t === '1/2-1/2' || t === '*' || /^\d+\.(\.\.)?$/.test(t) || t === '...'))
      .map(normalizeSanToken)
      .filter(Boolean);
  }

  function splitMoveSequence(raw) {
    if (Array.isArray(raw)) {
      return raw.map((token) => normalizeSanToken(token)).filter(Boolean);
    }
    return parseDefiningMoves(raw);
  }

  function isPrefix(prefix, full) {
    if (!Array.isArray(prefix) || !Array.isArray(full)) return false;
    if (prefix.length === 0 || prefix.length > full.length) return false;
    for (let i = 0; i < prefix.length; i += 1) {
      if (prefix[i] !== full[i]) return false;
    }
    return true;
  }

  function formatMoveList(game) {
    const moves = game.history({ verbose: false });
    const chunks = [];
    for (let i = 0; i < moves.length; i += 2) {
      const turn = Math.floor(i / 2) + 1;
      const white = moves[i] || '';
      const black = moves[i + 1] || '';
      chunks.push(`${turn}.${white}${black ? ` ${black}` : ''}`);
    }
    return chunks.join(' ');
  }

  function updateMoveListFromGame(game) {
    if (!els.moveList) return;
    els.moveList.value = formatMoveList(game) || '(start position)';
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

  function canonicalUci(move) {
    if (!move || typeof move !== 'object') return '';
    return `${move.from || ''}${move.to || ''}${move.promotion || ''}`.toLowerCase();
  }

  function buildLegalMaps(game) {
    const legalMoves = game.moves({ verbose: true }) || [];
    const bySan = new Map();
    const byUci = new Map();

    legalMoves.forEach((mv) => {
      const san = String(mv.san || '').trim();
      const uci = canonicalUci(mv);
      if (san) bySan.set(san, mv);
      if (uci) byUci.set(uci, mv);
    });

    return { bySan, byUci };
  }

  function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function getOpeningIndexEntry(fenKey, hash) {
    const root = state.openingPositionIndex;
    if (!root) return null;

    if (root.positions) {
      return root.positions[fenKey] || root.positions[hash] || null;
    }
    return root[fenKey] || root[hash] || null;
  }

  async function getBookChunkEntriesForHash(hash) {
    if (!state.bookChunkIndex) return null;
    const shard = String(hash || '').slice(0, 2).toLowerCase();
    if (!/^[0-9a-f]{2}$/.test(shard)) return null;

    if (state.bookChunkCache.has(shard)) {
      return state.bookChunkCache.get(shard);
    }

    try {
      const res = await fetch(`/data/book_chunks/book_chunk_${shard}.json`, { cache: 'force-cache' });
      if (!res.ok) {
        state.bookChunkCache.set(shard, null);
        return null;
      }
      const json = await res.json();
      const entries = json && json.entries && typeof json.entries === 'object' ? json.entries : null;
      state.bookChunkCache.set(shard, entries);
      return entries;
    } catch (_err) {
      state.bookChunkCache.set(shard, null);
      return null;
    }
  }

  function extractRawCandidates(entry) {
    if (!entry || typeof entry !== 'object') return [];

    if (Array.isArray(entry.moves)) return entry.moves;
    if (Array.isArray(entry.continuations)) return entry.continuations;
    if (Array.isArray(entry.candidates)) return entry.candidates;
    if (Array.isArray(entry.rows)) return entry.rows;

    return [];
  }

  function findNextMoveFromSequence(tokens, ply, legalBySan, legalByUci) {
    if (!Array.isArray(tokens) || tokens.length === 0) return { san: '', uci: '', preview: '' };

    const preview = tokens.join(' ').trim();

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const sanToken = normalizeSanToken(token);
      const uciToken = sanitizeMoveCellToken(String(token || '')).toLowerCase();

      if (sanToken && legalBySan.has(sanToken)) {
        const legal = legalBySan.get(sanToken);
        return { san: sanToken, uci: canonicalUci(legal), preview };
      }

      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uciToken) && legalByUci.has(uciToken)) {
        const legal = legalByUci.get(uciToken);
        return { san: String(legal.san || '').trim(), uci: uciToken, preview };
      }
    }

    const fallback = sanitizeMoveCellToken(tokens[ply] || tokens[0] || '');
    return {
      san: normalizeSanToken(fallback),
      uci: /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(fallback).toLowerCase()) ? String(fallback).toLowerCase() : '',
      preview
    };
  }

  function normalizeCandidateRow(candidate, context) {
    const raw = candidate && typeof candidate === 'object' ? candidate : {};

    const lineMoves = splitMoveSequence(raw.lineMoves || raw.movesLine || raw.pgnLine || raw.line || raw.pgn || raw.movesText || '');
    const sequenceHit = findNextMoveFromSequence(lineMoves, context.ply, context.legalBySan, context.legalByUci);

    const directSan = normalizeSanToken(raw.moveSAN || raw.san || raw.move || '');
    const directUci = sanitizeMoveCellToken(raw.moveUCI || raw.uci || '').toLowerCase();

    let moveSAN = '';
    let moveUCI = '';
    const directSanLegal = directSan && context.legalBySan.has(directSan);
    const directUciLegal = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(directUci) && context.legalByUci.has(directUci);

    if (directSanLegal) {
      moveSAN = directSan;
      moveUCI = canonicalUci(context.legalBySan.get(directSan));
    } else if (directUciLegal) {
      moveUCI = directUci;
      moveSAN = String(context.legalByUci.get(directUci).san || '').trim();
    } else if (sequenceHit.san || sequenceHit.uci) {
      moveSAN = sequenceHit.san;
      moveUCI = sequenceHit.uci;
    } else if (directSan) {
      moveSAN = sanitizeMoveCellToken(directSan);
    } else if (directUci) {
      moveUCI = directUci;
    }

    const n = toNumberOrNull(raw.games) ?? toNumberOrNull(raw.count) ?? toNumberOrNull(raw.n) ?? 0;
    const w = toNumberOrNull(raw.whiteWins) ?? toNumberOrNull(raw.w) ?? toNumberOrNull(raw.winsCount) ?? 0;
    const d = toNumberOrNull(raw.drawsCount) ?? toNumberOrNull(raw.d) ?? toNumberOrNull(raw.drawCount) ?? 0;
    const l = toNumberOrNull(raw.blackWins) ?? toNumberOrNull(raw.l) ?? toNumberOrNull(raw.lossesCount) ?? 0;
    const sample = w + d + l;

    const winsPct = sample > 0 ? toPercent(w, sample) : (toNumberOrNull(raw.wins) ?? 0);
    const drawsPct = sample > 0 ? toPercent(d, sample) : (toNumberOrNull(raw.draws) ?? 0);
    const lossesPct = sample > 0 ? toPercent(l, sample) : (toNumberOrNull(raw.losses) ?? 0);
    const value = toNumberOrNull(raw.value) ?? (sample > 0 ? ((w + 0.5 * d) / sample) * 100 : 0);

    return {
      moveSAN: sanitizeMoveCellToken(moveSAN),
      moveUCI: sanitizeMoveCellToken(moveUCI),
      games: n,
      wins: winsPct,
      draws: drawsPct,
      losses: lossesPct,
      value,
      elo: raw.elo || null,
      perf: raw.perf || null,
      year: raw.year || raw.lastYearSeen || null,
      w,
      d,
      l,
      preview: sequenceHit.preview || ''
    };
  }

  function normalizeContinuations(rawCandidates, context) {
    const normalized = [];
    const seen = new Set();

    (rawCandidates || []).forEach((candidate) => {
      const row = normalizeCandidateRow(candidate, context);
      const moveToken = row.moveSAN || row.moveUCI;
      if (!moveToken) return;

      // Hard rule: Move column must stay 1 ply only.
      const firstOnly = sanitizeMoveCellToken(moveToken);
      if (!firstOnly) return;

      const dedupeKey = (row.moveUCI || row.moveSAN).toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      row.moveSAN = sanitizeMoveCellToken(row.moveSAN);
      row.moveUCI = sanitizeMoveCellToken(row.moveUCI);
      normalized.push(row);
    });

    normalized.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return (b.value || 0) - (a.value || 0);
    });

    return normalized;
  }

  function renderStatsRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      state.currentRows = [];
      els.statsBody.innerHTML = '<tr><td colspan="8" class="openingdb-empty">No data for this position yet (TBD).</td></tr>';
      return;
    }

    state.currentRows = rows.slice();
    const total = rows.reduce((sum, r) => sum + (Number(r.games) || 0), 0);
    els.statsBody.innerHTML = rows.map((row, idx) => {
      const n = Number(row.games) || 0;
      const wPct = Number(row.wins) || 0;
      const dPct = Number(row.draws) || 0;
      const lPct = Number(row.losses) || 0;
      const value = Number(row.value);
      const perc = total > 0 ? toPercent(n, total) : 0;
      const year = row.year || 'TBD';
      const moveText = sanitizeMoveCellToken(row.moveSAN || row.moveUCI || 'TBD') || 'TBD';
      const title = row.preview && row.preview !== moveText ? ` title="${String(row.preview).replace(/"/g, '&quot;')}"` : '';
      const wdlTitle = `W:${wPct.toFixed(1)} D:${dPct.toFixed(1)} L:${lPct.toFixed(1)}`;

      return `
        <tr class="${dominantClass(wPct, dPct, lPct)}" data-row-index="${idx}">
          <td class="col-move"${title}>${moveText}</td>
          <td class="col-value">${Number.isFinite(value) ? `${value.toFixed(1)}%` : 'TBD'}</td>
          <td>${n > 0 ? n : 'TBD'}</td>
          <td class="col-perc">${Number.isFinite(perc) ? `${perc.toFixed(1)}%` : 'TBD'}</td>
          <td class="col-wdl">
            <div class="wdb-bar" title="${wdlTitle}">
              <div class="w" style="width:${wPct.toFixed(1)}%"><span>${wPct.toFixed(1)}%</span></div>
              <div class="d" style="width:${dPct.toFixed(1)}%"><span>${dPct.toFixed(1)}%</span></div>
              <div class="l" style="width:${lPct.toFixed(1)}%"><span>${lPct.toFixed(1)}%</span></div>
            </div>
          </td>
          <td>${row.elo || 'TBD'}</td>
          <td>${row.perf || 'TBD'}</td>
          <td>${year}</td>
        </tr>
      `;
    }).join('');
  }

  function applyMoveFromRow(row) {
    if (!row || !state.game) return false;

    const uci = sanitizeMoveCellToken(row.moveUCI || row.uci || '').toLowerCase();
    const san = sanitizeMoveCellToken(row.moveSAN || row.san || '');
    let move = null;

    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      move = state.game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion
      });
    }

    if (!move && san) {
      move = state.game.move(san, { sloppy: true });
    }

    if (!move) return false;

    state.board.position(state.game.fen(), false);
    updateMoveListFromGame(state.game);
    updatePositionView(state.game.fen());
    return true;
  }

  function resolveOpeningByPrefix() {
    const played = state.game.history({ verbose: false }).map(normalizeSanToken);

    let best = null;
    for (const def of state.ecoCodeDefs || []) {
      if (isPrefix(def.moves, played)) {
        if (!best || def.moves.length > best.moves.length) best = def;
      }
    }

    if (best) {
      return {
        eco: best.eco || '',
        name: best.name || 'Opening: (TBD)',
        source: 'eco_codes_prefix'
      };
    }

    return {
      eco: '',
      name: 'Opening: (TBD)',
      source: 'unknown'
    };
  }

  async function getContinuationsForFen(fen, fenKey, hash, ply) {
    const fromIndex = getOpeningIndexEntry(fenKey, hash);
    if (fromIndex) {
      return {
        source: 'opening_position_index_exact',
        entry: fromIndex,
        rawCandidates: extractRawCandidates(fromIndex)
      };
    }

    const chunkEntries = await getBookChunkEntriesForHash(hash);
    if (chunkEntries && chunkEntries[hash]) {
      return {
        source: 'book_chunks_exact',
        entry: chunkEntries[hash],
        rawCandidates: extractRawCandidates(chunkEntries[hash])
      };
    }

    if (ply === 0) {
      const cloud = await getCloudContinuationsByFen(fen);
      if (cloud && Array.isArray(cloud.moves) && cloud.moves.length > 0) {
        return {
          source: 'cloud_book_exact',
          entry: null,
          rawCandidates: cloud.moves
        };
      }
    }

    return {
      source: 'none',
      entry: null,
      rawCandidates: []
    };
  }

  async function getCloudContinuationsByFen(fen) {
    const fenKey = normalizeFenForHash(fen);
    if (!fenKey) return null;
    if (state.cloudBookCache.has(fenKey)) return state.cloudBookCache.get(fenKey);

    try {
      const url = `${CLOUD_BOOK_URL}?fen=${encodeURIComponent(fenKey)}&max=40`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        state.cloudBookCache.set(fenKey, null);
        return null;
      }
      const payload = await res.json();
      const moves = Array.isArray(payload && payload.moves) ? payload.moves : [];
      const mapped = {
        moves: moves.map((m) => ({
          uci: m.uci || '',
          san: m.san || '',
          games: Number(m.weight) || 0,
          perc: Number(m.percent) || 0
        }))
      };
      state.cloudBookCache.set(fenKey, mapped);
      return mapped;
    } catch (_err) {
      state.cloudBookCache.set(fenKey, null);
      return null;
    }
  }

  async function updatePositionView(inputFen) {
    const requestId = (state.positionRequestId || 0) + 1;
    state.positionRequestId = requestId;

    const fen = inputFen || state.game.fen();
    const fenKey = normalizeFenForHash(fen);
    const hash = hashFen(fen);
    const ply = state.game.history({ verbose: false }).length;

    if (state.lastDebugFenKey !== fenKey) {
      state.lastDebugFenKey = fenKey;
      console.log('[OpeningDB] fenKey', fenKey, 'ply', ply);
    }

    updateMoveListFromGame(state.game);
    if (els.turnPly) {
      els.turnPly.textContent = `Turn: ${state.game.turn() === 'w' ? 'White' : 'Black'} | Ply: ${ply}`;
    }

    const openingFallback = resolveOpeningByPrefix();
    const exactData = await getContinuationsForFen(fen, fenKey, hash, ply);
    if (requestId !== state.positionRequestId) return;

    const legal = buildLegalMaps(state.game);
    const rows = normalizeContinuations(exactData.rawCandidates, {
      ply,
      legalBySan: legal.bySan,
      legalByUci: legal.byUci
    }).slice(0, ply === 0 ? 60 : 40);

    let openingText = 'Opening: (TBD)';
    if (exactData.entry && exactData.entry.opening) {
      openingText = exactData.entry.opening;
    } else if (exactData.entry && exactData.entry.name) {
      openingText = exactData.entry.eco ? `${exactData.entry.name} (${exactData.entry.eco})` : exactData.entry.name;
    } else if (openingFallback.eco || openingFallback.name !== 'Opening: (TBD)') {
      openingText = openingFallback.eco ? `${openingFallback.name} (${openingFallback.eco})` : openingFallback.name;
    }
    els.openingLabel.textContent = openingText;

    renderStatsRows(rows);

    if (!state.datasetsLoaded) {
      els.lookupStatus.textContent = state.datasetsError || 'Loading datasets...';
    } else if (
      exactData.source === 'opening_position_index_exact' ||
      exactData.source === 'book_chunks_exact' ||
      exactData.source === 'cloud_book_exact'
    ) {
      els.lookupStatus.textContent = `Position lookup: exact match (${exactData.source})`;
    } else {
      els.lookupStatus.textContent = 'Position lookup: no exact match (TBD)';
    }

    debugLog('updatePosition complete', { fenKey, hash, requestId, rows: rows.length, source: exactData.source });
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

  async function loadDatasets() {
    let indexLoaded = false;
    let ecoCodesLoaded = false;
    let bookChunksLoaded = false;

    try {
      const [indexRes, ecoCodesRes, chunkIndexRes] = await Promise.allSettled([
        fetch('/data/opening_position_index.json', { cache: 'force-cache' }),
        fetch('/data/eco/eco_codes.json', { cache: 'force-cache' }),
        fetch('/data/book_chunks/index.json', { cache: 'force-cache' })
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

      if (chunkIndexRes.status === 'fulfilled' && chunkIndexRes.value.ok) {
        state.bookChunkIndex = await chunkIndexRes.value.json();
        bookChunksLoaded = true;
      }

      state.datasetsLoaded = true;
      state.datasetsError = '';

      const missing = [];
      if (!indexLoaded) missing.push('opening_position_index.json');
      if (!ecoCodesLoaded) missing.push('eco_codes.json');
      if (!bookChunksLoaded) missing.push('book_chunks/index.json');
      if (missing.length > 0) {
        showDatasetBanner(`Lookup partially unavailable: missing ${missing.join(', ')}`);
      } else {
        showDatasetBanner('');
      }

      debugLog('datasets loaded', {
        openingPositionIndexLoaded: indexLoaded,
        ecoCodesLoaded,
        bookChunksLoaded
      });
    } catch (error) {
      state.datasetsLoaded = false;
      state.datasetsError = 'Dataset fetch failed. Showing placeholders.';
      showDatasetBanner('Lookup unavailable');
      console.warn('[OpeningDB] dataset load error', error);
      debugLog('datasets loaded', {
        openingPositionIndexLoaded: indexLoaded,
        ecoCodesLoaded,
        bookChunksLoaded
      });
    }

    updatePositionView();
  }

  function bindEvents() {
    els.startBtn.addEventListener('click', () => {
      state.game.reset();
      state.board.position('start', false);
      updateMoveListFromGame(state.game);
      updatePositionView(state.game.fen());
    });

    els.takebackBtn.addEventListener('click', () => {
      const undone = state.game.undo();
      if (!undone) return;
      state.board.position(state.game.fen(), false);
      updateMoveListFromGame(state.game);
      updatePositionView(state.game.fen());
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
      updateMoveListFromGame(state.game);
      updatePositionView(state.game.fen());
    });

    els.statsBody.addEventListener('click', (event) => {
      const rowEl = event.target && event.target.closest ? event.target.closest('tr[data-row-index]') : null;
      if (!rowEl) return;
      const idx = Number(rowEl.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0) return;
      const row = state.currentRows[idx];
      applyMoveFromRow(row);
    });

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
          updateMoveListFromGame(state.game);
          updatePositionView(state.game.fen());
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
