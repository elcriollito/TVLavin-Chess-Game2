(function () {
  const WORKER_PATH = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js';
  const WASM_PATH = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm';
  const DISPLAY_NAME = 'Stockfish 19 Lite';
  const UCI_NAME_PATTERN = '^Stockfish\\s+19(?:\\.\\d+){0,2}\\s+Lite\\s+WASM(?:\\s.*)?$';
  const UCI_AUTHOR_PATTERN = '^the Stockfish developers \\(see AUTHORS file\\)(?:\\s.*)?$';
  const workerLifecycle = { created: 0, terminated: 0, active: 0, peakActive: 0 };

  function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
  }

  function parseWhiteWdl(rawLine, fen) {
    const match = String(rawLine || '').match(/\bwdl\s+(\d+)\s+(\d+)\s+(\d+)/i);
    if (!match) return null;
    const sideToMove = String(fen || '').split(/\s+/)[1] || 'w';
    const wins = Number(match[1]);
    const draws = Number(match[2]);
    const losses = Number(match[3]);
    return Object.freeze(sideToMove === 'b'
      ? { wins: losses, draws, losses: wins }
      : { wins, draws, losses });
  }

  function parseWhiteBound(rawLine, fen) {
    const raw = String(rawLine || '');
    let bound = /\blowerbound\b/i.test(raw) ? 'lower' : (/\bupperbound\b/i.test(raw) ? 'upper' : null);
    if (bound && (String(fen || '').split(/\s+/)[1] || 'w') === 'b') {
      bound = bound === 'lower' ? 'upper' : 'lower';
    }
    return bound;
  }

  function normalizeInfo(info, fen, requestId) {
    const hasMate = Number.isFinite(info?.mate);
    const hasScore = Number.isFinite(info?.score);
    return Object.freeze({
      rawLine: String(info?.rawLine || ''),
      depth: Number(info?.depth) || 0,
      seldepth: Number(info?.seldepth) || 0,
      nodes: Number(info?.nodes) || 0,
      nps: Number(info?.nps) || 0,
      time: Number(info?.time) || 0,
      multipv: Number(info?.multipv) || 1,
      pv: Object.freeze(Array.isArray(info?.pv) ? info.pv.map(move => String(move).toLowerCase()) : []),
      scoreType: hasMate ? 'mate' : (hasScore ? 'cp' : null),
      score: hasMate ? Number(info.mate) : (hasScore ? Math.round(Number(info.score) * 100) : null),
      whiteScorePawns: hasScore ? Number(info.score) : null,
      whiteMate: hasMate ? Number(info.mate) : null,
      scorePerspective: 'white',
      scoreBound: parseWhiteBound(info?.rawLine, fen),
      whiteWdl: parseWhiteWdl(info?.rawLine, fen),
      fen: String(fen || ''),
      requestId: String(requestId || '')
    });
  }

  class OpeningTrainerStockfishClient {
    constructor(options = {}) {
      this.workerPath = String(options.workerPath || WORKER_PATH);
      this.adapter = null;
      this.ready = false;
      this.initPromise = null;
      this.positionFen = '';
      this.multiPV = 1;
      this.requestGeneration = 0;
      this.activeRequestId = '';
      this.searchActivityTimer = null;
      this.searchStallTimer = null;
      this.ownsWorker = false;
      this.supportedOptions = new Map();
      this.onInfoHandler = null;
      this.onBestMoveHandler = null;
      this.onLineHandler = null;
      this.onErrorHandler = null;
      this.onStateHandler = null;
      this.handshakeTimeoutMs = boundedInteger(options.handshakeTimeoutMs, 8000, 1000, 15000);
      this.searchTimeoutMs = boundedInteger(options.searchTimeoutMs, 30000, 5000, 30000);
      this.debug = {
        workerUrl: WORKER_PATH,
        wasmUrl: WASM_PATH,
        displayName: DISPLAY_NAME,
        state: 'idle',
        handshakeState: 'idle',
        engineId: '',
        engineAuthor: '',
        lastLine: '',
        lastInfoAt: 0,
        errors: [],
        lastUciOkAt: 0,
        lastReadyOkAt: 0,
        activeFen: '',
        activeRequestId: '',
        searchMode: '',
        configuredOptions: [],
        targetDepth: 0,
        activityLimitMs: 0,
        lastStopReason: ''
      };
    }

    claimWorker() {
      if (this.ownsWorker) return;
      this.ownsWorker = true;
      workerLifecycle.created += 1;
      workerLifecycle.active += 1;
      workerLifecycle.peakActive = Math.max(workerLifecycle.peakActive, workerLifecycle.active);
    }

    releaseWorker() {
      if (!this.ownsWorker) return;
      this.ownsWorker = false;
      workerLifecycle.active = Math.max(0, workerLifecycle.active - 1);
      workerLifecycle.terminated += 1;
    }

    clearSearchTimers() {
      clearTimeout(this.searchActivityTimer);
      clearTimeout(this.searchStallTimer);
      this.searchActivityTimer = null;
      this.searchStallTimer = null;
    }

    supportsOption(name) {
      return this.supportedOptions.has(String(name || '').toLowerCase());
    }

    configureSupportedOptions() {
      if (!this.adapter) return;
      const requested = [
        ['Hash', 16],
        ['Threads', 1],
        ['UCI_ShowWDL', true],
        ['UCI_AnalyseMode', true],
        ['Ponder', false]
      ];
      this.adapter.defaultOptions = Object.fromEntries(requested
        .filter(([name]) => this.supportsOption(name))
        .map(([name, value]) => [this.supportedOptions.get(name.toLowerCase()), value]));
      this.debug.configuredOptions = Object.freeze(Object.keys(this.adapter.defaultOptions));
    }

    setState(next) {
      this.debug.state = String(next || '');
      this.onStateHandler?.(this.getDebugSnapshot());
    }

    setHandshakeState(next) {
      this.debug.handshakeState = String(next || '');
      this.onStateHandler?.(this.getDebugSnapshot());
    }

    addError(error) {
      const value = error instanceof Error ? error : new Error(String(error || 'Unknown engine error'));
      this.debug.errors.push({ at: Date.now(), message: value.message, code: value.code || '' });
      if (this.debug.errors.length > 20) this.debug.errors.shift();
      this.onErrorHandler?.(value);
      this.onStateHandler?.(this.getDebugSnapshot());
    }

    getDebugSnapshot() {
      return Object.freeze({
        ...this.debug,
        supportedOptions: Object.freeze([...this.supportedOptions.values()]),
        analyzing: this.adapter?.isAnalyzing?.() === true,
        runtime: this.adapter?.getRuntimeIdentity?.() || null,
        attribution: this.adapter?.inspectAttribution?.() || null,
        workerLifecycle: Object.freeze({ ...workerLifecycle }),
        errors: Object.freeze(this.debug.errors.map(item => Object.freeze({ ...item })))
      });
    }

    getIdentity() {
      return Object.freeze({
        displayName: DISPLAY_NAME,
        uciName: this.debug.engineId,
        author: this.debug.engineAuthor,
        workerPath: WORKER_PATH,
        wasmPath: WASM_PATH,
        ready: this.ready
      });
    }

    onInfo(callback) { this.onInfoHandler = typeof callback === 'function' ? callback : null; }
    onBestMove(callback) { this.onBestMoveHandler = typeof callback === 'function' ? callback : null; }
    onLine(callback) { this.onLineHandler = typeof callback === 'function' ? callback : null; }
    onError(callback) { this.onErrorHandler = typeof callback === 'function' ? callback : null; }
    onState(callback) { this.onStateHandler = typeof callback === 'function' ? callback : null; }

    handleLine(line) {
      const value = String(line || '');
      if (!value) return;
      this.debug.lastLine = value;
      if (value.startsWith('id name ')) this.debug.engineId = value.slice('id name '.length).trim();
      if (value.startsWith('id author ')) this.debug.engineAuthor = value.slice('id author '.length).trim();
      const option = value.match(/^option name (.+?) type\s/i);
      if (option) this.supportedOptions.set(option[1].toLowerCase(), option[1]);
      if (/^uciok$/i.test(value.trim())) {
        this.debug.lastUciOkAt = Date.now();
        this.configureSupportedOptions();
        this.setHandshakeState('uciok');
      }
      if (/^readyok$/i.test(value.trim())) {
        this.debug.lastReadyOkAt = Date.now();
        this.setHandshakeState('readyok');
      }
      this.onLineHandler?.(value);
    }

    validateWorkerPath() {
      const requested = new URL(this.workerPath, window.location.origin);
      if (requested.origin !== window.location.origin || requested.pathname !== WORKER_PATH || requested.search || requested.hash) {
        const error = new Error('Opening Trainer only permits the local Stockfish 19 Lite worker.');
        error.code = 'ENGINE_WORKER_NOT_APPROVED';
        throw error;
      }
    }

    async init() {
      if (this.ready) return true;
      if (this.initPromise) return this.initPromise;
      this.initPromise = (async () => {
        try {
          this.validateWorkerPath();
          if (typeof WebAssembly !== 'object') {
            const error = new Error('WebAssembly is unavailable in this browser.');
            error.code = 'ENGINE_WASM_UNAVAILABLE';
            throw error;
          }
          if (typeof window.EngineAdapter !== 'function') {
            const error = new Error('The CAISSA engine adapter is unavailable.');
            error.code = 'ENGINE_ADAPTER_UNAVAILABLE';
            throw error;
          }

          this.setState('loading');
          this.setHandshakeState('uci');
          const candidate = new window.EngineAdapter({
            id: 'opening-trainer-stockfish-19',
            providerId: 'stockfish-19-lite',
            requestedEngineId: 'opening-trainer-stockfish-19',
            name: DISPLAY_NAME,
            owner: 'opening-trainer',
            workerPath: WORKER_PATH,
            wasmPath: WASM_PATH,
            defaultDepth: 20,
            defaultOptions: {},
            runtimeIdentityExpectation: {
              family: 'Stockfish',
              namePattern: UCI_NAME_PATTERN,
              authorPattern: UCI_AUTHOR_PATTERN,
              requireName: true,
              requireAuthor: true
            },
            requireRuntimeIdentity: true,
            handshakeTimeoutMs: this.handshakeTimeoutMs,
            searchTimeoutMs: this.searchTimeoutMs,
            autoStart: false
          });
          this.adapter = candidate;
          candidate.onLine = line => {
            if (this.adapter === candidate) this.handleLine(line);
          };
          candidate.onError = error => {
            if (this.adapter !== candidate) return;
            if (error && !error.code) error.code = 'ENGINE_RUNTIME_ERROR';
            this.clearSearchTimers();
            this.requestGeneration += 1;
            this.activeRequestId = '';
            this.debug.activeRequestId = '';
            this.ready = false;
            this.releaseWorker();
            this.setState('error');
            this.addError(error);
          };
          this.claimWorker();
          await candidate.start();
          if (this.adapter !== candidate) {
            candidate.terminate('opening-trainer-superseded');
            return false;
          }
          const identity = candidate.getUciIdentity();
          this.debug.engineId = identity.name || this.debug.engineId;
          this.debug.engineAuthor = identity.author || this.debug.engineAuthor;
          this.ready = true;
          this.setHandshakeState('readyok');
          this.setState('ready');
          candidate.setMultiPV(this.multiPV);
          return true;
        } catch (error) {
          this.ready = false;
          this.clearSearchTimers();
          this.releaseWorker();
          this.setState('error');
          this.addError(error);
          this.adapter?.terminate('opening-trainer-init-failed');
          this.adapter = null;
          this.initPromise = null;
          throw error;
        }
      })();
      return this.initPromise;
    }

    setOptions({ multiPV } = {}) {
      this.multiPV = boundedInteger(multiPV, this.multiPV, 1, 3);
      this.adapter?.setMultiPV(this.multiPV);
    }

    setPositionFEN(fen) {
      this.positionFen = String(fen || '').trim();
    }

    armStallRecovery(localGeneration, stallTimeoutMs) {
      clearTimeout(this.searchStallTimer);
      if (!stallTimeoutMs) return;
      this.searchStallTimer = setTimeout(() => {
        if (!this.ready || localGeneration !== this.requestGeneration) return;
        const error = new Error('Stockfish analysis stopped responding.');
        error.code = 'ENGINE_ANALYSIS_STALLED';
        this.clearSearchTimers();
        this.requestGeneration += 1;
        this.activeRequestId = '';
        this.debug.activeRequestId = '';
        this.ready = false;
        const candidate = this.adapter;
        this.adapter = null;
        candidate?.terminate('opening-trainer-analysis-stalled');
        this.releaseWorker();
        this.setState('error');
        this.addError(error);
      }, stallTimeoutMs);
    }

    startInfiniteAnalysis({ targetDepth = 20, stopAtTarget = false, maxActivityMs = 0, stallTimeoutMs = 120000 } = {}) {
      if (!this.ready || !this.adapter || !this.positionFen) return null;
      const boundedDepth = boundedInteger(targetDepth, 20, 1, 30);
      const boundedActivityMs = maxActivityMs > 0 ? boundedInteger(maxActivityMs, 30000, 1000, 120000) : 0;
      const boundedStallMs = stallTimeoutMs > 0 ? boundedInteger(stallTimeoutMs, 120000, 1000, 300000) : 0;
      const fen = this.positionFen;
      const localGeneration = ++this.requestGeneration;
      this.activeRequestId = `opening-trainer:${localGeneration}`;
      this.debug.activeFen = fen;
      this.debug.activeRequestId = this.activeRequestId;
      this.debug.searchMode = 'infinite-attributed';
      this.debug.targetDepth = boundedDepth;
      this.debug.activityLimitMs = boundedActivityMs;
      this.debug.lastStopReason = '';
      this.clearSearchTimers();
      const adapterRequestId = this.adapter.startInfiniteAnalysisAttributed(fen, (info, attributedRequestId) => {
        if (!this.ready || localGeneration !== this.requestGeneration || fen !== this.positionFen) return;
        this.debug.lastInfoAt = Date.now();
        this.armStallRecovery(localGeneration, boundedStallMs);
        this.onInfoHandler?.(normalizeInfo(info, fen, attributedRequestId || this.activeRequestId));
        if (stopAtTarget && (Number(info?.multipv) || 1) === 1 && Number(info?.depth) >= boundedDepth) {
          this.stop('target-depth');
        }
      }, { multiPv: this.multiPV });
      if (!adapterRequestId) return null;
      this.activeRequestId = adapterRequestId;
      this.debug.activeRequestId = adapterRequestId;
      this.setState('analyzing');
      this.armStallRecovery(localGeneration, boundedStallMs);
      if (boundedActivityMs) {
        this.searchActivityTimer = setTimeout(() => {
          if (localGeneration === this.requestGeneration) this.stop('activity-limit');
        }, boundedActivityMs);
      }
      return adapterRequestId || this.activeRequestId;
    }

    stop(reason = 'requested') {
      this.clearSearchTimers();
      this.requestGeneration += 1;
      this.activeRequestId = '';
      this.debug.activeRequestId = '';
      this.debug.lastStopReason = String(reason || 'requested');
      this.adapter?.cancelAttributedSearch();
      if (this.ready) this.setState('ready');
    }

    terminate() {
      this.clearSearchTimers();
      this.requestGeneration += 1;
      this.activeRequestId = '';
      this.ready = false;
      const candidate = this.adapter;
      this.adapter = null;
      candidate?.terminate('opening-trainer-owner-exit');
      this.releaseWorker();
      this.initPromise = null;
      this.positionFen = '';
      this.setState('terminated');
    }
  }

  window.CaissaOpeningTrainerStockfish = Object.freeze({
    WORKER_PATH,
    WASM_PATH,
    DISPLAY_NAME,
    normalizeInfo,
    parseWhiteWdl,
    parseWhiteBound
  });
  window.OpeningTrainerStockfishClient = OpeningTrainerStockfishClient;
})();

