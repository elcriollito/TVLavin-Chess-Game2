import { create as createBoardAdapter } from '../board/caissa-board-adapter.js';

const SCHEMA_VERSION = '2.0.0';
const SNAPSHOT_SCHEMA_VERSION = '2.0.0';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ORIENTATIONS = Object.freeze(['white', 'black']);
const INPUT_METHODS = Object.freeze(['tap', 'drag', 'keyboard', 'programmatic']);
const STATUSES = Object.freeze(['accepted', 'unchanged', 'rejected', 'unavailable', 'disposed', 'failed']);
const EVENTS = Object.freeze([
    'square-selected', 'move-requested', 'drag-started', 'drag-ended',
    'move-rejected', 'promotion-required', 'orientation-changed', 'board-focused'
]);
const SQUARE = /^[a-h][1-8]$/;
const PIECE = /^[wb][KQRBNP]$/;
let sequence = 0;

function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
}

function result(ok, status, reasonCode, value = null) {
    return freeze({ ok, status, reasonCode, value });
}

function positionMapToFen(position) {
    const entries = Object.entries(position || {});
    const pieces = new Map(entries.map(([square, code]) => {
        if (!SQUARE.test(square) || !PIECE.test(code)) throw new TypeError('Invalid legacy board position.');
        return [square, code[0] === 'w' ? code[1] : code[1].toLowerCase()];
    }));
    const ranks = [];
    for (let rank = 8; rank >= 1; rank -= 1) {
        let empty = 0;
        let row = '';
        for (const file of 'abcdefgh') {
            const piece = pieces.get(`${file}${rank}`);
            if (!piece) empty += 1;
            else {
                if (empty) row += empty;
                empty = 0;
                row += piece;
            }
        }
        if (empty) row += empty;
        ranks.push(row);
    }
    return `${ranks.join('/')} w - - 0 1`;
}

function normalizePosition(position) {
    if (position === 'start') return START_FEN;
    if (position && typeof position === 'object' && !Array.isArray(position)) return positionMapToFen(position);
    return position;
}

function normalizeMove(move) {
    const flags = String(move?.flags || '');
    return {
        from: move?.from,
        to: move?.to,
        capture: !!move?.captured || flags.includes('c'),
        enPassant: flags.includes('e'),
        castle: flags.includes('k') || flags.includes('q'),
        promotion: move?.promotion || (flags.includes('p') ? 'q' : null)
    };
}

class PlayBoardProjection {
    #id = `play-board-${++sequence}`;
    #options;
    #adapter = null;
    #container = null;
    #disposed = false;
    #position = START_FEN;
    #orientation = 'white';
    #interactionEnabled = true;
    #selectedSquare = null;
    #legalTargets = [];
    #legalCaptureTargets = [];
    #lastMove = null;
    #checkSquare = null;
    #listeners = [];
    #diagnostics = {
        mounts: 0, unmounts: 0, projections: 0, semanticMoves: 0,
        canonicalPositions: 0, semanticFallbacks: 0, identicalPositions: 0,
        interactions: 0, dragStarts: 0, dragEnds: 0, rejected: 0, resizeRequests: 0
    };
    #legacyFacade;

    constructor(options = {}) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options required');
        this.#options = {
            label: 'Play chessboard', position: 'start', orientation: 'white',
            draggable: true, tapToMoveEnabled: true, keyboardEnabled: true,
            animation: true, animationDuration: 160,
            ...options
        };
        this.#position = normalizePosition(this.#options.position);
        if (ORIENTATIONS.includes(this.#options.orientation)) this.#orientation = this.#options.orientation;
        const self = this;
        this.#legacyFacade = Object.freeze({
            position(value, animate) {
                if (arguments.length === 0) return self.#positionMap();
                const projected = self.setPosition(value, { animate: animate === true, reason: 'legacy-facade' });
                return projected.ok ? self.#positionMap() : undefined;
            },
            orientation(value) {
                if (arguments.length === 0) return self.#orientation;
                return self.setOrientation(value).ok ? value : undefined;
            },
            flip() { return self.flip().value; },
            resize() { return self.resize().ok; },
            start(animate) { return self.setPosition('start', { animate: animate === true, reason: 'start' }).ok; },
            destroy() { return self.unmount().ok; }
        });
    }

    mount(containerLike) {
        if (this.#disposed) return result(false, 'disposed', 'ADAPTER_DISPOSED');
        const container = typeof containerLike === 'string'
            ? globalThis.document?.getElementById(containerLike)
            : containerLike;
        if (!container?.appendChild) return result(false, 'rejected', 'INVALID_CONTAINER');
        if (this.#container === container && this.#adapter) return result(true, 'unchanged', 'ALREADY_MOUNTED', this.getSnapshot());
        if (this.#container && this.#container !== container) return result(false, 'rejected', 'DIFFERENT_CONTAINER');
        try {
            const adapterFactory = this.#options.adapterFactory || createBoardAdapter;
            this.#adapter = adapterFactory(container, {
                label: this.#options.label,
                position: this.#position,
                orientation: this.#orientation,
                interactive: this.#interactionEnabled,
                readOnly: false,
                animation: this.#options.animation !== false,
                animationDuration: this.#options.animationDuration,
                tapPolicy: this.#options.tapToMoveEnabled === false ? 'disabled' : 'intent-only',
                dragPolicy: this.#options.draggable === false ? 'none' : (this.#options.dragPolicy || 'mouse'),
                keyboardPolicy: this.#options.keyboardEnabled === false ? 'disabled' : 'enabled',
                onSquareTap: square => this.#handleSquareIntent(square, 'tap'),
                onMoveAttempt: intent => this.#handleMoveAttempt(intent),
                onDragStart: square => this.#handleDragStart(square),
                onDragEnd: payload => this.#handleDragEnd(payload),
                onOrientationChange: orientation => this.#handleOrientationChange(orientation),
                onError: error => this.#options.onError?.(error)
            });
        } catch (error) {
            this.#adapter = null;
            return result(false, 'failed', 'PERSISTENT_RENDERER_FAILED', error?.message || String(error));
        }
        this.#container = container;
        this.#diagnostics.mounts += 1;
        this.#bindOwnedListeners();
        this.#syncCompatibilityDom();
        this.#paintOverlays();
        return result(true, 'accepted', 'MOUNTED', this.getSnapshot());
    }

    unmount() {
        if (this.#disposed) return result(false, 'disposed', 'ADAPTER_DISPOSED');
        if (!this.#adapter) return result(true, 'unchanged', 'NOT_MOUNTED');
        this.#removeListeners();
        this.#adapter.destroy();
        this.#adapter = null;
        this.#container = null;
        this.#diagnostics.unmounts += 1;
        return result(true, 'accepted', 'UNMOUNTED');
    }

    setPosition(position, options = {}) {
        if (this.#disposed) return result(false, 'disposed', 'ADAPTER_DISPOSED');
        if (!this.#adapter) return result(false, 'unavailable', 'NOT_MOUNTED');
        let fen;
        try { fen = normalizePosition(position); }
        catch (_) { this.#diagnostics.rejected += 1; return result(false, 'rejected', 'INVALID_POSITION'); }
        const projected = this.#adapter.setPosition(fen, {
            animate: options.animate === true,
            coalesce: options.coalesce === true
        });
        if (!projected.ok) { this.#diagnostics.rejected += 1; return projected; }
        this.#position = fen;
        this.#diagnostics.projections += 1;
        if (projected.status === 'unchanged') this.#diagnostics.identicalPositions += 1;
        else this.#diagnostics.canonicalPositions += 1;
        this.#syncCompatibilityDom();
        return projected;
    }

    applyMove(move, options = {}) {
        if (this.#disposed) return result(false, 'disposed', 'ADAPTER_DISPOSED');
        if (!this.#adapter) return result(false, 'unavailable', 'NOT_MOUNTED');
        const fen = normalizePosition(options.fen);
        const projected = this.#adapter.applyMove(normalizeMove(move), { fen, animate: options.animate !== false });
        if (!projected.ok) {
            this.#diagnostics.semanticFallbacks += 1;
            return this.setPosition(fen, { animate: false, reason: options.reason || 'semantic-recovery' });
        }
        this.#position = fen;
        this.#diagnostics.projections += 1;
        this.#diagnostics.semanticMoves += 1;
        this.#syncCompatibilityDom();
        return projected;
    }

    getPosition() { return this.#position; }
    getPositionMap() { return this.#positionMap(); }

    flushPending() {
        if (!this.#adapter) return result(false, 'unavailable', 'NOT_MOUNTED');
        const flushed = this.#adapter.flushPending();
        this.#syncCompatibilityDom();
        return flushed;
    }

    resize() {
        if (!this.#adapter) return result(false, 'unavailable', 'NOT_MOUNTED');
        this.#diagnostics.resizeRequests += 1;
        return this.#adapter.resize();
    }

    setOrientation(value) {
        if (!ORIENTATIONS.includes(value)) return result(false, 'rejected', 'INVALID_ORIENTATION');
        if (!this.#adapter) return result(false, 'unavailable', 'NOT_MOUNTED');
        const changed = this.#adapter.setOrientation(value);
        if (changed.ok) {
            this.#orientation = value;
            this.#syncCompatibilityDom();
        }
        return changed;
    }

    flip() {
        const orientation = this.#orientation === 'white' ? 'black' : 'white';
        const changed = this.setOrientation(orientation);
        return changed.ok ? result(true, changed.status, changed.reasonCode, orientation) : changed;
    }

    setInteractionEnabled(value) {
        this.#interactionEnabled = value === true;
        return this.#adapter?.setInteractive(this.#interactionEnabled)
            || result(false, 'unavailable', 'NOT_MOUNTED');
    }

    setSelection(square) {
        if (square !== null && !SQUARE.test(square || '')) return result(false, 'rejected', 'INVALID_SQUARE');
        this.#selectedSquare = square;
        return this.#paintOverlays();
    }

    clearSelection() { return this.setSelection(null); }

    setLegalTargets(squares, options = {}) {
        if (!Array.isArray(squares) || squares.some(square => !SQUARE.test(square)))
            return result(false, 'rejected', 'INVALID_LEGAL_TARGETS');
        const captures = Array.isArray(options.captureTargets) ? options.captureTargets : [];
        if (captures.some(square => !SQUARE.test(square) || !squares.includes(square)))
            return result(false, 'rejected', 'INVALID_LEGAL_CAPTURE_TARGETS');
        this.#legalTargets = [...new Set(squares)];
        this.#legalCaptureTargets = [...new Set(captures)];
        return this.#paintOverlays();
    }

    clearLegalTargets() {
        this.#legalTargets = [];
        this.#legalCaptureTargets = [];
        return this.#paintOverlays();
    }

    setLastMove(move) {
        if (move !== null && (!SQUARE.test(move?.from || '') || !SQUARE.test(move?.to || '')))
            return result(false, 'rejected', 'INVALID_LAST_MOVE');
        this.#lastMove = move ? { from: move.from, to: move.to } : null;
        return this.#paintOverlays();
    }

    setCheckSquare(square) {
        if (square !== null && !SQUARE.test(square || '')) return result(false, 'rejected', 'INVALID_SQUARE');
        this.#checkSquare = square;
        return this.#paintOverlays();
    }

    clearHighlights() {
        this.#selectedSquare = null;
        this.#legalTargets = [];
        this.#legalCaptureTargets = [];
        this.#lastMove = null;
        this.#checkSquare = null;
        return this.#paintOverlays();
    }

    focus(square = null) {
        const focused = this.#adapter?.focus(square) || result(false, 'unavailable', 'NOT_MOUNTED');
        if (focused.ok) this.#emit({ type: 'board-focused', square: focused.value });
        return focused;
    }

    getSnapshot() {
        const rect = this.#container?.getBoundingClientRect?.() || { width: 0, height: 0 };
        const metrics = this.#adapter?.getMetrics?.().renderer || {};
        const rendered = this.#adapter?.getPosition?.() || {};
        return freeze({
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            adapterId: this.#id,
            rendererId: metrics.rendererId || null,
            renderer: 'CaissaPersistentRenderer',
            mounted: !!this.#adapter,
            disposed: this.#disposed,
            containerId: this.#container?.id || null,
            positionFen: this.#position,
            renderedFen: rendered.renderedFen || rendered.renderedPlacement || null,
            pending: rendered.pending === true,
            orientation: this.#orientation,
            interactionEnabled: this.#interactionEnabled,
            draggable: this.#options.draggable !== false,
            dragPolicy: this.#options.draggable === false ? 'none' : (this.#options.dragPolicy || 'mouse'),
            tapToMoveEnabled: this.#options.tapToMoveEnabled !== false,
            keyboardEnabled: this.#options.keyboardEnabled !== false,
            selectedSquare: this.#selectedSquare,
            legalTargets: [...this.#legalTargets],
            legalCaptureTargets: [...this.#legalCaptureTargets],
            lastMove: this.#lastMove ? { ...this.#lastMove } : null,
            checkSquare: this.#checkSquare,
            width: Number(rect.width) || 0,
            height: Number(rect.height) || 0,
            squareSize: Math.min(Number(rect.width) || 0, Number(rect.height) || 0) / 8,
            resizeSequence: metrics.resizeChecks || 0,
            renderSequence: metrics.generation || 0,
            accessibility: {
                role: 'grid', label: this.#options.label, focusable: true,
                orientation: this.#orientation,
                activeColor: this.#options.getActiveColor?.() || null,
                disabled: !this.#interactionEnabled
            }
        });
    }

    inspect() {
        return freeze({ ...this.#diagnostics, listenerCount: this.#listeners.length,
            snapshot: this.getSnapshot(), renderer: this.#adapter?.getMetrics?.().renderer || null });
    }

    getLegacyFacade() { return this.#legacyFacade; }

    dispose() {
        if (this.#disposed) return result(true, 'unchanged', 'DISPOSED');
        this.unmount();
        this.#disposed = true;
        this.#options = {};
        return result(true, 'accepted', 'DISPOSED');
    }

    #paintOverlays() {
        if (!this.#adapter) return result(false, 'unavailable', 'NOT_MOUNTED');
        const highlights = [];
        if (this.#lastMove) {
            highlights.push({ square: this.#lastMove.from, type: 'last' });
            highlights.push({ square: this.#lastMove.to, type: 'last' });
        }
        this.#legalTargets.forEach(square => highlights.push({ square, type: 'legal' }));
        if (this.#checkSquare) highlights.push({ square: this.#checkSquare, type: 'error' });
        const painted = this.#adapter.replaceOverlays({ selection: this.#selectedSquare, highlights });
        this.#paintCompatibilityOverlays();
        return painted;
    }

    #syncCompatibilityDom() {
        const root = this.#container?.querySelector?.('.caissa-board');
        for (const name of ['board-b72b1', 'caissa-play-persistent-board']) {
            if (root && !root.classList.contains(name)) root.classList.add(name);
        }
        if (root?.getAttribute('data-caissa-play-renderer') !== 'persistent')
            root?.setAttribute('data-caissa-play-renderer', 'persistent');
        this.#container?.querySelectorAll?.('.caissa-board__square[data-square]')?.forEach(node => {
            for (const name of ['square-55d63', `square-${node.dataset.square}`]) {
                if (!node.classList.contains(name)) node.classList.add(name);
            }
        });
        this.#container?.querySelectorAll?.('.caissa-board__piece[data-square]')?.forEach(node => {
            if (!node.classList.contains('piece-417db')) node.classList.add('piece-417db');
        });
        this.#paintCompatibilityOverlays();
    }

    #paintCompatibilityOverlays() {
        if (!this.#container?.querySelectorAll) return;
        const classes = ['caissa-board-selected', 'caissa-board-legal-target', 'caissa-board-legal-capture',
            'caissa-board-last-move', 'caissa-board-check'];
        this.#container.querySelectorAll('.caissa-board__square[data-square]').forEach(node => {
            const square = node.dataset.square;
            const desired = new Set();
            if (this.#selectedSquare === square) desired.add('caissa-board-selected');
            if (this.#legalTargets.includes(square)) desired.add('caissa-board-legal-target');
            if (this.#legalCaptureTargets.includes(square)) desired.add('caissa-board-legal-capture');
            if (this.#lastMove && (this.#lastMove.from === square || this.#lastMove.to === square))
                desired.add('caissa-board-last-move');
            if (this.#checkSquare === square) desired.add('caissa-board-check');
            classes.forEach(name => {
                if (desired.has(name) !== node.classList.contains(name)) node.classList.toggle(name, desired.has(name));
            });
        });
    }

    #positionMap() {
        const pieces = this.#adapter?.getPosition?.().pieces || [];
        return Object.fromEntries(pieces.map(piece => [piece.square, piece.code]));
    }

    #pieceCode(square) {
        return this.#adapter?.getPieceAt?.(square)?.code || '';
    }

    #handleSquareIntent(square, inputMethod) {
        if (!this.#interactionEnabled || this.#options.tapToMoveEnabled === false) return;
        this.#diagnostics.interactions += 1;
        this.#emit({ type: 'square-selected', square, inputMethod });
    }

    #handleDragStart(square) {
        if (!this.#interactionEnabled || this.#options.draggable === false) return false;
        const accepted = this.#options.onDragStart?.(
            square, this.#pieceCode(square), this.#positionMap(), this.#orientation
        ) !== false;
        if (accepted) {
            this.#handleSquareIntent(square, 'drag');
            this.#diagnostics.dragStarts += 1;
            this.#emit({ type: 'drag-started', square, inputMethod: 'drag' });
        }
        return accepted;
    }

    #handleDragEnd(payload) {
        this.#diagnostics.dragEnds += 1;
        this.#emit({ type: 'drag-ended', ...payload, inputMethod: 'drag' });
        if (payload.cancelled) this.#options.onTouchCancel?.();
        const settle = () => this.#options.onSnapEnd?.();
        if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(settle);
        else Promise.resolve().then(settle);
    }

    #handleMoveAttempt(intent) {
        if (!this.#interactionEnabled) return;
        this.#diagnostics.interactions += 1;
        this.#emit({ type: 'move-requested', ...intent });
        const accepted = this.#options.onDrop?.(
            intent.from, intent.to, this.#pieceCode(intent.from), this.#positionMap(),
            this.#positionMap(), this.#orientation
        );
        if (accepted === 'snapback' || accepted === false) {
            this.#diagnostics.rejected += 1;
            this.#emit({ type: 'move-rejected', from: intent.from, to: intent.to, inputMethod: intent.inputMethod });
        }
    }

    #handleOrientationChange(orientation) {
        this.#orientation = orientation;
        this.#options.onOrientationChange?.(orientation);
        this.#emit({ type: 'orientation-changed', orientation });
    }

    #bindOwnedListeners() {
        const onDocumentClick = event => this.#options.onDocumentClick?.(event);
        if (globalThis.document?.addEventListener) {
            globalThis.document.addEventListener('click', onDocumentClick);
            this.#listeners.push({ target: globalThis.document, type: 'click', handler: onDocumentClick });
        }
    }

    #removeListeners() {
        this.#listeners.splice(0).forEach(({ target, type, handler }) => target?.removeEventListener?.(type, handler));
    }

    #emit(event) {
        try { this.#options.onInteraction?.(freeze({ ...event })); } catch (_) {}
    }
}

export function create(options) {
    return new PlayBoardProjection(options);
}

export { PlayBoardProjection };

const api = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
    statuses: STATUSES,
    events: EVENTS,
    orientations: ORIENTATIONS,
    inputMethods: INPUT_METHODS,
    create
});

globalThis.CaissaPlayBoardProjection = api;
globalThis.CaissaChessboardAdapter = api;

export default api;
