(function () {
  class StockfishClient {
    constructor(options = {}) {
      this.workerUrl = options.workerUrl || '/engine/stockfish.worker.js';
      this.worker = null;
      this.ready = false;
      this.queue = [];
      this.onInfoHandler = null;
      this.onBestMoveHandler = null;
      this.onLineHandler = null;
      this.initPromise = null;
    }

    init() {
      if (this.initPromise) return this.initPromise;
      this.initPromise = new Promise((resolve, reject) => {
        try {
          this.worker = new Worker(this.workerUrl);
          const onMessage = (event) => {
            const line = typeof event.data === 'string'
              ? event.data
              : String(event.data?.data ?? '');
            if (!line) return;
            if (this.onLineHandler) this.onLineHandler(line);
            if (line.includes('uciok')) {
              this.ready = true;
              this.flush();
            }
            if (line.includes('readyok')) {
              resolve();
            }
            if (line.startsWith('info')) {
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
          };
          this.worker.addEventListener('message', onMessage);
          this.worker.addEventListener('error', (err) => reject(err));
          this.send('uci');
          this.send('isready');
        } catch (err) {
          reject(err);
        }
      });
      return this.initPromise;
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

    onInfo(cb) {
      this.onInfoHandler = typeof cb === 'function' ? cb : null;
    }

    onBestMove(cb) {
      this.onBestMoveHandler = typeof cb === 'function' ? cb : null;
    }

    onLine(cb) {
      this.onLineHandler = typeof cb === 'function' ? cb : null;
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
      this.initPromise = null;
    }
  }

  window.StockfishClient = StockfishClient;
})();

