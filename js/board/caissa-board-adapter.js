import { CaissaPersistentRenderer } from './caissa-persistent-renderer.js';

export const CAISSA_BOARD_EVENTS = Object.freeze([
    'squareTap',
    'moveAttempt',
    'dragStart',
    'dragEnd',
    'promotionRequest',
    'orientationChange',
    'resize',
    'error'
]);

const EVENT_SET = new Set(CAISSA_BOARD_EVENTS);

/**
 * Stable product-facing boundary for CAISSA board presentation.
 *
 * The adapter forwards canonical positions and normalized interaction intent.
 * It never validates or submits moves to a game, protocol, PGN, or engine.
 */
export class CaissaBoardAdapter {
    #renderer;
    #options;
    #listeners = new Map();
    #destroyed = false;
    #metrics = { creates: 1, calls: 0, events: 0 };

    constructor(container, options = {}) {
        this.#options = { ...options };
        const Renderer = options.rendererFactory || CaissaPersistentRenderer;
        const rendererOptions = { ...options };
        delete rendererOptions.rendererFactory;
        Object.assign(rendererOptions, {
            onSquareTap: square => this.#emit('squareTap', square),
            onMoveAttempt: payload => this.#emit('moveAttempt', payload),
            onDragStart: square => this.#emitCancelable('dragStart', square),
            onDragEnd: payload => this.#emit('dragEnd', payload),
            onPromotionRequest: payload => this.#emitPromotionRequest(payload),
            onOrientationChange: orientation => this.#emit('orientationChange', orientation),
            onResize: geometry => this.#emit('resize', geometry),
            onError: error => this.#emit('error', error)
        });
        this.#renderer = new Renderer(container, rendererOptions);
    }

    on(type, listener) {
        if (!EVENT_SET.has(type)) throw new TypeError(`Unsupported CAISSA board event: ${type}`);
        if (typeof listener !== 'function') throw new TypeError('Board event listener must be a function.');
        if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
        this.#listeners.get(type).add(listener);
        return () => this.off(type, listener);
    }

    off(type, listener) {
        return this.#listeners.get(type)?.delete(listener) || false;
    }

    destroy() {
        if (this.#destroyed) return Object.freeze({ ok: true, status: 'unchanged', reasonCode: 'ADAPTER_DESTROYED' });
        this.#destroyed = true;
        this.#listeners.clear();
        return this.#renderer.destroy();
    }

    setPosition(fen, options) { return this.#call('setPosition', fen, options); }
    applyMove(move, options) { return this.#call('applyMove', move, options); }
    setOrientation(color) { return this.#call('setOrientation', color); }
    setInteractive(enabled) { return this.#call('setInteractive', enabled); }
    setReadOnly(enabled) { return this.#call('setReadOnly', enabled); }
    selectSquare(square) { return this.#call('selectSquare', square); }
    clearSelection() { return this.#call('clearSelection'); }
    highlightSquares(items) { return this.#call('highlightSquares', items); }
    clearHighlights() { return this.#call('clearHighlights'); }
    drawArrow(from, to, options) { return this.#call('drawArrow', from, to, options); }
    clearArrows() { return this.#call('clearArrows'); }
    resize() { return this.#call('resize'); }
    flushPending() { return this.#call('flushPending'); }
    getPosition() { return this.#call('getPosition'); }
    getOrientation() { return this.#call('getOrientation'); }

    getMetrics() {
        return Object.freeze({
            adapter: Object.freeze({ ...this.#metrics, destroyed: this.#destroyed }),
            renderer: this.#renderer.getMetrics()
        });
    }

    #call(method, ...args) {
        if (this.#destroyed && method !== 'getMetrics') {
            return Object.freeze({ ok: false, status: 'disposed', reasonCode: 'ADAPTER_DESTROYED' });
        }
        this.#metrics.calls += 1;
        return this.#renderer[method](...args);
    }

    #configuredCallback(type) {
        return this.#options[`on${type[0].toUpperCase()}${type.slice(1)}`];
    }

    #responses(type, payload) {
        this.#metrics.events += 1;
        const responses = [];
        const configured = this.#configuredCallback(type);
        if (typeof configured === 'function') responses.push(configured(payload));
        for (const listener of this.#listeners.get(type) || []) responses.push(listener(payload));
        return responses;
    }

    #emit(type, payload) {
        this.#responses(type, payload);
    }

    #emitCancelable(type, payload) {
        return !this.#responses(type, payload).some(response => response === false);
    }

    #emitPromotionRequest(payload) {
        return this.#responses('promotionRequest', payload)
            .find(response => typeof response === 'string' && /^[qrbn]$/i.test(response)) || null;
    }
}

export function create(container, options) {
    return new CaissaBoardAdapter(container, options);
}

export default Object.freeze({ create, CaissaBoardAdapter, CAISSA_BOARD_EVENTS });
