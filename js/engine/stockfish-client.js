(function () {
  class StockfishClient {
    constructor(options = {}) {
      const defaultUrl = new URL('/engine/stockfish.worker.js', window.location.origin).toString();
      this.workerUrl = String(options.workerUrl || defaultUrl);
      this.worker = null;
      this.ready = false;
      this.queue = [];
      this.waiters = [];
      this.initPromise = null;

      this.onInfoHandler = null;
      this.onBestMoveHandler = null;
      this.onLineHandler = null;
      this.onErrorHandler = null;
      this.onStateHandler = null;

      this.debug = {
        workerUrl: this.workerUrl,
        state: 'idle',
        handshakeState: 'idle',
        lastLine: '',
        lastInfoAt: 0,
        errors: [],
        lastUciOkAt: 0,
        lastReadyOkAt: 0
      };
    }

    setState(next) {
      this.debug.state = String(next || '');
      if (this.onStateHandler) this.onStateHandler(this.getDebugSnapshot());
    }

    setHandshakeState(next) {
      this.debug.handshakeState = String(next || '');
      if (this.onStateHandler) this.onStateHandler(this.getDebugSnapshot());
    }

    addError(message) {
      const text = String(message || 'Unknown engine error');
      this.debug.errors.push({ at: Date.now(), message: text });
      if (this.debug.errors.length > 20) this.debug.errors.shift();
      if (this.onErrorHandler) this.onErrorHandler(new Error(text));
      if (this.onStateHandler) this.onStateHandler(this.getDebugSnapshot());
    }

    getDebugSnapshot() {
      return {
        workerUrl: this.debug.workerUrl,
        state: this.debug.state,
        handshakeState: this.debug.handshakeState,
        lastLine: this.debug.lastLine,
        lastInfoAt: this.debug.lastInfoAt,
        lastUciOkAt: this.debug.lastUciOkAt,
        lastReadyOkAt: this.debug.lastReadyOkAt,
        errors: this.debug.errors.slice()
      };
    }

    onInfo(cb) {
      this.onInfoHandler = typeof cb === 'function' ? cb : null;
    }

    onBestMove(cb) {
      this.onBestMoveHandler = typeof cb === 'function' ? cb : null;
    }

    onLine(cb) {
      this.onLineHandler = typeof cb === 'function' ? cb : null;
    }

    onError(cb) {
      this.onErrorHandler = typeof cb === 'function' ? cb : null;
    }

    onState(cb) {
      this.onStateHandler = typeof cb === 'function' ? cb : null;
    }

    send(command) {
      if (!command) return;
      if (!this.worker || !this.ready) {
        this.queue.push(command);
        return;
      }
      this.worker.postMessage(command);
    }

    flush() {
      while (this.worker && this.ready && this.queue.length > 0) {
        this.worker.postMessage(this.queue.shift());
      }
    }

    parseInfoLine(line) {
      const info = {
        rawLine: line,
        depth: 0,
        seldepth: 0,
        nodes: 0,
        nps: 0,
        time: 0,
        multipv: 1,
        scoreType: null,
        score: null,
        pv: []
      };

      const depth = line.match(/\bdepth\s+(\d+)/);
      const seldepth = line.match(/\bseldepth\s+(\d+)/);
      const nodes = line.match(/\bnodes\s+(\d+)/);
      const nps = line.match(/\bnps\s+(\d+)/);
      const time = line.match(/\btime\s+(\d+)/);
      const multipv = line.match(/\bmultipv\s+(\d+)/);
      const cp = line.match(/\bscore\s+cp\s+(-?\d+)/);
      const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
      const pv = line.match(/\spv\s+(.+)$/);

      if (depth) info.depth = Number(depth[1]) || 0;
      if (seldepth) info.seldepth = Number(seldepth[1]) || 0;
      if (nodes) info.nodes = Number(nodes[1]) || 0;
      if (nps) info.nps = Number(nps[1]) || 0;
      if (time) info.time = Number(time[1]) || 0;
      if (multipv) info.multipv = Number(multipv[1]) || 1;
      if (cp) {
        info.scoreType = 'cp';
        info.score = Number(cp[1]) || 0;
      } else if (mate) {
        info.scoreType = 'mate';
        info.score = Number(mate[1]) || 0;
      }
      if (pv) {
        info.pv = pv[1].trim().split(/\s+/).filter(Boolean).map((m) => m.toLowerCase());
      }
      return info;
    }

    handleLine(line) {
      this.debug.lastLine = line;
      if (this.onLineHandler) this.onLineHandler(line);
      if (this.onStateHandler) this.onStateHandler(this.getDebugSnapshot());

      if (line.includes('uciok')) {
        this.debug.lastUciOkAt = Date.now();
        this.setHandshakeState('uciok');
      }
      if (line.includes('readyok')) {
        this.debug.lastReadyOkAt = Date.now();
        this.setHandshakeState('readyok');
      }

      if (line.startsWith('info')) {
        this.debug.lastInfoAt = Date.now();
        const parsed = this.parseInfoLine(line);
        if (parsed && this.onInfoHandler) this.onInfoHandler(parsed);
      }

      if (line.startsWith('bestmove')) {
        const m = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
        const p = line.match(/\sponder\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
        if (this.onBestMoveHandler) {
          this.onBestMoveHandler({
            bestmove: m ? m[1].toLowerCase() : '',
            ponder: p ? p[1].toLowerCase() : '',
            rawLine: line
          });
        }
      }

      if (this.waiters.length > 0) {
        const current = this.waiters.slice();
        current.forEach((w) => {
          if (!w || w.done) return;
          if (w.pattern.test(line)) {
            w.done = true;
            clearTimeout(w.timer);
            this.waiters = this.waiters.filter((x) => x !== w);
            w.resolve(line);
          }
        });
      }
    }

    waitForLine(pattern, timeoutMs, timeoutLabel) {
      return new Promise((resolve, reject) => {
        const waiter = {
          pattern,
          resolve,
          done: false,
          timer: setTimeout(() => {
            if (waiter.done) return;
            waiter.done = true;
            this.waiters = this.waiters.filter((x) => x !== waiter);
            reject(new Error(`Engine handshake timeout (${timeoutLabel})`));
          }, timeoutMs)
        };
        this.waiters.push(waiter);
      });
    }

    async init() {
      if (this.initPromise) return this.initPromise;
      this.initPromise = (async () => {
        try {
          this.setState('loading');
          this.setHandshakeState('boot');
          this.worker = new Worker(this.workerUrl, { type: 'classic' });

          this.worker.onmessage = (event) => {
            const line = typeof event.data === 'string'
              ? event.data
              : String(event.data?.data ?? '');
            if (!line) return;
            this.handleLine(line);
          };

          this.worker.onerror = (e) => {
            this.addError(`Worker error: ${e?.message || 'unknown'}`);
          };
          this.worker.onmessageerror = () => {
            this.addError('Worker message error');
          };

          this.setHandshakeState('uci');
          this.worker.postMessage('uci');
          await this.waitForLine(/(^|\s)uciok(\s|$)/i, 4000, 'uciok');

          this.setHandshakeState('isready');
          this.worker.postMessage('isready');
          await this.waitForLine(/(^|\s)readyok(\s|$)/i, 4000, 'readyok');

          this.ready = true;
          this.setState('ready');
          this.flush();
          return true;
        } catch (err) {
          this.ready = false;
          this.setState('error');
          this.addError(err?.message || String(err));
          throw err;
        }
      })();
      return this.initPromise;
    }

    setOptions({ multiPV }) {
      const mpv = Number(multiPV);
      if (Number.isFinite(mpv) && mpv > 0) {
        this.send(`setoption name MultiPV value ${Math.max(1, Math.min(5, mpv))}`);
      }
    }

    setPositionFEN(fen) {
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
    }

    goDepth(depth) {
      const d = Number(depth) || 18;
      this.send(`go depth ${Math.max(1, Math.min(50, d))}`);
    }

    goMoveTime(ms) {
      const t = Number(ms) || 1500;
      this.send(`go movetime ${Math.max(50, t)}`);
    }

    stop() {
      this.send('stop');
    }

    terminate() {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
      this.ready = false;
      this.queue = [];
      this.waiters = [];
      this.initPromise = null;
      this.setState('terminated');
    }
  }

  window.StockfishClient = StockfishClient;
})();

