import { ChessRulesFacade } from './chess-rules-facade.js';

export class EndgameSessionBoardBindingError extends Error {
    constructor(code, cause) { super(code, { cause }); this.name = 'EndgameSessionBoardBindingError'; this.code = code; }
}

const clone = (value) => value == null ? value : structuredClone(value);
const safe = (callback, value) => { try { callback?.(value); } catch { /* external boundary */ } };

export class EndgameSessionBoardBinding {
    #controller; #board; #callbacks; #rulesFactory; #unsubscribe = null;
    #generation = 0; #operationId = 0; #initialized = false; #disposed = false;
    #projection = { fen: null, sessionId: null, historyLength: 0, orientation: null, thinking: null, interactive: null, lastMove: null, checkSquare: null };
    #state = { loading: null, hint: null, error: null, operation: null, controllerState: null };

    constructor({ controller, boardView, onStateChange, onError, onAnnouncement,
        rulesFactory = (fen) => ChessRulesFacade.fromFen(fen) } = {}) {
        if (!controller || typeof controller.subscribe !== 'function' || !boardView || typeof boardView.setPosition !== 'function')
            throw new EndgameSessionBoardBindingError('invalid-options');
        this.#controller = controller; this.#board = boardView; this.#rulesFactory = rulesFactory;
        this.#callbacks = { onStateChange, onError, onAnnouncement };
    }

    initialize() {
        this.#assertAlive();
        if (this.#initialized) return this;
        this.#board.initialize();
        this.#unsubscribe = this.#controller.subscribe((state) => this.#applyState(state));
        this.#initialized = true;
        this.#applyState(this.#controller.getState());
        return this;
    }

    getState() { return clone({ initialized: this.#initialized, disposed: this.#disposed, ...this.#state }); }
    prepare(options) { return this.#run('preparing', () => this.#controller.prepareSession(options), true); }
    start() { return this.#run('starting', () => this.#controller.startSession()); }
    requestHint(options) { return this.#run('requesting-hint', () => this.#controller.requestHint(options), false, (result) => { this.#state.hint = clone(result); }); }
    undo() { return this.#run('undoing', () => this.#controller.undo(), true); }
    restart() { return this.#run('restarting', () => this.#controller.restart(), true); }
    newPosition(options) { return this.#run('selecting-position', () => this.#controller.newPosition(options), true); }
    resign() { return this.#run('resigning', () => this.#controller.resign(), true); }
    flip() { this.#assertReady(); return this.#controller.flipOrientation(); }

    async handleMoveIntent(move) {
        this.#assertReady();
        const current = this.#controller.getState();
        if (current.status !== 'user-turn' || current.engineThinking) return false;
        const token = this.#token('user-move', current);
        this.#state.loading = 'submitting-move'; this.#notify();
        try {
            const result = await this.#controller.playUserMove(move);
            return this.#owns(token) && result?.ok !== false;
        } catch (error) {
            if (this.#owns(token) && error?.code !== 'stale-operation') this.#report(error?.code || 'invalid-move');
            return false;
        } finally {
            if (this.#owns(token)) { this.#state.loading = null; this.#state.operation = null; this.#notify(); }
        }
    }

    dispose() {
        if (this.#disposed) return;
        this.#disposed = true; this.#generation += 1; this.#unsubscribe?.(); this.#unsubscribe = null;
        try { this.#board.dispose(); } catch { }
        try { this.#controller.dispose(); } catch { }
        this.#initialized = false; this.#state.loading = null; this.#state.operation = null;
    }

    async #run(loading, operation, invalidates = false, commit) {
        this.#assertReady();
        if (this.#state.loading && !invalidates) throw new EndgameSessionBoardBindingError('operation-in-progress');
        if (invalidates) this.#generation += 1;
        const token = this.#token(loading, this.#controller.getState());
        this.#state.loading = loading; this.#state.error = null; this.#notify();
        try {
            const result = await operation();
            if (!this.#owns(token)) throw new EndgameSessionBoardBindingError('stale-operation');
            commit?.(result); return result;
        } catch (error) {
            if (this.#owns(token) && error?.code !== 'stale-operation') this.#report(error?.code || 'operation-failed');
            throw error;
        } finally {
            if (this.#owns(token)) { this.#state.loading = null; this.#state.operation = null; this.#notify(); }
        }
    }

    #token(type, state) {
        const token = { bindingGeneration: this.#generation, sessionId: state.sessionId,
            currentFen: state.currentFen, operationType: type, operationId: ++this.#operationId };
        this.#state.operation = clone(token); return token;
    }
    #owns(token) { return !this.#disposed && token.bindingGeneration === this.#generation; }
    #applyState(state) {
        if (this.#disposed) return;
        const previous = this.#state.controllerState;
        this.#state.controllerState = clone(state);
        const last = state.moveHistory?.at(-1)?.move;
        const historyLength = state.moveHistory?.length ?? 0;
        const incrementalMove = state.sessionId === this.#projection.sessionId && historyLength === this.#projection.historyLength + 1 ? last : null;
        if (state.currentFen && state.currentFen !== this.#projection.fen) { this.#board.setPosition(state.currentFen, incrementalMove); this.#projection.fen = state.currentFen; }
        this.#projection.sessionId = state.sessionId; this.#projection.historyLength = historyLength;
        if (state.orientation && state.orientation !== this.#projection.orientation) { this.#board.setOrientation(state.orientation); this.#projection.orientation = state.orientation; }
        const thinking = Boolean(state.engineThinking);
        if (thinking !== this.#projection.thinking) { this.#board.setThinking(thinking); this.#projection.thinking = thinking; }
        const interactive = state.status === 'user-turn' && !state.engineThinking;
        if (interactive !== this.#projection.interactive) { this.#board.setInteractive(interactive); this.#projection.interactive = interactive; }
        const lastMove = last?.from && last?.to ? { from: last.from, to: last.to, ...(last.promotion ? { promotion: last.promotion } : {}) } : null;
        const lastKey = lastMove ? `${lastMove.from}-${lastMove.to}-${lastMove.promotion ?? ''}` : null;
        if (lastKey !== this.#projection.lastMove) { this.#board.setLastMove(lastMove); this.#projection.lastMove = lastKey; }
        const checkSquare = this.#checkSquare(state.currentFen);
        if (checkSquare !== this.#projection.checkSquare) { this.#board.setCheckSquare(checkSquare); this.#projection.checkSquare = checkSquare; }
        if (previous?.status !== state.status) safe(this.#callbacks.onAnnouncement, this.#announcement(state));
        safe(this.#callbacks.onStateChange, this.getState());
    }
    #checkSquare(fen) {
        if (!fen) return null;
        try { const rules = this.#rulesFactory(fen); return rules.isCheck() ? rules.pieces().find((p) => p.type === 'k' && p.color === rules.sideToMove())?.square ?? null : null; }
        catch { return null; }
    }
    #announcement(state) {
        if (state.status === 'engine-thinking') return 'Engine thinking.';
        if (state.status === 'user-turn') return 'Your turn.';
        if (state.status === 'ready') return 'Session ready.';
        return `Session ${state.status}.`;
    }
    #report(code) { this.#state.error = { code }; safe(this.#callbacks.onError, clone(this.#state.error)); this.#notify(); }
    #notify() { safe(this.#callbacks.onStateChange, this.getState()); }
    #assertAlive() { if (this.#disposed) throw new EndgameSessionBoardBindingError('binding-disposed'); }
    #assertReady() { this.#assertAlive(); if (!this.#initialized) throw new EndgameSessionBoardBindingError('binding-not-initialized'); }
}
