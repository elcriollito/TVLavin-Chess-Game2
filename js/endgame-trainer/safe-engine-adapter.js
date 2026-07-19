import { ChessRulesFacade } from './chess-rules-facade.js';

export const ENGINE_STATES = Object.freeze({
    IDLE: 'idle',
    INITIALIZING: 'initializing',
    READY: 'ready',
    SEARCHING: 'searching',
    STOPPING: 'stopping',
    DISPOSED: 'disposed',
    ERROR: 'error'
});

export class SafeEngineError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SafeEngineError';
        this.code = code;
    }
}

const OPTION_NAMES = Object.freeze({
    multiPv: 'MultiPV',
    skillLevel: 'Skill Level',
    uciLimitStrength: 'UCI_LimitStrength',
    uciElo: 'UCI_Elo',
    threads: 'Threads',
    hash: 'Hash'
});

function engineError(code) {
    return new SafeEngineError(code);
}

function integerInRange(value, minimum, maximum) {
    return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function cloneInfo(info) {
    return info ? { ...info, score: info.score ? { ...info.score } : null, pv: [...info.pv] } : null;
}

function normalizeMessage(event) {
    const value = event && typeof event === 'object' && 'data' in event ? event.data : event;
    return typeof value === 'string' ? value.trim() : '';
}

export function parseUciInfo(message) {
    if (typeof message !== 'string' || !message.startsWith('info ')) return null;
    const value = (name) => {
        const match = message.match(new RegExp(`(?:^|\\s)${name} (-?\\d+)(?:\\s|$)`));
        return match ? Number.parseInt(match[1], 10) : null;
    };
    const scoreMatch = message.match(/(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/);
    const pvMatch = message.match(/(?:^|\s)pv\s+(.+)$/);
    return {
        depth: value('depth'),
        seldepth: value('seldepth'),
        multipv: value('multipv') ?? 1,
        score: scoreMatch ? { type: scoreMatch[1], value: Number.parseInt(scoreMatch[2], 10) } : null,
        nodes: value('nodes'),
        nps: value('nps'),
        time: value('time'),
        pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : []
    };
}

export function parseUciBestMove(message) {
    if (typeof message !== 'string' || !message.startsWith('bestmove ')) return null;
    const match = message.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
    if (!match) return null;
    const normalizeMove = (move) => (!move || move === '0000' || move === '(none)') ? null : move;
    return { bestMove: normalizeMove(match[1]), ponder: normalizeMove(match[2]) };
}

export class SafeEngineAdapter {
    #createEngine;
    #defaultTimeoutMs;
    #logger;
    #initialOptions;
    #engine = null;
    #state = ENGINE_STATES.IDLE;
    #initializationPromise = null;
    #initialization = null;
    #activeRequest = null;
    #pendingRequest = null;
    #readyBarrier = null;
    #requestSequence = 0;
    #generation = 0;
    #engineGeneration = 0;
    #supportedOptions = new Set();
    #detachEngineListeners = null;
    #staleBestMoveCount = 0;
    #replacementPolicy;

    constructor({ createEngine, defaultTimeoutMs = 5000, logger = null, options = {}, replacementPolicy = 'restart-worker' } = {}) {
        if (typeof createEngine !== 'function' || !integerInRange(defaultTimeoutMs, 1, 600000)) {
            throw engineError('invalid-options');
        }
        if (logger !== null && typeof logger !== 'function') throw engineError('invalid-options');
        if (replacementPolicy !== 'restart-worker') throw engineError('invalid-options');
        this.#createEngine = createEngine;
        this.#defaultTimeoutMs = defaultTimeoutMs;
        this.#logger = logger;
        this.#initialOptions = this.#validateEngineOptions(options);
        this.#replacementPolicy = replacementPolicy;
    }

    isReady() {
        return this.#state === ENGINE_STATES.READY;
    }

    getState() {
        return Object.freeze({
            state: this.#state,
            ready: this.isReady(),
            requestId: this.#activeRequest?.requestId ?? null,
            pendingRequestId: this.#pendingRequest?.requestId ?? null,
            generation: this.#generation,
            transportGeneration: this.#engineGeneration,
            staleBestMoveCount: this.#staleBestMoveCount,
            replacementPolicy: this.#replacementPolicy,
            supportedOptions: Object.freeze([...this.#supportedOptions])
        });
    }

    initialize() {
        if (this.#state === ENGINE_STATES.DISPOSED) return Promise.reject(engineError('engine-disposed'));
        if (this.#state === ENGINE_STATES.READY) return Promise.resolve(this.getState());
        return this.#initializeTransport(this.#defaultTimeoutMs, 'engine-initialization-timeout');
    }

    #initializeTransport(timeoutMs, timeoutCode) {
        if (this.#initializationPromise) return this.#initializationPromise;
        this.#state = ENGINE_STATES.INITIALIZING;
        const engineGeneration = ++this.#engineGeneration;
        this.#initializationPromise = new Promise((resolve, reject) => {
            let engine;
            try {
                engine = this.#createEngine();
                if (!engine || typeof engine.postMessage !== 'function') throw new Error();
                this.#engine = engine;
                this.#attachEngine(engine, engineGeneration);
            } catch {
                this.#failInitialization('engine-load-failed', reject);
                return;
            }
            const timer = setTimeout(() => this.#failInitialization(timeoutCode, reject), timeoutMs);
            this.#initialization = { engineGeneration, phase: 'uci', resolve, reject, timer };
            this.#send('uci');
        }).finally(() => {
            this.#initializationPromise = null;
        });
        return this.#initializationPromise;
    }

    async requestBestMove(options) {
        return this.#startSearch('bestmove', options);
    }

    async analyzePosition(options) {
        return this.#startSearch('analysis', options);
    }

    async stop() {
        this.#assertUsable();
        if (!this.#activeRequest) {
            if (this.#readyBarrier) await this.#readyBarrier.promise;
            return this.getState();
        }
        this.#cancelActive('engine-search-cancelled', true);
        await this.#ensureReadyBarrier();
        return this.getState();
    }

    async newGame() {
        this.#assertUsable();
        if (this.#state !== ENGINE_STATES.READY && this.#state !== ENGINE_STATES.SEARCHING) {
            throw engineError('engine-not-ready');
        }
        if (this.#activeRequest) {
            this.#cancelActive('engine-search-cancelled', true);
            await this.#ensureReadyBarrier();
        } else if (this.#readyBarrier) {
            await this.#readyBarrier.promise;
        }
        this.#send('ucinewgame');
        await this.#ensureReadyBarrier();
        return this.getState();
    }

    dispose() {
        if (this.#state === ENGINE_STATES.DISPOSED) return;
        this.#generation += 1;
        if (this.#activeRequest) this.#settleRequest(this.#activeRequest, false, engineError('engine-disposed'));
        if (this.#pendingRequest) this.#settleRequest(this.#pendingRequest, false, engineError('engine-disposed'));
        if (this.#initialization) {
            clearTimeout(this.#initialization.timer);
            this.#initialization.reject(engineError('engine-disposed'));
            this.#initialization = null;
        }
        if (this.#readyBarrier) {
            clearTimeout(this.#readyBarrier.timer);
            this.#readyBarrier.reject(engineError('engine-disposed'));
            this.#readyBarrier = null;
        }
        this.#terminateTransport();
        this.#state = ENGINE_STATES.DISPOSED;
    }

    #startSearch(kind, rawOptions = {}) {
        this.#assertUsable();
        if (this.#state !== ENGINE_STATES.READY && this.#state !== ENGINE_STATES.SEARCHING && this.#state !== ENGINE_STATES.STOPPING) {
            throw engineError('engine-not-ready');
        }
        const options = this.#validateSearchOptions(kind, rawOptions);
        const validated = ChessRulesFacade.validateFen(options.fen);
        if (!validated.valid) throw engineError('invalid-fen');
        if (options.signal?.aborted) throw engineError('engine-search-cancelled');

        const requestId = ++this.#requestSequence;
        const generation = null;
        const startedAt = performance.now();
        let resolvePromise;
        let rejectPromise;
        const promise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        const request = { requestId, generation, kind, fen: validated.fen, options, startedAt, promise, resolve: resolvePromise, reject: rejectPromise, lines: new Map(), lastInfo: null, timer: null, abortHandler: null, settled: false };
        request.deadline = startedAt + options.timeoutMs;
        request.timer = setTimeout(() => {
            if (this.#pendingRequest === request) {
                this.#pendingRequest = null;
                this.#cancelInitialization('engine-search-timeout');
                this.#settleRequest(request, false, engineError('engine-search-timeout'));
            } else if (this.#activeRequest === request && request.generation === this.#generation) {
                this.#cancelActive('engine-search-timeout', true);
                void this.#ensureReadyBarrier().catch(() => {});
            }
        }, options.timeoutMs);
        if (options.signal) {
            request.abortHandler = () => {
                if (this.#pendingRequest === request) {
                    this.#pendingRequest = null;
                    this.#cancelInitialization('engine-search-cancelled');
                    this.#settleRequest(request, false, engineError('engine-search-cancelled'));
                } else if (this.#activeRequest === request) {
                    this.#cancelActive('engine-search-cancelled', true);
                    void this.#ensureReadyBarrier().catch(() => {});
                }
            };
            options.signal.addEventListener('abort', request.abortHandler, { once: true });
        }
        this.#pendingRequest = request;
        void this.#activateRequest(request);
        return request.promise;
    }

    async #activateRequest(request) {
        try {
            if (this.#activeRequest) {
                this.#cancelActive('engine-search-cancelled', true);
                this.#terminateTransport();
                this.#supportedOptions.clear();
                const remainingMs = Math.max(1, Math.ceil(request.deadline - performance.now()));
                await this.#initializeTransport(remainingMs, 'engine-search-timeout');
            } else if (this.#readyBarrier) {
                await this.#readyBarrier.promise;
            }
            if (request.settled || this.#pendingRequest !== request) return;
            this.#assertUsable();
            if (this.#state !== ENGINE_STATES.READY) throw engineError('engine-not-ready');
            this.#pendingRequest = null;
            request.generation = ++this.#generation;
            this.#activeRequest = request;
            this.#state = ENGINE_STATES.SEARCHING;
            this.#applySearchOptions(request.options);
            this.#send(`position fen ${request.fen}`);
            this.#send(this.#buildGoCommand(request.options));
        } catch (error) {
            if (!request.settled) {
                if (this.#pendingRequest === request) this.#pendingRequest = null;
                this.#settleRequest(request, false, error?.code ? error : engineError('engine-load-failed'));
            }
        }
    }

    #handleMessage(message, engineGeneration) {
        if (!message || engineGeneration !== this.#engineGeneration || this.#state === ENGINE_STATES.DISPOSED) return;
        if (message.startsWith('option name ')) this.#recordOption(message);
        if (this.#initialization?.engineGeneration === engineGeneration) {
            if (message === 'uciok' && this.#initialization.phase === 'uci') {
                this.#initialization.phase = 'ready';
                this.#applyEngineOptions(this.#initialOptions);
                this.#send('isready');
                return;
            }
            if (message === 'readyok' && this.#initialization.phase === 'ready') {
                const initialization = this.#initialization;
                this.#initialization = null;
                clearTimeout(initialization.timer);
                this.#state = ENGINE_STATES.READY;
                initialization.resolve(this.getState());
                return;
            }
        }
        if (message === 'readyok' && this.#readyBarrier?.engineGeneration === engineGeneration) {
            const barrier = this.#readyBarrier;
            this.#readyBarrier = null;
            clearTimeout(barrier.timer);
            this.#state = ENGINE_STATES.READY;
            barrier.resolve(this.getState());
            return;
        }
        const request = this.#activeRequest;
        if (!request || request.generation !== this.#generation || this.#state !== ENGINE_STATES.SEARCHING) return;
        const info = parseUciInfo(message);
        if (info) {
            request.lastInfo = cloneInfo(info);
            request.lines.set(info.multipv, cloneInfo(info));
            if (request.kind === 'analysis' && request.options.onInfo) {
                try {
                    request.options.onInfo(Object.freeze(cloneInfo(info)));
                } catch {
                    this.#log('info-callback-failed');
                }
            }
            return;
        }
        const bestMove = parseUciBestMove(message);
        if (!bestMove) return;
        if (bestMove.bestMove && !this.#isLegalBestMove(request.fen, bestMove.bestMove)) {
            this.#staleBestMoveCount += 1;
            request.lastInfo = null;
            request.lines.clear();
            this.#log('stale-bestmove-ignored');
            return;
        }
        const lines = [...request.lines.entries()].sort(([left], [right]) => left - right).map(([, line]) => cloneInfo(line));
        const result = request.kind === 'analysis'
            ? { requestId: request.requestId, fen: request.fen, bestMove: bestMove.bestMove, lines, elapsedMs: performance.now() - request.startedAt, completed: true }
            : { requestId: request.requestId, fen: request.fen, bestMove: bestMove.bestMove, ponder: bestMove.ponder, elapsedMs: performance.now() - request.startedAt, engineInfo: cloneInfo(request.lastInfo), completed: true };
        this.#settleRequest(request, true, Object.freeze(result));
        this.#state = ENGINE_STATES.READY;
    }

    #handleEngineError(engineGeneration) {
        if (engineGeneration !== this.#engineGeneration || this.#state === ENGINE_STATES.DISPOSED) return;
        if (this.#initialization) this.#failInitialization('engine-load-failed', this.#initialization.reject);
        if (this.#activeRequest) this.#settleRequest(this.#activeRequest, false, engineError('engine-protocol-error'));
        if (this.#readyBarrier) {
            const barrier = this.#readyBarrier;
            this.#readyBarrier = null;
            clearTimeout(barrier.timer);
            barrier.reject(engineError('engine-protocol-error'));
        }
        this.#state = ENGINE_STATES.ERROR;
    }

    #attachEngine(engine, engineGeneration) {
        const onMessage = (event) => this.#handleMessage(normalizeMessage(event), engineGeneration);
        const onError = () => this.#handleEngineError(engineGeneration);
        if (typeof engine.addEventListener === 'function') {
            engine.addEventListener('message', onMessage);
            engine.addEventListener('error', onError);
            this.#detachEngineListeners = () => {
                engine.removeEventListener?.('message', onMessage);
                engine.removeEventListener?.('error', onError);
            };
        } else {
            engine.onmessage = onMessage;
            engine.onerror = onError;
            this.#detachEngineListeners = () => {
                if (engine.onmessage === onMessage) engine.onmessage = null;
                if (engine.onerror === onError) engine.onerror = null;
            };
        }
    }

    #ensureReadyBarrier() {
        if (this.#readyBarrier) return this.#readyBarrier.promise;
        if (!this.#engine) return Promise.reject(engineError('engine-not-ready'));
        this.#state = ENGINE_STATES.STOPPING;
        let resolveBarrier;
        let rejectBarrier;
        const promise = new Promise((resolve, reject) => {
            resolveBarrier = resolve;
            rejectBarrier = reject;
        });
        const timer = setTimeout(() => {
            if (!this.#readyBarrier || this.#readyBarrier.promise !== promise) return;
            this.#readyBarrier = null;
            this.#state = ENGINE_STATES.ERROR;
            rejectBarrier(engineError('engine-protocol-error'));
        }, this.#defaultTimeoutMs);
        this.#readyBarrier = { promise, resolve: resolveBarrier, reject: rejectBarrier, timer, engineGeneration: this.#engineGeneration };
        this.#send('isready');
        return promise;
    }

    #cancelActive(code, sendStop) {
        const request = this.#activeRequest;
        if (!request) return;
        this.#generation += 1;
        if (sendStop) this.#send('stop');
        this.#settleRequest(request, false, engineError(code));
        this.#state = ENGINE_STATES.STOPPING;
    }

    #settleRequest(request, completed, value) {
        if (!request || request.settled) return;
        request.settled = true;
        clearTimeout(request.timer);
        if (request.options.signal && request.abortHandler) request.options.signal.removeEventListener('abort', request.abortHandler);
        if (this.#activeRequest === request) this.#activeRequest = null;
        if (this.#pendingRequest === request) this.#pendingRequest = null;
        request.lines.clear();
        if (completed) request.resolve(value);
        else request.reject(value);
    }

    #failInitialization(code, reject) {
        const initialization = this.#initialization;
        if (initialization) clearTimeout(initialization.timer);
        this.#initialization = null;
        this.#terminateTransport();
        this.#state = ENGINE_STATES.ERROR;
        reject(engineError(code));
    }

    #cancelInitialization(code) {
        const initialization = this.#initialization;
        if (!initialization) return;
        clearTimeout(initialization.timer);
        this.#initialization = null;
        this.#terminateTransport();
        this.#state = ENGINE_STATES.ERROR;
        initialization.reject(engineError(code));
    }

    #terminateTransport() {
        const engine = this.#engine;
        this.#engineGeneration += 1;
        this.#detach();
        this.#engine = null;
        if (engine && typeof engine.terminate === 'function') engine.terminate();
    }

    #isLegalBestMove(fen, move) {
        const normalizedMove = typeof move === 'string' ? move.toLowerCase() : '';
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalizedMove)) return false;
        try {
            const appliedMove = ChessRulesFacade.fromFen(fen).move(normalizedMove);
            return appliedMove?.lan === normalizedMove;
        } catch {
            return false;
        }
    }

    #recordOption(message) {
        const match = message.match(/^option name (.+?) type\s/);
        if (match) this.#supportedOptions.add(match[1]);
    }

    #applySearchOptions(options) {
        const requested = {};
        if (options.multiPv !== undefined) requested.multiPv = options.multiPv;
        if (options.skillLevel !== undefined) requested.skillLevel = options.skillLevel;
        if (options.uciElo !== undefined) {
            requested.uciLimitStrength = true;
            requested.uciElo = options.uciElo;
        }
        this.#applyEngineOptions(requested);
    }

    #applyEngineOptions(options) {
        for (const [key, value] of Object.entries(options)) {
            const name = OPTION_NAMES[key];
            if (name && this.#supportedOptions.has(name)) this.#send(`setoption name ${name} value ${value}`);
        }
    }

    #validateEngineOptions(options) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw engineError('invalid-options');
        const result = {};
        for (const [key, value] of Object.entries(options)) {
            if (!(key in OPTION_NAMES)) throw engineError('invalid-options');
            if (key === 'uciLimitStrength') {
                if (typeof value !== 'boolean') throw engineError('invalid-options');
            } else if (!integerInRange(value, 1, key === 'hash' ? 65536 : key === 'uciElo' ? 4000 : 1024)) {
                throw engineError('invalid-options');
            }
            result[key] = value;
        }
        return Object.freeze(result);
    }

    #validateSearchOptions(kind, options) {
        if (!options || typeof options !== 'object' || Array.isArray(options) || typeof options.fen !== 'string') throw engineError('invalid-options');
        const allowed = new Set(['fen', 'depth', 'moveTimeMs', 'skillLevel', 'uciElo', 'signal', 'timeoutMs', ...(kind === 'analysis' ? ['multiPv', 'onInfo'] : [])]);
        if (Object.keys(options).some((key) => !allowed.has(key))) throw engineError('invalid-options');
        if (options.depth !== undefined && !integerInRange(options.depth, 1, 128)) throw engineError('invalid-options');
        if (options.moveTimeMs !== undefined && !integerInRange(options.moveTimeMs, 1, 600000)) throw engineError('invalid-options');
        if (options.depth !== undefined && options.moveTimeMs !== undefined) throw engineError('invalid-options');
        if (options.skillLevel !== undefined && !integerInRange(options.skillLevel, 0, 20)) throw engineError('invalid-options');
        if (options.uciElo !== undefined && !integerInRange(options.uciElo, 1320, 3190)) throw engineError('invalid-options');
        if (options.multiPv !== undefined && !integerInRange(options.multiPv, 1, 10)) throw engineError('invalid-options');
        if (options.onInfo !== undefined && typeof options.onInfo !== 'function') throw engineError('invalid-options');
        if (options.timeoutMs !== undefined && !integerInRange(options.timeoutMs, 1, 600000)) throw engineError('invalid-options');
        if (options.signal !== undefined && (!options.signal || typeof options.signal.addEventListener !== 'function' || typeof options.signal.removeEventListener !== 'function')) throw engineError('invalid-options');
        return Object.freeze({ ...options, depth: options.depth ?? (options.moveTimeMs ? undefined : 15), timeoutMs: options.timeoutMs ?? this.#defaultTimeoutMs });
    }

    #buildGoCommand(options) {
        return options.moveTimeMs ? `go movetime ${options.moveTimeMs}` : `go depth ${options.depth}`;
    }

    #send(command) {
        if (!this.#engine) throw engineError('engine-not-ready');
        this.#engine.postMessage(command);
    }

    #assertUsable() {
        if (this.#state === ENGINE_STATES.DISPOSED) throw engineError('engine-disposed');
    }

    #log(event) {
        if (!this.#logger) return;
        try {
            this.#logger({ event });
        } catch {
            // Logging is observational and cannot affect engine ownership.
        }
    }

    #detach() {
        this.#detachEngineListeners?.();
        this.#detachEngineListeners = null;
    }
}
