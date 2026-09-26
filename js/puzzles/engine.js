// One worker belongs to the puzzle page. Switching puzzles or turning it off disposes it.
export class PuzzleEngine {
    constructor(onInfo, onMove, onError) {
        this.onInfo = onInfo;
        this.onMove = onMove;
        this.onError = onError;
        this.worker = null;
        this.ready = false;
        this.search = null;
    }

    start() {
        if (this.worker) return;
        try {
            this.worker = new Worker('/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js');
            this.worker.onmessage = event => this.receive(String(event.data || ''));
            this.worker.onerror = () => { this.stop(); this.onError('Engine unavailable'); };
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
            if (depth && score) this.onInfo({ depth: Number(depth), type: score[1], score: Number(score[2]) });
        } else if (line.startsWith('bestmove ') && this.search?.mode === 'play') {
            const move = line.split(' ')[1];
            this.search = null;
            if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) this.onMove(move);
            else this.onError('No legal engine move');
        }
    }

    analyze(fen) { this.search = { mode: 'analysis', fen }; if (this.ready) this.execute(); }
    play(fen) { this.search = { mode: 'play', fen }; if (this.ready) this.execute(); }
    execute() {
        this.send('stop');
        this.send(`position fen ${this.search.fen}`);
        this.send(this.search.mode === 'play' ? 'go movetime 650' : 'go depth 15');
    }
    stop() {
        if (this.worker) { this.send('stop'); this.send('quit'); this.worker.terminate(); }
        this.worker = null;
        this.search = null;
        this.ready = false;
    }
}
