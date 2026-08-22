import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const DEFAULT_WORKER_URL = '/engine/stockfish-working.js';
const DEFAULT_INITIALIZATION_TIMEOUT_MS = 30000;
const MAX_PV_PLIES = 12;

function engineError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function normalizeFen(fen) {
    try {
        return new Chess(fen).fen();
    } catch (_) {
        throw engineError('invalid-fen');
    }
}

export function parseUciInfo(message) {
    if (typeof message !== 'string' || !message.startsWith('info ')) return null;
    const score = message.match(/(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/);
    const pv = message.match(/(?:^|\s)pv\s+(.+)$/);
    if (!score || !pv) return null;
    const number = name => {
        const match = message.match(new RegExp(`(?:^|\\s)${name} (\\d+)(?:\\s|$)`));
        return match ? Number.parseInt(match[1], 10) : null;
    };
    return Object.freeze({
        depth: number('depth') || 0,
        multipv: number('multipv') || 1,
        score: Object.freeze({ type: score[1], value: Number.parseInt(score[2], 10) }),
        pv: Object.freeze(pv[1].trim().split(/\s+/).slice(0, 32))
    });
}

export function pvToSan(fen, pv, maxPlies = MAX_PV_PLIES) {
    const chess = new Chess(fen);
    const result = [];
    for (const uci of (Array.isArray(pv) ? pv : []).slice(0, maxPlies)) {
        const match = String(uci).toLowerCase().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
        if (!match) break;
        try {
            const move = chess.move({ from: match[1], to: match[2], promotion: match[3] });
            if (!move) break;
            result.push(move.san);
        } catch (_) {
            break;
        }
    }
    return result;
}

export class PgnAnalysisEngine {
    constructor(options = {}) {
        const baseUrl = new URL(options.baseUrl || globalThis.document?.baseURI || import.meta.url);
        const workerUrl = new URL(options.workerUrl || DEFAULT_WORKER_URL, baseUrl);
        if (!['http:', 'https:'].includes(workerUrl.protocol) || workerUrl.origin !== baseUrl.origin) {
            throw engineError('invalid-worker-url');
        }
        this.workerUrl = workerUrl.href;
        this.WorkerConstructor = options.WorkerConstructor || globalThis.Worker;
        this.moveTimeMs = Math.max(250, Math.min(3000, Number(options.moveTimeMs) || 900));
        this.initializationTimeoutMs = Math.max(12000, Math.min(60000, Number(options.initializationTimeoutMs) || DEFAULT_INITIALIZATION_TIMEOUT_MS));
        this.onState = typeof options.onState === 'function' ? options.onState : () => {};
        this.onLines = typeof options.onLines === 'function' ? options.onLines : () => {};
        this.worker = null;
        this.state = 'off';
        this.lines = new Map();
        this.currentFen = null;
        this.pendingFen = null;
        this.handshake = null;
        this.searchTimer = null;
    }

    setState(next, detail = null) {
        this.state = next;
        this.onState(next, detail);
    }

    emitLines() {
        const lines = [...this.lines.entries()]
            .sort(([left], [right]) => left - right)
            .slice(0, 2)
            .map(([, info]) => Object.freeze({
                ...info,
                fen: this.currentFen,
                san: Object.freeze(pvToSan(this.currentFen, info.pv))
            }));
        this.onLines(Object.freeze(lines));
    }

    async enable(fen) {
        if (this.state !== 'off' && this.state !== 'error') {
            this.analyze(fen);
            return;
        }
        if (typeof this.WorkerConstructor !== 'function') throw engineError('worker-unsupported');
        this.pendingFen = normalizeFen(fen);
        this.setState('loading');
        this.lines.clear();
        this.onLines(Object.freeze([]));
        return new Promise((resolve, reject) => {
            const timer = globalThis.setTimeout(() => this.fail('engine-initialization-timeout'), this.initializationTimeoutMs);
            this.handshake = { phase: 'uci', timer, resolve, reject };
            try {
                this.worker = new this.WorkerConstructor(this.workerUrl, { name: 'caissa-pgn-stockfish' });
                this.worker.addEventListener('message', event => this.handleMessage(typeof event.data === 'string' ? event.data.trim() : ''));
                this.worker.addEventListener('error', () => this.fail('engine-load-failed'), { once: true });
                this.worker.postMessage('uci');
            } catch (_) {
                this.fail('engine-load-failed');
            }
        });
    }

    handleMessage(message) {
        if (!message || this.state === 'off' || this.state === 'error') return;
        if (this.handshake?.phase === 'uci' && message === 'uciok') {
            this.worker.postMessage('setoption name MultiPV value 2');
            this.worker.postMessage('setoption name Threads value 1');
            this.worker.postMessage('setoption name Hash value 16');
            this.handshake.phase = 'ready';
            this.worker.postMessage('isready');
            return;
        }
        if (this.handshake?.phase === 'ready' && message === 'readyok') {
            const handshake = this.handshake;
            this.handshake = null;
            globalThis.clearTimeout(handshake.timer);
            this.setState('ready');
            handshake.resolve();
            this.startPendingSearch();
            return;
        }
        if (this.state === 'analyzing') {
            const info = parseUciInfo(message);
            if (info && info.multipv <= 2) {
                this.lines.set(info.multipv, info);
                this.emitLines();
                return;
            }
        }
        if (message.startsWith('bestmove ') && (this.state === 'analyzing' || this.state === 'stopping')) {
            globalThis.clearTimeout(this.searchTimer);
            this.searchTimer = null;
            this.setState('ready');
            if (this.pendingFen) this.startPendingSearch();
        }
    }

    analyze(fen) {
        this.pendingFen = normalizeFen(fen);
        if (this.state === 'loading') return;
        if (this.state === 'analyzing') {
            this.setState('stopping');
            this.worker.postMessage('stop');
            return;
        }
        if (this.state === 'stopping') return;
        if (this.state === 'ready') this.startPendingSearch();
    }

    startPendingSearch() {
        if (!this.worker || this.state !== 'ready' || !this.pendingFen) return;
        this.currentFen = this.pendingFen;
        this.pendingFen = null;
        this.lines.clear();
        this.onLines(Object.freeze([]));
        this.worker.postMessage(`position fen ${this.currentFen}`);
        this.worker.postMessage(`go movetime ${this.moveTimeMs}`);
        this.setState('analyzing');
        globalThis.clearTimeout(this.searchTimer);
        this.searchTimer = globalThis.setTimeout(() => this.fail('engine-search-timeout'), this.moveTimeMs + 5000);
    }

    fail(code) {
        const handshake = this.handshake;
        this.handshake = null;
        if (handshake) {
            globalThis.clearTimeout(handshake.timer);
            handshake.reject(engineError(code));
        }
        globalThis.clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.worker?.terminate?.();
        this.worker = null;
        this.pendingFen = null;
        this.lines.clear();
        this.onLines(Object.freeze([]));
        this.setState('error', code);
    }

    disable() {
        const handshake = this.handshake;
        this.handshake = null;
        if (handshake) {
            globalThis.clearTimeout(handshake.timer);
            handshake.reject(engineError('engine-disabled'));
        }
        globalThis.clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.worker?.terminate?.();
        this.worker = null;
        this.currentFen = null;
        this.pendingFen = null;
        this.lines.clear();
        this.onLines(Object.freeze([]));
        this.setState('off');
    }
}
