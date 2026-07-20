import { ChessRulesFacade } from './chess-rules-facade.js';
import { selectBestEndgameCandidate } from './endgame-candidate-selector.js';
import { positionKey } from './endgame-fen-utils.js';
import { createInitialSessionState, snapshotSessionState, cloneSessionValue } from './endgame-session-state.js';

export const SESSION_CONTROLLER_VERSION = '1.0.0';
const COLORS = new Set(['white', 'black', 'random']);

class SessionError extends Error {
    constructor(code) { super(code); this.name = 'EndgameSessionError'; this.code = code; }
}

function fail(code) { throw new SessionError(code); }
function opposite(color) { return color === 'white' ? 'black' : 'white'; }
function seededColor(seed) {
    const text = String(seed ?? 'caissa-session');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return (hash >>> 0) % 2 === 0 ? 'white' : 'black';
}
function objectiveFor(classification, candidate, userColor) {
    if (candidate?.metadata?.categoryId === 'KRPvKR') {
        const attacking = userColor === candidate.metadata.strongSide;
        if (attacking) return candidate.metadata.trainingRole === 'attack' ? candidate.metadata.objective : 'Cut off the defending king and improve the rook.';
        return candidate.metadata.trainingRole === 'defense' ? candidate.metadata.objective : 'Use active rook checks to contain the pawn.';
    }
    const type = classification?.type;
    if (type === 'basic-mate-practice') return 'Practice the basic mating technique.';
    if (type === 'opposition-pattern') return 'Explore an opposition pattern.';
    if (type === 'balanced-pawn-endgame') return 'Practice a balanced pawn ending.';
    if (type === 'pawn-defense-practice' || type === 'pawn-conversion-practice') return 'Improve king activity around the pawn.';
    return 'Explore the key ideas in this endgame position.';
}
function normalizeEngineError(error, fallback) {
    if (error?.code === 'stale-operation') return error;
    return new SessionError(fallback);
}

export class EndgameSessionController {
    #createEngineAdapter; #candidateSelector; #rulesFactory; #idFactory; #now; #defaultEngineOptions;
    #engine = null; #rules = null; #state = createInitialSessionState(); #candidate = null;
    #generation = 0; #operationId = 0; #activeOperation = null; #listeners = new Set(); #lastOptions = null;
    #emitting = false;

    constructor({
        createEngineAdapter,
        candidateSelector = selectBestEndgameCandidate,
        rulesFactory = (fen) => ChessRulesFacade.fromFen(fen),
        idFactory = (() => { let id = 0; return () => `endgame-session-${++id}`; })(),
        now = () => Date.now(),
        defaultEngineOptions = {}
    } = {}) {
        if (typeof createEngineAdapter !== 'function' || typeof candidateSelector !== 'function'
            || typeof rulesFactory !== 'function' || typeof idFactory !== 'function' || typeof now !== 'function'
            || !defaultEngineOptions || typeof defaultEngineOptions !== 'object' || Array.isArray(defaultEngineOptions)) fail('invalid-options');
        this.#createEngineAdapter = createEngineAdapter;
        this.#candidateSelector = candidateSelector;
        this.#rulesFactory = rulesFactory;
        this.#idFactory = idFactory;
        this.#now = now;
        this.#defaultEngineOptions = cloneSessionValue(defaultEngineOptions);
    }

    getState() { return snapshotSessionState(this.#state); }
    subscribe(listener) {
        this.#assertAlive();
        if (typeof listener !== 'function') fail('invalid-options');
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    unsubscribe(listener) { this.#listeners.delete(listener); }

    async prepareSession(options = {}) {
        this.#assertAlive();
        if (this.#activeOperation || !['idle', 'completed', 'resigned', 'error'].includes(this.#state.status)) fail('invalid-session-state');
        const normalized = this.#validatePrepareOptions(options);
        const generation = ++this.#generation;
        this.#setState({ status: 'preparing', error: null, engineThinking: false });
        try {
            if (generation !== this.#generation) fail('stale-operation');
            const selection = await this.#candidateSelector({
                categoryId: normalized.categoryId, seed: normalized.seed, candidateCount: normalized.candidateCount,
                minimumScore: normalized.minimumScore, recentPositionKeys: normalized.recentPositionKeys,
                generatorOptions: normalized.generatorOptions
            });
            if (generation !== this.#generation) fail('stale-operation');
            if (!selection?.ok || !selection.selected?.fen) fail(selection?.error?.code === 'unknown-category' ? 'unknown-category' : 'candidate-selection-failed');
            const rules = this.#rulesFactory(selection.selected.fen);
            const userColor = normalized.userColor === 'random' ? seededColor(normalized.seed) : normalized.userColor;
            await this.#ensureEngine({ ...this.#defaultEngineOptions, ...normalized.engineOptions });
            if (generation !== this.#generation) fail('stale-operation');
            const sessionId = this.#idFactory();
            if (typeof sessionId !== 'string' || !sessionId.trim()) fail('invalid-options');
            this.#rules = rules;
            this.#candidate = cloneSessionValue(selection.selected);
            this.#lastOptions = cloneSessionValue(normalized);
            const fen = rules.fen();
            this.#state = {
                ...createInitialSessionState(), status: 'ready', sessionId, categoryId: normalized.categoryId,
                initialFen: fen, currentFen: fen, positionKey: positionKey(fen), userColor, engineColor: opposite(userColor),
                sideToMove: rules.sideToMove(), orientation: userColor, objective: objectiveFor(selection.selected.classification, selection.selected, userColor),
                classification: cloneSessionValue(selection.selected.classification), score: selection.selected.scoring?.score ?? null,
                attemptNumber: 1, versions: { ...createInitialSessionState().versions, controller: SESSION_CONTROLLER_VERSION }, error: null
            };
            this.#emit();
            return this.getState();
        } catch (error) {
            const normalizedError = error instanceof SessionError ? error : new SessionError('candidate-selection-failed');
            if (generation === this.#generation && this.#state.status !== 'disposed') {
                this.#state.status = 'error';
                this.#state.engineThinking = false;
                this.#state.error = { code: normalizedError.code };
                this.#emit();
            }
            throw normalizedError;
        }
    }

    async startSession() {
        this.#assertAlive();
        if (this.#state.status !== 'ready') fail('invalid-session-state');
        if (this.#rules.sideToMove() === this.#state.userColor) {
            this.#setState({ status: 'user-turn', sideToMove: this.#rules.sideToMove() });
            return this.getState();
        }
        return this.#requestEngineMove();
    }

    getLegalMoves(square) {
        this.#assertAlive();
        if (!this.#rules || !['ready', 'user-turn'].includes(this.#state.status)) fail('invalid-session-state');
        if (square !== undefined && (typeof square !== 'string' || !/^[a-h][1-8]$/.test(square))) fail('invalid-options');
        return cloneSessionValue(this.#rules.legalMoves(square ? { square, verbose: true } : { verbose: true }));
    }

    async playUserMove(move) {
        this.#assertAlive();
        if (this.#state.status === 'completed') fail('session-completed');
        if (this.#state.status === 'resigned') fail('session-resigned');
        if (this.#state.status !== 'user-turn') fail(this.#state.engineThinking ? 'not-user-turn' : 'invalid-session-state');
        if (this.#activeOperation?.type === 'hint') await this.#invalidateOperations();
        else if (this.#activeOperation) fail('invalid-session-state');
        if (this.#promotionRequired(move)) fail('promotion-required');
        let applied;
        try { applied = this.#rules.move(move); }
        catch {
            fail('invalid-move');
        }
        this.#recordMove(applied, 'user');
        if (this.#completeIfTerminal()) return { ok: true, move: cloneSessionValue(applied), state: this.getState() };
        await this.#requestEngineMove();
        return { ok: true, move: cloneSessionValue(applied), state: this.getState() };
    }

    async requestHint(options = {}) {
        this.#assertAlive();
        if (this.#state.status !== 'user-turn') fail('invalid-session-state');
        if (this.#activeOperation) fail('invalid-session-state');
        const token = this.#beginOperation('hint');
        try {
            const result = this.#engine.analyzePosition
                ? await this.#engine.analyzePosition({ fen: token.fen, ...cloneSessionValue(options) })
                : await this.#engine.requestBestMove({ fen: token.fen, ...cloneSessionValue(options) });
            this.#assertCurrent(token);
            if (result?.fen && result.fen !== token.fen) fail('hint-failed');
            const suggestedMove = result?.bestMove ?? result?.suggestedMove;
            if (!suggestedMove || !this.#isLegalOnFen(token.fen, suggestedMove)) fail('hint-failed');
            this.#state.hintsUsed += 1;
            this.#emit();
            return { requestId: result.requestId ?? token.operationId, fen: token.fen, suggestedMove, lines: cloneSessionValue(result.lines ?? []), completed: true };
        } catch (error) {
            if (!this.#isTokenCurrent(token)) fail('stale-operation');
            throw normalizeEngineError(error, 'hint-failed');
        } finally { this.#endOperation(token); }
    }

    async undo() {
        this.#assertAlive();
        if (this.#state.status === 'resigned') fail('session-resigned');
        if (!this.#rules || !this.#state.moveHistory.length) fail('invalid-session-state');
        await this.#invalidateOperations();
        const count = Math.min(2, this.#state.moveHistory.length);
        for (let index = 0; index < count; index += 1) this.#rules.undo();
        this.#state.moveHistory.splice(-count, count);
        this.#state.undosUsed += 1;
        this.#state.currentFen = this.#rules.fen();
        this.#state.positionKey = positionKey(this.#state.currentFen);
        this.#state.sideToMove = this.#rules.sideToMove();
        this.#state.status = this.#state.sideToMove === this.#state.userColor ? 'user-turn' : 'ready';
        this.#state.result = null;
        this.#emit();
        return this.getState();
    }

    async restart() {
        this.#assertAlive();
        if (!this.#rules || this.#state.status === 'idle') fail('invalid-session-state');
        await this.#invalidateOperations();
        this.#rules = this.#rulesFactory(this.#state.initialFen);
        this.#state.currentFen = this.#rules.fen();
        this.#state.positionKey = positionKey(this.#state.currentFen);
        this.#state.sideToMove = this.#rules.sideToMove();
        this.#state.moveHistory = [];
        this.#state.attemptNumber += 1;
        this.#state.result = null;
        this.#state.error = null;
        this.#state.status = 'ready';
        this.#state.engineThinking = false;
        this.#emit();
        return this.startSession();
    }

    async newPosition(options = {}) {
        this.#assertAlive();
        if (!this.#lastOptions) fail('invalid-session-state');
        if (!options || typeof options !== 'object' || Array.isArray(options)) fail('invalid-options');
        await this.#invalidateOperations();
        this.#state.status = 'idle';
        const overrides = cloneSessionValue(options);
        const merged = { ...cloneSessionValue(this.#lastOptions) };
        for (const [key, value] of Object.entries(overrides)) if (value !== undefined) merged[key] = value;
        if (overrides.engineOptions !== undefined && overrides.engineOptions !== null) {
            merged.engineOptions = { ...cloneSessionValue(this.#lastOptions.engineOptions), ...overrides.engineOptions };
        }
        return this.prepareSession(merged);
    }

    async resign() {
        this.#assertAlive();
        if (this.#state.status === 'resigned') return this.getState();
        if (!this.#rules || ['idle', 'preparing'].includes(this.#state.status)) fail('invalid-session-state');
        await this.#invalidateOperations();
        this.#setState({ status: 'resigned', engineThinking: false, result: { gameResult: 'resignation', exerciseOutcome: 'resigned', at: this.#now() } });
        return this.getState();
    }

    flipOrientation() {
        this.#assertAlive();
        if (this.#emitting) fail('invalid-session-state');
        if (!this.#rules) fail('invalid-session-state');
        this.#setState({ orientation: opposite(this.#state.orientation) });
        return this.getState();
    }

    dispose() {
        if (this.#state.status === 'disposed') return;
        this.#generation += 1;
        this.#activeOperation = null;
        try { this.#engine?.dispose(); } catch { /* Disposal is best effort. */ }
        this.#engine = null;
        this.#rules = null;
        this.#state.status = 'disposed';
        this.#state.engineThinking = false;
        this.#state.result ??= { gameResult: 'aborted', exerciseOutcome: 'aborted', at: this.#now() };
        this.#listeners.clear();
    }

    async #ensureEngine(options) {
        if (!this.#engine) {
            this.#engine = this.#createEngineAdapter(cloneSessionValue(options));
            if (!this.#engine || typeof this.#engine.initialize !== 'function') fail('engine-not-ready');
        }
        try { await this.#engine.initialize(); }
        catch { fail('engine-not-ready'); }
    }
    #validatePrepareOptions(options) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) fail('invalid-options');
        const categoryId = options.categoryId;
        const userColor = options.userColor ?? 'random';
        if (typeof categoryId !== 'string' || !categoryId) fail('invalid-options');
        if (!COLORS.has(userColor)) fail('invalid-user-color');
        if (options.engineOptions !== undefined && (!options.engineOptions || typeof options.engineOptions !== 'object' || Array.isArray(options.engineOptions))) fail('invalid-options');
        if (options.generatorOptions !== undefined && (!options.generatorOptions || typeof options.generatorOptions !== 'object' || Array.isArray(options.generatorOptions))) fail('invalid-options');
        return {
            categoryId, userColor, seed: options.seed ?? 'caissa-session', candidateCount: options.candidateCount ?? 12,
            minimumScore: options.minimumScore, recentPositionKeys: cloneSessionValue(options.recentPositionKeys ?? []),
            engineOptions: cloneSessionValue(options.engineOptions ?? {}), generatorOptions: cloneSessionValue(options.generatorOptions ?? {})
        };
    }
    async #requestEngineMove() {
        const token = this.#beginOperation('engine-move');
        this.#setState({ status: 'engine-thinking', engineThinking: true });
        try {
            const result = await this.#engine.requestBestMove({ fen: token.fen });
            this.#assertCurrent(token);
            if (result?.fen && result.fen !== token.fen) fail('engine-move-failed');
            if (!result?.bestMove) fail('engine-move-failed');
            let applied;
            try { applied = this.#rules.move(result.bestMove); } catch { fail('engine-move-failed'); }
            this.#recordMove(applied, 'engine');
            if (!this.#completeIfTerminal()) this.#setState({ status: 'user-turn', engineThinking: false });
            return this.getState();
        } catch (error) {
            if (!this.#isTokenCurrent(token)) fail('stale-operation');
            this.#state.status = 'error';
            this.#state.engineThinking = false;
            this.#state.error = { code: 'engine-move-failed' };
            this.#state.result = { gameResult: 'engine-error', exerciseOutcome: 'unknown', at: this.#now() };
            this.#emit();
            throw normalizeEngineError(error, 'engine-move-failed');
        } finally { this.#endOperation(token); }
    }
    #beginOperation(type) {
        if (this.#activeOperation) fail('invalid-session-state');
        const token = { type, operationId: ++this.#operationId, generation: this.#generation, sessionId: this.#state.sessionId, fen: this.#rules.fen() };
        this.#activeOperation = token;
        return token;
    }
    #endOperation(token) { if (this.#activeOperation === token) this.#activeOperation = null; }
    #isTokenCurrent(token) {
        return token.generation === this.#generation && token.sessionId === this.#state.sessionId
            && token.fen === this.#rules?.fen() && this.#activeOperation === token;
    }
    #assertCurrent(token) { if (!this.#isTokenCurrent(token)) fail('stale-operation'); }
    async #invalidateOperations() {
        this.#generation += 1;
        const active = this.#activeOperation;
        this.#activeOperation = null;
        if (active) { try { await this.#engine?.stop?.(); } catch { /* The generation owns cancellation. */ } }
    }
    #recordMove(move, actor) {
        this.#state.moveHistory.push({ actor, move: cloneSessionValue(move), fen: this.#rules.fen(), at: this.#now() });
        this.#state.currentFen = this.#rules.fen();
        this.#state.positionKey = positionKey(this.#state.currentFen);
        this.#state.sideToMove = this.#rules.sideToMove();
        this.#state.engineThinking = false;
        this.#emit();
    }
    #completeIfTerminal() {
        if (!this.#rules.isGameOver()) return false;
        let gameResult = 'draw';
        if (this.#rules.isCheckmate()) gameResult = 'checkmate';
        else if (this.#rules.isStalemate()) gameResult = 'stalemate';
        else if (this.#rules.isInsufficientMaterial()) gameResult = 'insufficient-material';
        const lastActor = this.#state.moveHistory.at(-1)?.actor;
        const exerciseOutcome = gameResult === 'checkmate' && lastActor === 'user' && ['KQK', 'KRK'].includes(this.#state.categoryId) ? 'completed' : 'unknown';
        this.#state.status = 'completed';
        this.#state.engineThinking = false;
        this.#state.result = { gameResult, exerciseOutcome, at: this.#now() };
        this.#emit();
        return true;
    }
    #promotionRequired(move) {
        if (typeof move !== 'string' || !/^[a-h][1-8][a-h][18]$/.test(move)) return false;
        const [from, to] = [move.slice(0, 2), move.slice(2, 4)];
        return this.#rules.legalMoves({ square: from, verbose: true }).some((candidate) => candidate.to === to && candidate.promotion);
    }
    #isLegalOnFen(fen, move) { try { this.#rulesFactory(fen).move(move); return true; } catch { return false; } }
    #setState(patch) { Object.assign(this.#state, cloneSessionValue(patch)); this.#emit(); }
    #emit() {
        if (this.#emitting || this.#state.status === 'disposed') return;
        this.#emitting = true;
        const snapshot = this.getState();
        try {
            for (const listener of [...this.#listeners]) {
                if (this.#state.status === 'disposed') break;
                try { listener(snapshotSessionState(snapshot)); } catch { /* Observers cannot corrupt domain state. */ }
            }
        } finally { this.#emitting = false; }
    }
    #assertAlive() { if (this.#state.status === 'disposed') fail('session-disposed'); }
}
