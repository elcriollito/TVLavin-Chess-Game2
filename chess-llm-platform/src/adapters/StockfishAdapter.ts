import type {
  EngineAnalysisOptions,
  EngineBestMoveOptions,
  PVLine,
} from '../store/types';

export interface StockfishMessage {
  type: 'ready' | 'info' | 'bestmove' | 'error';
  data: any;
}

export class StockfishAdapter {
  private worker: Worker | null = null;
  private ready = false;
  private messageCallbacks: Array<(msg: StockfishMessage) => void> = [];

  constructor() {
    this.init();
  }

  // ===== INITIALIZATION =====
  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create blob worker that imports Stockfish from local file
        const workerCode = `
          importScripts('/stockfish/stockfish.js');
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        this.worker = new Worker(workerUrl);

        this.worker.onmessage = (e) => {
          this.handleMessage(e.data);
        };

        this.worker.onerror = (error) => {
          console.error('Stockfish worker error:', error);
          this.notifyCallbacks({ type: 'error', data: error });
          reject(error);
        };

        // Send UCI init
        this.send('uci');

        // Wait for uciok
        const checkReady = (msg: StockfishMessage) => {
          if (msg.type === 'ready') {
            this.ready = true;
            this.send('isready');
            resolve();
          }
        };

        this.onMessage(checkReady);
      } catch (error) {
        console.error('Failed to initialize Stockfish:', error);
        reject(error);
      }
    });
  }

  // ===== OPTIONS =====
  setOption(name: string, value: string | number): void {
    this.send(`setoption name ${name} value ${value}`);
  }

  setSkillLevel(level: number): void {
    // 0-20
    this.setOption('Skill Level', Math.max(0, Math.min(20, level)));
  }

  setMultiPV(count: number): void {
    this.setOption('MultiPV', Math.max(1, Math.min(5, count)));
  }

  // ===== ANALYSIS =====
  analyzePosition(fen: string, options: EngineAnalysisOptions = {}): void {
    this.send(`position fen ${fen}`);

    if (options.multiPV) {
      this.setMultiPV(options.multiPV);
    }

    const goCommand = options.depth
      ? `go depth ${options.depth}`
      : options.timeMs
      ? `go movetime ${options.timeMs}`
      : 'go infinite';

    this.send(goCommand);
  }

  // ===== BEST MOVE =====
  getBestMove(fen: string, options: EngineBestMoveOptions = {}): Promise<string> {
    return new Promise((resolve) => {
      this.send(`position fen ${fen}`);

      if (options.skillLevel !== undefined) {
        this.setSkillLevel(options.skillLevel);
      }

      const goCommand = options.depth
        ? `go depth ${options.depth}`
        : options.timeMs
        ? `go movetime ${options.timeMs}`
        : 'go depth 15';

      this.send(goCommand);

      // Listen for bestmove
      const listener = (msg: StockfishMessage) => {
        if (msg.type === 'bestmove') {
          resolve(msg.data.move);
          // Remove listener after receiving
          this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== listener);
        }
      };

      this.onMessage(listener);
    });
  }

  // ===== CONTROL =====
  stop(): void {
    this.send('stop');
  }

  quit(): void {
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
  }

  // ===== MESSAGING =====
  private send(command: string): void {
    if (!this.worker) return;
    this.worker.postMessage(command);
  }

  private handleMessage(message: string): void {
    // Parse UCI protocol messages
    if (message === 'uciok') {
      this.notifyCallbacks({ type: 'ready', data: null });
    } else if (message.startsWith('bestmove')) {
      const match = message.match(/bestmove (\S+)/);
      if (match) {
        this.notifyCallbacks({ type: 'bestmove', data: { move: match[1] } });
      }
    } else if (message.startsWith('info')) {
      const info = this.parseInfo(message);
      this.notifyCallbacks({ type: 'info', data: info });
    }
  }

  private parseInfo(message: string): Partial<PVLine> & { nodes?: number; nps?: number } {
    const result: any = {};

    const depthMatch = message.match(/depth (\d+)/);
    if (depthMatch) result.depth = parseInt(depthMatch[1]);

    const scoreMatch = message.match(/score cp (-?\d+)/);
    if (scoreMatch) result.score = parseInt(scoreMatch[1]);

    const mateMatch = message.match(/score mate (-?\d+)/);
    if (mateMatch) result.mate = parseInt(mateMatch[1]);

    const nodesMatch = message.match(/nodes (\d+)/);
    if (nodesMatch) result.nodes = parseInt(nodesMatch[1]);

    const npsMatch = message.match(/nps (\d+)/);
    if (npsMatch) result.nps = parseInt(npsMatch[1]);

    const pvMatch = message.match(/pv (.+)$/);
    if (pvMatch) result.pv = pvMatch[1];

    return result;
  }

  onMessage(callback: (msg: StockfishMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  private notifyCallbacks(msg: StockfishMessage): void {
    this.messageCallbacks.forEach(cb => cb(msg));
  }
}
