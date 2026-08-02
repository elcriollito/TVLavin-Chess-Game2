/*
 * EngineAdapter - unified UCI worker adapter for CAISSA engines
 * Supports Stockfish-style WASM workers and a consistent API for Play + Arena.
 */

(function () {
    class EngineAdapter {
        constructor(config = {}) {
            this.config = config || {};
            this.id = this.config.id || 'stockfish';
            this.name = this.config.name || 'Engine';
            this.workerPath = this.config.workerPath || 'engine/stockfish-working.js';
            this.wasmPath = this.config.wasmPath || '';
            this.defaultOptions = this.config.defaultOptions || {};
            this.supportsChess960 = !!this.config.supportsChess960;
            this.notes = this.config.notes || '';

            this.engine = null;
            this.ready = false;
            this.configured = false;
            this.analyzing = false;
            this.skillLevel = 5;
            this.searchDepth = this.config.defaultDepth || 20;
            this.multipv = 1;
            this.wasmSupported = typeof WebAssembly === 'object';

            this.searchId = 0;
            this.activeSearchId = 0;
            this.currentFen = null;
            this.attributionGeneration = 0;
            this.attributionEnabled = false;
            this.attributionBarrierPending = false;
            this.attributedActive = null;
            this.attributedPending = null;
            this.attributionDiagnostics = {
                generations: 0,
                superseded: 0,
                rejectedRawMessages: 0,
                completed: 0,
                canceled: 0
            };

            this.onReady = null;
            this.onBestMove = null;
            this.onInfo = null;
            this.onError = null;
            this.onLine = null;

            this.commandQueue = [];
            this.basePath = this.getBasePath();

            this.start();
        }

        getBasePath() {
            const path = window.location.pathname;
            if (path.includes('/')) {
                const parts = path.split('/');
                if (parts[parts.length - 1].includes('.')) {
                    parts.pop();
                }
                const basePath = parts.join('/');
                return basePath.endsWith('/') ? basePath : basePath + '/';
            }
            return './';
        }

        resolvePath(path) {
            if (!path) return '';
            if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
                return path;
            }
            return this.basePath + path;
        }

        start() {
            try {
                const workerUrl = this.resolvePath(this.workerPath);
                if (!workerUrl) {
                    throw new Error('Worker path is missing');
                }

                this.engine = new Worker(workerUrl);
                this.engine.onmessage = (event) => {
                    const message = typeof event.data === 'string'
                        ? event.data
                        : (event.data?.data ?? String(event.data));
                    this.handleMessage(message);
                };

                this.engine.onerror = (error) => {
                    if (this.onError) this.onError(error);
                };

                this.engine.onmessageerror = (error) => {
                    if (window.CAISSA_DEBUG) {
                        console.error('[EngineAdapter] message error:', error);
                    }
                };

                this.send('uci');
            } catch (error) {
                if (this.onError) {
                    this.onError(new Error('Could not load chess engine.'));
                }
            }
        }

        handleMessage(message) {
            if (this.onLine) {
                this.onLine(message);
            }

            if (message.includes('uciok')) {
                // `uciok` confirms protocol identity, not search readiness.
                this.configureEngine();
            }

            if (message.includes('readyok')) {
                const firstReady = !this.ready;
                this.ready = true;
                this.processCommandQueue();
                this.completeAttributionBarrier();
                if (firstReady && this.onReady) this.onReady();
            }

            if (message.startsWith('bestmove')) {
                this.analyzing = false;
                const match = message.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
                if (this.attributionEnabled) {
                    if (this.attributionBarrierPending || !this.attributedActive
                        || !['bestmove', 'candidates'].includes(this.attributedActive.kind)) {
                        this.attributionDiagnostics.rejectedRawMessages += 1;
                        return;
                    }
                    const operation = this.attributedActive;
                    this.attributedActive = null;
                    operation.status = 'completed';
                    this.attributionDiagnostics.completed += 1;
                    if (operation.kind === 'candidates') {
                        this.send(`setoption name MultiPV value ${this.multipv}`);
                        const candidates = [...operation.candidates.values()]
                            .sort((a, b) => a.multipv - b.multipv).slice(0, operation.candidateCount);
                        operation.callback(Object.freeze(candidates.map(Object.freeze)), operation.generationId);
                        return;
                    }
                    if (match) {
                        const move = match[1];
                        const ponder = message.match(/ponder ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
                        operation.callback(move, ponder ? ponder[1] : null, operation.generationId);
                    }
                    return;
                }
                if (match && this.onBestMove) {
                    const move = match[1];
                    const ponder = message.match(/ponder ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
                    this.onBestMove(move, ponder ? ponder[1] : null);
                }
            }

            if (message.startsWith('info') && this.attributionEnabled) {
                if (this.attributionBarrierPending || !this.attributedActive
                    || !['analysis', 'candidates'].includes(this.attributedActive.kind)) {
                    this.attributionDiagnostics.rejectedRawMessages += 1;
                    return;
                }
                if (message.includes(' pv ') || (message.includes('depth') && message.includes('score'))) {
                    if (this.attributedActive.kind === 'candidates') {
                        const info = this.parseInfo(message, null);
                        if (info?.pv?.[0] && info.depth >= (this.attributedActive.candidates.get(info.multipv)?.depth || 0))
                            this.attributedActive.candidates.set(info.multipv, Object.freeze({ move: info.pv[0],
                                multipv: info.multipv, depth: info.depth, score: info.score, mate: info.mate }));
                    } else this.parseInfo(message, this.attributedActive.callback);
                }
                return;
            }

            if (message.startsWith('info') && this.onInfo) {
                if (message.includes(' pv ') || (message.includes('depth') && message.includes('score'))) {
                    this.parseInfo(message);
                }
            }

            if (message.startsWith('error') || message.includes('Error')) {
                if (this.onError) this.onError(new Error(message));
            }
        }

        parseInfo(message, callback = this.onInfo) {
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
                hashfull: 0,
                tbhits: 0,
                rawLine: message
            };

            const depthMatch = message.match(/depth (\d+)/);
            if (depthMatch) info.depth = parseInt(depthMatch[1], 10);

            const seldepthMatch = message.match(/seldepth (\d+)/);
            if (seldepthMatch) info.seldepth = parseInt(seldepthMatch[1], 10);

            const nodesMatch = message.match(/nodes (\d+)/);
            if (nodesMatch) info.nodes = parseInt(nodesMatch[1], 10);

            const npsMatch = message.match(/nps (\d+)/);
            if (npsMatch) info.nps = parseInt(npsMatch[1], 10);

            const timeMatch = message.match(/time (\d+)/);
            if (timeMatch) info.time = parseInt(timeMatch[1], 10);

            const multipvMatch = message.match(/multipv (\d+)/);
            if (multipvMatch) info.multipv = parseInt(multipvMatch[1], 10);

            const currmoveMatch = message.match(/currmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
            if (currmoveMatch) info.currmove = currmoveMatch[1];

            const hashfullMatch = message.match(/hashfull (\d+)/);
            if (hashfullMatch) info.hashfull = parseInt(hashfullMatch[1], 10);

            const tbhitsMatch = message.match(/tbhits (\d+)/);
            if (tbhitsMatch) info.tbhits = parseInt(tbhitsMatch[1], 10);

            const scoreMatch = message.match(/score cp (-?\d+)/);
            if (scoreMatch) {
                const rawCp = parseInt(scoreMatch[1], 10);
                info.score = this.normalizeScore(rawCp);
            }

            const mateMatch = message.match(/score mate (-?\d+)/);
            if (mateMatch) {
                const rawMate = parseInt(mateMatch[1], 10);
                info.mate = this.normalizeMate(rawMate);
            }

            const pvMatch = message.match(/\s+pv\s+(.+)$/);
            if (pvMatch) {
                info.pv = pvMatch[1].trim().split(/\s+/).filter(m => m.length > 0);
            }

            if (callback && info.pv.length > 0) {
                callback(info, this.attributedActive?.generationId ?? null);
            }
            return info;
        }

        createAttributedOperation(kind, fen, callback, options) {
            const generated = this.config.generationIdFactory?.();
            const sequence = ++this.attributionGeneration;
            const generationId = typeof generated === 'string' && generated
                ? `${generated}:${sequence}`
                : `engine-generation:${sequence}`;
            this.attributionDiagnostics.generations += 1;
            return {
                generationId,
                kind,
                fen,
                callback,
                options,
                candidateCount: kind === 'candidates' ? options.candidateCount : null,
                candidates: kind === 'candidates' ? new Map() : null,
                status: 'created'
            };
        }

        invalidateAttributedOperation(operation, status) {
            if (!operation || ['completed', 'superseded', 'canceled'].includes(operation.status)) return;
            operation.status = status;
            if (status === 'superseded') this.attributionDiagnostics.superseded += 1;
            if (status === 'canceled') this.attributionDiagnostics.canceled += 1;
        }

        activateAttributedOperation(operation) {
            if (!operation || operation.status !== 'created') return;
            operation.status = 'active';
            this.attributedActive = operation;
            this.currentFen = operation.fen;
            if (operation.kind === 'candidates') this.send(`setoption name MultiPV value ${operation.candidateCount}`);
            this.setPosition(operation.fen);
            this.go(operation.options);
        }

        completeAttributionBarrier() {
            if (!this.attributionBarrierPending) return;
            this.attributionBarrierPending = false;
            const pending = this.attributedPending;
            this.attributedPending = null;
            this.activateAttributedOperation(pending);
        }

        startAttributedOperation(kind, fen, callback, options = {}) {
            if (!this.ready) {
                if (this.onError) this.onError(new Error('Engine not ready'));
                return null;
            }
            if (typeof callback !== 'function') return null;

            this.attributionEnabled = true;
            const operation = this.createAttributedOperation(kind, fen, callback, options);
            const needsBarrier = this.attributionBarrierPending || this.attributionGeneration > 1
                || this.attributedActive || this.analyzing;

            this.invalidateAttributedOperation(this.attributedActive, 'superseded');
            this.attributedActive = null;
            this.invalidateAttributedOperation(this.attributedPending, 'superseded');
            this.attributedPending = null;

            if (!needsBarrier) {
                this.activateAttributedOperation(operation);
                return operation.generationId;
            }

            this.attributedPending = operation;
            if (!this.attributionBarrierPending) {
                if (this.analyzing) this.send('stop');
                this.analyzing = false;
                this.attributionBarrierPending = true;
                this.send('isready');
            }
            return operation.generationId;
        }

        cancelAttributedSearch() {
            if (!this.attributionEnabled) return false;
            const hadOperation = Boolean(this.attributedActive || this.attributedPending || this.attributionBarrierPending);
            const wasAnalyzing = this.analyzing;
            const restoreMultiPv = this.attributedActive?.kind === 'candidates';
            this.invalidateAttributedOperation(this.attributedActive, 'canceled');
            this.invalidateAttributedOperation(this.attributedPending, 'canceled');
            this.attributedActive = null;
            this.attributedPending = null;
            if (restoreMultiPv) this.send(`setoption name MultiPV value ${this.multipv}`);
            if (this.analyzing) this.send('stop');
            this.analyzing = false;
            if (!this.attributionBarrierPending && (hadOperation || wasAnalyzing)) {
                this.attributionBarrierPending = true;
                this.send('isready');
            }
            return hadOperation;
        }

        inspectAttribution() {
            return Object.freeze({
                enabled: this.attributionEnabled,
                barrierPending: this.attributionBarrierPending,
                activeGenerationId: this.attributedActive?.generationId ?? null,
                pendingGenerationId: this.attributedPending?.generationId ?? null,
                activeOperationCount: Number(Boolean(this.attributedActive))
                    + Number(Boolean(this.attributedPending)),
                diagnostics: Object.freeze({ ...this.attributionDiagnostics })
            });
        }

        normalizeScore(rawCp) {
            if (!this.currentFen) return rawCp / 100;
            const fenParts = this.currentFen.split(' ');
            const sideToMove = fenParts[1];
            const normalizedCp = (sideToMove === 'b') ? -rawCp : rawCp;
            return normalizedCp / 100;
        }

        normalizeMate(rawMate) {
            if (!this.currentFen) return rawMate;
            const fenParts = this.currentFen.split(' ');
            const sideToMove = fenParts[1];
            return (sideToMove === 'b') ? -rawMate : rawMate;
        }

        configureEngine() {
            if (this.configured) return;

            if (this.multipv) {
                this.send(`setoption name MultiPV value ${this.multipv}`);
            }

            if (this.supportsChess960) {
                const chess960Enabled = !!(window.App && App.chess960Enabled);
                this.send(`setoption name UCI_Chess960 value ${chess960Enabled ? 'true' : 'false'}`);
            }

            Object.keys(this.defaultOptions || {}).forEach((key) => {
                const value = this.defaultOptions[key];
                if (value === undefined || value === null) return;
                this.send(`setoption name ${key} value ${value}`);
            });

            this.send('isready');
            this.configured = true;
        }

        send(command) {
            if (this.engine) {
                this.engine.postMessage(command);
            } else if (!this.ready) {
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
            this.searchDepth = 20;
        }

        setMultiPV(lines) {
            this.multipv = Math.max(1, Math.min(5, parseInt(lines, 10)));
            if (this.ready) {
                this.send(`setoption name MultiPV value ${this.multipv}`);
            }
        }

        newGame() {
            if (this.attributionEnabled) this.cancelAttributedSearch();
            else this.stop();
            this.send('ucinewgame');
            this.send('isready');
        }

        ucinewgame() {
            this.newGame();
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

            if (options.movetime) {
                command += ` movetime ${options.movetime}`;
            } else if (options.depth) {
                command += ` depth ${options.depth}`;
            } else if (!options.infinite) {
                command += ` depth ${this.searchDepth}`;
            }

            if (options.wtime !== undefined) command += ` wtime ${options.wtime}`;
            if (options.btime !== undefined) command += ` btime ${options.btime}`;
            if (options.winc !== undefined) command += ` winc ${options.winc}`;
            if (options.binc !== undefined) command += ` binc ${options.binc}`;
            if (options.movestogo) command += ` movestogo ${options.movestogo}`;

            if (options.infinite) command = 'go infinite';
            if (options.ponder) command += ' ponder';

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
                if (this.onError) this.onError(new Error('Engine not ready'));
                return;
            }

            this.searchId += 1;
            this.activeSearchId = this.searchId;
            this.currentFen = fen;

            this.onBestMove = callback;
            this.setPosition(fen);
            this.go(options);
        }

        getBestMoveAttributed(fen, callback, options = {}) {
            return this.startAttributedOperation('bestmove', fen, callback, options);
        }

        getCandidatesAttributed(fen, callback, options = {}) {
            const candidateCount = Math.max(2, Math.min(5, Number(options.candidateCount) || 3));
            const operationCallback = typeof callback === 'function' ? callback : null;
            if (!operationCallback) return null;
            const generationId = this.startAttributedOperation('candidates', fen, operationCallback,
                { depth: Math.max(1, Math.min(20, Number(options.depth) || 8)), candidateCount });
            return generationId;
        }

        startAnalysis(fen, infoCallback, depth = null) {
            if (!this.ready) {
                if (this.onError) this.onError(new Error('Engine not ready'));
                return;
            }

            this.searchId += 1;
            this.activeSearchId = this.searchId;
            this.currentFen = fen;

            this.stop();
            this.onInfo = infoCallback;
            this.setPosition(fen);
            const options = depth ? { depth } : { depth: 20 };
            this.go(options);
        }

        startAnalysisAttributed(fen, infoCallback, depth = null) {
            const options = depth ? { depth } : { depth: 20 };
            return this.startAttributedOperation('analysis', fen, infoCallback, options);
        }

        stopAnalysis() {
            if (this.attributionEnabled) {
                this.cancelAttributedSearch();
                return;
            }
            this.stop();
            this.onInfo = null;
        }

        eval(fen, callback, depth = 20) {
            if (!this.ready) return;

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
                setTimeout(() => {
                    if (this.engine) {
                        this.engine.terminate();
                        this.engine = null;
                    }
                }, 100);
            }
        }

        terminate() {
            this.invalidateAttributedOperation(this.attributedActive, 'canceled');
            this.invalidateAttributedOperation(this.attributedPending, 'canceled');
            this.attributedActive = null;
            this.attributedPending = null;
            this.attributionBarrierPending = false;
            if (this.engine) {
                this.engine.terminate();
                this.engine = null;
            }
        }
    }

    window.EngineAdapter = EngineAdapter;
})();
