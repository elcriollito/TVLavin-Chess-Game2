/**
 * Stockfish Worker Interface
 * Manages communication with Stockfish chess engine
 * Enhanced version with WASM support and improved error handling
 */

class StockfishEngine {
    constructor() {
        this.engine = null;
        this.ready = false;
        this.analyzing = false;
        this.skillLevel = 5;
        this.searchDepth = 12;
        this.multipv = 1;
        this.wasmSupported = typeof WebAssembly === 'object';

        // Callbacks
        this.onReady = null;
        this.onBestMove = null;
        this.onInfo = null;
        this.onError = null;

        // Message queue for commands sent before engine is ready
        this.commandQueue = [];

        this.initializeEngine();
    }

    initializeEngine() {
        try {
            // Try to load Stockfish with WASM support if available
            let workerCode;

            if (this.wasmSupported) {
                // Modern browsers with WASM support
                workerCode = `
                    // Try loading WASM version first, fallback to JS version
                    try {
                        importScripts('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/stockfish-16.0-lite.js');
                    } catch (e) {
                        // Fallback to older JS-only version
                        importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
                    }
                `;
            } else {
                // Older browsers without WASM support
                workerCode = `
                    importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
                `;
            }

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);

            this.engine = new Worker(workerUrl);

            this.engine.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.engine.onerror = (error) => {
                console.error('Stockfish worker error:', error);
                URL.revokeObjectURL(workerUrl);

                if (this.onError) {
                    this.onError(error);
                }

                // Try fallback initialization
                this.tryFallbackInit();
            };

            // Initialize UCI protocol
            this.send('uci');

        } catch (error) {
            console.error('Failed to initialize Stockfish:', error);
            if (this.onError) {
                this.onError(new Error('Could not load chess engine. Please refresh the page.'));
            }
        }
    }

    tryFallbackInit() {
        console.warn('Attempting fallback Stockfish initialization...');

        try {
            // Try simpler worker without WASM
            const workerCode = `
                importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);

            this.engine = new Worker(workerUrl);
            this.engine.onmessage = (event) => this.handleMessage(event.data);
            this.send('uci');

        } catch (error) {
            console.error('Fallback initialization failed:', error);
        }
    }

    handleMessage(message) {
        // Only log in debug mode
        if (window.App && window.App.debug) {
            console.log('Engine:', message);
        }

        // Engine ready
        if (message.includes('uciok')) {
            this.ready = true;
            this.configureEngine();

            // Process any queued commands
            this.processCommandQueue();

            if (this.onReady) {
                this.onReady();
            }
        }

        // Ready for new position
        if (message.includes('readyok')) {
            if (window.App && window.App.debug) {
                console.log('Engine ready for new position');
            }
        }

        // Best move found
        if (message.startsWith('bestmove')) {
            this.analyzing = false;
            const match = message.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
            if (match && this.onBestMove) {
                const move = match[1];
                const ponder = message.match(/ponder ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
                this.onBestMove(move, ponder ? ponder[1] : null);
            }
        }

        // Analysis info
        if (message.startsWith('info') && this.onInfo) {
            this.parseInfo(message);
        }

        // Handle errors from engine
        if (message.startsWith('error') || message.includes('Error')) {
            console.error('Engine error:', message);
            if (this.onError) {
                this.onError(new Error(message));
            }
        }
    }

    parseInfo(message) {
        const info = {
            depth: 0,
            seldepth: 0,
            nodes: 0,
            nps: 0,
            score: null,
            mate: null,
            pv: [],
            time: 0,
            multipv: 1,
            currmove: null,
            hashfull: 0
        };

        // Parse depth
        const depthMatch = message.match(/depth (\d+)/);
        if (depthMatch) {
            info.depth = parseInt(depthMatch[1]);
        }

        // Parse selective depth
        const seldepthMatch = message.match(/seldepth (\d+)/);
        if (seldepthMatch) {
            info.seldepth = parseInt(seldepthMatch[1]);
        }

        // Parse nodes
        const nodesMatch = message.match(/nodes (\d+)/);
        if (nodesMatch) {
            info.nodes = parseInt(nodesMatch[1]);
        }

        // Parse nodes per second
        const npsMatch = message.match(/nps (\d+)/);
        if (npsMatch) {
            info.nps = parseInt(npsMatch[1]);
        }

        // Parse time (in milliseconds)
        const timeMatch = message.match(/time (\d+)/);
        if (timeMatch) {
            info.time = parseInt(timeMatch[1]);
        }

        // Parse multipv number
        const multipvMatch = message.match(/multipv (\d+)/);
        if (multipvMatch) {
            info.multipv = parseInt(multipvMatch[1]);
        }

        // Parse current move
        const currmoveMatch = message.match(/currmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
        if (currmoveMatch) {
            info.currmove = currmoveMatch[1];
        }

        // Parse hash table fullness
        const hashfullMatch = message.match(/hashfull (\d+)/);
        if (hashfullMatch) {
            info.hashfull = parseInt(hashfullMatch[1]);
        }

        // Parse score (centipawns)
        const scoreMatch = message.match(/score cp (-?\d+)/);
        if (scoreMatch) {
            info.score = parseInt(scoreMatch[1]) / 100; // Convert centipawns to pawns
        }

        // Parse mate score
        const mateMatch = message.match(/score mate (-?\d+)/);
        if (mateMatch) {
            info.mate = parseInt(mateMatch[1]);
        }

        // Parse PV (principal variation)
        const pvMatch = message.match(/pv (.+)$/);
        if (pvMatch) {
            info.pv = pvMatch[1].split(' ');
        }

        if (this.onInfo) {
            this.onInfo(info);
        }
    }

    configureEngine() {
        // Set skill level (0-20)
        this.send(`setoption name Skill Level value ${this.skillLevel}`);

        // Enable multi-PV for analysis
        this.send(`setoption name MultiPV value ${this.multipv}`);

        // Configure hash table size (in MB)
        this.send('setoption name Hash value 128');

        // Set number of threads (use 1 for web workers)
        this.send('setoption name Threads value 1');

        // Limit strength for lower levels
        if (this.skillLevel < 20) {
            this.send('setoption name UCI_LimitStrength value true');
            const elo = 1000 + (this.skillLevel * 100);
            this.send(`setoption name UCI_Elo value ${elo}`);
        } else {
            this.send('setoption name UCI_LimitStrength value false');
        }

        this.send('isready');
    }

    send(command) {
        if (this.engine) {
            this.engine.postMessage(command);
        } else if (!this.ready) {
            // Queue command if engine not ready
            this.commandQueue.push(command);
        }
    }

    processCommandQueue() {
        while (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift();
            this.send(command);
        }
    }

    setSkillLevel(level) {
        this.skillLevel = Math.max(0, Math.min(20, parseInt(level)));

        // Adjust search depth based on skill level
        if (this.skillLevel <= 3) {
            this.searchDepth = 8;
        } else if (this.skillLevel <= 8) {
            this.searchDepth = 12;
        } else if (this.skillLevel <= 15) {
            this.searchDepth = 16;
        } else {
            this.searchDepth = 20;
        }

        if (this.ready) {
            this.configureEngine();
        }
    }

    setMultiPV(lines) {
        this.multipv = Math.max(1, Math.min(5, parseInt(lines)));
        if (this.ready) {
            this.send(`setoption name MultiPV value ${this.multipv}`);
        }
    }

    newGame() {
        this.stop();
        this.send('ucinewgame');
        this.send('isready');
    }

    setPosition(fen, moves = []) {
        let command = `position fen ${fen}`;
        if (moves.length > 0) {
            command += ` moves ${moves.join(' ')}`;
        }
        this.send(command);
    }

    setPositionFromStartpos(moves = []) {
        let command = 'position startpos';
        if (moves.length > 0) {
            command += ` moves ${moves.join(' ')}`;
        }
        this.send(command);
    }

    go(options = {}) {
        this.analyzing = true;

        let command = 'go';

        if (options.depth) {
            command += ` depth ${options.depth}`;
        } else if (!options.infinite) {
            command += ` depth ${this.searchDepth}`;
        }

        if (options.movetime) {
            command += ` movetime ${options.movetime}`;
        }

        if (options.wtime !== undefined) {
            command += ` wtime ${options.wtime}`;
        }

        if (options.btime !== undefined) {
            command += ` btime ${options.btime}`;
        }

        if (options.winc !== undefined) {
            command += ` winc ${options.winc}`;
        }

        if (options.binc !== undefined) {
            command += ` binc ${options.binc}`;
        }

        if (options.movestogo) {
            command += ` movestogo ${options.movestogo}`;
        }

        if (options.infinite) {
            command = 'go infinite';
        }

        if (options.ponder) {
            command += ' ponder';
        }

        this.send(command);
    }

    stop() {
        if (this.analyzing) {
            this.send('stop');
            this.analyzing = false;
        }
    }

    ponderhit() {
        if (this.analyzing) {
            this.send('ponderhit');
        }
    }

    analyze(fen, depth = null) {
        this.setPosition(fen);
        const options = depth ? { depth } : { infinite: false };
        this.go(options);
    }

    getBestMove(fen, callback, options = {}) {
        if (!this.ready) {
            console.error('Engine not ready');
            if (this.onError) {
                this.onError(new Error('Engine not ready'));
            }
            return;
        }

        this.onBestMove = callback;
        this.setPosition(fen);
        this.go(options);
    }

    startAnalysis(fen, infoCallback, depth = null) {
        if (!this.ready) {
            console.error('Engine not ready');
            if (this.onError) {
                this.onError(new Error('Engine not ready'));
            }
            return;
        }

        this.onInfo = infoCallback;
        this.setPosition(fen);
        const options = depth ? { depth } : { infinite: true };
        this.go(options);
    }

    stopAnalysis() {
        this.stop();
        this.onInfo = null;
    }

    eval(fen, callback, depth = 20) {
        if (!this.ready) {
            console.error('Engine not ready');
            return;
        }

        let evaluationInfo = null;

        this.onInfo = (info) => {
            if (info.depth >= depth) {
                evaluationInfo = info;
            }
        };

        this.onBestMove = () => {
            this.onInfo = null;
            if (callback && evaluationInfo) {
                callback(evaluationInfo);
            }
        };

        this.setPosition(fen);
        this.go({ depth });
    }

    isReady() {
        return this.ready;
    }

    isAnalyzing() {
        return this.analyzing;
    }

    getSkillLevel() {
        return this.skillLevel;
    }

    getSearchDepth() {
        return this.searchDepth;
    }

    supportsWASM() {
        return this.wasmSupported;
    }

    quit() {
        if (this.engine) {
            this.send('quit');

            // Give engine time to quit gracefully
            setTimeout(() => {
                if (this.engine) {
                    this.engine.terminate();
                    this.engine = null;
                }
            }, 100);

            this.ready = false;
            this.analyzing = false;
        }
    }

    terminate() {
        if (this.engine) {
            this.engine.terminate();
            this.engine = null;
            this.ready = false;
            this.analyzing = false;
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.StockfishEngine = StockfishEngine;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StockfishEngine;
}
