import { CaissaBoardInteraction } from '../caissa-board-interaction.js';

export class EndgameBoardViewError extends Error {
    constructor(code, cause) { super(code, { cause }); this.name = 'EndgameBoardViewError'; this.code = code; }
}

const FILES = 'abcdefgh';
const SQUARE_PATTERN = /^[a-h][1-8]$/;
const ORIENTATIONS = new Set(['white', 'black']);
const HIGHLIGHT_CLASSES = [
    'et-board-selected', 'et-board-legal', 'et-board-capture', 'et-board-last',
    'et-board-check', 'et-board-pending'
];

function isElement(value) {
    if (typeof globalThis.HTMLElement === 'function' && !(value instanceof globalThis.HTMLElement)) return false;
    return value && typeof value.querySelector === 'function' &&
        typeof value.querySelectorAll === 'function' && typeof value.addEventListener === 'function';
}

function safeCall(callback, value) { try { callback?.(value); } catch { /* callbacks are isolation boundaries */ } }

export function detectTouchCapability(environment = globalThis) {
    const points = Number(environment.navigator?.maxTouchPoints) || 0;
    let coarse = false;
    try { coarse = environment.matchMedia?.('(any-pointer: coarse)')?.matches === true; } catch { /* optional capability */ }
    return points > 0 || coarse;
}

export function createChessboardJsBoard(element, options = {}) {
    const factory = globalThis.Chessboard;
    if (typeof factory !== 'function') throw new EndgameBoardViewError('board-library-unavailable');
    const board = factory(element, options);
    if (!board) throw new EndgameBoardViewError('board-initialization-failed');
    return board;
}

export class EndgameBoardView {
    #element;
    #createBoard;
    #rulesFactory;
    #callbacks;
    #options;
    #board = null;
    #rules = null;
    #interaction = null;
    #abort = null;
    #observer = null;
    #frame = null;
    #pointerStart = null;
    #pendingVisualMove = null;
    #touchCapable = false;
    #state;

    constructor({ element, createBoard = createChessboardJsBoard, rulesFactory, promotionResolver,
        onMove, onSelectionChange, onError, onAnnouncement, options = {} } = {}) {
        if (!isElement(element)) throw new EndgameBoardViewError('invalid-element');
        this.#element = element;
        this.#createBoard = createBoard;
        this.#rulesFactory = rulesFactory;
        this.#callbacks = { promotionResolver, onMove, onSelectionChange, onError, onAnnouncement };
        this.#options = { label: 'Endgame training board', resizeObserver: true, touchDetector: detectTouchCapability, ...options };
        this.#state = {
            initialized: false, disposed: false, fen: null, orientation: 'white', interactive: true,
            thinking: false, submitting: false, selectedSquare: null, legalTargets: [], lastMove: null,
            checkSquare: null, pendingPromotion: null, inputMode: null, focusedSquare: 'a1', version: 0,
            mountCount: 0, fullPositionRenderCount: 0, incrementalMoveCount: 0
        };
    }

    initialize() {
        this.#assertAlive();
        if (this.#state.initialized) return this;
        if (typeof this.#createBoard !== 'function' || typeof this.#rulesFactory !== 'function')
            throw new EndgameBoardViewError('board-library-unavailable');
        this.#abort = new AbortController();
        this.#touchCapable = this.#options.touchDetector(globalThis) === true;
        const config = {
            draggable: !this.#touchCapable, position: this.#state.fen || 'start', orientation: this.#state.orientation,
            onDragStart: (source, piece) => this.#interaction?.canStart(source, piece) ?? false,
            onDrop: (from, to) => this.#interaction?.beginDrop(from, to) ? undefined : 'snapback',
            ...(this.#options.board || {})
        };
        try {
            this.#board = this.#createBoard(this.#element, config);
            if (!this.#board) throw new Error('empty-board');
            this.#rules = this.#rulesFactory(this.#state.fen);
            this.#interaction = new CaissaBoardInteraction({
                rules: this.#rules, boardView: this, onMove: this.#callbacks.onMove,
                promotionResolver: this.#callbacks.promotionResolver
            });
            this.#state.initialized = true;
            this.#state.mountCount += 1;
            this.#configureRoot();
            this.#attachEvents();
            this.#setupResize();
            this.#syncDom();
            return this;
        } catch (error) {
            this.#cleanupPartial();
            if (error instanceof EndgameBoardViewError) throw error;
            throw new EndgameBoardViewError('board-initialization-failed', error);
        }
    }

    setPosition(fen, move = null) {
        this.#assertReady();
        let rules;
        try { rules = this.#rulesFactory(fen); } catch (error) { throw new EndgameBoardViewError('invalid-fen', error); }
        if (!rules || typeof rules.fen !== 'function') throw new EndgameBoardViewError('invalid-fen');
        const normalized = rules.fen();
        if (normalized === this.#state.fen) return normalized;
        const previousFen = this.#state.fen;
        this.#interaction.invalidate();
        this.#rules = rules;
        this.#interaction.setRules(rules);
        this.#state.fen = normalized;
        this.#state.submitting = false;
        this.#state.pendingPromotion = null;
        this.#state.version += 1;
        this.setSelectedSquare(null);
        if (previousFen && move?.from && move?.to) {
            const key = `${move.from}-${move.to}`;
            const alreadyRendered = this.#pendingVisualMove?.key === key && this.#pendingVisualMove.rendered;
            const needsPositionDiff = Boolean(move.promotion) || /[ekq]/.test(move.flags ?? '');
            if (needsPositionDiff) this.#board.position(normalized, true);
            else if (!alreadyRendered) this.#board.move?.(key, false);
            this.#state.incrementalMoveCount += 1;
        } else {
            this.#board.position(normalized, false);
            this.#state.fullPositionRenderCount += 1;
        }
        this.#pendingVisualMove = null;
        this.#syncDom();
        return normalized;
    }

    getPosition() { this.#assertAlive(); return this.#state.fen; }
    setOrientation(color) {
        this.#assertReady();
        if (!ORIENTATIONS.has(color)) throw new EndgameBoardViewError('invalid-orientation');
        this.#state.orientation = color; this.#board.orientation(color); this.#syncDom(); return color;
    }
    flip() { return this.setOrientation(this.#state.orientation === 'white' ? 'black' : 'white'); }
    setInteractive(enabled) { this.#assertReady(); this.#state.interactive = Boolean(enabled); if (!enabled) this.setSelectedSquare(null); this.#syncDom(); }
    setThinking(thinking) { this.#assertReady(); this.#state.thinking = Boolean(thinking); if (thinking) this.setSelectedSquare(null); this.#syncDom(); }
    setLastMove(move) { this.#assertReady(); this.#state.lastMove = move ? { from: move.from, to: move.to } : null; this.#syncHighlights(); }
    setCheckSquare(square = null) { this.#assertReady(); if (square && !SQUARE_PATTERN.test(square)) throw new EndgameBoardViewError('invalid-move'); this.#state.checkSquare = square; this.#syncHighlights(); }
    clearHighlights() { this.#assertReady(); this.#state.lastMove = null; this.#state.checkSquare = null; this.setSelectedSquare(null); this.#syncHighlights(); }
    focusSquare(square) { this.#assertReady(); if (!SQUARE_PATTERN.test(square)) throw new EndgameBoardViewError('invalid-move'); this.#state.focusedSquare = square; this.#syncAccessibility(); this.#square(square)?.focus?.(); }
    resize() { this.#assertReady(); this.#board.resize?.(); this.#syncDom(); }
    getState() { return structuredClone(this.#state); }
    canInteract() { return this.#state.initialized && !this.#state.disposed && this.#state.interactive && !this.#state.thinking && !this.#state.submitting; }
    restoreControlledPosition() { return this.#state.fen; }
    setPendingVisualMove(move, rendered = false) { this.#pendingVisualMove = move?.from && move?.to ? { key: `${move.from}-${move.to}`, rendered: Boolean(rendered) } : null; }
    rollbackPendingVisualMove() { if (this.#pendingVisualMove?.rendered && this.#state.fen) this.#board.position(this.#state.fen, false); this.#pendingVisualMove = null; }
    reportError(code, cause) { safeCall(this.#callbacks.onError, Object.freeze({ code, cause })); }

    setSubmitting(value, move = null) {
        this.#state.submitting = Boolean(value); this.#state.pendingPromotion = value && move ? { ...move } : null; this.#syncDom();
    }

    setSelectedSquare(square, moves = []) {
        if (square && !SQUARE_PATTERN.test(square)) throw new EndgameBoardViewError('invalid-move');
        this.#state.selectedSquare = square;
        this.#state.legalTargets = moves.map((move) => ({ to: move.to, capture: Boolean(move.capture) }));
        safeCall(this.#callbacks.onSelectionChange, square);
        if (square) this.#announce(`${square} selected. ${moves.length} legal moves available.`);
        this.#syncHighlights();
    }

    dispose() {
        if (this.#state.disposed) return;
        this.#state.disposed = true; this.#state.initialized = false; this.#state.version += 1;
        this.#pointerStart = null; this.#pendingVisualMove = null;
        this.#interaction?.dispose(); this.#abort?.abort(); this.#observer?.disconnect?.();
        if (this.#frame !== null) (globalThis.cancelAnimationFrame || clearTimeout)(this.#frame);
        this.#clearDomClasses();
        try { this.#board?.destroy?.(); } catch { /* best effort cleanup */ }
        this.#board = null; this.#rules = null; this.#interaction = null; this.#observer = null;
    }

    #configureRoot() {
        this.#element.setAttribute('role', 'grid');
        this.#element.setAttribute('aria-label', this.#options.label);
        this.#element.setAttribute('data-input-mode', this.#touchCapable ? 'tap' : 'pointer');
    }
    #attachEvents() {
        const signal = this.#abort.signal;
        this.#element.addEventListener('pointerdown', (event) => {
            const square = this.#closestSquare(event.target);
            if (!square || event.isPrimary === false) return;
            this.#pointerStart = {
                square, pointerId: event.pointerId,
                x: Number(event.clientX) || 0, y: Number(event.clientY) || 0
            };
            try { this.#element.setPointerCapture?.(event.pointerId); } catch { /* optional browser capability */ }
        }, { signal });
        this.#element.addEventListener('pointerup', (event) => {
            const start = this.#pointerStart;
            this.#pointerStart = null;
            if (!start || (event.pointerId !== undefined && event.pointerId !== start.pointerId)) return;
            const distance = Math.hypot((Number(event.clientX) || 0) - start.x, (Number(event.clientY) || 0) - start.y);
            const square = this.#closestSquare(event.target) || start.square;
            if (distance <= 10 && square) {
                this.#state.inputMode = 'tap'; this.#state.focusedSquare = square;
                void this.#interaction.activate(square);
            }
        }, { signal });
        this.#element.addEventListener('pointercancel', () => { this.#pointerStart = null; }, { signal });
        this.#element.addEventListener('click', (event) => {
            if (event.detail !== undefined && event.detail !== 0) return;
            const square = this.#closestSquare(event.target);
            if (square) { this.#state.inputMode = 'tap'; this.#state.focusedSquare = square; void this.#interaction.activate(square); }
        }, { signal });
        this.#element.addEventListener('keydown', (event) => this.#onKeydown(event), { signal });
    }
    #setupResize() {
        if (!this.#options.resizeObserver || typeof globalThis.ResizeObserver !== 'function') return;
        this.#observer = new globalThis.ResizeObserver(() => {
            if (this.#frame !== null) return;
            const raf = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
            this.#frame = raf(() => { this.#frame = null; if (!this.#state.disposed) this.resize(); });
        });
        this.#observer.observe(this.#element);
    }
    #onKeydown(event) {
        if (event.key === 'Escape') { event.preventDefault(); this.setSelectedSquare(null); this.focusSquare(this.#state.focusedSquare); return; }
        if (!this.canInteract()) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); this.#state.inputMode = 'keyboard'; void this.#interaction.activate(this.#state.focusedSquare); return;
        }
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
        if (!directions[event.key]) return;
        event.preventDefault();
        let [df, dr] = directions[event.key];
        if (this.#state.orientation === 'black') { df *= -1; dr *= -1; }
        const current = this.#state.focusedSquare;
        const file = Math.max(0, Math.min(7, FILES.indexOf(current[0]) + df));
        const rank = Math.max(1, Math.min(8, Number(current[1]) + dr));
        this.focusSquare(`${FILES[file]}${rank}`);
    }
    #syncDom() {
        this.#element.setAttribute('aria-orientation', this.#state.orientation);
        this.#element.setAttribute('aria-disabled', String(!this.canInteract()));
        this.#element.setAttribute('aria-busy', String(this.#state.thinking || this.#state.submitting));
        this.#element.classList?.toggle('et-board-disabled', !this.canInteract());
        this.#syncHighlights(); this.#syncAccessibility();
    }
    #syncHighlights() {
        for (const node of this.#element.querySelectorAll('.square-55d63')) for (const name of HIGHLIGHT_CLASSES) node.classList?.remove(name);
        if (this.#state.selectedSquare) this.#square(this.#state.selectedSquare)?.classList?.add('et-board-selected');
        for (const target of this.#state.legalTargets) this.#square(target.to)?.classList?.add(target.capture ? 'et-board-capture' : 'et-board-legal');
        for (const square of [this.#state.lastMove?.from, this.#state.lastMove?.to]) if (square) this.#square(square)?.classList?.add('et-board-last');
        if (this.#state.checkSquare) this.#square(this.#state.checkSquare)?.classList?.add('et-board-check');
        if (this.#state.pendingPromotion?.from) this.#square(this.#state.pendingPromotion.from)?.classList?.add('et-board-pending');
        if (this.#state.pendingPromotion?.to) this.#square(this.#state.pendingPromotion.to)?.classList?.add('et-board-pending');
        this.#syncAccessibility();
    }
    #syncAccessibility() {
        const pieces = new Map((this.#rules?.pieces?.() || []).map((piece) => [piece.square, piece]));
        for (const node of this.#element.querySelectorAll('.square-55d63')) {
            const square = this.#squareName(node); if (!square) continue;
            node.setAttribute('role', 'gridcell'); node.setAttribute('tabindex', square === this.#state.focusedSquare ? '0' : '-1');
            const piece = pieces.get(square); const target = this.#state.legalTargets.find((item) => item.to === square);
            const label = piece ? `${piece.color} ${this.#pieceName(piece.type)} on ${square}` : `Empty square ${square}`;
            node.setAttribute('aria-label', target ? `${label}. Legal destination ${square}` : label);
        }
    }
    #pieceName(type) { return ({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' })[type] || 'piece'; }
    #square(square) { return this.#element.querySelector(`.square-${square}`); }
    #squareName(node) { const value = [...(node.classList || [])].find((name) => /^square-[a-h][1-8]$/.test(name)); return value?.slice(7) || null; }
    #closestSquare(node) { while (node && node !== this.#element) { const square = this.#squareName(node); if (square) return square; node = node.parentNode; } return null; }
    #announce(message) { safeCall(this.#callbacks.onAnnouncement, message); }
    #clearDomClasses() { this.#element.classList?.remove('et-board-disabled'); for (const node of this.#element.querySelectorAll('.square-55d63')) for (const name of HIGHLIGHT_CLASSES) node.classList?.remove(name); }
    #cleanupPartial() { this.#abort?.abort(); try { this.#board?.destroy?.(); } catch {} this.#board = null; this.#rules = null; this.#interaction = null; }
    #assertAlive() { if (this.#state.disposed) throw new EndgameBoardViewError('board-disposed'); }
    #assertReady() { this.#assertAlive(); if (!this.#state.initialized) throw new EndgameBoardViewError('board-initialization-failed'); }
}

/**
 * Future controller contract: state enters through setPosition/orientation/thinking/
 * lastMove/checkSquare/interactive; only immutable move intents leave through onMove.
 */
