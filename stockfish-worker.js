/**
 * Stockfish Worker Interface
 * Manages communication with Stockfish chess engine
 */

class StockfishEngine {
    constructor() {
        this.engine = null;
        this.ready = false;
        this.analyzing = false;
        this.skillLevel = 5;
        this.searchDepth = 12;
        this.multipv = 1;
        
        // Callbacks
        this.onReady = null;
        this.onBestMove = null;
        this.onInfo = null;
        this.onError = null;
        
        this.initializeEngine();
    }
    
    initializeEngine() {
        try {
            // Try to load Stockfish WASM
            this.engine = new Worker('https://cdn.jsdelivr.net/npm/stockfish.wasm@0.11.0/stockfish.wasm.js');
            
            this.engine.onmessage = (event) => {
                this.handleMessage(event.data);
            };
            
            this.engine.onerror = (error) => {
                console.error('Stockfish error:', error);
                if (this.onError) {
                    this.onError(error);
                }
                // Try fallback
                this.initializeFallback();
            };
            
            // Initialize engine
            this.send('uci');
            
        } catch (error) {
            console.error('Failed to initialize Stockfish WASM:', error);
            this.initializeFallback();
        }
    }
    
    initializeFallback() {
        try {
            console.log('Trying fallback Stockfish...');
            this.engine = new Worker('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
            
            this.engine.onmessage = (event) => {
                this.handleMessage(event.data);
            };
            
            this.engine.onerror = (error) => {
                console.error('Fallback Stockfish error:', error);
                if (this.onError) {
                    this.onError(error);
                }
            };
            
            this.send('uci');
            
        } catch (error) {
            console.error('All Stockfish initializations failed:', error);
            if (this.onError) {
                this.onError(new Error('Could not load chess engine'));
            }
        }
    }
    
    handleMessage(message) {
        console.log('Engine:', message);
        
        // Engine ready
        if (message.includes('uciok')) {
            this.ready = true;
            this.configureEngine();
            if (this.onReady) {
                this.onReady();
            }
        }
        
        // Ready for new position
        if (message.includes('readyok')) {
            console.log('Engine ready for new position');
        }
        
        // Best move found
        if (message.startsWith('bestmove')) {
            this.analyzing = false;
            const match = message.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
            if (match && this.onBestMove) {
                this.onBestMove(match[1]);
            }
        }
        
        // Analysis info
        if (message.startsWith('info') && this.onInfo) {
            this.parseInfo(message);
        }
    }
    
    parseInfo(message) {
        const info = {
            depth: 0,
            nodes: 0,
            score: null,
            mate: null,
            pv: [],
            time: 0
        };
        
        // Parse depth
        const depthMatch = message.match(/depth (\d+)/);
        if (depthMatch) {
            info.depth = parseInt(depthMatch[1]);
        }
        
        // Parse nodes
        const nodesMatch = message.match(/nodes (\d+)/);
        if (nodesMatch) {
            info.nodes = parseInt(nodesMatch[1]);
        }
        
        // Parse time
        const timeMatch = message.match(/time (\d+)/);
        if (timeMatch) {
            info.time = parseInt(timeMatch[1]);
        }
        
        // Parse score
        const scoreMatch = message.match(/score cp (-?\d+)/);
        if (scoreMatch) {
            info.score = parseInt(scoreMatch[1]) / 100; // Convert centipawns to pawns
        }
        
        // Parse mate
        const mateMatch = message.match(/score mate (-?\d+)/);
        if (mateMatch) {
            info.mate = parseInt(mateMatch[1]);
        }
        
        // Parse PV (principal variation)
        const pvMatch = message.match(/pv (.+)$/);
        if (pvMatch) {
            info.pv = pvMatch[1].split(' ').slice(0, 10); // First 10 moves
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
        }
    }
    
    setSkillLevel(level) {
        this.skillLevel = parseInt(level);
        
        // Adjust search depth based on skill
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
    
    go(options = {}) {
        this.analyzing = true;
        
        let command = 'go';
        
        if (options.depth) {
            command += ` depth ${options.depth}`;
        } else {
            command += ` depth ${this.searchDepth}`;
        }
        
        if (options.movetime) {
            command += ` movetime ${options.movetime}`;
        }
        
        if (options.infinite) {
            command = 'go infinite';
        }
        
        this.send(command);
    }
    
    stop() {
        if (this.analyzing) {
            this.send('stop');
            this.analyzing = false;
        }
    }
    
    analyze(fen) {
        this.setPosition(fen);
        this.go({ infinite: false });
    }
    
    getBestMove(fen, callback) {
        if (!this.ready) {
            console.error('Engine not ready');
            return;
        }
        
        this.onBestMove = callback;
        this.setPosition(fen);
        this.go();
    }
    
    startAnalysis(fen, infoCallback) {
        if (!this.ready) {
            console.error('Engine not ready');
            return;
        }
        
        this.onInfo = infoCallback;
        this.setPosition(fen);
        this.go({ infinite: true });
    }
    
    stopAnalysis() {
        this.stop();
        this.onInfo = null;
    }
    
    quit() {
        if (this.engine) {
            this.send('quit');
            this.engine.terminate();
            this.engine = null;
            this.ready = false;
        }
    }
}

// Make available globally
window.StockfishEngine = StockfishEngine;
