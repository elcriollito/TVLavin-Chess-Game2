import { create as createBoardAdapter } from '../board/caissa-board-adapter.js';

function semanticMove(node) {
    const flags = String(node?.flags || '');
    const move = { from: node?.from, to: node?.to };
    if (flags.includes('c')) move.capture = true;
    if (flags.includes('e')) move.enPassant = true;
    if (flags.includes('k') || flags.includes('q')) move.castle = true;
    if (node?.promotion || flags.includes('p')) move.promotion = String(node?.promotion || 'q').toUpperCase();
    return move;
}

export class PgnBoard {
    constructor(container, options = {}) {
        if (!container) throw new TypeError('A PGN board container is required.');
        const createAdapter = options.adapterFactory || createBoardAdapter;
        this.container = container;
        this.currentNodeId = null;
        this.stats = { semanticMoves: 0, sandboxMoves: 0, positionSets: 0, semanticFallbacks: 0 };
        this.adapter = createAdapter(container, {
            label: 'PGN Reader chessboard',
            position: options.position || 'start',
            orientation: options.orientation === 'black' ? 'black' : 'white',
            interactive: false,
            readOnly: true,
            animation: options.animation !== false,
            animationDuration: 180
        });
        container.querySelector?.('.caissa-board')?.setAttribute('aria-readonly', 'true');
    }

    render(fen, node = null, options = {}) {
        const targetFen = fen || 'start';
        const animate = options.animate !== false;
        let result;
        let strategy = options.strategy === 'move' ? 'move' : 'position';
        const position = this.adapter.getPosition();
        const isSequential = strategy === 'move'
            && node?.from && node?.to
            && node.previousId === this.currentNodeId
            && position.renderedFen === node.fenBefore;

        if (isSequential) {
            result = this.adapter.applyMove(semanticMove(node), { fen: targetFen, animate });
            if (result?.ok) this.stats.semanticMoves += 1;
            else strategy = 'position';
        } else {
            strategy = 'position';
        }

        if (strategy === 'position') {
            if (options.strategy === 'move') this.stats.semanticFallbacks += 1;
            result = this.adapter.setPosition(targetFen, { animate });
            this.stats.positionSets += 1;
        }

        this.adapter.highlightSquares(node?.from && node?.to
            ? [{ square: node.from, type: 'last' }, { square: node.to, type: 'last' }]
            : []);
        this.currentNodeId = node?.id || null;
        this.container.dataset.pgnUpdateStrategy = strategy;
        return result;
    }

    setPosition(fen, node = null, animate = true) {
        return this.render(fen, node, { animate, strategy: 'position' });
    }

    applyNode(node, options = {}) {
        return this.render(node?.fenAfter, node, { ...options, strategy: 'move' });
    }

    applySandboxMove(move, fen, animate = true) {
        let result = this.adapter.applyMove(semanticMove(move), { fen, animate });
        if (result?.ok) this.stats.sandboxMoves += 1;
        else {
            result = this.adapter.setPosition(fen, { animate: false });
            this.stats.semanticFallbacks += 1;
            this.stats.positionSets += 1;
        }
        this.adapter.highlightSquares([
            { square: move.from, type: 'last' },
            { square: move.to, type: 'last' }
        ]);
        this.container.dataset.pgnUpdateStrategy = result?.ok ? 'sandbox-move' : 'position';
        return result;
    }

    setInteractive(enabled) {
        this.adapter.setInteractive(enabled === true);
        this.adapter.setReadOnly(enabled !== true);
        this.adapter.clearSelection();
        const root = this.container.querySelector?.('.caissa-board');
        const readOnly = String(enabled !== true);
        if (root?.getAttribute('aria-readonly') !== readOnly) root?.setAttribute('aria-readonly', readOnly);
    }

    showSelection(square, legalSquares = []) {
        this.adapter.highlightSquares(legalSquares.map(target => ({ square: target, type: 'legal' })));
        if (square) this.adapter.selectSquare(square);
        else this.adapter.clearSelection();
    }

    on(type, listener) { return this.adapter.on(type, listener); }

    flip() {
        const orientation = this.adapter.getOrientation() === 'white' ? 'black' : 'white';
        this.adapter.setOrientation(orientation);
        return orientation;
    }

    resize() { return this.adapter.resize(); }

    inspect() {
        return Object.freeze({
            currentNodeId: this.currentNodeId,
            strategy: this.container.dataset.pgnUpdateStrategy || 'position',
            stats: Object.freeze({ ...this.stats }),
            position: this.adapter.getPosition(),
            metrics: this.adapter.getMetrics()
        });
    }

    destroy() { return this.adapter.destroy(); }
}

export function create(container, options) {
    return new PgnBoard(container, options);
}

export default Object.freeze({ create, PgnBoard });
