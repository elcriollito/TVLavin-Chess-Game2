import {
    SQUARES,
    applySemanticMove,
    assignInitialPieceIdentities,
    createIdentityAllocator,
    isSquare,
    parseFen,
    reconcilePieces,
    serializePlacement
} from './caissa-board-state.js';
import {
    boardAccessibleDescription,
    navigateSquare,
    squareAccessibleLabel,
    squareFromVisualPoint,
    visualCoordinates
} from './caissa-board-a11y.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HIGHLIGHT_TYPES = new Set(['legal', 'last', 'hint', 'error']);
let rendererSequence = 0;

function result(ok, status, reasonCode, value = null) {
    return Object.freeze({ ok, status, reasonCode, value });
}

function copyPiece(piece) {
    return piece ? Object.freeze({ ...piece }) : null;
}

function createElement(documentRef, tag, className) {
    const element = documentRef.createElement(tag);
    element.className = className;
    return element;
}

export class CaissaPersistentRenderer {
    #container;
    #document;
    #options;
    #root;
    #layers = {};
    #rows = new Map();
    #squares = new Map();
    #highlightNodes = new Map();
    #pieceNodes = new Map();
    #coordinateNodes = [];
    #pieces = [];
    #allocateId;
    #parsedPosition;
    #requestedPosition;
    #orientation;
    #interactive;
    #readOnly;
    #selection = null;
    #highlights = new Map();
    #arrows = new Map();
    #arrowSequence = 0;
    #focusSquare;
    #listeners = [];
    #resizeObserver = null;
    #mediaQuery = null;
    #pendingPosition = null;
    #pendingFrame = null;
    #generation = 0;
    #drag = null;
    #destroyed = false;
    #geometry = { width: 0, height: 0, squareSize: 0 };
    #metrics = {
        positionUpdates: 0,
        semanticMoves: 0,
        identicalUpdates: 0,
        coalescedUpdates: 0,
        animationsCancelled: 0,
        geometryChanges: 0,
        resizeChecks: 0,
        nodesAdded: 0,
        nodesRemoved: 0,
        attributeMutations: 0,
        styleMutations: 0,
        lastUpdate: null
    };

    constructor(container, options = {}) {
        if (!container || typeof container.appendChild !== 'function') {
            throw new TypeError('CaissaPersistentRenderer requires a DOM container.');
        }
        this.#container = container;
        this.#document = container.ownerDocument;
        this.#options = {
            label: 'CAISSA chessboard',
            position: 'start',
            orientation: 'white',
            interactive: true,
            readOnly: false,
            animation: true,
            coalesce: false,
            animationDuration: 180,
            reducedMotion: null,
            pieceAssetPath: code => `/img/chesspieces/wikipedia/${code}.png`,
            theme: {},
            ...options
        };
        if (!['white', 'black'].includes(this.#options.orientation)) {
            throw new TypeError('Board orientation must be white or black.');
        }
        this.#orientation = this.#options.orientation;
        this.#interactive = this.#options.interactive !== false;
        this.#readOnly = this.#options.readOnly === true;
        this.#focusSquare = this.#orientation === 'white' ? 'a1' : 'h8';
        this.#parsedPosition = parseFen(this.#options.position);
        this.#requestedPosition = this.#parsedPosition;
        this.#pieces = assignInitialPieceIdentities(this.#parsedPosition.entries);
        this.#allocateId = createIdentityAllocator(this.#pieces);
        this.#buildDom();
        this.#bindInput();
        this.#bindResize();
        this.resize();
    }

    get root() {
        return this.#root;
    }

    setPosition(fen, options = {}) {
        if (this.#destroyed) return result(false, 'disposed', 'RENDERER_DESTROYED');
        let parsed;
        try {
            parsed = parseFen(fen);
        } catch (error) {
            return result(false, 'rejected', error.code || 'INVALID_FEN', error.message);
        }

        const coalesce = options.coalesce ?? this.#options.coalesce;
        if (coalesce) {
            if (this.#pendingPosition) this.#metrics.coalescedUpdates += 1;
            this.#pendingPosition = { parsed, options };
            this.#requestedPosition = parsed;
            if (this.#pendingFrame === null) {
                this.#pendingFrame = this.#requestFrame(() => {
                    this.#pendingFrame = null;
                    const pending = this.#pendingPosition;
                    this.#pendingPosition = null;
                    if (pending && !this.#destroyed) this.#commitParsedPosition(pending.parsed, pending.options);
                });
            }
            return result(true, 'queued', 'POSITION_QUEUED', parsed.fen);
        }

        this.#cancelPendingFrame();
        this.#requestedPosition = parsed;
        return this.#commitParsedPosition(parsed, options);
    }

    flushPending() {
        if (!this.#pendingPosition) return result(true, 'unchanged', 'NO_PENDING_POSITION');
        const pending = this.#pendingPosition;
        this.#cancelPendingFrame();
        this.#requestedPosition = pending.parsed;
        return this.#commitParsedPosition(pending.parsed, pending.options);
    }

    applyMove(move, options = {}) {
        if (this.#destroyed) return result(false, 'disposed', 'RENDERER_DESTROYED');
        this.flushPending();
        let semantic;
        let canonical = null;
        try {
            semantic = applySemanticMove(this.#pieces, move, this.#allocateId);
            if (options.fen) {
                canonical = parseFen(options.fen);
                if (canonical.placement !== semantic.placement) {
                    return result(false, 'rejected', 'CANONICAL_FEN_MISMATCH');
                }
            }
        } catch (error) {
            return result(false, 'rejected', error.code || 'INVALID_SEMANTIC_MOVE', error.message);
        }

        this.#metrics.semanticMoves += 1;
        this.#requestedPosition = canonical || parseFen(semantic.placement);
        return this.#commitPieceDelta(semantic, canonical || parseFen(semantic.placement), options, 'SEMANTIC_MOVE_APPLIED');
    }

    setOrientation(orientation) {
        if (this.#destroyed) return result(false, 'disposed', 'RENDERER_DESTROYED');
        if (!['white', 'black'].includes(orientation)) return result(false, 'rejected', 'INVALID_ORIENTATION');
        if (orientation === this.#orientation) return result(true, 'unchanged', 'SAME_ORIENTATION');
        this.#cancelDrag(true);
        this.#cancelAnimations();
        this.#orientation = orientation;
        this.#setAttribute(this.#root, 'data-orientation', orientation);
        this.#focusSquare = orientation === 'white' ? 'a1' : 'h8';
        for (const square of SQUARES) {
            this.#placeSquareNode(this.#squares.get(square), square);
            this.#placeSquareNode(this.#highlightNodes.get(square), square);
        }
        for (const [rank, row] of this.#rows) {
            this.#setAttribute(row, 'aria-rowindex', String(visualCoordinates(`a${rank}`, this.#orientation).y + 1));
        }
        for (const piece of this.#pieces) this.#placePieceNode(this.#pieceNodes.get(piece.id), piece.square);
        this.#positionCoordinates();
        this.#refreshAccessibility(SQUARES);
        this.#refreshKeyboardFocus();
        this.#redrawArrows();
        this.#notify('onOrientationChange', orientation);
        return result(true, 'accepted', 'ORIENTATION_CHANGED', orientation);
    }

    setInteractive(enabled) {
        const value = enabled === true;
        if (value === this.#interactive) return result(true, 'unchanged', 'SAME_INTERACTIVE_STATE');
        this.#interactive = value;
        this.#refreshRootAccessibility();
        if (!this.#canInteract()) this.#cancelDrag(true);
        return result(true, 'accepted', 'INTERACTIVE_STATE_CHANGED', value);
    }

    setReadOnly(enabled) {
        const value = enabled === true;
        if (value === this.#readOnly) return result(true, 'unchanged', 'SAME_READ_ONLY_STATE');
        this.#readOnly = value;
        this.#refreshRootAccessibility();
        if (!this.#canInteract()) this.#cancelDrag(true);
        return result(true, 'accepted', 'READ_ONLY_STATE_CHANGED', value);
    }

    selectSquare(square) {
        if (!isSquare(square)) return result(false, 'rejected', 'INVALID_SQUARE');
        if (this.#selection === square) return result(true, 'unchanged', 'SAME_SELECTION', square);
        this.#selection = square;
        this.#paintHighlights();
        return result(true, 'accepted', 'SQUARE_SELECTED', square);
    }

    clearSelection() {
        if (!this.#selection) return result(true, 'unchanged', 'NO_SELECTION');
        this.#selection = null;
        this.#paintHighlights();
        return result(true, 'accepted', 'SELECTION_CLEARED');
    }

    highlightSquares(items) {
        if (!Array.isArray(items)) return result(false, 'rejected', 'INVALID_HIGHLIGHTS');
        const next = new Map();
        for (const item of items) {
            const normalized = typeof item === 'string' ? { square: item, type: 'hint' } : item;
            if (!normalized || !isSquare(normalized.square) || !HIGHLIGHT_TYPES.has(normalized.type)) {
                return result(false, 'rejected', 'INVALID_HIGHLIGHT');
            }
            if (!next.has(normalized.square)) next.set(normalized.square, new Set());
            next.get(normalized.square).add(normalized.type);
        }
        this.#highlights = next;
        this.#paintHighlights();
        return result(true, 'accepted', 'HIGHLIGHTS_SET', items.length);
    }

    clearHighlights() {
        const hadHighlights = this.#highlights.size > 0 || this.#selection !== null;
        this.#highlights.clear();
        this.#selection = null;
        if (hadHighlights) this.#paintHighlights();
        return result(true, hadHighlights ? 'accepted' : 'unchanged', hadHighlights ? 'HIGHLIGHTS_CLEARED' : 'NO_HIGHLIGHTS');
    }

    drawArrow(from, to, options = {}) {
        if (!isSquare(from) || !isSquare(to) || from === to) return result(false, 'rejected', 'INVALID_ARROW');
        const id = `arrow-${++this.#arrowSequence}`;
        this.#arrows.set(id, { id, from, to, color: options.color || '#2f7de1', opacity: options.opacity ?? 0.72 });
        this.#renderArrow(this.#arrows.get(id));
        return result(true, 'accepted', 'ARROW_DRAWN', id);
    }

    clearArrows() {
        const count = this.#arrows.size;
        this.#arrows.clear();
        this.#layers.arrowGroup.replaceChildren();
        return result(true, count ? 'accepted' : 'unchanged', count ? 'ARROWS_CLEARED' : 'NO_ARROWS', count);
    }

    resize() {
        if (this.#destroyed) return result(false, 'disposed', 'RENDERER_DESTROYED');
        this.#metrics.resizeChecks += 1;
        const rect = this.#root.getBoundingClientRect();
        const next = {
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            squareSize: Math.round((Math.min(rect.width, rect.height) / 8) * 100) / 100
        };
        if (next.width === this.#geometry.width && next.height === this.#geometry.height) {
            return result(true, 'unchanged', 'GEOMETRY_UNCHANGED', { ...this.#geometry });
        }
        this.#geometry = next;
        this.#metrics.geometryChanges += 1;
        this.#notify('onResize', { ...next });
        return result(true, 'accepted', 'GEOMETRY_CHANGED', { ...next });
    }

    getPosition() {
        return Object.freeze({
            fen: this.#requestedPosition.metadata ? this.#requestedPosition.fen : null,
            placement: this.#requestedPosition.placement,
            renderedFen: this.#parsedPosition.metadata ? this.#parsedPosition.fen : null,
            renderedPlacement: this.#parsedPosition.placement,
            pending: this.#pendingPosition !== null,
            pieces: Object.freeze(this.#pieces.map(copyPiece))
        });
    }

    getOrientation() {
        return this.#orientation;
    }

    getMetrics() {
        return Object.freeze({
            rendererId: this.#root.id,
            generation: this.#generation,
            squareCount: this.#squares.size,
            pieceCount: this.#pieceNodes.size,
            arrowCount: this.#arrows.size,
            orientation: this.#orientation,
            geometry: Object.freeze({ ...this.#geometry }),
            ...structuredClone(this.#metrics)
        });
    }

    getPieceAt(square) {
        return copyPiece(this.#pieceAt(square));
    }

    destroy() {
        if (this.#destroyed) return result(true, 'unchanged', 'ALREADY_DESTROYED');
        this.#cancelPendingFrame();
        this.#cancelAnimations();
        this.#cancelDrag(true);
        this.#resizeObserver?.disconnect();
        if (this.#mediaQuery) this.#mediaQuery.removeEventListener?.('change', this.#handleMotionChange);
        for (const listener of this.#listeners) listener.target.removeEventListener(listener.type, listener.handler, listener.options);
        this.#listeners = [];
        this.#root.remove();
        this.#destroyed = true;
        return result(true, 'accepted', 'RENDERER_DESTROYED');
    }

    #buildDom() {
        const id = `caissa-board-${++rendererSequence}`;
        this.#root = createElement(this.#document, 'div', 'caissa-board');
        this.#root.id = id;
        this.#root.setAttribute('role', 'grid');
        this.#root.setAttribute('tabindex', '0');
        this.#root.setAttribute('data-orientation', this.#orientation);
        this.#root.setAttribute('data-animate', String(this.#options.animation !== false));
        this.#root.style.setProperty('--caissa-board-animation-duration', `${Math.max(0, Number(this.#options.animationDuration) || 0)}ms`);
        this.#applyTheme();

        this.#layers.squares = createElement(this.#document, 'div', 'caissa-board__squares');
        this.#layers.squares.setAttribute('role', 'rowgroup');
        this.#layers.highlights = createElement(this.#document, 'div', 'caissa-board__highlights');
        this.#layers.highlights.setAttribute('aria-hidden', 'true');
        this.#layers.pieces = createElement(this.#document, 'div', 'caissa-board__pieces');
        this.#layers.pieces.setAttribute('aria-hidden', 'true');
        this.#layers.coordinates = createElement(this.#document, 'div', 'caissa-board__coordinates');
        this.#layers.coordinates.setAttribute('aria-hidden', 'true');
        this.#layers.arrows = this.#document.createElementNS(SVG_NS, 'svg');
        this.#layers.arrows.classList.add('caissa-board__arrows');
        this.#layers.arrows.setAttribute('viewBox', '0 0 100 100');
        this.#layers.arrows.setAttribute('aria-hidden', 'true');
        this.#layers.arrowGroup = this.#document.createElementNS(SVG_NS, 'g');
        this.#layers.arrows.append(this.#layers.arrowGroup);

        for (const square of SQUARES) {
            const rank = square[1];
            if (!this.#rows.has(rank)) {
                const row = createElement(this.#document, 'div', 'caissa-board__row');
                row.dataset.rank = rank;
                row.setAttribute('role', 'row');
                row.setAttribute('aria-rowindex', String(visualCoordinates(`a${rank}`, this.#orientation).y + 1));
                this.#rows.set(rank, row);
                this.#layers.squares.append(row);
            }
            const node = createElement(this.#document, 'button', `caissa-board__square caissa-board__square--${this.#isLightSquare(square) ? 'light' : 'dark'}`);
            node.type = 'button';
            node.id = `${id}-square-${square}`;
            node.dataset.square = square;
            node.setAttribute('role', 'gridcell');
            node.setAttribute('tabindex', '-1');
            node.setAttribute('aria-selected', 'false');
            this.#placeSquareNode(node, square, false);
            this.#squares.set(square, node);
            this.#rows.get(rank).append(node);

            const highlight = createElement(this.#document, 'span', 'caissa-board__highlight');
            highlight.dataset.square = square;
            this.#placeSquareNode(highlight, square, false);
            this.#highlightNodes.set(square, highlight);
            this.#layers.highlights.append(highlight);
        }

        for (const piece of this.#pieces) this.#createPieceNode(piece, false);
        this.#buildCoordinates();
        this.#root.append(
            this.#layers.squares,
            this.#layers.highlights,
            this.#layers.arrows,
            this.#layers.pieces,
            this.#layers.coordinates
        );
        this.#container.append(this.#root);
        this.#refreshRootAccessibility();
        this.#refreshAccessibility(SQUARES, false);
        this.#refreshKeyboardFocus(false);
        this.#syncReducedMotionAttribute();
    }

    #applyTheme() {
        const themeMap = {
            light: '--caissa-board-light', dark: '--caissa-board-dark', selected: '--caissa-board-selected',
            lastMove: '--caissa-board-last-move', legal: '--caissa-board-legal', hint: '--caissa-board-hint',
            error: '--caissa-board-error', coordinates: '--caissa-board-coordinates'
        };
        for (const [key, variable] of Object.entries(themeMap)) {
            if (this.#options.theme?.[key]) this.#root.style.setProperty(variable, this.#options.theme[key]);
        }
    }

    #buildCoordinates() {
        for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
            const node = createElement(this.#document, 'span', 'caissa-board__coordinate caissa-board__coordinate--file');
            node.dataset.file = file;
            node.textContent = file;
            this.#coordinateNodes.push(node);
            this.#layers.coordinates.append(node);
        }
        for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8']) {
            const node = createElement(this.#document, 'span', 'caissa-board__coordinate caissa-board__coordinate--rank');
            node.dataset.rank = rank;
            node.textContent = rank;
            this.#coordinateNodes.push(node);
            this.#layers.coordinates.append(node);
        }
        this.#positionCoordinates(false);
    }

    #positionCoordinates(track = true) {
        for (const node of this.#coordinateNodes) {
            if (node.dataset.file) {
                const position = visualCoordinates(`${node.dataset.file}1`, this.#orientation);
                this.#setStyleProperty(node, '--caissa-x', String(position.x), track);
            } else {
                const position = visualCoordinates(`a${node.dataset.rank}`, this.#orientation);
                this.#setStyleProperty(node, '--caissa-y', String(position.y), track);
            }
        }
    }

    #commitParsedPosition(parsed, options) {
        if (parsed.placement === this.#parsedPosition.placement) {
            this.#parsedPosition = parsed;
            this.#requestedPosition = parsed;
            this.#metrics.identicalUpdates += 1;
            this.#metrics.lastUpdate = Object.freeze({ reason: 'IDENTICAL_POSITION', nodesAdded: 0, nodesRemoved: 0, movedPieces: 0, attributeMutations: 0, styleMutations: 0 });
            return result(true, 'unchanged', 'IDENTICAL_POSITION', parsed.fen);
        }
        const delta = reconcilePieces(this.#pieces, parsed.entries, this.#allocateId);
        this.#metrics.positionUpdates += 1;
        return this.#commitPieceDelta(delta, parsed, options, 'POSITION_APPLIED');
    }

    #commitPieceDelta(delta, parsed, options, reasonCode) {
        const beforeAttributes = this.#metrics.attributeMutations;
        const beforeStyles = this.#metrics.styleMutations;
        const animate = (options.animate ?? this.#options.animation) === true && !this.#isReducedMotion();
        this.#setAttribute(this.#root, 'data-animate', String(animate));
        this.#cancelDrag(true);
        this.#cancelAnimations();
        this.#generation += 1;

        for (const piece of delta.removed) {
            const node = this.#pieceNodes.get(piece.id);
            if (!node) continue;
            node.remove();
            this.#pieceNodes.delete(piece.id);
            this.#metrics.nodesRemoved += 1;
        }
        for (const move of delta.moved) {
            const node = this.#pieceNodes.get(move.id);
            if (!node) continue;
            this.#setAttribute(node, 'data-square', move.to);
            this.#placePieceNode(node, move.to);
        }
        for (const piece of delta.added) this.#createPieceNode(piece);

        const affectedSquares = new Set([
            ...delta.moved.flatMap(move => [move.from, move.to]),
            ...delta.removed.map(piece => piece.square),
            ...delta.added.map(piece => piece.square)
        ]);
        this.#pieces = [...delta.pieces];
        this.#parsedPosition = parsed;
        this.#requestedPosition = parsed;
        this.#refreshAccessibility(affectedSquares);
        this.#metrics.lastUpdate = Object.freeze({
            reason: reasonCode,
            nodesAdded: delta.added.length,
            nodesRemoved: delta.removed.length,
            movedPieces: delta.moved.length,
            attributeMutations: this.#metrics.attributeMutations - beforeAttributes,
            styleMutations: this.#metrics.styleMutations - beforeStyles
        });
        return result(true, 'accepted', reasonCode, parsed.fen);
    }

    #createPieceNode(piece, track = true) {
        const node = createElement(this.#document, 'img', 'caissa-board__piece');
        node.alt = '';
        node.draggable = false;
        node.setAttribute('aria-hidden', 'true');
        node.dataset.pieceId = piece.id;
        node.dataset.piece = piece.code;
        node.dataset.square = piece.square;
        node.src = this.#options.pieceAssetPath(piece.code);
        this.#placePieceNode(node, piece.square, false);
        this.#pieceNodes.set(piece.id, node);
        this.#layers.pieces.append(node);
        if (track) this.#metrics.nodesAdded += 1;
        return node;
    }

    #placePieceNode(node, square, track = true) {
        if (!node) return;
        const position = visualCoordinates(square, this.#orientation);
        this.#setStyleProperty(node, '--caissa-x', String(position.x), track);
        this.#setStyleProperty(node, '--caissa-y', String(position.y), track);
    }

    #placeSquareNode(node, square, track = true) {
        if (!node) return;
        const position = visualCoordinates(square, this.#orientation);
        this.#setStyleProperty(node, '--caissa-x', String(position.x), track);
        this.#setStyleProperty(node, '--caissa-y', String(position.y), track);
        this.#setAttribute(node, 'aria-colindex', String(position.x + 1), track);
        this.#setAttribute(node, 'aria-rowindex', String(position.y + 1), track);
    }

    #pieceAt(square) {
        return this.#pieces.find(piece => piece.square === square) || null;
    }

    #refreshRootAccessibility() {
        const disabled = !this.#canInteract();
        this.#setAttribute(this.#root, 'aria-label', this.#options.label);
        this.#setAttribute(this.#root, 'aria-disabled', String(disabled));
        this.#setAttribute(this.#root, 'aria-description', boardAccessibleDescription(this.#orientation, this.#interactive, this.#readOnly));
        this.#setAttribute(this.#root, 'aria-activedescendant', this.#squares.get(this.#focusSquare)?.id || '');
    }

    #refreshAccessibility(squares, track = true) {
        for (const square of squares) {
            const node = this.#squares.get(square);
            if (!node) continue;
            this.#setAttribute(node, 'aria-label', squareAccessibleLabel(square, this.#pieceAt(square), this.#orientation), track);
        }
        this.#refreshRootAccessibility();
    }

    #refreshKeyboardFocus(track = true) {
        for (const [square, node] of this.#squares) {
            this.#setAttribute(node, 'data-keyboard-focus', String(square === this.#focusSquare), track);
        }
        this.#setAttribute(this.#root, 'aria-activedescendant', this.#squares.get(this.#focusSquare)?.id || '', track);
    }

    #paintHighlights() {
        for (const square of SQUARES) {
            const node = this.#highlightNodes.get(square);
            const types = this.#highlights.get(square) || new Set();
            const classes = ['caissa-board__highlight'];
            if (this.#selection === square) classes.push('caissa-board__highlight--selected');
            for (const type of types) classes.push(`caissa-board__highlight--${type}`);
            const className = classes.join(' ');
            if (node.className !== className) {
                node.className = className;
                this.#metrics.attributeMutations += 1;
            }
            this.#setAttribute(this.#squares.get(square), 'aria-selected', String(this.#selection === square));
        }
    }

    #renderArrow(arrow) {
        const from = visualCoordinates(arrow.from, this.#orientation);
        const to = visualCoordinates(arrow.to, this.#orientation);
        const start = { x: (from.x + 0.5) * 12.5, y: (from.y + 0.5) * 12.5 };
        const end = { x: (to.x + 0.5) * 12.5, y: (to.y + 0.5) * 12.5 };
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const shortened = { x: end.x - Math.cos(angle) * 3.2, y: end.y - Math.sin(angle) * 3.2 };
        const left = { x: end.x - Math.cos(angle - Math.PI / 6) * 5.2, y: end.y - Math.sin(angle - Math.PI / 6) * 5.2 };
        const right = { x: end.x - Math.cos(angle + Math.PI / 6) * 5.2, y: end.y - Math.sin(angle + Math.PI / 6) * 5.2 };
        const group = this.#document.createElementNS(SVG_NS, 'g');
        group.dataset.arrowId = arrow.id;
        const line = this.#document.createElementNS(SVG_NS, 'line');
        line.classList.add('caissa-board__arrow-line');
        line.setAttribute('x1', start.x); line.setAttribute('y1', start.y);
        line.setAttribute('x2', shortened.x); line.setAttribute('y2', shortened.y);
        line.setAttribute('stroke', arrow.color); line.setAttribute('stroke-width', '5');
        line.setAttribute('opacity', arrow.opacity);
        const head = this.#document.createElementNS(SVG_NS, 'polygon');
        head.classList.add('caissa-board__arrow-head');
        head.setAttribute('points', `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`);
        head.setAttribute('fill', arrow.color); head.setAttribute('opacity', arrow.opacity);
        group.append(line, head);
        this.#layers.arrowGroup.append(group);
    }

    #redrawArrows() {
        this.#layers.arrowGroup.replaceChildren();
        for (const arrow of this.#arrows.values()) this.#renderArrow(arrow);
    }

    #bindInput() {
        this.#listen(this.#root, 'pointerdown', event => this.#onPointerDown(event));
        this.#listen(this.#root, 'pointermove', event => this.#onPointerMove(event), { passive: false });
        this.#listen(this.#root, 'pointerup', event => this.#onPointerUp(event));
        this.#listen(this.#root, 'pointercancel', event => this.#onPointerCancel(event));
        this.#listen(this.#root, 'lostpointercapture', event => {
            if (this.#drag?.pointerId === event.pointerId) this.#cancelDrag(true);
        });
        this.#listen(this.#root, 'keydown', event => this.#onKeyDown(event));
        this.#listen(this.#root, 'contextmenu', event => {
            if (event.target.closest?.('.caissa-board')) event.preventDefault();
        });
        this.#listen(this.#root, 'dragstart', event => event.preventDefault());
    }

    #bindResize() {
        const view = this.#document.defaultView;
        if (typeof view?.ResizeObserver === 'function') {
            this.#resizeObserver = new view.ResizeObserver(() => this.resize());
            this.#resizeObserver.observe(this.#root);
        } else if (view) {
            this.#listen(view, 'resize', () => this.resize());
        }
        if (this.#options.reducedMotion === null && typeof view?.matchMedia === 'function') {
            this.#mediaQuery = view.matchMedia('(prefers-reduced-motion: reduce)');
            this.#mediaQuery.addEventListener?.('change', this.#handleMotionChange);
        }
    }

    #handleMotionChange = () => {
        this.#cancelAnimations();
        this.#syncReducedMotionAttribute();
    };

    #syncReducedMotionAttribute() {
        this.#setAttribute(this.#root, 'data-reduced-motion', String(this.#isReducedMotion()), false);
    }

    #onPointerDown(event) {
        if (!this.#canInteract() || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const square = this.#squareFromEvent(event);
        if (!square) return;
        const piece = this.#pieceAt(square);
        this.#drag = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            from: square,
            startX: event.clientX,
            startY: event.clientY,
            started: false,
            pieceId: piece?.id || null
        };
    }

    #onPointerMove(event) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
        const distance = Math.hypot(event.clientX - this.#drag.startX, event.clientY - this.#drag.startY);
        if (!this.#drag.started && distance >= 6 && this.#drag.pieceId) {
            const accepted = this.#notify('onDragStart', this.#drag.from) !== false;
            if (!accepted) {
                this.#drag = null;
                return;
            }
            this.#drag.started = true;
            this.#root.setPointerCapture?.(event.pointerId);
            this.#setAttribute(this.#pieceNodes.get(this.#drag.pieceId), 'data-dragging', 'true');
        }
        if (!this.#drag?.started) return;
        if (event.cancelable) event.preventDefault();
        const rect = this.#root.getBoundingClientRect();
        const squareSize = Math.min(rect.width, rect.height) / 8;
        const x = event.clientX - rect.left - squareSize / 2;
        const y = event.clientY - rect.top - squareSize / 2;
        const node = this.#pieceNodes.get(this.#drag.pieceId);
        const transform = `translate3d(${x}px, ${y}px, 0)`;
        if (node?.style.transform !== transform) {
            node.style.transform = transform;
            this.#metrics.styleMutations += 1;
        }
    }

    #onPointerUp(event) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
        const drag = this.#drag;
        const to = this.#squareFromEvent(event);
        if (!drag.started) {
            this.#drag = null;
            if (to) this.#handleTap(to, 'tap');
            return;
        }
        this.#drag = null;
        this.#finishDragPresentation(drag);
        this.#notify('onDragEnd', { from: drag.from, to, cancelled: !to });
        if (to && to !== drag.from) this.#attemptMove(drag.from, to, 'drag');
    }

    #onPointerCancel(event) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
        const drag = this.#drag;
        this.#drag = null;
        this.#finishDragPresentation(drag);
        this.#notify('onDragEnd', { from: drag.from, to: null, cancelled: true });
    }

    #cancelDrag(notify) {
        if (!this.#drag) return;
        const drag = this.#drag;
        this.#drag = null;
        if (drag.started) this.#finishDragPresentation(drag);
        if (notify && drag.started) this.#notify('onDragEnd', { from: drag.from, to: null, cancelled: true });
    }

    #finishDragPresentation(drag) {
        const node = this.#pieceNodes.get(drag.pieceId);
        if (node) {
            this.#setAttribute(node, 'data-dragging', null);
            node.style.removeProperty('transform');
            this.#metrics.styleMutations += 1;
            const piece = this.#pieces.find(item => item.id === drag.pieceId);
            if (piece) this.#placePieceNode(node, piece.square);
        }
        if (this.#root.hasPointerCapture?.(drag.pointerId)) this.#root.releasePointerCapture(drag.pointerId);
    }

    #onKeyDown(event) {
        if (!this.#canInteract()) return;
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            this.#focusSquare = navigateSquare(this.#focusSquare, event.key, this.#orientation);
            this.#refreshKeyboardFocus();
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.#handleTap(this.#focusSquare, 'keyboard');
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.clearSelection();
        }
    }

    #handleTap(square, inputMethod) {
        const piece = this.#pieceAt(square);
        this.#notify('onSquareTap', square);
        if (!this.#selection) {
            if (piece) this.selectSquare(square);
            return;
        }
        if (this.#selection === square) {
            this.clearSelection();
            return;
        }
        const from = this.#selection;
        this.clearSelection();
        this.#attemptMove(from, square, inputMethod);
    }

    #attemptMove(from, to, inputMethod) {
        const source = this.#pieceAt(from);
        let promotion = null;
        if (source?.type === 'P' && (to[1] === '1' || to[1] === '8')) {
            const requested = this.#notify('onPromotionRequest', { from, to, color: source.color, inputMethod });
            if (typeof requested === 'string' && /^[qrbn]$/i.test(requested)) promotion = requested.toUpperCase();
        }
        this.#notify('onMoveAttempt', { from, to, promotion, inputMethod });
    }

    #squareFromEvent(event) {
        const rect = this.#root.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = ((event.clientX - rect.left) / rect.width) * 8;
        const y = ((event.clientY - rect.top) / rect.height) * 8;
        if (x < 0 || x >= 8 || y < 0 || y >= 8) return null;
        return squareFromVisualPoint(x, y, this.#orientation);
    }

    #canInteract() {
        return this.#interactive && !this.#readOnly && !this.#destroyed;
    }

    #isLightSquare(square) {
        return (square.charCodeAt(0) - 96 + Number(square[1])) % 2 === 1;
    }

    #isReducedMotion() {
        if (typeof this.#options.reducedMotion === 'boolean') return this.#options.reducedMotion;
        return this.#mediaQuery?.matches === true
            || this.#document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    }

    #cancelAnimations() {
        let cancelled = 0;
        for (const node of this.#pieceNodes.values()) {
            for (const animation of node.getAnimations?.() || []) {
                animation.cancel();
                cancelled += 1;
            }
        }
        if (cancelled) this.#metrics.animationsCancelled += cancelled;
        return cancelled;
    }

    #requestFrame(callback) {
        const view = this.#document.defaultView;
        if (typeof view?.requestAnimationFrame === 'function') return view.requestAnimationFrame(callback);
        return view.setTimeout(callback, 0);
    }

    #cancelPendingFrame() {
        if (this.#pendingFrame !== null) {
            const view = this.#document.defaultView;
            if (typeof view?.cancelAnimationFrame === 'function') view.cancelAnimationFrame(this.#pendingFrame);
            else view?.clearTimeout(this.#pendingFrame);
        }
        this.#pendingFrame = null;
        this.#pendingPosition = null;
    }

    #listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.#listeners.push({ target, type, handler, options });
    }

    #notify(name, payload) {
        try {
            return this.#options[name]?.(payload);
        } catch (error) {
            this.#options.onError?.(error);
            return undefined;
        }
    }

    #setAttribute(node, name, value, track = true) {
        if (!node) return false;
        if (value === null) {
            if (!node.hasAttribute(name)) return false;
            node.removeAttribute(name);
        } else {
            const normalized = String(value);
            if (node.getAttribute(name) === normalized) return false;
            node.setAttribute(name, normalized);
        }
        if (track) this.#metrics.attributeMutations += 1;
        return true;
    }

    #setStyleProperty(node, name, value, track = true) {
        if (!node || node.style.getPropertyValue(name) === value) return false;
        node.style.setProperty(name, value);
        if (track) this.#metrics.styleMutations += 1;
        return true;
    }
}

export function createPersistentRenderer(container, options) {
    return new CaissaPersistentRenderer(container, options);
}
