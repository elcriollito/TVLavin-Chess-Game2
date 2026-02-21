(function () {
  const state = {
    game: null,
    board: null,
    boardFlipped: false,
    ecoCodeDefs: [],
    openingDbShardCache: new Map(),
    shardBaseUrl: '',
    activeDbVersion: 'v3',
    dbVersionFallback: true,
    datasetsLoaded: false,
    datasetsError: '',
    positionRequestId: 0,
    lastDebugFenKey: '',
    currentRows: [],
    latestAllLegalRows: [],
    latestPopularRows: [],
    moveListMode: 'popular',
    activeTab: 'moves',
    gamesTier: 'free',
    gamesVersion: 'v1',
    gamesBaseRoot: '/openingdb/games',
    gameSearchManifest: null,
    gameSearchLineKey: '',
    gamesManifestLoaded: false,
    gamesManifestLoadAttempted: false,
    gamesManifestFallback: true,
    gamesShardCache: new Map(),
    gamesCatalogCache: new Map(),
    gamesResults: [],
    pgnViewsUsed: 0,
    engine: {
      client: null,
      evalClient: null,
      loading: false,
      available: false,
      running: false,
      paused: false,
      evalNextMoves: false,
      status: 'Idle',
      requestId: 0,
      activeRequestId: 0,
      evalRequestId: 0,
      activeEvalRequestId: 0,
      lastFen: '',
      depth: 18,
      multiPV: 1,
      debounceTimer: null,
      lastInfo: null,
      lastInfoFen: '',
      lastBestMove: '',
      lastPvSan: '',
      lastPvUci: [],
      pvLines: {},
      copyFeedbackTimer: null,
      nextMoveEvalCache: new Map(),
      nextMoveEvalSessionId: 0,
      nextMoveEvalRunning: false,
      debug: {
        workerUrl: '',
        handshakeState: 'idle',
        lastLine: '',
        lastInfoAt: 0,
        errors: [],
        sanity: null
      }
    }
  };

  const manifestUrl = '/openingdb/manifest.json';
  const shardBaseUrl = '/openingdb/shards/v3';
  const DEFAULT_SHARD_ROOT = '/openingdb/shards';
  const DEFAULT_ACTIVE_VERSION = 'v3';
  const MANIFEST_URL = manifestUrl;
  const LOCAL_MANIFEST_URL = '/openingdb/manifest.json';
  const MANIFEST_TTL_MS = 5 * 60 * 1000;
  const SHARD_PREFETCH_DELAY_MS = 200;
  const SHARD_BASE = (() => {
    const configured = String(window.CAISSA_OPENINGDB_BASE || '').trim();
    if (configured) return configured;
    return `${DEFAULT_SHARD_ROOT}/${DEFAULT_ACTIVE_VERSION}`;
  })();
  const MANIFEST_OVERRIDE_URL = String(window.CAISSA_OPENINGDB_MANIFEST_URL || '').trim();
  const DEV_MODE = (() => {
    const params = new URLSearchParams(window.location.search);
    const forceDev = params.get('dev') === '1';
    const host = String(window.location.hostname || '').toLowerCase();
    const localHost = host === 'localhost' || host === '127.0.0.1';
    return forceDev || localHost;
  })();
  const SHARD_FETCH_TIMEOUT_MS = 4000;
  const MANIFEST_FETCH_TIMEOUT_MS = 2000;
  const GAMES_MANIFEST_URL = '/openingdb/games/manifest.json';
  const REMOTE_GAMES_MANIFEST_URL = 'https://downloads.caissa-chess.org/openingdb/games/manifest.json';
  const LOCAL_GAMES_MANIFEST_URL = '/openingdb/games/manifest.json';
  const GAMES_MANIFEST_TTL_MS = 5 * 60 * 1000;
  const GAMES_FETCH_TIMEOUT_MS = 4000;
  const SEARCH_GAMES_ENABLED = true;
  const GAMESEARCH_MANIFEST_URL = '/gamesearch/manifest.json';
  const GAMESEARCH_LINE_URL = '/gamesearch/line';
  const GAMESEARCH_DEFAULT_MAX_PLIES = 10;
  const GAMESEARCH_RENDER_LIMIT = 50;
  const FREE_GAME_PREVIEW_LIMIT = 20;
  const PREMIUM_GAME_PREVIEW_LIMIT = 500;
  const FREE_PGN_VIEW_LIMIT = 5;
  const FREE_DOWNLOAD_LINK_LIMIT = 10;
  const PREMIUM_DOWNLOAD_LINK_LIMIT = 200;
  const EARLY_MIDDLEGAME_PLY = 10;
  const EARLY_MIDDLEGAME_MIN_MOVES = 3;
  const EARLY_MIDDLEGAME_MIN_GAMES = 20;
  const ENGINE_RESTART_DEBOUNCE_MS = 700;
  const ENGINE_DEFAULT_DEPTH = 18;
  const ENGINE_DEFAULT_MOVETIME_MS = 1500;
  const ENGINE_MOVE_EVAL_DEPTH = 10;
  const ENGINE_MOVE_EVAL_LIMIT = 12;
  const ENGINE_MOVE_EVAL_GAP_MS = 100;
  const ENGINE_MOVE_EVAL_TIMEOUT_MS = 3500;
  const ENGINE_PV_MAX_PLIES = 60;
  const QUICK_EVAL_STORAGE_KEY = 'odb_eval_next_moves_fast';

  const els = {
    board: document.getElementById('openingDbBoard'),
    moveList: document.getElementById('odbMoveList'),
    turnPly: document.getElementById('odbTurnPly'),
    openingLabel: document.getElementById('odbOpeningLabel'),
    lookupStatus: document.getElementById('odbLookupStatus'),
    matchBadge: document.getElementById('odbMatchBadge'),
    datasetBanner: document.getElementById('odbDatasetBanner'),
    statsBody: document.getElementById('odbStatsBody'),
    tabMoves: document.getElementById('odbTabMoves'),
    tabGames: document.getElementById('odbTabGames'),
    movesPopularBtn: document.getElementById('odbMovesPopularBtn'),
    movesAllBtn: document.getElementById('odbMovesAllBtn'),
    coverageBadge: document.getElementById('odbCoverageBadge'),
    movesPanel: document.getElementById('odbMovesPanel'),
    gamesPanel: document.getElementById('odbGamesPanel'),
    transitionPanel: document.getElementById('odbTransitionPanel'),
    transitionMessage: document.getElementById('odbTransitionMessage'),
    transitionStats: document.getElementById('odbTransitionStats'),
    transitionSearchGamesBtn: document.getElementById('odbTransitionSearchGamesBtn'),
    analyzePositionBtn: document.getElementById('odbAnalyzePositionBtn'),
    openSearchDockBtn: document.getElementById('odbOpenSearchDockBtn'),
    searchGamesBtn: document.getElementById('odbSearchGamesBtn'),
    copyLineKeyBtn: document.getElementById('odbCopyLineKeyBtn'),
    openSearchNewTabBtn: document.getElementById('odbOpenSearchNewTabBtn'),
    downloadGamesBtn: document.getElementById('odbDownloadGamesBtn'),
    gamesYearMin: document.getElementById('odbGamesYearMin'),
    gamesYearMax: document.getElementById('odbGamesYearMax'),
    gamesEloMin: document.getElementById('odbGamesEloMin'),
    gamesResult: document.getElementById('odbGamesResult'),
    gamesStatus: document.getElementById('odbGamesStatus'),
    gamesSummary: document.getElementById('odbGamesSummary'),
    gamesBody: document.getElementById('odbGamesBody'),
    gamesDownloads: document.getElementById('odbGamesDownloads'),
    gamesPgnViewer: document.getElementById('odbGamesPgnViewer'),
    gamesPgnTitle: document.getElementById('odbGamesPgnTitle'),
    gamesPgnText: document.getElementById('odbGamesPgnText'),
    gamesPgnCopyBtn: document.getElementById('odbGamesPgnCopyBtn'),
    gamesPgnCloseBtn: document.getElementById('odbGamesPgnCloseBtn'),
    stopEngineBtn: document.getElementById('odbStopEngineBtn'),
    engineDepth: document.getElementById('odbEngineDepth'),
    engineMultiPV: document.getElementById('odbEngineMultiPV'),
    engineStatusValue: document.getElementById('odbEngineStatusValue'),
    engineEvalValue: document.getElementById('odbEngineEvalValue'),
    engineDepthValue: document.getElementById('odbEngineDepthValue'),
    enginePvValue: document.getElementById('odbEnginePvValue'),
    enginePvLines: document.getElementById('odbEnginePvLines'),
    engineBestMoveValue: document.getElementById('odbEngineBestMoveValue'),
    engineNpsValue: document.getElementById('odbEngineNpsValue'),
    engineNodesValue: document.getElementById('odbEngineNodesValue'),
    quickEvalToggle: document.getElementById('odbQuickEvalToggle') || document.getElementById('odbEngineEvalMovesToggle'),
    engineCopyPvBtn: document.getElementById('odbEngineCopyPvBtn'),
    engineCopyFenBtn: document.getElementById('odbEngineCopyFenBtn'),
    engineCopyFeedback: document.getElementById('odbEngineCopyFeedback'),
    engineCopyDebugBtn: document.getElementById('odbEngineCopyDebugBtn'),
    engineDebugWorkerUrl: document.getElementById('odbEngineDebugWorkerUrl'),
    engineDebugHandshake: document.getElementById('odbEngineDebugHandshake'),
    engineDebugLastInfoAt: document.getElementById('odbEngineDebugLastInfoAt'),
    engineDebugLastLine: document.getElementById('odbEngineDebugLastLine'),
    startEngineBtn: document.getElementById('odbStartEngineBtn'),
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

  const openingDbDebugState = {
    counters: {
      lookupCount: 0,
      lookupMsTotal: 0,
      shardCacheMemoryHits: 0,
      shardCacheSessionHits: 0,
      shardFetchMisses: 0,
      shardFetchCount: 0,
      shardFetchMsTotal: 0,
      matchLevel: {
        exact: 0,
        no_ep: 0,
        no_castling: 0,
        board_only: 0,
        none: 0
      }
    },
    last: {}
  };

  function resetOpeningDbDebug() {
    openingDbDebugState.counters.lookupCount = 0;
    openingDbDebugState.counters.lookupMsTotal = 0;
    openingDbDebugState.counters.shardCacheMemoryHits = 0;
    openingDbDebugState.counters.shardCacheSessionHits = 0;
    openingDbDebugState.counters.shardFetchMisses = 0;
    openingDbDebugState.counters.shardFetchCount = 0;
    openingDbDebugState.counters.shardFetchMsTotal = 0;
    openingDbDebugState.counters.matchLevel = {
      exact: 0,
      no_ep: 0,
      no_castling: 0,
      board_only: 0,
      none: 0
    };
    openingDbDebugState.last = {};
  }

  function bumpMatchLevelCounter(level) {
    const key = String(level || 'none');
    if (!Object.prototype.hasOwnProperty.call(openingDbDebugState.counters.matchLevel, key)) {
      openingDbDebugState.counters.matchLevel[key] = 0;
    }
    openingDbDebugState.counters.matchLevel[key] += 1;
  }

  function setOpeningDbDebugLast(payload) {
    openingDbDebugState.last = {
      ...payload,
      at: new Date().toISOString()
    };
    if (window.__openingdbDebug) {
      window.__openingdbDebug.last = openingDbDebugState.last;
    }
  }

  window.__openingdbDebug = {
    counters: openingDbDebugState.counters,
    last: openingDbDebugState.last,
    reset: () => {
      resetOpeningDbDebug();
      window.__openingdbDebug.last = openingDbDebugState.last;
    }
  };

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

  function setMatchBadge(label) {
    if (!els.matchBadge) return;
    const text = String(label || '').trim();
    if (!text) {
      els.matchBadge.hidden = true;
      els.matchBadge.textContent = '';
      return;
    }
    els.matchBadge.hidden = false;
    els.matchBadge.textContent = `match: ${text}`;
  }

  function normalizeFenForHash(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) return String(fen || '').trim();
    return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
  }

  function splitFenParts(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    return {
      board: parts[0] || '',
      turn: parts[1] || 'w',
      castling: parts[2] || '-',
      ep: parts[3] || '-'
    };
  }

  function sha1Hex(input) {
    function rotl(n, s) {
      return (n << s) | (n >>> (32 - s));
    }
    function toHex(i) {
      return (`00000000${(i >>> 0).toString(16)}`).slice(-8);
    }

    const msg = unescape(encodeURIComponent(String(input || '')));
    const words = [];
    for (let i = 0; i < msg.length; i += 1) {
      words[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    words[msg.length >> 2] |= 0x80 << (24 - (msg.length % 4) * 8);
    words[(((msg.length + 8) >> 6) + 1) * 16 - 1] = msg.length * 8;

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    for (let i = 0; i < words.length; i += 16) {
      const w = [];
      for (let j = 0; j < 16; j += 1) w[j] = words[i + j] | 0;
      for (let j = 16; j < 80; j += 1) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let j = 0; j < 80; j += 1) {
        let f = 0;
        let k = 0;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const temp = (rotl(a, 5) + f + e + k + (w[j] | 0)) | 0;
        e = d;
        d = c;
        c = rotl(b, 30) | 0;
        b = a;
        a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    return (toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4)).toLowerCase();
  }

  function hashFen(fen) {
    return sha1Hex(normalizeFenForHash(fen)).slice(0, 16);
  }

  function buildFenLookupVariants(fen) {
    const p = splitFenParts(fen);
    if (!p.board) return [];
    const variants = [
      { level: 'exact', key: `${p.board} ${p.turn} ${p.castling} ${p.ep}` },
      { level: 'no_ep', key: `${p.board} ${p.turn} ${p.castling} -` },
      { level: 'no_castling', key: `${p.board} ${p.turn} - -` },
      { level: 'board_only', key: `${p.board}` }
    ];
    const seen = new Set();
    return variants.filter((v) => {
      const k = String(v.key || '').trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
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

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPrefixedSAN({ ply, sanForCandidateMove }) {
    const san = sanitizeMoveCellToken(sanForCandidateMove || '');
    if (!san) return { prefix: '', san: 'TBD' };
    const currentPly = Number.isInteger(ply) ? ply : 0;
    const fullmove = Math.floor(currentPly / 2) + 1;
    const isWhiteToMove = currentPly % 2 === 0;
    const prefix = isWhiteToMove ? `${fullmove}.` : `${fullmove}...`;
    return { prefix, san };
  }

  function uciToMoveObject(uci) {
    const m = String(uci || '').trim().toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) return null;
    return {
      from: m.slice(0, 2),
      to: m.slice(2, 4),
      promotion: m.length > 4 ? m.slice(4, 5) : undefined
    };
  }


  function pvUciToSan(fen, pvMoves, maxMoves = ENGINE_PV_MAX_PLIES) {
    try {
      if (!window.Chess) return (pvMoves || []).slice(0, maxMoves).join(' ');
      const game = new Chess(fen);
      const out = [];
      for (const uci of (pvMoves || []).slice(0, maxMoves)) {
        const moveObj = uciToMoveObject(uci);
        if (!moveObj) break;
        const mv = game.move(moveObj);
        if (!mv) break;
        out.push(mv.san || uci);
      }
      return out.length > 0 ? out.join(' ') : (pvMoves || []).slice(0, maxMoves).join(' ');
    } catch (_err) {
      return (pvMoves || []).slice(0, maxMoves).join(' ');
    }
  }

  function uciToSanFromFen(fen, uci) {
    try {
      if (!window.Chess) return String(uci || '');
      const mvObj = uciToMoveObject(uci);
      if (!mvObj) return String(uci || '');
      const game = new Chess(fen);
      const mv = game.move(mvObj);
      return mv?.san || String(uci || '');
    } catch (_err) {
      return String(uci || '');
    }
  }

  function scoreToWhitePerspective(info, fen) {
    if (!info || !info.scoreType) return null;
    const fenTurn = String(fen || '').split(/\s+/)[1] || 'w';
    const whitePerspectiveSign = fenTurn === 'b' ? -1 : 1;
    if (info.scoreType === 'mate') {
      return { scoreType: 'mate', score: (Number(info.score) || 0) * whitePerspectiveSign };
    }
    return { scoreType: 'cp', score: (Number(info.score) || 0) * whitePerspectiveSign };
  }

  function formatEngineScore(info, fen) {
    const normalized = scoreToWhitePerspective(info, fen || state.engine.lastInfoFen || state.engine.lastFen);
    if (!normalized) return '-';
    if (normalized.scoreType === 'mate') {
      const mate = Number(normalized.score) || 0;
      const side = mate >= 0 ? 'White' : 'Black';
      return `Mate in ${Math.abs(mate)} (${side})`;
    }
    const cp = Number(normalized.score) || 0;
    const value = cp / 100;
    const side = cp >= 0 ? 'White' : 'Black';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)} (${side})`;
  }

  function formatEngineScoreCompact(info, fen) {
    const normalized = scoreToWhitePerspective(info, fen);
    if (!normalized) return '-';
    if (normalized.scoreType === 'mate') {
      const mate = Number(normalized.score) || 0;
      return mate >= 0 ? `M${Math.abs(mate)}` : `-M${Math.abs(mate)}`;
    }
    const cp = Number(normalized.score) || 0;
    const value = cp / 100;
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }

  function getEngineEvalText(row) {
    const direct = row && (row.engineEval ?? row.eval ?? row.ceval ?? row.stockfish);
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct).trim();
    }
    return '-';
  }

  function getEngineCacheKey(fen, moveUci) {
    return `${String(fen || '').trim()}|${String(moveUci || '').trim().toLowerCase()}`;
  }

  function setEngineCopyFeedback(message) {
    if (!els.engineCopyFeedback) return;
    els.engineCopyFeedback.textContent = String(message || '');
    if (state.engine.copyFeedbackTimer) {
      clearTimeout(state.engine.copyFeedbackTimer);
      state.engine.copyFeedbackTimer = null;
    }
    if (message) {
      state.engine.copyFeedbackTimer = setTimeout(() => {
        state.engine.copyFeedbackTimer = null;
        if (els.engineCopyFeedback) els.engineCopyFeedback.textContent = '';
      }, 1400);
    }
  }

  function loadQuickEvalPreference() {
    try {
      if (!window.localStorage) return false;
      return localStorage.getItem(QUICK_EVAL_STORAGE_KEY) === '1';
    } catch (_err) {
      return false;
    }
  }

  function persistQuickEvalPreference(enabled) {
    try {
      if (!window.localStorage) return;
      localStorage.setItem(QUICK_EVAL_STORAGE_KEY, enabled ? '1' : '0');
    } catch (_err) {
      // ignore
    }
  }

  function renderMultiPvLines() {
    if (!els.enginePvLines) {
      if (els.enginePvValue) {
        els.enginePvValue.textContent = state.engine.lastPvSan || '-';
      }
      return;
    }
    const multiPv = Number(state.engine.multiPV) || 1;
    const linesToShow = multiPv > 1 ? [1, 2, 3] : [1];
    const lineHtml = linesToShow.map((idx) => {
      const entry = state.engine.pvLines[idx] || null;
      if (!entry) {
        return `<div class="engine-pv-line"><div class="engine-pv-line-header">PV${idx}: pending</div><strong>-</strong></div>`;
      }
      const evalText = formatEngineScore(entry.info, state.engine.lastInfoFen || state.engine.lastFen || (state.game ? state.game.fen() : ''));
      const depthText = Number(entry.info?.depth) || '-';
      const pvText = entry.pvSan || entry.pvUci || '-';
      return `<div class="engine-pv-line">
        <div class="engine-pv-line-header">PV${idx}: ${escapeHtml(evalText)} | d${escapeHtml(String(depthText))}</div>
        <strong>${escapeHtml(pvText)}</strong>
      </div>`;
    }).join('');
    els.enginePvLines.innerHTML = lineHtml;
  }

  function setRowEngineEvalByUci(uci, evalText) {
    const moveUci = String(uci || '').trim().toLowerCase();
    if (!moveUci) return;
    const text = String(evalText || '-');
    const applyTo = (rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (!row) return;
        const rowUci = String(row.moveUCI || row.uci || '').trim().toLowerCase();
        if (rowUci && rowUci === moveUci) row.engineEval = text;
      });
    };
    applyTo(state.latestAllLegalRows);
    applyTo(state.latestPopularRows);
    applyTo(state.currentRows);
  }

  function applyEngineEvalCacheToRows(rows, fen) {
    if (!Array.isArray(rows)) return;
    const currentFen = String(fen || '').trim();
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const uci = String(row.moveUCI || row.uci || '').trim().toLowerCase();
      if (!uci) {
        row.engineEval = '-';
        return;
      }
      const cached = state.engine.nextMoveEvalCache.get(getEngineCacheKey(currentFen, uci));
      row.engineEval = cached || '-';
    });
  }

  function refreshRenderedEngineEvalCells() {
    if (!els.statsBody) return;
    const fen = state.game ? state.game.fen() : '';
    const rowElements = els.statsBody.querySelectorAll('tr[data-row-index]');
    rowElements.forEach((rowEl) => {
      const idx = Number(rowEl.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.currentRows.length) return;
      const row = state.currentRows[idx];
      const uci = String(row?.moveUCI || row?.uci || '').trim().toLowerCase();
      const cell = rowEl.querySelector('td.col-engine');
      if (!cell) return;
      const text = uci ? (state.engine.nextMoveEvalCache.get(getEngineCacheKey(fen, uci)) || row.engineEval || '-') : '-';
      cell.textContent = text;
      cell.setAttribute('data-engine-eval', text);
      cell.classList.toggle('is-pending', text === '...');
    });
  }

  function clearEngineDebounce() {
    if (state.engine.debounceTimer) {
      clearTimeout(state.engine.debounceTimer);
      state.engine.debounceTimer = null;
    }
  }

  function sanitizeDebugLine(line) {
    return String(line || '').replace(/\s+/g, ' ').trim();
  }

  function updateEngineDebugWindow() {
    window.__engineDebug = {
      workerUrl: state.engine.debug.workerUrl || '',
      state: state.engine.status || '',
      handshakeState: state.engine.debug.handshakeState || '',
      evalNextMoves: !!state.engine.evalNextMoves,
      nextMoveEvalRunning: !!state.engine.nextMoveEvalRunning,
      lastLine: state.engine.debug.lastLine || '',
      lastInfoAt: state.engine.debug.lastInfoAt || 0,
      errors: (state.engine.debug.errors || []).slice(),
      sanity: state.engine.debug.sanity || null
    };
  }

  function renderEnginePanel() {
    const engine = state.engine;
    if (els.engineStatusValue) els.engineStatusValue.textContent = engine.status || 'Idle';
    if (els.engineEvalValue) els.engineEvalValue.textContent = engine.lastInfo ? formatEngineScore(engine.lastInfo, engine.lastInfoFen || engine.lastFen) : '-';
    if (els.engineDepthValue) els.engineDepthValue.textContent = engine.lastInfo ? String(engine.lastInfo.depth || engine.depth || '-') : String(engine.depth || '-');
    renderMultiPvLines();
    if (els.enginePvValue) els.enginePvValue.textContent = engine.lastPvSan || '-';
    if (els.engineBestMoveValue) els.engineBestMoveValue.textContent = engine.lastBestMove || '-';
    if (els.engineNpsValue) els.engineNpsValue.textContent = engine.lastInfo?.nps ? String(engine.lastInfo.nps) : '-';
    if (els.engineNodesValue) els.engineNodesValue.textContent = engine.lastInfo?.nodes ? String(engine.lastInfo.nodes) : '-';
    if (els.startEngineBtn) {
      els.startEngineBtn.disabled = engine.loading;
      els.startEngineBtn.textContent = engine.running ? 'RESTART ANALYSIS' : (engine.paused ? 'RESUME ANALYSIS' : 'START ENGINE ANALYSIS');
    }
    if (els.stopEngineBtn) {
      els.stopEngineBtn.disabled = !engine.running;
    }
    if (els.quickEvalToggle) {
      els.quickEvalToggle.checked = !!engine.evalNextMoves;
    }
    if (els.engineDebugWorkerUrl) els.engineDebugWorkerUrl.textContent = engine.debug.workerUrl || '-';
    if (els.engineDebugHandshake) els.engineDebugHandshake.textContent = engine.debug.handshakeState || '-';
    if (els.engineDebugLastInfoAt) {
      const ago = engine.debug.lastInfoAt ? `${Math.max(0, Date.now() - engine.debug.lastInfoAt)}ms ago` : '-';
      els.engineDebugLastInfoAt.textContent = ago;
    }
    if (els.engineDebugLastLine) {
      els.engineDebugLastLine.textContent = sanitizeDebugLine(engine.debug.lastLine) || '-';
    }
    updateEngineDebugWindow();
  }

  function setEngineStatus(status) {
    state.engine.status = String(status || 'Idle');
    renderEnginePanel();
  }

  async function runEngineAssetSanityCheck() {
    const workerPath = '/engine/stockfish.worker.js';
    const result = {
      url: workerPath,
      ok: false,
      status: 0,
      contentType: '',
      startsWithHtml: false,
      checkedAt: Date.now(),
      error: ''
    };
    try {
      const response = await fetch(workerPath, { cache: 'no-store' });
      result.status = response.status;
      result.contentType = String(response.headers.get('content-type') || '');
      const text = await response.text();
      result.startsWithHtml = /^\s*<!doctype html|^\s*<html/i.test(text);
      result.ok = response.ok && !result.startsWithHtml;
      if (result.startsWithHtml) {
        setEngineStatus('Worker file is HTML (rewrite/route). Check hosting/public path.');
      } else if (!/javascript|ecmascript/i.test(result.contentType)) {
        setEngineStatus(`Worker content-type warning: ${result.contentType || 'unknown'}`);
      }
    } catch (err) {
      result.error = err?.message || String(err);
    }
    state.engine.debug.sanity = result;
    renderEnginePanel();
    return result;
  }

  async function ensureEngineClient() {
    const engine = state.engine;
    if (engine.client && engine.available) return true;
    if (engine.loading) return false;
    if (!window.StockfishClient) {
      setEngineStatus('Engine unavailable');
      renderEnginePanel();
      return false;
    }
    engine.loading = true;
    setEngineStatus('Loading engine...');
    try {
      const workerUrl = new URL('/engine/stockfish.worker.js', window.location.origin).toString();
      engine.debug.workerUrl = workerUrl;
      engine.client = new window.StockfishClient({ workerUrl });
      engine.client.onState((snapshot) => {
        engine.debug.workerUrl = snapshot.workerUrl || engine.debug.workerUrl;
        engine.debug.handshakeState = snapshot.handshakeState || '';
        engine.debug.lastLine = snapshot.lastLine || '';
        engine.debug.lastInfoAt = Number(snapshot.lastInfoAt) || 0;
        engine.debug.errors = Array.isArray(snapshot.errors) ? snapshot.errors.slice(-20) : [];
        if (snapshot.handshakeState === 'uciok') console.log('[Engine] uciok');
        if (snapshot.handshakeState === 'readyok') console.log('[Engine] readyok');
        renderEnginePanel();
      });
      engine.client.onLine((line) => {
        engine.debug.lastLine = line || '';
        if (typeof line === 'string' && line.startsWith('info depth')) {
          console.log('[Engine]', line);
        }
        renderEnginePanel();
      });
      engine.client.onError((err) => {
        const msg = err?.message || String(err);
        setEngineStatus(msg.startsWith('Worker') ? msg : `Engine error: ${msg}`);
      });
      engine.client.onInfo((info) => {
        if (!engine.running) return;
        if (engine.activeRequestId !== engine.requestId) return;
        engine.debug.lastInfoAt = Date.now();
        const multipv = Number(info.multipv || 1);
        const prevForLine = engine.pvLines[multipv];
        const prevDepthForLine = Number(prevForLine?.info?.depth) || 0;
        const nextDepth = Number(info.depth) || 0;
        if (nextDepth >= prevDepthForLine) {
          const baseFen = engine.lastFen || (state.game ? state.game.fen() : '');
          const pvUci = Array.isArray(info.pv) ? info.pv.slice(0, ENGINE_PV_MAX_PLIES) : [];
          const pvSan = pvUciToSan(baseFen, pvUci, ENGINE_PV_MAX_PLIES);
          engine.pvLines[multipv] = {
            info,
            pvUci: pvUci.join(' '),
            pvSan
          };
          if (multipv === 1) {
            const prevDepth = Number(engine.lastInfo?.depth) || 0;
            if (nextDepth >= prevDepth) {
              engine.lastInfo = info;
              engine.lastInfoFen = baseFen;
              engine.lastPvUci = pvUci;
              engine.lastPvSan = pvSan;
            }
          }
          renderEnginePanel();
        }
      });
      engine.client.onBestMove((payload) => {
        if (!payload) return;
        if (engine.activeRequestId !== engine.requestId) return;
        engine.lastBestMove = uciToSanFromFen(engine.lastFen, payload.bestmove || '');
        renderEnginePanel();
      });
      engine.debug.handshakeState = 'uci';
      renderEnginePanel();
      await engine.client.init();
      engine.available = true;
      setEngineStatus('Idle');
      return true;
    } catch (err) {
      console.warn('[OpeningDB] engine init failed', err);
      engine.available = false;
      setEngineStatus(err?.message || 'Engine unavailable');
      return false;
    } finally {
      engine.loading = false;
      renderEnginePanel();
    }
  }

  async function startEngineAnalysis(opts = {}) {
    const engine = state.engine;
    await runEngineAssetSanityCheck();
    const ok = await ensureEngineClient();
    if (!ok || !engine.client || !state.game) return;

    clearEngineDebounce();
    const depth = Number(opts.depth || els.engineDepth?.value || engine.depth || ENGINE_DEFAULT_DEPTH);
    const multiPV = Number(opts.multiPV || els.engineMultiPV?.value || engine.multiPV || 1);
    engine.depth = depth;
    engine.multiPV = multiPV;
    engine.requestId += 1;
    engine.activeRequestId = engine.requestId;
    engine.running = true;
    engine.paused = false;
    engine.lastFen = state.game.fen();
    engine.pvLines = {};
    engine.lastInfo = null;
    engine.lastPvSan = '';
    engine.lastPvUci = [];
    engine.lastBestMove = '';
    setEngineStatus('Running');

    engine.client.stop();
    engine.client.setOptions({ multiPV });
    engine.client.setPositionFEN(engine.lastFen);
    engine.client.goDepth(depth || ENGINE_DEFAULT_DEPTH);
    if (engine.evalNextMoves) {
      void runNextMoveEvalQueue(engine.lastFen);
    }
  }

  function clearCurrentPositionEngineEvalRows() {
    const clearRows = (rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (row && typeof row === 'object') row.engineEval = '-';
      });
    };
    clearRows(state.latestAllLegalRows);
    clearRows(state.latestPopularRows);
    clearRows(state.currentRows);
  }

  function stopEngineAnalysis() {
    const engine = state.engine;
    clearEngineDebounce();
    if (engine.client) engine.client.stop();
    cancelNextMoveEvalQueue();
    engine.running = false;
    engine.paused = true;
    setEngineStatus('Paused');
  }

  function cancelNextMoveEvalQueue() {
    state.engine.nextMoveEvalSessionId += 1;
    state.engine.nextMoveEvalRunning = false;
    if (state.engine.evalClient) {
      state.engine.evalClient.stop();
    }
  }

  async function ensureEvalClient() {
    const engine = state.engine;
    if (engine.evalClient) return true;
    if (!window.StockfishClient) return false;
    try {
      const workerUrl = new URL('/engine/stockfish.worker.js', window.location.origin).toString();
      engine.evalClient = new window.StockfishClient({ workerUrl });
      await engine.evalClient.init();
      return true;
    } catch (err) {
      console.warn('[OpeningDB] eval engine init failed', err);
      engine.evalClient = null;
      return false;
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function evaluateMoveUciQuick(positionFen, moveUci) {
    const engine = state.engine;
    const ok = await ensureEvalClient();
    if (!ok || !engine.evalClient) return '-';

    let childFen = '';
    try {
      const clone = new Chess(positionFen);
      const mv = uciToMoveObject(moveUci);
      if (!mv) return '-';
      const played = clone.move(mv);
      if (!played) return '-';
      childFen = clone.fen();
    } catch (_err) {
      return '-';
    }

    const reqId = ++engine.evalRequestId;
    engine.activeEvalRequestId = reqId;

    return new Promise((resolve) => {
      let bestInfo = null;
      let done = false;
      const finalize = (value) => {
        if (done) return;
        done = true;
        if (engine.activeEvalRequestId === reqId) {
          resolve(value);
        } else {
          resolve('-');
        }
      };
      const timer = setTimeout(() => {
        finalize(bestInfo ? formatEngineScoreCompact(bestInfo, childFen) : '-');
      }, ENGINE_MOVE_EVAL_TIMEOUT_MS);

      engine.evalClient.onInfo((info) => {
        if (engine.activeEvalRequestId !== reqId) return;
        if (!info || (info.multipv || 1) !== 1) return;
        const prevDepth = Number(bestInfo?.depth) || 0;
        const depth = Number(info.depth) || 0;
        if (depth >= prevDepth) bestInfo = info;
      });
      engine.evalClient.onBestMove(() => {
        if (engine.activeEvalRequestId !== reqId) return;
        clearTimeout(timer);
        finalize(bestInfo ? formatEngineScoreCompact(bestInfo, childFen) : '-');
      });
      engine.evalClient.onError(() => {
        if (engine.activeEvalRequestId !== reqId) return;
        clearTimeout(timer);
        finalize('-');
      });

      engine.evalClient.stop();
      engine.evalClient.setOptions({ multiPV: 1 });
      engine.evalClient.setPositionFEN(childFen);
      engine.evalClient.goDepth(ENGINE_MOVE_EVAL_DEPTH);
    });
  }

  async function runNextMoveEvalQueue(positionFen) {
    const engine = state.engine;
    if (!engine.evalNextMoves || !state.game) return;
    const sourceRows = (state.moveListMode === 'all' ? state.latestAllLegalRows : state.latestPopularRows) || [];
    const queueRows = sourceRows
      .filter((row) => row && String(row.moveUCI || '').trim())
      .slice(0, ENGINE_MOVE_EVAL_LIMIT);
    if (queueRows.length === 0) return;

    const sessionId = ++engine.nextMoveEvalSessionId;
    engine.nextMoveEvalRunning = true;
    const fen = String(positionFen || state.game.fen() || '');

    for (let i = 0; i < queueRows.length; i += 1) {
      if (sessionId !== engine.nextMoveEvalSessionId) break;
      const row = queueRows[i];
      const uci = String(row.moveUCI || '').toLowerCase();
      if (!uci) continue;
      const cacheKey = getEngineCacheKey(fen, uci);
      const cached = engine.nextMoveEvalCache.get(cacheKey);
      if (cached) {
        setRowEngineEvalByUci(uci, cached);
        refreshRenderedEngineEvalCells();
        continue;
      }
      setRowEngineEvalByUci(uci, '...');
      refreshRenderedEngineEvalCells();
      const evalText = await evaluateMoveUciQuick(fen, uci);
      if (sessionId !== engine.nextMoveEvalSessionId) break;
      engine.nextMoveEvalCache.set(cacheKey, evalText || '-');
      setRowEngineEvalByUci(uci, evalText || '-');
      refreshRenderedEngineEvalCells();
      if (i < queueRows.length - 1) {
        await delay(ENGINE_MOVE_EVAL_GAP_MS);
      }
    }

    if (sessionId === engine.nextMoveEvalSessionId) {
      engine.nextMoveEvalRunning = false;
    }
  }

  function maybeRunNextMoveEvalQueue() {
    if (!state.engine.evalNextMoves || !state.game) return;
    const fen = state.game.fen();
    cancelNextMoveEvalQueue();
    void runNextMoveEvalQueue(fen);
  }

  function scheduleEngineReanalyzeForCurrentPosition() {
    const engine = state.engine;
    if (!engine.running || !state.game) {
      if (!engine.running && !engine.paused) {
        setEngineStatus(engine.available ? 'Idle' : (engine.loading ? 'Loading engine...' : 'Idle'));
      }
      maybeRunNextMoveEvalQueue();
      return;
    }
    const fen = state.game.fen();
    if (fen === engine.lastFen) return;
    cancelNextMoveEvalQueue();
    clearEngineDebounce();
    engine.debounceTimer = setTimeout(() => {
      engine.debounceTimer = null;
      startEngineAnalysis({ depth: engine.depth, multiPV: engine.multiPV });
    }, ENGINE_RESTART_DEBOUNCE_MS);
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

  function getShardSessionCacheKey(shard) {
    const version = String(state.activeDbVersion || DEFAULT_ACTIVE_VERSION || 'v3').toLowerCase();
    return `caissa.openingdb.shard.${version}.${shard}`;
  }

  function getManifestSessionCacheKey() {
    return 'openingdb_manifest_cache';
  }

  function clearLegacyShardSessionCache() {
    try {
      if (!window.sessionStorage) return;
      const keysToDelete = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('caissa.openingdb.shard.') && !/^caissa\.openingdb\.shard\.v[0-9a-z._-]+\.[0-9a-f]{2}$/i.test(key)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => sessionStorage.removeItem(key));
    } catch (_err) {
      // Ignore cache cleanup failures.
    }
  }

  function getDbVersionLabel() {
    return `DB: ${state.activeDbVersion}${state.dbVersionFallback ? ' (fallback)' : ''}`;
  }

  function updateTurnPlyLabel(ply) {
    if (!els.turnPly) return;
    const turnLabel = state.game.turn() === 'w' ? 'White' : 'Black';
    els.turnPly.textContent = `Turn: ${turnLabel} | Ply: ${ply} | ${getDbVersionLabel()}`;
  }

  function readManifestFromSession() {
    try {
      if (!window.sessionStorage) return null;
      const raw = sessionStorage.getItem(getManifestSessionCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const ts = Number(parsed.ts) || 0;
      if (Date.now() - ts > MANIFEST_TTL_MS) return null;
      return parsed.manifest || null;
    } catch (_err) {
      return null;
    }
  }

  function writeManifestToSession(manifest) {
    try {
      if (!window.sessionStorage) return;
      sessionStorage.setItem(getManifestSessionCacheKey(), JSON.stringify({
        ts: Date.now(),
        manifest
      }));
    } catch (_err) {
      // Ignore cache write errors.
    }
  }

  function getGamesManifestSessionKey() {
    return 'openingdb_games_manifest_cache';
  }

  function getPgnViewsSessionKey() {
    return 'openingdb_games_pgn_views_used';
  }

  function getTierFromUrl() {
    const tier = String(new URLSearchParams(window.location.search).get('tier') || '').toLowerCase();
    return tier === 'premium' ? 'premium' : 'free';
  }

  function getGamesVersionLabel() {
    return `Games: ${state.gamesVersion}${state.gamesManifestFallback ? ' (fallback)' : ''}`;
  }

  function getCurrentPreviewLimit() {
    return state.gamesTier === 'premium' ? PREMIUM_GAME_PREVIEW_LIMIT : FREE_GAME_PREVIEW_LIMIT;
  }

  function getCurrentDownloadLimit() {
    return state.gamesTier === 'premium' ? PREMIUM_DOWNLOAD_LINK_LIMIT : FREE_DOWNLOAD_LINK_LIMIT;
  }

  function normalizeResultFilterForApi(rawResult) {
    const value = String(rawResult || 'all').toLowerCase();
    if (value === '1-0' || value === 'white') return 'white';
    if (value === '1/2-1/2' || value === 'draw') return 'draw';
    if (value === '0-1' || value === 'black') return 'black';
    return 'all';
  }

  function updateDownloadButtonLabel() {
    if (!els.downloadGamesBtn) return;
    const limit = getCurrentDownloadLimit();
    els.downloadGamesBtn.textContent = `Download top ${limit} (ZIP)`;
  }

  function hydratePgnViewCounter() {
    try {
      if (!window.sessionStorage) return;
      const used = Number.parseInt(sessionStorage.getItem(getPgnViewsSessionKey()) || '0', 10);
      state.pgnViewsUsed = Number.isFinite(used) && used > 0 ? used : 0;
    } catch (_err) {
      state.pgnViewsUsed = 0;
    }
  }

  function persistPgnViewCounter() {
    try {
      if (!window.sessionStorage) return;
      sessionStorage.setItem(getPgnViewsSessionKey(), String(state.pgnViewsUsed));
    } catch (_err) {
      // Ignore write errors.
    }
  }

  function readGamesManifestFromSession() {
    try {
      if (!window.sessionStorage) return null;
      const raw = sessionStorage.getItem(getGamesManifestSessionKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const ts = Number(parsed.ts) || 0;
      if (Date.now() - ts > GAMES_MANIFEST_TTL_MS) return null;
      return parsed.manifest || null;
    } catch (_err) {
      return null;
    }
  }

  function writeGamesManifestToSession(manifest) {
    try {
      if (!window.sessionStorage) return;
      sessionStorage.setItem(getGamesManifestSessionKey(), JSON.stringify({
        ts: Date.now(),
        manifest
      }));
    } catch (_err) {
      // Ignore cache write errors.
    }
  }

  function readShardFromSession(shard) {
    try {
      if (!window.sessionStorage) return null;
      const raw = sessionStorage.getItem(getShardSessionCacheKey(shard));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function writeShardToSession(shard, payload) {
    try {
      if (!window.sessionStorage) return;
      sessionStorage.setItem(getShardSessionCacheKey(shard), JSON.stringify(payload));
    } catch (_err) {
      // Ignore cache write errors.
    }
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: 'force-cache', signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (_err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTextWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return null;
      return await res.text();
    } catch (_err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function applyManifest(manifest, fallback = false) {
    const m = manifest && typeof manifest === 'object' ? manifest : {};
    const activeVersion = String(m.activeVersion || DEFAULT_ACTIVE_VERSION).trim() || DEFAULT_ACTIVE_VERSION;
    let baseRoot = String(m.baseUrl || DEFAULT_SHARD_ROOT).trim() || DEFAULT_SHARD_ROOT;
    // In production, force same-origin shard path to avoid any cross-origin/CORS path.
    if (!DEV_MODE) {
      baseRoot = `/openingdb/shards/${activeVersion}`;
    }
    const normalizedBase = baseRoot.replace(/\/+$/, '');
    const alreadyVersioned = normalizedBase.toLowerCase().endsWith(`/${activeVersion.toLowerCase()}`);
    state.activeDbVersion = activeVersion;
    state.dbVersionFallback = !!fallback;
    state.shardBaseUrl = alreadyVersioned ? normalizedBase : `${normalizedBase}/${activeVersion}`;
    console.log('[OpeningDB] manifest', {
      activeVersion: state.activeDbVersion,
      baseUrl: state.shardBaseUrl,
      shardCount: Number(m.shardCount) || null
    });
    clearLegacyShardSessionCache();
  }

  function preferSameOriginManifest(manifest) {
    const m = manifest && typeof manifest === 'object' ? { ...manifest } : {};
    const activeVersion = String(m.activeVersion || DEFAULT_ACTIVE_VERSION).trim() || DEFAULT_ACTIVE_VERSION;
    m.activeVersion = activeVersion;
    m.baseUrl = `/openingdb/shards/${activeVersion}`;
    return m;
  }

  async function loadOpeningDbManifest() {
    const cached = readManifestFromSession();
    if (cached) {
      applyManifest(cached, false);
      return { source: 'session-cache', ok: true };
    }

    const siteManifestUrl = MANIFEST_OVERRIDE_URL || MANIFEST_URL;
    const siteManifest = await fetchJsonWithTimeout(siteManifestUrl, MANIFEST_FETCH_TIMEOUT_MS);
    if (siteManifest && typeof siteManifest === 'object') {
      const runtimeManifest = DEV_MODE ? siteManifest : preferSameOriginManifest(siteManifest);
      writeManifestToSession(runtimeManifest);
      applyManifest(runtimeManifest, false);
      return { source: 'site-proxy', ok: true };
    }

    applyManifest({
      activeVersion: DEFAULT_ACTIVE_VERSION,
      baseUrl: shardBaseUrl
    }, true);
    return { source: 'fallback', ok: false };
  }

  async function loadOpeningDbGamesManifest() {
    state.gamesManifestLoadAttempted = true;
    const cached = readGamesManifestFromSession();
    if (cached && typeof cached === 'object') {
      state.gamesVersion = String(cached.activeVersion || 'v1');
      state.gamesBaseRoot = String(cached.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      state.gamesManifestLoaded = true;
      return { source: 'session-cache', ok: true };
    }

    const localSiteManifest = await fetchJsonWithTimeout(LOCAL_GAMES_MANIFEST_URL, MANIFEST_FETCH_TIMEOUT_MS);
    if (localSiteManifest && typeof localSiteManifest === 'object') {
      const status = String(localSiteManifest.status || '').toLowerCase();
      if (status === 'pending') {
        state.gamesVersion = String(localSiteManifest.activeVersion || state.gamesVersion || 'v1');
        state.gamesBaseRoot = String(localSiteManifest.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
        state.gamesManifestFallback = true;
        state.gamesManifestLoaded = true;
        return { source: 'local-site-pending', ok: true };
      }
      writeGamesManifestToSession(localSiteManifest);
      state.gamesVersion = String(localSiteManifest.activeVersion || 'v1');
      state.gamesBaseRoot = String(localSiteManifest.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      state.gamesManifestLoaded = true;
      return { source: 'local-site-manifest', ok: true };
    }

    const remote = await fetchJsonWithTimeout(REMOTE_GAMES_MANIFEST_URL, MANIFEST_FETCH_TIMEOUT_MS);
    if (remote && typeof remote === 'object') {
      writeGamesManifestToSession(remote);
      state.gamesVersion = String(remote.activeVersion || 'v1');
      state.gamesBaseRoot = String(remote.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      state.gamesManifestLoaded = true;
      return { source: 'remote', ok: true };
    }

    const local = await fetchJsonWithTimeout('/data/openingdb_games/manifest.json', MANIFEST_FETCH_TIMEOUT_MS);
    if (local && typeof local === 'object') {
      state.gamesVersion = String(local.activeVersion || 'v1');
      state.gamesBaseRoot = String(local.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      state.gamesManifestLoaded = true;
      return { source: 'local-manifest', ok: true };
    }

    state.gamesVersion = 'v1';
    state.gamesBaseRoot = '/openingdb/games';
    state.gamesManifestFallback = true;
    state.gamesManifestLoaded = false;
    return { source: 'fallback', ok: false };
  }

  async function ensureGamesManifestLoaded() {
    if (state.gamesManifestLoaded) return { ok: true, source: 'cached' };
    if (state.gamesManifestLoadAttempted && state.gamesManifestFallback) {
      setGamesStatus('Search Games: coming soon.');
      return { ok: false, source: 'fallback-cached' };
    }
    const result = await loadOpeningDbGamesManifest();
    if (!result || !result.ok) {
      setGamesStatus('Search Games: coming soon.');
      return { ok: false, source: result?.source || 'fallback' };
    }
    return { ok: true, source: result.source || 'remote' };
  }

  async function loadGamesShard(shard) {
    if (!/^[0-9a-f]{2}$/.test(String(shard || ''))) return null;
    if (state.gamesShardCache.has(shard)) return state.gamesShardCache.get(shard);

    const remoteUrl = `${state.gamesBaseRoot}/${state.gamesVersion}/shards/${shard}.json`;
    let payload = await fetchJsonWithTimeout(remoteUrl, GAMES_FETCH_TIMEOUT_MS);
    if (!payload || typeof payload !== 'object') {
      payload = await fetchJsonWithTimeout(`/data/openingdb_games/${state.gamesVersion}/shards/${shard}.json`, GAMES_FETCH_TIMEOUT_MS);
    }
    state.gamesShardCache.set(shard, payload || null);
    return payload || null;
  }

  async function loadGamesCatalogPrefix(prefix) {
    if (!/^[0-9a-f]{2}$/.test(String(prefix || ''))) return null;
    if (state.gamesCatalogCache.has(prefix)) return state.gamesCatalogCache.get(prefix);

    const remoteUrl = `${state.gamesBaseRoot}/${state.gamesVersion}/catalog/${prefix}.json`;
    let payload = await fetchJsonWithTimeout(remoteUrl, GAMES_FETCH_TIMEOUT_MS);
    if (!payload || typeof payload !== 'object') {
      payload = await fetchJsonWithTimeout(`/data/openingdb_games/${state.gamesVersion}/catalog/${prefix}.json`, GAMES_FETCH_TIMEOUT_MS);
    }
    state.gamesCatalogCache.set(prefix, payload || null);
    return payload || null;
  }

  function buildPgnUrl(gameId) {
    return `${state.gamesBaseRoot}/${state.gamesVersion}/pgn/${gameId}.pgn`;
  }

  function prefetchShard(shard) {
    if (!/^[0-9a-f]{2}$/.test(String(shard || ''))) return;
    if (state.openingDbShardCache.has(shard)) return;
    setTimeout(() => {
      loadOpeningDbShard(shard).catch(() => {});
    }, SHARD_PREFETCH_DELAY_MS);
  }

  function scheduleOpeningDbPrefetch() {
    try {
      const startFen = normalizeFenForHash(new Chess().fen());
      const startHash = hashFen(startFen);
      const startShard = startHash.slice(0, 2).toLowerCase();
      prefetchShard(startShard);

      const base = Number.parseInt(startShard, 16);
      if (Number.isFinite(base)) {
        const next1 = ((base + 1) & 0xff).toString(16).padStart(2, '0');
        const next2 = ((base + 2) & 0xff).toString(16).padStart(2, '0');
        prefetchShard(next1);
        prefetchShard(next2);
      }
    } catch (_err) {
      // Prefetch is best effort.
    }
  }

  async function loadOpeningDbShard(shard) {
    if (!/^[0-9a-f]{2}$/.test(shard)) return null;

    if (state.openingDbShardCache.has(shard)) {
      openingDbDebugState.counters.shardCacheMemoryHits += 1;
      const cached = state.openingDbShardCache.get(shard);
      if (cached && typeof cached === 'object') {
        console.log('[OpeningDB] shardLoaded', { shardId: shard, entries: Object.keys(cached).length });
      }
      return cached;
    }

    const fromSession = readShardFromSession(shard);
    if (fromSession && typeof fromSession === 'object') {
      openingDbDebugState.counters.shardCacheSessionHits += 1;
      state.openingDbShardCache.set(shard, fromSession);
      console.log('[OpeningDB] shardLoaded', { shardId: shard, entries: Object.keys(fromSession).length });
      return fromSession;
    }

    try {
      const fetchStartedAt = performance.now();
      const activeBase = state.shardBaseUrl || SHARD_BASE;
      const remoteUrl = `${activeBase}/${shard}.json`;
      const json = await fetchJsonWithTimeout(remoteUrl, SHARD_FETCH_TIMEOUT_MS);
      const fetchMs = performance.now() - fetchStartedAt;
      openingDbDebugState.counters.shardFetchCount += 1;
      openingDbDebugState.counters.shardFetchMsTotal += fetchMs;
      const payload = json && typeof json === 'object' ? json : null;
      if (!payload) openingDbDebugState.counters.shardFetchMisses += 1;
      state.openingDbShardCache.set(shard, payload);
      if (payload) writeShardToSession(shard, payload);
      if (payload) {
        console.log('[OpeningDB] shardLoaded', { shardId: shard, entries: Object.keys(payload).length });
      }
      setOpeningDbDebugLast({
        shardId: shard,
        shardFetchMs: Number(fetchMs.toFixed(2)),
        shardSource: 'network',
        shardEntries: payload && typeof payload === 'object' ? Object.keys(payload).length : 0
      });
      return payload;
    } catch (_err) {
      openingDbDebugState.counters.shardFetchMisses += 1;
      state.openingDbShardCache.set(shard, null);
      setOpeningDbDebugLast({
        shardId: shard,
        shardSource: 'network_error'
      });
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
      elo: toNumberOrNull(raw.avgElo) ?? toNumberOrNull(raw.elo) ?? null,
      perf: raw.perf || null,
      year: raw.year || raw.lastYear || raw.lastYearSeen || null,
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

  function sortExplorerRows(rows) {
    const copy = Array.isArray(rows) ? rows.slice() : [];
    copy.sort((a, b) => {
      const gamesA = Number(a?.games) || 0;
      const gamesB = Number(b?.games) || 0;
      if (gamesB !== gamesA) return gamesB - gamesA;
      return String(a?.moveSAN || a?.moveUCI || '').localeCompare(String(b?.moveSAN || b?.moveUCI || ''));
    });
    return copy;
  }

  function buildAllLegalRowsFromGame(game) {
    if (!game || typeof game.moves !== 'function') return [];
    const legalMoves = game.moves({ verbose: true }) || [];
    return sortExplorerRows(legalMoves.map((mv) => {
      const isObj = mv && typeof mv === 'object';
      const san = sanitizeMoveCellToken(isObj ? (mv.san || '') : String(mv || ''));
      const uci = isObj ? canonicalUci(mv) : '';
      return {
        moveSAN: san,
        moveUCI: uci,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        value: null,
        elo: null,
        perf: null,
        year: null,
        w: 0,
        d: 0,
        l: 0,
        preview: '',
        hasData: false
      };
    }));
  }

  function mergeLegalMovesWithStats(game, candidateRows) {
    const legalRows = buildAllLegalRowsFromGame(game);
    const byUci = new Map();
    const bySan = new Map();
    (candidateRows || []).forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const uci = sanitizeMoveCellToken(row.moveUCI || row.uci || '').toLowerCase();
      const san = sanitizeMoveCellToken(row.moveSAN || row.san || '');
      if (uci) byUci.set(uci, row);
      if (san) bySan.set(san, row);
    });

    const merged = legalRows.map((base) => {
      const uci = sanitizeMoveCellToken(base.moveUCI || '').toLowerCase();
      const san = sanitizeMoveCellToken(base.moveSAN || '');
      const found = (uci ? byUci.get(uci) : null) || (san ? bySan.get(san) : null) || null;
      if (!found) return base;
      return {
        ...base,
        ...found,
        moveSAN: sanitizeMoveCellToken(found.moveSAN || san || base.moveSAN),
        moveUCI: sanitizeMoveCellToken(found.moveUCI || uci || base.moveUCI).toLowerCase(),
        hasData: true
      };
    });

    const withData = merged.filter((row) => row.hasData);
    return {
      allLegal: sortExplorerRows(merged),
      popular: sortExplorerRows(withData)
    };
  }

  function updateCoverageBadge(hasDataCount, totalLegal) {
    if (!els.coverageBadge) return;
    const withData = Number(hasDataCount) || 0;
    const total = Number(totalLegal) || 0;
    els.coverageBadge.textContent = `${withData}/${total} moves have DB stats`;
  }

  function setMovesListMode(mode) {
    state.moveListMode = mode === 'all' ? 'all' : 'popular';
    const isPopular = state.moveListMode === 'popular';
    if (els.movesPopularBtn) {
      els.movesPopularBtn.classList.toggle('active', isPopular);
      els.movesPopularBtn.setAttribute('aria-pressed', isPopular ? 'true' : 'false');
    }
    if (els.movesAllBtn) {
      els.movesAllBtn.classList.toggle('active', !isPopular);
      els.movesAllBtn.setAttribute('aria-pressed', isPopular ? 'false' : 'true');
    }
    const rows = isPopular ? state.latestPopularRows : state.latestAllLegalRows;
    renderStatsRows(rows);
    refreshRenderedEngineEvalCells();
    maybeRunNextMoveEvalQueue();
  }

  function renderStatsRows(rows) {
    if (!els.statsBody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      if (state.moveListMode === 'all' && state.game) {
        const fallbackRows = buildAllLegalRowsFromGame(state.game);
        if (fallbackRows.length > 0) {
          state.currentRows = fallbackRows;
          rows = fallbackRows;
        }
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      state.currentRows = [];
      const message = state.moveListMode === 'popular'
        ? 'No DB stats for this position yet. Switch to "All Legal" to see playable moves.'
        : 'No legal moves in this position.';
      els.statsBody.innerHTML = `<tr><td colspan="4" class="openingdb-empty">${message}</td></tr>`;
      return;
    }

    const currentPly = state.game && typeof state.game.history === 'function'
      ? state.game.history({ verbose: false }).length
      : 0;
    state.currentRows = rows.slice();
    const rowsHtml = rows.map((row, idx) => {
      const n = Number(row.games) || 0;
      const wPct = Number(row.wins) || 0;
      const dPct = Number(row.draws) || 0;
      const lPct = Number(row.losses) || 0;
      const hasData = !!row.hasData;
      const moveText = sanitizeMoveCellToken(row.moveSAN || row.moveUCI || 'TBD') || 'TBD';
      const prefixed = formatPrefixedSAN({ ply: currentPly, sanForCandidateMove: row.moveSAN || row.moveUCI || moveText });
      const moveCellHtml = `<span class="movePrefix">${escapeHtml(prefixed.prefix)}</span><span class="moveSan">${escapeHtml(prefixed.san)}</span>`;
      const title = row.preview && row.preview !== moveText ? ` title="${String(row.preview).replace(/"/g, '&quot;')}"` : '';
      const wdlTitle = `W:${wPct.toFixed(1)} D:${dPct.toFixed(1)} L:${lPct.toFixed(1)}`;
      const rowClass = hasData ? dominantClass(wPct, dPct, lPct) : 'row-nodata';
      const engineEval = getEngineEvalText(row);
      const engineClass = engineEval === '...' ? 'col-engine is-pending' : 'col-engine';
      const wdlCell = hasData
        ? `<div class="wdb-bar" title="${wdlTitle}">
              <div class="w" style="width:${wPct.toFixed(1)}%"><span>${wPct.toFixed(1)}%</span></div>
              <div class="d" style="width:${dPct.toFixed(1)}%"><span>${dPct.toFixed(1)}%</span></div>
              <div class="l" style="width:${lPct.toFixed(1)}%"><span>${lPct.toFixed(1)}%</span></div>
            </div>`
        : '<div class="wdb-bar is-empty" title="No statistics for this move">—</div>';

      return `
        <tr class="${rowClass}" data-row-index="${idx}">
          <td class="col-move"${title}>${moveCellHtml}</td>
          <td class="col-games">${n}</td>
          <td class="col-wdl">
            ${wdlCell}
          </td>
          <td class="${engineClass}" data-engine-eval="${escapeHtml(engineEval)}" data-engine-uci="${escapeHtml(String(row.moveUCI || ''))}">${escapeHtml(engineEval)}</td>
        </tr>
      `;
    }).join('');
    els.statsBody.innerHTML = rowsHtml;
  }

  function setGamesStatus(message) {
    if (!els.gamesStatus) return;
    const tierNote = `Tier: ${state.gamesTier.toUpperCase()} | ${getGamesVersionLabel()}`;
    els.gamesStatus.textContent = `${message} | ${tierNote}`;
  }

  function renderGamesSummary(rows, totalGames) {
    if (!els.gamesSummary) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      els.gamesSummary.textContent = 'Games: 0 | White 0% | Draw 0% | Black 0% | Avg Elo - | Years -';
      return;
    }
    const count = Number(totalGames) || rows.length;
    let whiteWins = 0;
    let draws = 0;
    let blackWins = 0;
    let sumElo = 0;
    let eloCount = 0;
    let yearMin = Number.POSITIVE_INFINITY;
    let yearMax = Number.NEGATIVE_INFINITY;

    rows.forEach((row) => {
      const result = String(row.result || '');
      if (result === '1-0') whiteWins += 1;
      else if (result === '1/2-1/2') draws += 1;
      else if (result === '0-1') blackWins += 1;
      const avgElo = Number(row.avgElo);
      if (Number.isFinite(avgElo) && avgElo > 0) {
        sumElo += avgElo;
        eloCount += 1;
      }
      const year = Number(row.year);
      if (Number.isFinite(year) && year > 0) {
        yearMin = Math.min(yearMin, year);
        yearMax = Math.max(yearMax, year);
      }
    });

    const pct = (n) => {
      const value = rows.length > 0 ? (Number(n) / rows.length) * 100 : 0;
      return `${value.toFixed(1)}%`;
    };
    const avgEloText = eloCount > 0 ? String(Math.round(sumElo / eloCount)) : '-';
    const yearsText = Number.isFinite(yearMin) && Number.isFinite(yearMax) ? `${yearMin}-${yearMax}` : '-';
    els.gamesSummary.textContent = `Games: ${count} | White ${pct(whiteWins)} | Draw ${pct(draws)} | Black ${pct(blackWins)} | Avg Elo ${avgEloText} | Years ${yearsText}`;
  }

  function toggleTransitionPanel(show, message, statsText) {
    if (!els.transitionPanel) return;
    els.transitionPanel.hidden = !show;
    if (show) {
      if (els.transitionMessage) {
        els.transitionMessage.textContent = message || 'Position branching is narrowing. You are transitioning from Opening Theory into Early Middlegame.';
      }
      if (els.transitionStats) {
        els.transitionStats.textContent = statsText || '';
      }
    }
  }

  function checkTransitionState(rows, plyCount) {
    const moves = Array.isArray(rows) ? rows : [];
    const totalGames = moves.reduce((sum, move) => sum + (Number(move.games) || 0), 0);
    const allowPanel = Number(plyCount) >= EARLY_MIDDLEGAME_PLY;
    const lowCandidates = moves.length < EARLY_MIDDLEGAME_MIN_MOVES;
    const lowGames = totalGames < EARLY_MIDDLEGAME_MIN_GAMES;
    const shouldTransition = allowPanel && (lowCandidates || lowGames);

    if (!shouldTransition) {
      toggleTransitionPanel(false);
      return;
    }

    const message = lowCandidates
      ? 'Branching is narrowing. You are transitioning from Opening Theory into Early Middlegame.'
      : 'This position is rare in the database. You are transitioning from Opening Theory into Early Middlegame.';
    const statsText = `Ply: ${Number(plyCount) || 0} • Candidates: ${moves.length} • Games: ${totalGames}`;
    toggleTransitionPanel(true, message, statsText);
  }

  async function loadGamePgnText(row) {
    if (!row || !row.gameId) return null;
    const remoteText = await fetchTextWithTimeout(row.pgnUrl, GAMES_FETCH_TIMEOUT_MS);
    if (remoteText) return remoteText;
    const localUrl = `/data/openingdb_games/${state.gamesVersion}/pgn/${row.gameId}.pgn`;
    return fetchTextWithTimeout(localUrl, GAMES_FETCH_TIMEOUT_MS);
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName === 'games' ? 'games' : 'moves';
    const isGames = state.activeTab === 'games';
    if (els.tabMoves) {
      els.tabMoves.classList.toggle('active', !isGames);
      els.tabMoves.setAttribute('aria-selected', isGames ? 'false' : 'true');
    }
    if (els.tabGames) {
      els.tabGames.classList.toggle('active', isGames);
      els.tabGames.setAttribute('aria-selected', isGames ? 'true' : 'false');
    }
    if (els.movesPanel) els.movesPanel.hidden = isGames;
    if (els.gamesPanel) els.gamesPanel.hidden = !isGames;
    if (isGames && !SEARCH_GAMES_ENABLED) {
      setGamesStatus('Search Games: coming soon.');
      renderGamesSummary([], 0);
      return;
    }
    if (isGames) {
      const lineKey = buildCurrentLineKey();
      state.gameSearchLineKey = lineKey;
      if (!lineKey) {
        setGamesStatus('Play moves, then click Search Games From This Position.');
      } else {
        setGamesStatus('Ready. Click Search Games From This Position.');
      }
    }
  }

  function passesGamesFilters(meta) {
    const yearMin = Number.parseInt(String(els.gamesYearMin?.value || ''), 10);
    const yearMax = Number.parseInt(String(els.gamesYearMax?.value || ''), 10);
    const eloMin = Number.parseInt(String(els.gamesEloMin?.value || ''), 10);
    const resultFilter = String(els.gamesResult?.value || 'all');

    const year = Number(meta.year) || 0;
    const avgElo = ((Number(meta.whiteElo) || 0) + (Number(meta.blackElo) || 0)) / 2;
    const result = String(meta.result || '');

    if (Number.isFinite(yearMin) && yearMin > 0 && year > 0 && year < yearMin) return false;
    if (Number.isFinite(yearMax) && yearMax > 0 && year > 0 && year > yearMax) return false;
    if (Number.isFinite(eloMin) && eloMin > 0 && Number.isFinite(avgElo) && avgElo > 0 && avgElo < eloMin) return false;
    if (resultFilter !== 'all' && result !== resultFilter) return false;
    return true;
  }

  function renderGamesRows(rows) {
    if (!els.gamesBody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      els.gamesBody.innerHTML = '<tr><td colspan="7" class="openingdb-empty">No games found for this position/filter.</td></tr>';
      return;
    }

    els.gamesBody.innerHTML = rows.map((row, idx) => {
      const white = row.white || 'Unknown';
      const black = row.black || 'Unknown';
      const result = row.result || '?';
      const event = row.eco ? `${row.event || row.site || '-'} [${row.eco}]` : (row.event || row.site || '-');
      const year = row.year || '-';
      const avgElo = Number(row.avgElo);
      const whiteElo = row.whiteElo ? String(row.whiteElo) : '?';
      const blackElo = row.blackElo ? String(row.blackElo) : '?';
      const eloCell = Number.isFinite(avgElo) ? `${Math.round(avgElo)} (avg)` : `${whiteElo}/${blackElo}`;
      const actions = row.pgnUrl
        ? `<button class="btn btn-secondary odb-game-view-btn" data-action="view" data-game-index="${idx}" type="button">View PGN</button>
            <a class="btn btn-secondary odb-game-download-link" data-action="download" data-game-index="${idx}" href="${row.pgnUrl}" download="${row.gameId}.pgn">Download</a>`
        : '—';
      return `
        <tr data-game-index="${idx}">
          <td>${white}</td>
          <td>${black}</td>
          <td>${result}</td>
          <td>${event}</td>
          <td>${year}</td>
          <td>${eloCell}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  }

  function renderGamesDownloadLinks(rows) {
    if (!els.gamesDownloads) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      els.gamesDownloads.innerHTML = '';
      return;
    }
    const limit = Math.min(rows.length, getCurrentDownloadLimit());
    const chosen = rows.slice(0, limit);
    const links = chosen.map((row) => `<a href="${row.pgnUrl}" download="${row.gameId}.pgn">${row.white || '?'} vs ${row.black || '?'} (${row.year || '?'})</a>`);
    const paywall = state.gamesTier === 'free' && rows.length > limit
      ? '<div class="openingdb-games-status">Upgrade to Premium to download more games.</div>'
      : '';
    els.gamesDownloads.innerHTML = `<div class="openingdb-games-status">Download list (${limit}/${rows.length})</div>${links.join('')}${paywall}`;
  }

  function moveVerboseToUci(move) {
    if (!move || typeof move !== 'object') return '';
    return `${move.from || ''}${move.to || ''}${move.promotion || ''}`.toLowerCase();
  }

  function getGameSearchMaxPlies() {
    const fromManifest = Number(state.gameSearchManifest?.maxPlies);
    if (Number.isFinite(fromManifest) && fromManifest > 0) return fromManifest;
    return GAMESEARCH_DEFAULT_MAX_PLIES;
  }

  function buildCurrentLineKey() {
    if (!state.game) return '';
    const maxPlies = getGameSearchMaxPlies();
    const history = state.game.history({ verbose: true }) || [];
    const ucis = history.map(moveVerboseToUci).filter(Boolean);
    if (ucis.length === 0) return '';
    return ucis.slice(-maxPlies).join(' ');
  }

  async function ensureGameSearchManifest() {
    if (state.gameSearchManifest && typeof state.gameSearchManifest === 'object') {
      return state.gameSearchManifest;
    }
    const manifest = await fetchJsonWithTimeout(GAMESEARCH_MANIFEST_URL, MANIFEST_FETCH_TIMEOUT_MS);
    if (!manifest || typeof manifest !== 'object') return null;
    state.gameSearchManifest = manifest;
    return manifest;
  }

  async function queryGameSearchByLineKey(lineKey) {
    const url = `${GAMESEARCH_LINE_URL}?lineKey=${encodeURIComponent(lineKey)}`;
    const data = await fetchJsonWithTimeout(url, GAMES_FETCH_TIMEOUT_MS);
    if (!data || typeof data !== 'object') return null;
    return data;
  }

  function parseFilenameFromContentDisposition(value, fallback) {
    const raw = String(value || '');
    const matchStar = raw.match(/filename\*=UTF-8''([^;]+)/i);
    if (matchStar && matchStar[1]) {
      try {
        return decodeURIComponent(matchStar[1].replace(/["']/g, ''));
      } catch (_err) {
        // ignore
      }
    }
    const match = raw.match(/filename="?([^";]+)"?/i);
    if (match && match[1]) return match[1];
    return fallback;
  }

  async function triggerGamesZipDownload() {
    setGamesStatus('Download Games ZIP: coming soon.');
  }

  async function runGamesSearch() {
    if (!SEARCH_GAMES_ENABLED) {
      setGamesStatus('Search Games: coming soon.');
      return;
    }
    if (!state.game) return;
    const manifest = await ensureGameSearchManifest();
    if (!manifest) {
      setGamesStatus('GameSearch manifest unavailable.');
      renderGamesSummary([], 0);
      return;
    }
    const lineKey = buildCurrentLineKey();
    state.gameSearchLineKey = lineKey;
    if (!lineKey) {
      state.gamesResults = [];
      renderGamesRows([]);
      renderGamesSummary([], 0);
      if (els.gamesDownloads) els.gamesDownloads.innerHTML = '';
      setGamesStatus('No moves played yet. Play moves to search games.');
      return;
    }

    setGamesStatus('Searching indexed games...');
    const payload = await queryGameSearchByLineKey(lineKey);
    if (!payload || !payload.ok) {
      state.gamesResults = [];
      renderGamesRows([]);
      renderGamesSummary([], 0);
      if (els.gamesDownloads) els.gamesDownloads.innerHTML = '';
      setGamesStatus('GameSearch request failed.');
      return;
    }

    const topRows = Array.isArray(payload.top) ? payload.top.slice(0, GAMESEARCH_RENDER_LIMIT) : [];
    const rows = topRows.map((meta) => {
      const avgElo = Number(meta.avgElo);
      return {
        gameId: meta.gameId || '',
        white: meta.white || 'Unknown',
        black: meta.black || 'Unknown',
        result: meta.result || '?',
        event: meta.event || meta.site || '',
        site: meta.site || '',
        year: meta.year || null,
        whiteElo: meta.whiteElo || null,
        blackElo: meta.blackElo || null,
        eco: meta.eco || '',
        avgElo: Number.isFinite(avgElo) ? avgElo : null,
        pgnUrl: ''
      };
    }).filter(passesGamesFilters);

    state.gamesResults = rows;
    renderGamesRows(rows);
    renderGamesSummary(rows, Number(payload.games) || rows.length);
    if (els.gamesDownloads) {
      const safeLineKey = String(lineKey).replace(/"/g, '&quot;');
      els.gamesDownloads.innerHTML = `
        <div class="openingdb-games-status">lineKey: <code>${safeLineKey}</code></div>
        <div class="openingdb-games-status">Total indexed games: ${Number(payload.games) || 0} | Showing: ${rows.length}</div>
      `;
    }

    if ((Number(payload.games) || 0) === 0) {
      setGamesStatus('No indexed games for this line (yet).');
    } else {
      setGamesStatus(`Found ${Number(payload.games) || 0} indexed games for this line.`);
    }
  }

  async function viewGamePgn(gameIndex) {
    if (!SEARCH_GAMES_ENABLED) {
      setGamesStatus('Search Games: coming soon.');
      return;
    }
    const idx = Number(gameIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.gamesResults.length) return;
    const row = state.gamesResults[idx];
    if (!row) return;

    if (state.gamesTier !== 'premium' && state.pgnViewsUsed >= FREE_PGN_VIEW_LIMIT) {
      setGamesStatus(`Free limit reached (${FREE_PGN_VIEW_LIMIT} PGN views/session). Upgrade to Premium.`);
      return;
    }

    const pgnText = await loadGamePgnText(row);
    if (!pgnText) {
      setGamesStatus(`PGN unavailable for ${row.gameId}.`);
      return;
    }

    if (state.gamesTier !== 'premium') {
      state.pgnViewsUsed += 1;
      persistPgnViewCounter();
    }

    if (els.gamesPgnTitle) {
      els.gamesPgnTitle.textContent = `${row.white || '?'} vs ${row.black || '?'} (${row.result || '?'})`;
    }
    if (els.gamesPgnText) {
      els.gamesPgnText.value = pgnText;
    }
    if (els.gamesPgnViewer) {
      els.gamesPgnViewer.hidden = false;
    }
    const usedText = state.gamesTier === 'premium' ? 'premium' : `${state.pgnViewsUsed}/${FREE_PGN_VIEW_LIMIT}`;
    setGamesStatus(`PGN loaded (${usedText}).`);
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

  async function getContinuationsForFen(fen, context = {}) {
    const variants = buildFenLookupVariants(fen);
    for (const variant of variants) {
      const fenKeyCandidate = String(variant.key || '');
      const fenHash = hashFen(fenKeyCandidate);
      const shard = String(fenHash || '').slice(0, 2).toLowerCase();
      const shardUrl = `${state.shardBaseUrl || SHARD_BASE}/${shard}.json`;
      console.log('[OpeningDB] lookup', {
        ply: Number(context.ply) || 0,
        fenKey: context.fenKey || '',
        lookupFenKey: fenKeyCandidate,
        matchLevel: variant.level,
        shardId: shard,
        shardUrl
      });

      const shardData = await loadOpeningDbShard(shard);
      const entry = shardData && typeof shardData === 'object' ? shardData[fenHash] : null;
      const candidateCount = Array.isArray(entry?.moves) ? entry.moves.length : 0;
      const totalGames = Array.isArray(entry?.moves)
        ? entry.moves.reduce((sum, move) => sum + (Number(move?.games) || 0), 0)
        : 0;
      console.log('[OpeningDB] match', {
        found: !!entry,
        matchLevel: variant.level,
        candidates: candidateCount,
        totalGames
      });

      if (entry) {
        return {
          source: 'openingdb_shard_exact',
          matchLevel: variant.level,
          entry,
          rawCandidates: extractRawCandidates(entry)
        };
      }
    }

    return {
      source: 'none',
      matchLevel: 'none',
      entry: null,
      rawCandidates: []
    };
  }

  async function updatePositionView(inputFen, options = {}) {
    const lookupStartedAt = performance.now();
    const force = !!options.force;
    const requestId = (state.positionRequestId || 0) + 1;
    state.positionRequestId = requestId;

    const fen = inputFen || state.game.fen();
    const fenKey = normalizeFenForHash(fen);
    const ply = state.game.history({ verbose: false }).length;

    if (force || state.lastDebugFenKey !== fenKey) {
      state.lastDebugFenKey = fenKey;
      console.log('[OpeningDB] fenKey', fenKey, 'ply', ply);
    }

    updateMoveListFromGame(state.game);
    updateTurnPlyLabel(ply);

    const openingFallback = resolveOpeningByPrefix();
    const exactData = await getContinuationsForFen(fen, { ply, fenKey });
    if (requestId !== state.positionRequestId) return;

    const legal = buildLegalMaps(state.game);
    const candidateRows = normalizeContinuations(exactData.rawCandidates, {
      ply,
      legalBySan: legal.bySan,
      legalByUci: legal.byUci
    });
    const merged = mergeLegalMovesWithStats(state.game, candidateRows);
    state.latestAllLegalRows = merged.allLegal;
    state.latestPopularRows = merged.popular;
    if (state.engine.evalNextMoves) {
      applyEngineEvalCacheToRows(state.latestAllLegalRows, fen);
      applyEngineEvalCacheToRows(state.latestPopularRows, fen);
    } else {
      clearCurrentPositionEngineEvalRows();
    }
    updateCoverageBadge(state.latestPopularRows.length, state.latestAllLegalRows.length);

    const rows = state.moveListMode === 'all' ? state.latestAllLegalRows : state.latestPopularRows;
    state.gameSearchLineKey = buildCurrentLineKey();

    let openingText = 'Opening: (TBD)';
    if (openingFallback.eco || openingFallback.name !== 'Opening: (TBD)') {
      openingText = openingFallback.eco ? `${openingFallback.name} (${openingFallback.eco})` : openingFallback.name;
    }
    els.openingLabel.textContent = openingText;

    renderStatsRows(rows);
    refreshRenderedEngineEvalCells();
    checkTransitionState(state.latestPopularRows, ply);

    if (!state.datasetsLoaded) {
      els.lookupStatus.textContent = state.datasetsError || 'Loading datasets...';
      setMatchBadge(state.dbVersionFallback ? 'fallback' : 'none');
    } else if (exactData.source === 'openingdb_shard_exact') {
      els.lookupStatus.textContent = `Position lookup: match (${exactData.matchLevel || 'exact'})`;
      setMatchBadge(exactData.matchLevel || 'exact');
    } else {
      els.lookupStatus.textContent = 'Position lookup: no exact match (TBD)';
      setMatchBadge(state.dbVersionFallback ? 'fallback' : 'none');
    }

    const lookupMs = performance.now() - lookupStartedAt;
    openingDbDebugState.counters.lookupCount += 1;
    openingDbDebugState.counters.lookupMsTotal += lookupMs;
    bumpMatchLevelCounter(exactData.matchLevel || 'none');
    setOpeningDbDebugLast({
      fenKey,
      ply,
      matchLevel: exactData.matchLevel || 'none',
      source: exactData.source,
      lookupMs: Number(lookupMs.toFixed(2)),
      rowsRendered: rows.length,
      rowsPopular: state.latestPopularRows.length,
      rowsLegal: state.latestAllLegalRows.length
    });

    debugLog('updatePosition complete', {
      fenKey,
      requestId,
      rowsRendered: rows.length,
      rowsPopular: state.latestPopularRows.length,
      rowsLegal: state.latestAllLegalRows.length,
      matchLevel: exactData.matchLevel || 'none',
      source: exactData.source
    });

    scheduleEngineReanalyzeForCurrentPosition();
    if (!state.engine.running) {
      maybeRunNextMoveEvalQueue();
    }
  }

  async function copyEnginePvToClipboard() {
    if (!state.game) return;
    const fen = state.game.fen();
    const evalText = state.engine.lastInfo ? formatEngineScore(state.engine.lastInfo, state.engine.lastInfoFen || state.engine.lastFen || fen) : '-';
    const depthText = state.engine.lastInfo ? String(state.engine.lastInfo.depth || state.engine.depth || '-') : String(state.engine.depth || '-');
    const pvText = state.engine.lastPvSan || (Array.isArray(state.engine.lastPvUci) ? state.engine.lastPvUci.join(' ') : '-') || '-';
    const payload = [
      `Position FEN: ${fen}`,
      `Eval: ${evalText}`,
      `Depth: ${depthText}`,
      `PV: ${pvText}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      setEngineCopyFeedback('Copied!');
    } catch (_err) {
      setEngineCopyFeedback('Copy failed');
    }
  }

  async function copyEngineFenToClipboard() {
    const fen = state.game ? state.game.fen() : '';
    if (!fen) return;
    try {
      await navigator.clipboard.writeText(fen);
      setEngineCopyFeedback('Copied!');
    } catch (_err) {
      setEngineCopyFeedback('Copy failed');
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

  async function loadDatasets() {
    let ecoCodesLoaded = false;
    let manifestReady = false;
    let manifestSource = 'fallback';
    const gamesManifestReady = false;
    const gamesManifestSource = 'deferred';

    try {
      const [ecoCodesRes, manifestResult] = await Promise.allSettled([
        fetch('/data/eco/eco_codes.json', { cache: 'force-cache' }),
        loadOpeningDbManifest()
      ]);

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

      if (manifestResult.status === 'fulfilled') {
        manifestReady = !!manifestResult.value?.ok || !state.dbVersionFallback;
        manifestSource = manifestResult.value?.source || manifestSource;
      } else {
        manifestReady = false;
        manifestSource = 'fallback';
      }

      state.datasetsLoaded = true;
      state.datasetsError = '';

      const missing = [];
      if (!ecoCodesLoaded) missing.push('eco_codes.json');
      if (!manifestReady) missing.push('openingdb/manifest.json');
      if (missing.length > 0) {
        showDatasetBanner(`Fallback dataset active - missing ${missing.join(', ')}`);
      } else {
        showDatasetBanner('');
      }

      debugLog('datasets loaded', {
        ecoCodesLoaded,
        manifestReady,
        manifestSource,
        gamesManifestReady,
        gamesManifestSource,
        shardBase: state.shardBaseUrl || SHARD_BASE,
        activeDbVersion: state.activeDbVersion,
        dbVersionFallback: state.dbVersionFallback,
        gamesBaseRoot: state.gamesBaseRoot,
        gamesVersion: state.gamesVersion
      });
    } catch (error) {
      state.datasetsLoaded = false;
      state.datasetsError = 'Dataset fetch failed. Showing placeholders.';
      showDatasetBanner('Lookup unavailable');
      console.warn('[OpeningDB] dataset load error', error);
      debugLog('datasets loaded', {
        ecoCodesLoaded,
        manifestReady,
        manifestSource,
        gamesManifestReady,
        gamesManifestSource,
        shardBase: state.shardBaseUrl || SHARD_BASE,
        activeDbVersion: state.activeDbVersion,
        dbVersionFallback: state.dbVersionFallback,
        gamesBaseRoot: state.gamesBaseRoot,
        gamesVersion: state.gamesVersion
      });
    }

    updateTurnPlyLabel(state.game ? state.game.history({ verbose: false }).length : 0);
    updateDownloadButtonLabel();
    if (els.downloadGamesBtn) {
      els.downloadGamesBtn.disabled = true;
      els.downloadGamesBtn.textContent = 'Download (coming soon)';
    }
    setGamesStatus('Ready. Click Search Games From This Position.');
    if (!SEARCH_GAMES_ENABLED) {
      if (els.searchGamesBtn) els.searchGamesBtn.disabled = true;
      if (els.downloadGamesBtn) els.downloadGamesBtn.disabled = true;
      if (els.transitionSearchGamesBtn) els.transitionSearchGamesBtn.disabled = true;
    }
    scheduleOpeningDbPrefetch();
    await updatePositionView(state.game ? state.game.fen() : undefined, { force: true });
  }

  function bindEvents() {
    if (els.tabMoves) {
      els.tabMoves.addEventListener('click', () => setActiveTab('moves'));
    }
    if (els.tabGames) {
      els.tabGames.addEventListener('click', () => setActiveTab('games'));
    }
    if (els.movesPopularBtn) {
      els.movesPopularBtn.addEventListener('click', () => setMovesListMode('popular'));
    }
    if (els.movesAllBtn) {
      els.movesAllBtn.addEventListener('click', () => setMovesListMode('all'));
    }

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

    if (els.statsBody) {
      els.statsBody.addEventListener('click', (event) => {
        const rowEl = event.target && event.target.closest ? event.target.closest('tr[data-row-index]') : null;
        if (!rowEl) return;
        const idx = Number(rowEl.getAttribute('data-row-index'));
        if (!Number.isInteger(idx) || idx < 0) return;
        const row = state.currentRows[idx];
        applyMoveFromRow(row);
      });
    }

    if (els.searchGamesBtn) {
      els.searchGamesBtn.addEventListener('click', () => {
        runGamesSearch();
      });
    }

    if (els.openSearchDockBtn) {
      els.openSearchDockBtn.addEventListener('click', () => {
        setActiveTab('games');
      });
    }

    if (els.copyLineKeyBtn) {
      els.copyLineKeyBtn.addEventListener('click', async () => {
        const lineKey = state.gameSearchLineKey || buildCurrentLineKey();
        if (!lineKey) {
          setGamesStatus('No lineKey yet. Play moves first.');
          return;
        }
        try {
          await navigator.clipboard.writeText(lineKey);
          setGamesStatus('lineKey copied.');
        } catch (_err) {
          setGamesStatus(`lineKey: ${lineKey}`);
        }
      });
    }

    if (els.openSearchNewTabBtn) {
      els.openSearchNewTabBtn.addEventListener('click', () => {
        const fen = state.game ? state.game.fen() : '';
        const lineKey = state.gameSearchLineKey || buildCurrentLineKey();
        const url = `/search?fen=${encodeURIComponent(fen)}${lineKey ? `&lineKey=${encodeURIComponent(lineKey)}` : ''}`;
        window.open(url, '_blank', 'noopener');
      });
    }

    if (els.transitionSearchGamesBtn) {
      els.transitionSearchGamesBtn.addEventListener('click', () => {
        setActiveTab('games');
        runGamesSearch();
      });
    }

    if (els.analyzePositionBtn) {
      els.analyzePositionBtn.addEventListener('click', () => {
        startEngineAnalysis();
      });
    }

    if (els.downloadGamesBtn) {
      els.downloadGamesBtn.addEventListener('click', () => {
        triggerGamesZipDownload();
      });
    }

    if (els.startEngineBtn) {
      els.startEngineBtn.addEventListener('click', async () => {
        const fen = state.game ? state.game.fen() : '';
        const moveList = state.game ? formatMoveList(state.game) : '';
        setOpeningDbDebugLast({
          ...(openingDbDebugState.last || {}),
          engineCta: true,
          engineFen: fen,
          engineMoveList: moveList
        });
        await startEngineAnalysis();
      });
    }

    if (els.stopEngineBtn) {
      els.stopEngineBtn.addEventListener('click', () => {
        stopEngineAnalysis();
      });
    }

    if (els.engineCopyPvBtn) {
      els.engineCopyPvBtn.addEventListener('click', () => {
        copyEnginePvToClipboard();
      });
    }

    if (els.engineCopyFenBtn) {
      els.engineCopyFenBtn.addEventListener('click', () => {
        copyEngineFenToClipboard();
      });
    }

    if (els.engineCopyDebugBtn) {
      els.engineCopyDebugBtn.addEventListener('click', async () => {
        const payload = JSON.stringify(window.__engineDebug || {}, null, 2);
        try {
          await navigator.clipboard.writeText(payload);
          setEngineStatus('Engine debug copied');
        } catch (_err) {
          setEngineStatus(`Engine debug: ${payload}`);
        }
      });
    }

    if (els.engineDepth) {
      els.engineDepth.addEventListener('change', () => {
        const d = Number(els.engineDepth.value) || ENGINE_DEFAULT_DEPTH;
        state.engine.depth = d;
        renderEnginePanel();
        if (state.engine.running) startEngineAnalysis({ depth: d, multiPV: state.engine.multiPV });
      });
    }

    if (els.engineMultiPV) {
      els.engineMultiPV.addEventListener('change', () => {
        const m = Number(els.engineMultiPV.value) || 1;
        state.engine.multiPV = m;
        renderEnginePanel();
        if (state.engine.running) startEngineAnalysis({ depth: state.engine.depth, multiPV: m });
      });
    }

    if (els.quickEvalToggle) {
      els.quickEvalToggle.addEventListener('change', () => {
        state.engine.evalNextMoves = !!els.quickEvalToggle.checked;
        persistQuickEvalPreference(state.engine.evalNextMoves);
        if (!state.engine.evalNextMoves) {
          cancelNextMoveEvalQueue();
          state.currentRows.forEach((row) => {
            if (row && row.engineEval === '...') row.engineEval = '-';
          });
          refreshRenderedEngineEvalCells();
        } else {
          maybeRunNextMoveEvalQueue();
        }
        renderEnginePanel();
      });
    }

    if (els.gamesBody) {
      els.gamesBody.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
        if (!target) return;
        const action = target.getAttribute('data-action');
        const idx = Number(target.getAttribute('data-game-index'));
        if (action === 'view') {
          event.preventDefault();
          viewGamePgn(idx);
        }
      });
    }

    if (els.gamesPgnCloseBtn) {
      els.gamesPgnCloseBtn.addEventListener('click', () => {
        if (els.gamesPgnViewer) els.gamesPgnViewer.hidden = true;
      });
    }

    if (els.gamesPgnCopyBtn) {
      els.gamesPgnCopyBtn.addEventListener('click', async () => {
        if (!els.gamesPgnText || !els.gamesPgnText.value) return;
        try {
          await navigator.clipboard.writeText(els.gamesPgnText.value);
          setGamesStatus('PGN copied to clipboard.');
        } catch (_err) {
          setGamesStatus('Clipboard copy failed.');
        }
      });
    }

    window.addEventListener('resize', () => {
      if (state.board && typeof state.board.resize === 'function') {
        state.board.resize();
      }
    });

    window.addEventListener('beforeunload', () => {
      clearEngineDebounce();
      if (state.engine.client) state.engine.client.terminate();
      if (state.engine.evalClient) state.engine.evalClient.terminate();
    });

    setMovesListMode(state.moveListMode);
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
      state.gamesTier = getTierFromUrl();
      hydratePgnViewCounter();
      if (els.engineDepth) {
        const d = Number(els.engineDepth.value) || ENGINE_DEFAULT_DEPTH;
        state.engine.depth = d;
      }
      if (els.engineMultiPV) {
        const m = Number(els.engineMultiPV.value) || 1;
        state.engine.multiPV = m;
      }
      state.engine.evalNextMoves = loadQuickEvalPreference();
      if (els.quickEvalToggle) {
        els.quickEvalToggle.checked = state.engine.evalNextMoves;
      }
      state.engine.debug.workerUrl = new URL('/engine/stockfish.worker.js', window.location.origin).toString();
      state.engine.debug.handshakeState = 'idle';
      state.engine.debug.lastLine = '';
      state.engine.debug.lastInfoAt = 0;
      state.engine.debug.errors = [];
      renderEnginePanel();
      initBoard();
      bindEvents();
      setActiveTab('moves');
      updateDownloadButtonLabel();
      setGamesStatus('Ready to search.');
      renderGamesSummary([], 0);
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


