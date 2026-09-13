import { create as createBoardAdapter } from './board/caissa-board-adapter.js';

const BOARD_STYLESHEET_URL = '/css/caissa-board.css?v=1.0.0';

function ensureBoardStylesheet() {
    if (typeof document === 'undefined') return Promise.resolve();
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find(link => new URL(link.href, document.baseURI).pathname === '/css/caissa-board.css');
    if (existing?.sheet) return Promise.resolve();
    const link = existing || Object.assign(document.createElement('link'), {
        rel: 'stylesheet', href: BOARD_STYLESHEET_URL
    });
    const ready = new Promise((resolve, reject) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', () => reject(new Error('Analyze board stylesheet failed to load.')), { once: true });
    });
    if (!existing) document.head.append(link);
    return ready;
}

export const stylesReady = ensureBoardStylesheet();

function semanticMove(move) {
    const flags = String(move?.flags || '');
    const projected = { from: move?.from, to: move?.to };
    if (move?.captured || flags.includes('c')) projected.capture = true;
    if (flags.includes('e')) projected.enPassant = true;
    if (flags.includes('k') || flags.includes('q')) projected.castle = true;
    if (move?.promotion || flags.includes('p')) projected.promotion = String(move?.promotion || 'q').toUpperCase();
    return projected;
}

function classificationType(classification) {
    if (classification === 'Blunder' || classification === 'Mistake') return 'error';
    if (classification === 'Inaccuracy') return 'hint';
    return null;
}

export class AnalyzeBoardProjection {
    constructor(container, options = {}) {
        if (!container) throw new TypeError('Analyze board container is required.');
        this.container = container;
        this.callbacks = { ...options };
        this.mode = 'analysis';
        this.lastMove = null;
        this.classification = null;
        this.legalSquares = [];
        this.selectedSquare = null;
        this.pointerEndedOutside = false;
        this.moveAttemptTapTarget = null;
        this.stats = {
            positionSets: 0,
            semanticMoves: 0,
            semanticFallbacks: 0,
            moveAttempts: 0,
            squareTaps: 0
        };

        this.adapter = createBoardAdapter(container, {
            label: 'CAISSA Analyze interactive chessboard',
            position: options.position || 'start',
            orientation: options.orientation === 'black' ? 'black' : 'white',
            interactive: true,
            readOnly: false,
            animation: options.animation !== false,
            animationDuration: 180,
            onSquareTap: square => {
                this.stats.squareTaps += 1;
                queueMicrotask(() => {
                    if (this.moveAttemptTapTarget === square) {
                        this.moveAttemptTapTarget = null;
                        return;
                    }
                    this.callbacks.onSquareTap?.(square);
                });
            },
            onMoveAttempt: payload => {
                this.stats.moveAttempts += 1;
                if (payload?.inputMethod !== 'drag') this.moveAttemptTapTarget = payload?.to || null;
                this.callbacks.onMoveAttempt?.(payload);
            },
            onDragStart: square => this.callbacks.onDragStart?.(square) !== false,
            onDragEnd: payload => {
                this.callbacks.onDragEnd?.({
                    ...payload,
                    offboard: payload.cancelled === true && this.pointerEndedOutside === true
                });
                this.pointerEndedOutside = false;
            },
            onError: error => this.callbacks.onError?.(error)
        });

        const root = container.querySelector('.caissa-board');
        root?.setAttribute('aria-readonly', 'false');
        root?.addEventListener('pointerdown', () => { this.pointerEndedOutside = false; }, true);
        root?.addEventListener('pointercancel', () => { this.pointerEndedOutside = false; }, true);
        root?.addEventListener('pointerup', event => {
            const rect = root.getBoundingClientRect();
            this.pointerEndedOutside = event.clientX < rect.left || event.clientX > rect.right
                || event.clientY < rect.top || event.clientY > rect.bottom;
        }, true);
    }

    setPosition(fen, options = {}) {
        const result = this.adapter.setPosition(fen, { animate: options.animate === true, coalesce: options.coalesce === true });
        this.stats.positionSets += 1;
        this.setOverlayState(options);
        this.container.dataset.analyzeBoardStrategy = result?.status === 'unchanged' ? 'identical' : 'position';
        return result;
    }

    applyMove(move, fen, options = {}) {
        let result = this.adapter.applyMove(semanticMove(move), { fen, animate: options.animate !== false });
        if (result?.ok) {
            this.stats.semanticMoves += 1;
            this.container.dataset.analyzeBoardStrategy = 'move';
        } else {
            result = this.adapter.setPosition(fen, { animate: false });
            this.stats.semanticFallbacks += 1;
            this.stats.positionSets += 1;
            this.container.dataset.analyzeBoardStrategy = 'position-fallback';
        }
        this.setOverlayState({ ...options, lastMove: move });
        return result;
    }

    setMode(mode) {
        this.mode = mode === 'setup' ? 'setup' : 'analysis';
        this.adapter.setInteractive(true);
        this.adapter.setReadOnly(false);
        this.container.dataset.analyzeBoardMode = this.mode;
        return this.mode;
    }

    setOverlayState({ lastMove = this.lastMove, classification = this.classification } = {}) {
        this.lastMove = lastMove?.from && lastMove?.to ? { from: lastMove.from, to: lastMove.to } : null;
        this.classification = classification || null;
        this.paintOverlays();
    }

    showSelection(square, legalSquares = []) {
        this.selectedSquare = square || null;
        this.legalSquares = Array.isArray(legalSquares) ? [...new Set(legalSquares)] : [];
        this.paintOverlays();
        if (this.selectedSquare) this.adapter.selectSquare(this.selectedSquare);
        else this.adapter.clearSelection();
    }

    clearSelection() {
        this.selectedSquare = null;
        this.legalSquares = [];
        this.paintOverlays();
        return this.adapter.clearSelection();
    }

    paintOverlays() {
        const highlights = [];
        if (this.lastMove) {
            highlights.push({ square: this.lastMove.from, type: 'last' }, { square: this.lastMove.to, type: 'last' });
            const type = classificationType(this.classification);
            if (type) highlights.push({ square: this.lastMove.to, type });
        }
        for (const square of this.legalSquares) highlights.push({ square, type: 'legal' });
        this.adapter.highlightSquares(highlights);
        if (this.selectedSquare) this.adapter.selectSquare(this.selectedSquare);
    }

    setOrientation(orientation) { return this.adapter.setOrientation(orientation); }
    getOrientation() { return this.adapter.getOrientation(); }
    resize() { return this.adapter.resize(); }
    getPosition() { return this.adapter.getPosition(); }

    inspect() {
        return Object.freeze({
            mode: this.mode,
            strategy: this.container.dataset.analyzeBoardStrategy || 'position',
            selectedSquare: this.selectedSquare,
            legalSquares: Object.freeze([...this.legalSquares]),
            stats: Object.freeze({ ...this.stats }),
            position: this.adapter.getPosition(),
            metrics: this.adapter.getMetrics()
        });
    }

    destroy() { return this.adapter.destroy(); }
}

export function create(container, options) {
    return new AnalyzeBoardProjection(container, options);
}

export default Object.freeze({ create, AnalyzeBoardProjection });
