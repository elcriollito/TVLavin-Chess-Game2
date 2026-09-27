import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function readablePrincipalVariation(fen, moves, limit = 10) {
    let game;
    try { game = new Chess(fen); }
    catch { return null; }
    const notation = [];
    const accepted = [];
    for (const uci of (moves || []).slice(0, limit)) {
        if (!UCI_MOVE.test(uci)) break;
        const before = game.fen().split(' ');
        let move;
        try {
            move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
        } catch { break; }
        if (!move) break;
        const moveNumber = before[5];
        notation.push(move.color === 'w' ? `${moveNumber}. ${move.san}`
            : `${notation.length ? '' : `${moveNumber}... `}${move.san}`);
        accepted.push(uci);
    }
    if (!notation.length) return null;
    return Object.freeze({
        bestMove: notation[0].replace(/^\d+\.(?:\.\.)?\s*/, ''),
        bestUci: accepted[0],
        variation: notation.join(' '),
        moves: Object.freeze(accepted),
    });
}

// One worker belongs to one bounded engine role. Turning that role off disposes it.
export class PuzzleEngine {
    constructor(onInfo, onMove, onError) {
        this.onInfo = onInfo;
        this.onMove = onMove;
        this.onError = onError;
        this.worker = null;
        this.ready = false;
        this.search = null;
        this.sequence = 0;
    }

    start() {
        if (this.worker) return;
        try {
            const worker = new Worker('/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js');
            this.worker = worker;
            worker.onmessage = event => {
                if (this.worker === worker) this.receive(String(event.data || ''));
            };
            worker.onerror = () => {
                if (this.worker !== worker) return;
                this.stop();
                this.onError('Engine unavailable');
            };
            this.send('uci');
        } catch { this.stop(); this.onError('Engine unavailable'); }
    }

    send(command) { this.worker?.postMessage(command); }

    receive(line) {
        if (line === 'uciok') {
            this.send('setoption name Threads value 1');
            this.send('setoption name Hash value 16');
            this.send('isready');
        } else if (line === 'readyok') {
            this.ready = true;
            if (this.search) this.execute();
        } else if (line.startsWith('info ') && this.search?.mode === 'analysis') {
            const depth = line.match(/\bdepth (\d+)/)?.[1];
            const score = line.match(/\bscore (cp|mate) (-?\d+)/);
            const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/).filter(move => UCI_MOVE.test(move)) || [];
            if (depth && score && pv.length) this.onInfo({
                depth: Number(depth), type: score[1], score: Number(score[2]), pv,
                fen: this.search.fen, sequence: this.search.sequence,
            });
        } else if (line.startsWith('bestmove ') && this.search?.mode === 'play') {
            const move = line.split(' ')[1];
            this.search = null;
            if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) this.onMove(move);
            else this.onError('No legal engine move');
        }
    }

    analyze(fen) { this.search = { mode: 'analysis', fen, sequence: ++this.sequence }; if (this.ready) this.execute(); }
    play(fen) { this.search = { mode: 'play', fen, sequence: ++this.sequence }; if (this.ready) this.execute(); }
    execute() {
        this.send('stop');
        this.send(`position fen ${this.search.fen}`);
        this.send(this.search.mode === 'play' ? 'go movetime 650' : 'go depth 15');
    }
    cancel() {
        this.send('stop');
        this.search = null;
    }
    stop() {
        const worker = this.worker;
        if (worker) {
            this.send('stop');
            this.send('quit');
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
        }
        this.worker = null;
        this.search = null;
        this.ready = false;
    }
}

export class EngineMatch {
    constructor({ onUpdate = () => {}, onState = () => {}, onError = () => {}, engineFactory,
        schedule = (callback, delay) => setTimeout(callback, delay), cancelSchedule = timer => clearTimeout(timer),
        delay = 300, maxPlies = 120 } = {}) {
        this.onUpdate = onUpdate;
        this.onState = onState;
        this.onError = onError;
        this.engineFactory = engineFactory || (callbacks => new PuzzleEngine(callbacks.onInfo, callbacks.onMove, callbacks.onError));
        this.schedule = schedule;
        this.cancelSchedule = cancelSchedule;
        this.delay = delay;
        this.maxPlies = maxPlies;
        this.engines = null;
        this.game = null;
        this.running = false;
        this.timer = null;
    }

    start(fen) {
        this.stop({ notify: false });
        this.game = new Chess(fen);
        this.engines = Object.fromEntries(['w', 'b'].map(color => [color, this.engineFactory({
            onInfo: () => {},
            onMove: move => this.#acceptMove(color, move),
            onError: message => this.#fail(message),
        })]));
        this.engines.w.start();
        this.engines.b.start();
        this.running = true;
        this.onState({ status: 'running', reason: null });
        this.onUpdate(this.snapshot());
        this.#requestMove();
        return this.snapshot();
    }

    pause() {
        if (!this.running || !this.game) return false;
        this.running = false;
        this.#clearTimer();
        this.engines?.w.cancel();
        this.engines?.b.cancel();
        this.onState({ status: 'paused', reason: null });
        return true;
    }

    resume() {
        if (this.running || !this.game || this.game.isGameOver() || this.game.history().length >= this.maxPlies) return false;
        this.running = true;
        this.onState({ status: 'running', reason: null });
        this.#requestMove();
        return true;
    }

    stop({ notify = true } = {}) {
        this.#clearTimer();
        this.engines?.w.stop();
        this.engines?.b.stop();
        this.engines = null;
        this.running = false;
        this.game = null;
        if (notify) this.onState({ status: 'stopped', reason: null });
    }

    snapshot() {
        if (!this.game) return null;
        return Object.freeze({
            fen: this.game.fen(),
            turn: this.game.turn(),
            moves: Object.freeze(this.game.history()),
            verboseMoves: Object.freeze(this.game.history({ verbose: true })),
            plyCount: this.game.history().length,
            gameOver: this.game.isGameOver(),
        });
    }

    #requestMove() {
        if (!this.running || !this.game) return;
        if (this.game.isGameOver()) return this.#finish('Game over by chess rules');
        if (this.game.history().length >= this.maxPlies) return this.#finish(`Stopped at ${this.maxPlies} plies`);
        this.engines[this.game.turn()].play(this.game.fen());
    }

    #acceptMove(color, uci) {
        if (!this.running || !this.game || this.game.turn() !== color || !UCI_MOVE.test(uci)) return;
        try {
            const move = this.game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
            if (!move) throw new Error('Illegal engine move');
        } catch {
            return this.#fail('Engine returned an invalid move');
        }
        this.onUpdate(this.snapshot());
        if (this.game.isGameOver()) return this.#finish('Game over by chess rules');
        if (this.game.history().length >= this.maxPlies) return this.#finish(`Stopped at ${this.maxPlies} plies`);
        this.timer = this.schedule(() => {
            this.timer = null;
            this.#requestMove();
        }, this.delay);
    }

    #finish(reason) {
        this.running = false;
        this.#clearTimer();
        this.engines?.w.stop();
        this.engines?.b.stop();
        this.engines = null;
        this.onState({ status: 'finished', reason });
    }

    #fail(message) {
        this.pause();
        this.onError(message);
    }

    #clearTimer() {
        if (this.timer !== null) this.cancelSchedule(this.timer);
        this.timer = null;
    }
}
