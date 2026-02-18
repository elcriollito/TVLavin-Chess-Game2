(function () {
  const state = {
    game: null,
    board: null,
    boardFlipped: false,
    ecoCodeDefs: [],
    openingDbShardCache: new Map(),
    shardBaseUrl: '',
    activeDbVersion: 'v1',
    dbVersionFallback: true,
    datasetsLoaded: false,
    datasetsError: '',
    positionRequestId: 0,
    lastDebugFenKey: '',
    currentRows: [],
    activeTab: 'moves',
    gamesTier: 'free',
    gamesVersion: 'v1',
    gamesBaseRoot: 'https://downloads.caissa-chess.org/openingdb/games',
    gamesManifestFallback: true,
    gamesShardCache: new Map(),
    gamesCatalogCache: new Map(),
    gamesResults: [],
    pgnViewsUsed: 0
  };

  const DEFAULT_SHARD_ROOT = 'https://downloads.caissa-chess.org/openingdb/shards';
  const DEFAULT_ACTIVE_VERSION = 'v1';
  const MANIFEST_URL = 'https://downloads.caissa-chess.org/openingdb/manifest.json';
  const LOCAL_MANIFEST_URL = '/openingdb/manifest.json';
  const MANIFEST_TTL_MS = 5 * 60 * 1000;
  const SHARD_PREFETCH_DELAY_MS = 200;
  const SHARD_BASE = (() => {
    const configured = String(window.CAISSA_OPENINGDB_BASE || '').trim();
    if (configured) return configured;
    return `${DEFAULT_SHARD_ROOT}/${DEFAULT_ACTIVE_VERSION}`;
  })();
  const MANIFEST_OVERRIDE_URL = String(window.CAISSA_OPENINGDB_MANIFEST_URL || '').trim();
  const SHARD_FETCH_TIMEOUT_MS = 4000;
  const MANIFEST_FETCH_TIMEOUT_MS = 2000;
  const GAMES_MANIFEST_URL = 'https://downloads.caissa-chess.org/openingdb/games/manifest.json';
  const LOCAL_GAMES_MANIFEST_URL = '/openingdb/games/manifest.json';
  const GAMES_MANIFEST_TTL_MS = 5 * 60 * 1000;
  const GAMES_FETCH_TIMEOUT_MS = 4000;
  const FREE_GAME_PREVIEW_LIMIT = 20;
  const PREMIUM_GAME_PREVIEW_LIMIT = 500;
  const FREE_PGN_VIEW_LIMIT = 5;
  const FREE_DOWNLOAD_LINK_LIMIT = 10;
  const PREMIUM_DOWNLOAD_LINK_LIMIT = 200;
  const EARLY_MIDDLEGAME_PLY = 10;
  const EARLY_MIDDLEGAME_MIN_MOVES = 3;
  const EARLY_MIDDLEGAME_MIN_GAMES = 20;

  const els = {
    board: document.getElementById('openingDbBoard'),
    moveList: document.getElementById('odbMoveList'),
    turnPly: document.getElementById('odbTurnPly'),
    openingLabel: document.getElementById('odbOpeningLabel'),
    lookupStatus: document.getElementById('odbLookupStatus'),
    datasetBanner: document.getElementById('odbDatasetBanner'),
    statsBody: document.getElementById('odbStatsBody'),
    tabMoves: document.getElementById('odbTabMoves'),
    tabGames: document.getElementById('odbTabGames'),
    movesPanel: document.getElementById('odbMovesPanel'),
    gamesPanel: document.getElementById('odbGamesPanel'),
    transitionPanel: document.getElementById('odbTransitionPanel'),
    transitionMessage: document.getElementById('odbTransitionMessage'),
    transitionStats: document.getElementById('odbTransitionStats'),
    transitionSearchGamesBtn: document.getElementById('odbTransitionSearchGamesBtn'),
    analyzePositionBtn: document.getElementById('odbAnalyzePositionBtn'),
    searchGamesBtn: document.getElementById('odbSearchGamesBtn'),
    downloadGamesBtn: document.getElementById('odbDownloadGamesBtn'),
    gamesYearMin: document.getElementById('odbGamesYearMin'),
    gamesYearMax: document.getElementById('odbGamesYearMax'),
    gamesEloMin: document.getElementById('odbGamesEloMin'),
    gamesResult: document.getElementById('odbGamesResult'),
    gamesStatus: document.getElementById('odbGamesStatus'),
    gamesBody: document.getElementById('odbGamesBody'),
    gamesDownloads: document.getElementById('odbGamesDownloads'),
    gamesPgnViewer: document.getElementById('odbGamesPgnViewer'),
    gamesPgnTitle: document.getElementById('odbGamesPgnTitle'),
    gamesPgnText: document.getElementById('odbGamesPgnText'),
    gamesPgnCopyBtn: document.getElementById('odbGamesPgnCopyBtn'),
    gamesPgnCloseBtn: document.getElementById('odbGamesPgnCloseBtn'),
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

  function getShardSessionCacheKey(shard) {
    return `caissa.openingdb.shard.${shard}`;
  }

  function getManifestSessionCacheKey() {
    return 'openingdb_manifest_cache';
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
    const baseRoot = String(m.baseUrl || DEFAULT_SHARD_ROOT).trim() || DEFAULT_SHARD_ROOT;
    const normalizedBase = baseRoot.replace(/\/+$/, '');
    const alreadyVersioned = normalizedBase.toLowerCase().endsWith(`/${activeVersion.toLowerCase()}`);
    state.activeDbVersion = activeVersion;
    state.dbVersionFallback = !!fallback;
    state.shardBaseUrl = alreadyVersioned ? normalizedBase : `${normalizedBase}/${activeVersion}`;
  }

  async function loadOpeningDbManifest() {
    const cached = readManifestFromSession();
    if (cached) {
      applyManifest(cached, false);
      return { source: 'session-cache', ok: true };
    }

    const localManifest = await fetchJsonWithTimeout(LOCAL_MANIFEST_URL, MANIFEST_FETCH_TIMEOUT_MS);
    if (localManifest && typeof localManifest === 'object') {
      writeManifestToSession(localManifest);
      applyManifest(localManifest, false);
      return { source: 'local-site-manifest', ok: true };
    }

    const remoteManifestUrl = MANIFEST_OVERRIDE_URL || MANIFEST_URL;
    const remoteManifest = await fetchJsonWithTimeout(remoteManifestUrl, MANIFEST_FETCH_TIMEOUT_MS);
    if (remoteManifest && typeof remoteManifest === 'object') {
      writeManifestToSession(remoteManifest);
      applyManifest(remoteManifest, false);
      return { source: 'remote', ok: true };
    }

    const localDataManifest = await fetchJsonWithTimeout('/data/openingdb/manifest.json', MANIFEST_FETCH_TIMEOUT_MS);
    if (localDataManifest && typeof localDataManifest === 'object') {
      applyManifest(localDataManifest, false);
      return { source: 'local-manifest', ok: true };
    }

    applyManifest({
      activeVersion: DEFAULT_ACTIVE_VERSION,
      baseUrl: DEFAULT_SHARD_ROOT
    }, true);
    return { source: 'fallback', ok: false };
  }

  async function loadOpeningDbGamesManifest() {
    const cached = readGamesManifestFromSession();
    if (cached && typeof cached === 'object') {
      state.gamesVersion = String(cached.activeVersion || 'v1');
      state.gamesBaseRoot = String(cached.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      return { source: 'session-cache', ok: true };
    }

    const localSiteManifest = await fetchJsonWithTimeout(LOCAL_GAMES_MANIFEST_URL, MANIFEST_FETCH_TIMEOUT_MS);
    if (localSiteManifest && typeof localSiteManifest === 'object') {
      const status = String(localSiteManifest.status || '').toLowerCase();
      if (status === 'pending') {
        state.gamesVersion = String(localSiteManifest.activeVersion || state.gamesVersion || 'v1');
        state.gamesBaseRoot = String(localSiteManifest.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
        state.gamesManifestFallback = true;
        return { source: 'local-site-pending', ok: true };
      }
      writeGamesManifestToSession(localSiteManifest);
      state.gamesVersion = String(localSiteManifest.activeVersion || 'v1');
      state.gamesBaseRoot = String(localSiteManifest.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      return { source: 'local-site-manifest', ok: true };
    }

    const remote = await fetchJsonWithTimeout(GAMES_MANIFEST_URL, MANIFEST_FETCH_TIMEOUT_MS);
    if (remote && typeof remote === 'object') {
      writeGamesManifestToSession(remote);
      state.gamesVersion = String(remote.activeVersion || 'v1');
      state.gamesBaseRoot = String(remote.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      return { source: 'remote', ok: true };
    }

    const local = await fetchJsonWithTimeout('/data/openingdb_games/manifest.json', MANIFEST_FETCH_TIMEOUT_MS);
    if (local && typeof local === 'object') {
      state.gamesVersion = String(local.activeVersion || 'v1');
      state.gamesBaseRoot = String(local.baseUrl || state.gamesBaseRoot).replace(/\/+$/, '');
      state.gamesManifestFallback = false;
      return { source: 'local-manifest', ok: true };
    }

    state.gamesVersion = 'v1';
    state.gamesBaseRoot = 'https://downloads.caissa-chess.org/openingdb/games';
    state.gamesManifestFallback = true;
    return { source: 'fallback', ok: false };
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
      return state.openingDbShardCache.get(shard);
    }

    const fromSession = readShardFromSession(shard);
    if (fromSession && typeof fromSession === 'object') {
      state.openingDbShardCache.set(shard, fromSession);
      return fromSession;
    }

    try {
      const activeBase = state.shardBaseUrl || SHARD_BASE;
      const localVersionedUrl = `/data/openingdb/shards/${state.activeDbVersion}/${shard}.json`;
      let json = await fetchJsonWithTimeout(localVersionedUrl, SHARD_FETCH_TIMEOUT_MS);
      let source = 'local-versioned';

      if (!json || typeof json !== 'object') {
        const remoteUrl = `${activeBase}/${shard}.json`;
        source = 'remote';
        json = await fetchJsonWithTimeout(remoteUrl, SHARD_FETCH_TIMEOUT_MS);
      }

      if (!json || typeof json !== 'object') {
        source = 'local-legacy';
        json = await fetchJsonWithTimeout(`/data/openingdb/shards/${shard}.json`, SHARD_FETCH_TIMEOUT_MS);
      }

      if (!json || typeof json !== 'object') {
        source = 'sample-fallback';
        json = await fetchJsonWithTimeout(`/data/openingdb/shards_sample/${shard}.json`, SHARD_FETCH_TIMEOUT_MS);
      }

      const payload = json && typeof json === 'object' ? json : null;
      state.openingDbShardCache.set(shard, payload);
      if (payload) writeShardToSession(shard, payload);
      debugLog('shard loaded', { shard, source, base: activeBase });
      return payload;
    } catch (_err) {
      state.openingDbShardCache.set(shard, null);
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
          <td>${Number.isFinite(Number(row.elo)) ? Math.round(Number(row.elo)) : 'TBD'}</td>
          <td>${row.perf || 'TBD'}</td>
          <td>${year}</td>
        </tr>
      `;
    }).join('');
  }

  function setGamesStatus(message) {
    if (!els.gamesStatus) return;
    const tierNote = `Tier: ${state.gamesTier.toUpperCase()} | ${getGamesVersionLabel()}`;
    els.gamesStatus.textContent = `${message} | ${tierNote}`;
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
      const event = row.event || row.site || '-';
      const year = row.year || '-';
      const whiteElo = row.whiteElo ? String(row.whiteElo) : '?';
      const blackElo = row.blackElo ? String(row.blackElo) : '?';
      return `
        <tr data-game-index="${idx}">
          <td>${white}</td>
          <td>${black}</td>
          <td>${result}</td>
          <td>${event}</td>
          <td>${year}</td>
          <td>${whiteElo}/${blackElo}</td>
          <td>
            <button class="btn btn-secondary odb-game-view-btn" data-action="view" data-game-index="${idx}" type="button">View PGN</button>
            <a class="btn btn-secondary odb-game-download-link" data-action="download" data-game-index="${idx}" href="${row.pgnUrl}" download="${row.gameId}.pgn">Download</a>
          </td>
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
    if (!state.game) return;
    const fenHash = hashFen(state.game.fen());
    const limit = getCurrentDownloadLimit();
    const body = {
      fenHash,
      limit,
      filters: {
        yearMin: Number.parseInt(String(els.gamesYearMin?.value || ''), 10) || null,
        yearMax: Number.parseInt(String(els.gamesYearMax?.value || ''), 10) || null,
        eloMin: Number.parseInt(String(els.gamesEloMin?.value || ''), 10) || null,
        result: normalizeResultFilterForApi(els.gamesResult?.value || 'all')
      }
    };

    const tierQuery = state.gamesTier === 'premium' ? '?tier=premium' : '';
    const url = `${state.gamesBaseRoot}/${state.gamesVersion}/download.zip${tierQuery}`;
    const originalLabel = els.downloadGamesBtn ? els.downloadGamesBtn.textContent : '';

    if (els.downloadGamesBtn) {
      els.downloadGamesBtn.disabled = true;
      els.downloadGamesBtn.textContent = 'Preparing ZIP...';
    }
    setGamesStatus(`Preparing ZIP for ${fenHash}...`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-caissa-tier': state.gamesTier
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        let detail = '';
        try {
          const errJson = await res.json();
          detail = errJson?.error || '';
        } catch (_err) {
          detail = '';
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const fallbackName = `caissa-games_${fenHash.slice(0, 8)}.zip`;
      const filename = parseFilenameFromContentDisposition(res.headers.get('content-disposition'), fallbackName);
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);

      const truncated = String(res.headers.get('x-caissa-truncated') || '').toLowerCase() === 'true';
      if (truncated) {
        setGamesStatus(`ZIP downloaded (${filename}) - truncated by size cap, see index.txt.`);
      } else {
        setGamesStatus(`ZIP downloaded (${filename}).`);
      }
    } catch (error) {
      console.warn('[OpeningDB] ZIP download failed', error);
      setGamesStatus(`ZIP download failed: ${error?.message || 'unknown error'}`);
    } finally {
      if (els.downloadGamesBtn) {
        els.downloadGamesBtn.disabled = false;
        els.downloadGamesBtn.textContent = originalLabel || `Download top ${limit} (ZIP)`;
      }
      updateDownloadButtonLabel();
    }
  }

  async function runGamesSearch() {
    if (!state.game) return;
    const fenHash = hashFen(state.game.fen());
    const shard = fenHash.slice(0, 2);
    setGamesStatus(`Searching... fenHash=${fenHash}`);

    const shardData = await loadGamesShard(shard);
    const allGameIds = shardData && Array.isArray(shardData[fenHash]) ? shardData[fenHash] : [];
    if (!allGameIds.length) {
      state.gamesResults = [];
      renderGamesRows([]);
      if (els.gamesDownloads) els.gamesDownloads.innerHTML = '';
      setGamesStatus('No indexed games for this position.');
      return;
    }

    const previewCap = getCurrentPreviewLimit();
    const gameIds = allGameIds.slice(0, previewCap);
    const prefixes = Array.from(new Set(gameIds.map((id) => String(id || '').slice(2, 4).toLowerCase()).filter((p) => /^[0-9a-f]{2}$/.test(p))));

    const catalogs = await Promise.all(prefixes.map((prefix) => loadGamesCatalogPrefix(prefix)));
    const mergedCatalog = {};
    catalogs.forEach((cat) => {
      if (cat && typeof cat === 'object') {
        Object.assign(mergedCatalog, cat);
      }
    });

    const rows = gameIds.map((gameId) => {
      const meta = mergedCatalog[gameId] || {};
      return {
        gameId,
        white: meta.white || 'Unknown',
        black: meta.black || 'Unknown',
        result: meta.result || '?',
        event: meta.event || '',
        site: meta.site || '',
        year: meta.year || null,
        whiteElo: meta.whiteElo || null,
        blackElo: meta.blackElo || null,
        pgnKey: meta.pgnKey || '',
        pgnUrl: meta.pgnKey
          ? `${state.gamesBaseRoot}/${meta.pgnKey.replace(/^openingdb\/games\/[^/]+\//, `${state.gamesVersion}/`)}`
          : buildPgnUrl(gameId)
      };
    }).filter(passesGamesFilters);

    state.gamesResults = rows;
    renderGamesRows(rows);
    if (els.gamesDownloads) {
      const shown = Math.min(rows.length, getCurrentDownloadLimit());
      els.gamesDownloads.innerHTML = `<div class="openingdb-games-status">ZIP ready: up to ${shown} games with current tier/filters.</div>`;
    }

    const hidden = allGameIds.length > gameIds.length ? ` (showing ${gameIds.length}/${allGameIds.length})` : '';
    setGamesStatus(`Found ${rows.length} games${hidden}`);
  }

  async function viewGamePgn(gameIndex) {
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

  async function getContinuationsForFen(fenHash) {
    const shard = String(fenHash || '').slice(0, 2).toLowerCase();
    const shardData = await loadOpeningDbShard(shard);
    const entry = shardData && typeof shardData === 'object' ? shardData[fenHash] : null;
    if (entry) {
      return {
        source: 'openingdb_shard_exact',
        entry,
        rawCandidates: extractRawCandidates(entry)
      };
    }

    return {
      source: 'none',
      entry: null,
      rawCandidates: []
    };
  }

  async function updatePositionView(inputFen) {
    const requestId = (state.positionRequestId || 0) + 1;
    state.positionRequestId = requestId;

    const fen = inputFen || state.game.fen();
    const fenKey = normalizeFenForHash(fen);
    const fenHash = hashFen(fen);
    const ply = state.game.history({ verbose: false }).length;

    if (state.lastDebugFenKey !== fenKey) {
      state.lastDebugFenKey = fenKey;
      console.log('[OpeningDB] fenKey', fenKey, 'ply', ply);
    }

    updateMoveListFromGame(state.game);
    updateTurnPlyLabel(ply);

    const openingFallback = resolveOpeningByPrefix();
    const exactData = await getContinuationsForFen(fenHash);
    if (requestId !== state.positionRequestId) return;

    const legal = buildLegalMaps(state.game);
    const rows = normalizeContinuations(exactData.rawCandidates, {
      ply,
      legalBySan: legal.bySan,
      legalByUci: legal.byUci
    }).slice(0, ply === 0 ? 60 : 40);

    let openingText = 'Opening: (TBD)';
    if (openingFallback.eco || openingFallback.name !== 'Opening: (TBD)') {
      openingText = openingFallback.eco ? `${openingFallback.name} (${openingFallback.eco})` : openingFallback.name;
    }
    els.openingLabel.textContent = openingText;

    renderStatsRows(rows);
    checkTransitionState(rows, ply);

    if (!state.datasetsLoaded) {
      els.lookupStatus.textContent = state.datasetsError || 'Loading datasets...';
    } else if (exactData.source === 'openingdb_shard_exact') {
      els.lookupStatus.textContent = `Position lookup: exact match (${exactData.source})`;
    } else {
      els.lookupStatus.textContent = 'Position lookup: no exact match (TBD)';
    }

    debugLog('updatePosition complete', { fenKey, fenHash, requestId, rows: rows.length, source: exactData.source });
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
    let gamesManifestReady = false;
    let gamesManifestSource = 'fallback';

    try {
      const [ecoCodesRes, manifestResult, gamesManifestResult] = await Promise.allSettled([
        fetch('/data/eco/eco_codes.json', { cache: 'force-cache' }),
        loadOpeningDbManifest(),
        loadOpeningDbGamesManifest()
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

      if (gamesManifestResult.status === 'fulfilled') {
        gamesManifestReady = !!gamesManifestResult.value?.ok || !state.gamesManifestFallback;
        gamesManifestSource = gamesManifestResult.value?.source || gamesManifestSource;
      } else {
        gamesManifestReady = false;
        gamesManifestSource = 'fallback';
      }

      state.datasetsLoaded = true;
      state.datasetsError = '';

      const missing = [];
      if (!ecoCodesLoaded) missing.push('eco_codes.json');
      if (!manifestReady) missing.push('openingdb/manifest.json');
      const gamesPending = gamesManifestSource === 'local-site-pending';
      if (missing.length > 0) {
        showDatasetBanner(`Lookup partially unavailable: missing ${missing.join(', ')}`);
      } else {
        showDatasetBanner(gamesPending ? 'Search Games: coming soon.' : '');
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
    setGamesStatus('Ready to search.');
    scheduleOpeningDbPrefetch();
    updatePositionView();
  }

  function bindEvents() {
    if (els.tabMoves) {
      els.tabMoves.addEventListener('click', () => setActiveTab('moves'));
    }
    if (els.tabGames) {
      els.tabGames.addEventListener('click', () => setActiveTab('games'));
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

    els.statsBody.addEventListener('click', (event) => {
      const rowEl = event.target && event.target.closest ? event.target.closest('tr[data-row-index]') : null;
      if (!rowEl) return;
      const idx = Number(rowEl.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0) return;
      const row = state.currentRows[idx];
      applyMoveFromRow(row);
    });

    if (els.searchGamesBtn) {
      els.searchGamesBtn.addEventListener('click', () => {
        runGamesSearch();
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
        setGamesStatus('Analyze Position will be enabled in a later phase.');
      });
    }

    if (els.downloadGamesBtn) {
      els.downloadGamesBtn.addEventListener('click', () => {
        triggerGamesZipDownload();
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
      initBoard();
      bindEvents();
      setActiveTab('moves');
      updateDownloadButtonLabel();
      setGamesStatus('Ready to search.');
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
