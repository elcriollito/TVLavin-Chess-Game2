(function (global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.0.0';
    const ORIENTATIONS = Object.freeze(['white', 'black']);
    const INPUT_METHODS = Object.freeze(['tap', 'drag', 'keyboard', 'programmatic']);
    const STATUSES = Object.freeze(['accepted', 'unchanged', 'rejected', 'unavailable', 'disposed', 'failed']);
    const EVENTS = Object.freeze([
        'square-selected', 'move-requested', 'drag-started', 'drag-ended',
        'move-rejected', 'promotion-required', 'orientation-changed', 'board-focused'
    ]);
    const REASONS = Object.freeze({
        MOUNTED: 'MOUNTED', ALREADY_MOUNTED: 'ALREADY_MOUNTED', INVALID_CONTAINER: 'INVALID_CONTAINER',
        DIFFERENT_CONTAINER: 'DIFFERENT_CONTAINER', UNMOUNTED: 'UNMOUNTED', NOT_MOUNTED: 'NOT_MOUNTED',
        POSITION_RENDERED: 'POSITION_RENDERED', SAME_POSITION: 'SAME_POSITION', INVALID_POSITION: 'INVALID_POSITION',
        ORIENTATION_CHANGED: 'ORIENTATION_CHANGED', SAME_ORIENTATION: 'SAME_ORIENTATION',
        INTERACTION_CHANGED: 'INTERACTION_CHANGED', DISPOSED: 'DISPOSED', ADAPTER_DISPOSED: 'ADAPTER_DISPOSED'
    });
    const SQUARE = /^[a-h][1-8]$/;
    const FEN = /^(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+(?:\s[wb]\s(?:-|[KQkq]+)\s(?:-|[a-h][36])\s\d+\s\d+)?$/;
    let sequence = 0;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }

    function validFen(value) {
        if (!FEN.test(value || '')) return false;
        const ranks = value.split(' ')[0].split('/');
        return ranks.length === 8 && ranks.every(rank =>
            [...rank].reduce((total, token) => total + (/\d/.test(token) ? Number(token) : 1), 0) === 8);
    }

    class ChessboardAdapter {
        #id; #options; #widget = null; #container = null; #disposed = false;
        #position = null; #orientation = 'white'; #interactionEnabled = true;
        #selectedSquare = null; #legalTargets = []; #lastMove = null; #checkSquare = null;
        #resizeSequence = 0; #renderSequence = 0; #listeners = []; #resizeTimer = null;
        #diagnostics = { mounts: 0, unmounts: 0, renders: 0, resizes: 0, interactions: 0, rejected: 0 };
        #legacyFacade;

        constructor(options = {}) {
            if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options required');
            this.#id = `play-board-${++sequence}`;
            this.#options = Object.assign({
                label: 'Play chessboard', position: 'start', orientation: 'white',
                draggable: true, tapToMoveEnabled: true, pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
                showNotation: true
            }, options);
            if (ORIENTATIONS.includes(this.#options.orientation)) this.#orientation = this.#options.orientation;
            this.#position = this.#options.position;
            const self = this;
            this.#legacyFacade = Object.freeze({
                position(value, animate) {
                    if (arguments.length === 0) return self.#getLegacyPosition();
                    return self.setPosition(value, { animate }).ok ? self.getPosition() : undefined;
                },
                orientation(value) {
                    if (arguments.length === 0) return self.getSnapshot().orientation;
                    return self.setOrientation(value).ok ? value : undefined;
                },
                flip() { return self.flip().value; },
                resize() { return self.resize().ok; },
                start(animate) { return self.setPosition('start', { animate }).ok; },
                destroy() { return self.unmount().ok; }
            });
        }

        mount(containerLike) {
            if (this.#disposed) return result(false, 'disposed', REASONS.ADAPTER_DISPOSED);
            const container = typeof containerLike === 'string'
                ? global.document?.getElementById(containerLike)
                : containerLike;
            if (!container || typeof container !== 'object' || !container.addEventListener)
                return result(false, 'rejected', REASONS.INVALID_CONTAINER);
            if (this.#container === container && this.#widget)
                return result(true, 'unchanged', REASONS.ALREADY_MOUNTED, this.getSnapshot());
            if (this.#container && this.#container !== container)
                return result(false, 'rejected', REASONS.DIFFERENT_CONTAINER);
            const factory = this.#options.boardFactory || global.Chessboard;
            if (typeof factory !== 'function') return result(false, 'unavailable', 'BOARD_FACTORY_UNAVAILABLE');
            this.#container = container;
            try {
                this.#widget = factory(container, {
                    draggable: !!this.#options.draggable,
                    position: this.#position,
                    orientation: this.#orientation,
                    onDragStart: (from, piece, position, orientation) => {
                        const accepted = this.#interactionEnabled
                            && this.#options.onDragStart?.(from, piece, position, orientation) !== false;
                        this.#setDragSource(from, accepted);
                        return accepted;
                    },
                    onDrop: (from, to, piece, newPosition, oldPosition, orientation) => {
                        if (!this.#interactionEnabled) return 'snapback';
                        this.#diagnostics.interactions += 1;
                        this.#emit({ type: 'move-requested', from, to, promotion: null, inputMethod: 'drag' });
                        return this.#options.onDrop?.(from, to, piece, newPosition, oldPosition, orientation);
                    },
                    onSnapEnd: (...args) => {
                        this.#clearDragSource();
                        this.#options.onSnapEnd?.(...args);
                    },
                    pieceTheme: this.#options.pieceTheme,
                    showNotation: this.#options.showNotation !== false,
                    sparePieces: false,
                    appearSpeed: 'fast', moveSpeed: 'fast', snapbackSpeed: 'fast',
                    snapSpeed: 'fast', trashSpeed: 'fast'
                });
            } catch (_) {
                this.#widget = null; this.#container = null;
                return result(false, 'failed', 'BOARD_FACTORY_FAILED');
            }
            this.#diagnostics.mounts += 1;
            this.#applyAccessibility();
            this.#bindOwnedListeners();
            return result(true, 'accepted', REASONS.MOUNTED, this.getSnapshot());
        }

        unmount() {
            if (this.#disposed) return result(false, 'disposed', REASONS.ADAPTER_DISPOSED);
            if (!this.#widget) return result(true, 'unchanged', REASONS.NOT_MOUNTED);
            this.#removeListeners();
            try { this.#widget.destroy?.(); } catch (_) {}
            this.#widget = null; this.#container = null; this.#diagnostics.unmounts += 1;
            return result(true, 'accepted', REASONS.UNMOUNTED);
        }

        setPosition(position, options = {}) {
            if (this.#disposed) return result(false, 'disposed', REASONS.ADAPTER_DISPOSED);
            const valid = position === 'start' || (typeof position === 'string' && validFen(position)) ||
                (position && typeof position === 'object' && !Array.isArray(position));
            if (!valid) { this.#diagnostics.rejected += 1; return result(false, 'rejected', REASONS.INVALID_POSITION); }
            const comparable = typeof position === 'string' ? position : JSON.stringify(position);
            const currentComparable = typeof this.#position === 'string' ? this.#position : JSON.stringify(this.#position);
            if (comparable === currentComparable) return result(true, 'unchanged', REASONS.SAME_POSITION);
            if (!this.#widget) return result(false, 'unavailable', REASONS.NOT_MOUNTED);
            const reducedMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
            const animate = options.animate === true && !reducedMotion;
            try { this.#widget.position(position, animate); } catch (_) {
                return result(false, 'failed', 'POSITION_RENDER_FAILED');
            }
            this.#position = typeof position === 'object' ? Object.assign({}, position) : position;
            this.#renderSequence += 1; this.#diagnostics.renders += 1;
            this.#applyAccessibility(); this.#applyHighlights();
            return result(true, 'accepted', REASONS.POSITION_RENDERED);
        }

        getPosition() {
            if (this.#position && typeof this.#position === 'object') return deepFreeze(Object.assign({}, this.#position));
            return this.#position;
        }

        resize() {
            if (this.#disposed) return result(false, 'disposed', REASONS.ADAPTER_DISPOSED);
            if (!this.#widget) return result(false, 'unavailable', REASONS.NOT_MOUNTED);
            try { this.#widget.resize?.(); } catch (_) { return result(false, 'failed', 'RESIZE_FAILED'); }
            this.#resizeSequence += 1; this.#diagnostics.resizes += 1;
            this.#applyHighlights();
            return result(true, 'accepted', 'RESIZED');
        }

        setOrientation(value) {
            if (this.#disposed) return result(false, 'disposed', REASONS.ADAPTER_DISPOSED);
            if (!ORIENTATIONS.includes(value)) return result(false, 'rejected', 'INVALID_ORIENTATION');
            if (value === this.#orientation) return result(true, 'unchanged', REASONS.SAME_ORIENTATION);
            if (!this.#widget) return result(false, 'unavailable', REASONS.NOT_MOUNTED);
            this.#widget.orientation(value); this.#orientation = value;
            this.#applyAccessibility(); this.#applyHighlights();
            this.#emit({ type: 'orientation-changed', orientation: value });
            return result(true, 'accepted', REASONS.ORIENTATION_CHANGED, value);
        }

        flip() { return this.setOrientation(this.#orientation === 'white' ? 'black' : 'white'); }

        setInteractionEnabled(value) {
            if (this.#disposed) return result(false, 'disposed', REASONS.ADAPTER_DISPOSED);
            const enabled = value === true;
            if (enabled === this.#interactionEnabled) return result(true, 'unchanged', 'SAME_INTERACTION_STATE');
            this.#interactionEnabled = enabled; this.#applyAccessibility();
            return result(true, 'accepted', REASONS.INTERACTION_CHANGED, enabled);
        }

        setSelection(square) {
            if (square !== null && !SQUARE.test(square || '')) return result(false, 'rejected', 'INVALID_SQUARE');
            this.#selectedSquare = square; this.#applyHighlights(); return result(true, 'accepted', 'SELECTION_SET');
        }
        clearSelection() { return this.setSelection(null); }
        setLegalTargets(squares) {
            if (!Array.isArray(squares) || squares.length > 64 || squares.some(square => !SQUARE.test(square)))
                return result(false, 'rejected', 'INVALID_LEGAL_TARGETS');
            this.#legalTargets = [...new Set(squares)]; this.#applyHighlights();
            return result(true, 'accepted', 'LEGAL_TARGETS_SET');
        }
        clearLegalTargets() { this.#legalTargets = []; this.#applyHighlights(); return result(true, 'accepted', 'LEGAL_TARGETS_CLEARED'); }
        setLastMove(move) {
            if (move !== null && (!move || !SQUARE.test(move.from || '') || !SQUARE.test(move.to || '')))
                return result(false, 'rejected', 'INVALID_LAST_MOVE');
            this.#lastMove = move ? { from: move.from, to: move.to } : null; this.#applyHighlights();
            return result(true, 'accepted', 'LAST_MOVE_SET');
        }
        setCheckSquare(square) {
            if (square !== null && !SQUARE.test(square || '')) return result(false, 'rejected', 'INVALID_SQUARE');
            this.#checkSquare = square; this.#applyHighlights(); return result(true, 'accepted', 'CHECK_SQUARE_SET');
        }
        clearHighlights() {
            this.#selectedSquare = null; this.#legalTargets = []; this.#lastMove = null; this.#checkSquare = null;
            this.#applyHighlights(); return result(true, 'accepted', 'HIGHLIGHTS_CLEARED');
        }
        focus() {
            if (!this.#container) return result(false, 'unavailable', REASONS.NOT_MOUNTED);
            this.#container.focus(); return result(true, 'accepted', 'BOARD_FOCUSED');
        }

        getSnapshot() {
            const rect = this.#container?.getBoundingClientRect?.() || { width: 0, height: 0 };
            const width = Number.isFinite(rect.width) ? rect.width : 0;
            const height = Number.isFinite(rect.height) ? rect.height : 0;
            return deepFreeze({
                schemaVersion: SNAPSHOT_SCHEMA_VERSION, adapterId: this.#id,
                mounted: !!this.#widget, disposed: this.#disposed,
                containerId: this.#container?.id || null, positionFen: typeof this.#position === 'string' ? this.#position : null,
                orientation: this.#orientation, interactionEnabled: this.#interactionEnabled,
                draggable: !!this.#options.draggable, tapToMoveEnabled: !!this.#options.tapToMoveEnabled,
                selectedSquare: this.#selectedSquare, legalTargets: [...this.#legalTargets],
                lastMove: this.#lastMove ? { ...this.#lastMove } : null, checkSquare: this.#checkSquare,
                width, height, squareSize: Math.min(width, height) / 8,
                resizeSequence: this.#resizeSequence, renderSequence: this.#renderSequence,
                accessibility: {
                    role: 'application', label: this.#options.label, focusable: true,
                    orientation: this.#orientation, activeColor: this.#options.getActiveColor?.() || null,
                    disabled: !this.#interactionEnabled
                }
            });
        }

        inspect() { return deepFreeze(Object.assign({}, this.#diagnostics, { listenerCount: this.#listeners.length, snapshot: this.getSnapshot() })); }
        getLegacyFacade() { return this.#legacyFacade; }
        dispose() {
            if (this.#disposed) return result(true, 'unchanged', REASONS.DISPOSED);
            this.unmount(); this.#disposed = true; this.#options = {};
            return result(true, 'accepted', REASONS.DISPOSED);
        }

        #applyAccessibility() {
            if (!this.#container) return;
            this.#container.setAttribute('role', 'application');
            this.#container.setAttribute('aria-label', this.#options.label);
            this.#container.setAttribute('tabindex', '0');
            this.#container.setAttribute('aria-disabled', String(!this.#interactionEnabled));
            this.#container.setAttribute('data-orientation', this.#orientation);
            const activeColor = this.#options.getActiveColor?.() || 'unknown';
            this.#container.setAttribute('data-active-color', activeColor);
            this.#container.setAttribute('aria-description',
                `${this.#orientation} orientation. ${activeColor} to move. Use tap or drag to request a move.`);
        }

        #applyHighlights() {
            if (!this.#container?.querySelectorAll) return;
            const classes = ['caissa-board-selected', 'caissa-board-legal-target', 'caissa-board-last-move', 'caissa-board-check'];
            this.#container.querySelectorAll(classes.map(name => `.${name}`).join(',')).forEach(node =>
                classes.forEach(name => node.classList.remove(name)));
            const square = value => this.#container.querySelector(`.square-${value}`);
            square(this.#selectedSquare)?.classList.add('caissa-board-selected');
            this.#legalTargets.forEach(value => square(value)?.classList.add('caissa-board-legal-target'));
            if (this.#lastMove) [this.#lastMove.from, this.#lastMove.to].forEach(value => square(value)?.classList.add('caissa-board-last-move'));
            square(this.#checkSquare)?.classList.add('caissa-board-check');
        }

        #setDragSource(square, active) {
            this.#clearDragSource();
            if (!active || !SQUARE.test(square || '')) return;
            this.#container?.querySelector?.(`.square-${square} .piece-417db`)
                ?.classList?.add?.('caissa-piece-drag-source');
        }

        #clearDragSource() {
            this.#container?.querySelectorAll?.('.caissa-piece-drag-source')?.forEach?.(node =>
                node.classList.remove('caissa-piece-drag-source'));
        }

        #listen(target, type, handler, options) {
            target?.addEventListener?.(type, handler, options);
            this.#listeners.push({ target, type, handler, options });
        }

        #bindOwnedListeners() {
            this.#listen(global, 'resize', () => {
                if (this.#resizeTimer) global.clearTimeout(this.#resizeTimer);
                this.#resizeTimer = global.setTimeout(() => { this.#resizeTimer = null; this.resize(); }, 250);
            });
            this.#listen(global, 'orientationchange', () => {
                this.#options.onOrientationChange?.();
                if (this.#resizeTimer) global.clearTimeout(this.#resizeTimer);
                this.#resizeTimer = global.setTimeout(() => { this.#resizeTimer = null; this.resize(); }, 100);
            });
            this.#listen(this.#container, 'touchmove', event => {
                if (this.#options.shouldPreventTouchMove?.(event)) event.preventDefault();
            }, { passive: false });
            this.#listen(this.#container, 'click', event => {
                if (this.#interactionEnabled) {
                    const squareNode = event.target?.closest?.('[class*="square-"]');
                    const squareClass = squareNode ? [...squareNode.classList].find(name => /^square-[a-h][1-8]$/.test(name)) : null;
                    if (squareClass) this.#emit({ type: 'square-selected', square: squareClass.slice(7), inputMethod: 'tap' });
                    this.#options.onTap?.(event);
                }
            });
            this.#listen(this.#container, 'touchcancel', () => this.#options.onTouchCancel?.(), { passive: true });
            this.#listen(this.#container, 'focus', () => this.#emit({ type: 'board-focused' }));
            this.#listen(global.document, 'click', event => this.#options.onDocumentClick?.(event));
        }

        #removeListeners() {
            this.#listeners.splice(0).forEach(({ target, type, handler, options }) =>
                target?.removeEventListener?.(type, handler, options));
            if (this.#resizeTimer) global.clearTimeout(this.#resizeTimer);
            this.#resizeTimer = null;
        }

        #emit(event) {
            try { this.#options.onInteraction?.(deepFreeze(Object.assign({}, event))); } catch (_) {}
        }

        #getLegacyPosition() {
            if (!this.#widget?.position) return null;
            try {
                const value = this.#widget.position();
                return value && typeof value === 'object' ? Object.assign({}, value) : value;
            } catch (_) {
                return null;
            }
        }
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        statuses: STATUSES, events: EVENTS, reasonCodes: REASONS,
        orientations: ORIENTATIONS, inputMethods: INPUT_METHODS,
        create: options => new ChessboardAdapter(options)
    });
    global.CaissaChessboardAdapter = api;
})(typeof window !== 'undefined' ? window : globalThis);
