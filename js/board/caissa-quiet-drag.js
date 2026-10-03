import { squareFromVisualPoint } from './caissa-board-a11y.js';

const DRAG_THRESHOLD_PX = 6;

function frozenRect(rect) {
    return Object.freeze({
        left: Number(rect.left) || 0,
        top: Number(rect.top) || 0,
        width: Number(rect.width) || 0,
        height: Number(rect.height) || 0
    });
}

export class CaissaDropResolver {
    #board;
    #orientation;

    constructor(boardRect, orientation) {
        this.#board = frozenRect(boardRect);
        this.#orientation = orientation === 'black' ? 'black' : 'white';
    }

    static capture(root, orientation) {
        return new CaissaDropResolver(root.getBoundingClientRect(), orientation);
    }

    get geometry() {
        return this.#board;
    }

    squareAt(clientX, clientY) {
        if (!this.#board.width || !this.#board.height) return null;
        const x = ((clientX - this.#board.left) / this.#board.width) * 8;
        const y = ((clientY - this.#board.top) / this.#board.height) * 8;
        if (x < 0 || x >= 8 || y < 0 || y >= 8) return null;
        return squareFromVisualPoint(x, y, this.#orientation);
    }

    dragPosition(clientX, clientY, grabOffset) {
        return Object.freeze({
            x: clientX - this.#board.left - grabOffset.x,
            y: clientY - this.#board.top - grabOffset.y
        });
    }
}

export class CaissaDragScheduler {
    #view;
    #write;
    #frame = null;
    #latest = null;
    #generation = 0;
    #destroyed = false;
    #metrics = {
        inputEvents: 0,
        coalescedEvents: 0,
        framesRequested: 0,
        visualWrites: 0,
        cancelledFrames: 0
    };

    constructor(view, write) {
        if (!view || typeof write !== 'function') throw new TypeError('Quiet Drag scheduler requires a view and writer.');
        this.#view = view;
        this.#write = write;
    }

    update(point, coalescedCount = 0) {
        if (this.#destroyed) return false;
        this.#metrics.inputEvents += 1;
        this.#metrics.coalescedEvents += Math.max(0, Number(coalescedCount) || 0);
        this.#latest = point;
        if (this.#frame !== null) return true;
        const generation = this.#generation;
        this.#metrics.framesRequested += 1;
        this.#frame = this.#requestFrame(() => {
            this.#frame = null;
            if (this.#destroyed || generation !== this.#generation || !this.#latest) return;
            const latest = this.#latest;
            this.#latest = null;
            this.#write(latest);
            this.#metrics.visualWrites += 1;
        });
        return true;
    }

    cancel() {
        this.#generation += 1;
        this.#latest = null;
        if (this.#frame !== null) {
            this.#cancelFrame(this.#frame);
            this.#frame = null;
            this.#metrics.cancelledFrames += 1;
        }
    }

    destroy() {
        this.cancel();
        this.#destroyed = true;
    }

    getMetrics() {
        return Object.freeze({
            ...this.#metrics,
            pendingFrame: this.#frame !== null,
            destroyed: this.#destroyed
        });
    }

    #requestFrame(callback) {
        if (typeof this.#view.requestAnimationFrame === 'function') return this.#view.requestAnimationFrame(callback);
        return this.#view.setTimeout(callback, 0);
    }

    #cancelFrame(frame) {
        if (typeof this.#view.cancelAnimationFrame === 'function') this.#view.cancelAnimationFrame(frame);
        else this.#view.clearTimeout?.(frame);
    }
}

export class CaissaPointerController {
    #root;
    #view;
    #options;
    #listeners = [];
    #drag = null;
    #scheduler;
    #destroyed = false;
    #metrics = {
        pointerDowns: 0,
        pointerMoves: 0,
        dragStarts: 0,
        drops: 0,
        taps: 0,
        cancellations: 0,
        geometryReadsAtStart: 0,
        geometryReadsDuringMove: 0,
        coalescedSamples: 0
    };

    constructor(root, options = {}) {
        if (!root?.addEventListener) throw new TypeError('Quiet Drag pointer controller requires a root element.');
        this.#root = root;
        this.#view = root.ownerDocument?.defaultView || globalThis;
        this.#options = options;
        this.#scheduler = new CaissaDragScheduler(this.#view, point => this.#write(point));
        this.#listen('pointerdown', event => this.#onPointerDown(event));
        this.#listen('pointermove', event => this.#onPointerMove(event), { passive: false });
        this.#listen('pointerup', event => this.#onPointerUp(event));
        this.#listen('pointercancel', event => this.#onPointerCancel(event));
        this.#listen('lostpointercapture', event => this.#onLostPointerCapture(event));
    }

    cancel(notify = false) {
        if (!this.#drag) return false;
        const drag = this.#drag;
        this.#drag = null;
        this.#scheduler.cancel();
        if (drag.started) {
            this.#options.onPresentationEnd?.(drag);
            if (notify) this.#options.onDragEnd?.({ from: drag.from, to: null, cancelled: true });
            this.#metrics.cancellations += 1;
        }
        this.#releaseCapture(drag.pointerId);
        return true;
    }

    destroy() {
        if (this.#destroyed) return;
        this.cancel(false);
        this.#scheduler.destroy();
        for (const listener of this.#listeners) {
            this.#root.removeEventListener(listener.type, listener.handler, listener.options);
        }
        this.#listeners = [];
        this.#destroyed = true;
    }

    getMetrics() {
        return Object.freeze({
            ...this.#metrics,
            active: this.#drag !== null,
            started: this.#drag?.started === true,
            pointerId: this.#drag?.pointerId ?? null,
            pointerCaptured: this.#drag
                ? this.#root.hasPointerCapture?.(this.#drag.pointerId) === true
                : false,
            listenerCount: this.#listeners.length,
            scheduler: this.#scheduler.getMetrics()
        });
    }

    #listen(type, handler, options) {
        this.#root.addEventListener(type, handler, options);
        this.#listeners.push({ type, handler, options });
    }

    #onPointerDown(event) {
        if (this.#destroyed || !this.#options.canInteract?.()
            || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        this.cancel(false);
        const geometry = this.#options.getBoardRect?.() || this.#root.getBoundingClientRect();
        const resolver = new CaissaDropResolver(geometry, this.#options.getOrientation?.());
        this.#metrics.geometryReadsAtStart += 1;
        const from = resolver.squareAt(event.clientX, event.clientY);
        if (!from) return;
        const piece = this.#options.resolvePiece?.(from) || null;
        let grabOffset = Object.freeze({ x: 0, y: 0 });
        let pieceRect = null;
        if (piece?.node) {
            pieceRect = frozenRect(piece.node.getBoundingClientRect());
            this.#metrics.geometryReadsAtStart += 1;
            grabOffset = Object.freeze({
                x: event.clientX - pieceRect.left,
                y: event.clientY - pieceRect.top
            });
        }
        this.#metrics.pointerDowns += 1;
        this.#drag = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            from,
            startX: event.clientX,
            startY: event.clientY,
            maxDistance: 0,
            started: false,
            resolver,
            grabOffset,
            pieceId: piece?.id || null,
            node: piece?.node || null,
            pieceRect
        };
        if (piece?.node && this.#options.preventDefaultOnPointerDown === true && event.cancelable) {
            event.preventDefault();
        }
        try { this.#root.setPointerCapture?.(event.pointerId); } catch (_) {}
        if (piece?.id && this.#options.startImmediately === true
            && this.#options.allowsDrag?.(event.pointerType)) {
            if (this.#options.onDragStart?.(from, this.#drag) === false) {
                this.cancel(false);
                return;
            }
            this.#drag.started = true;
            this.#metrics.dragStarts += 1;
            this.#options.onPresentationStart?.(this.#drag);
        }
    }

    #onPointerMove(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        this.#metrics.pointerMoves += 1;
        const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
        // The dispatched event is the authoritative latest coordinate. WebKit
        // can expose a coalesced list whose final sample trails this event.
        const latest = event;
        this.#metrics.coalescedSamples += samples.length;
        const distance = Math.hypot(latest.clientX - drag.startX, latest.clientY - drag.startY);
        drag.maxDistance = Math.max(drag.maxDistance, distance);
        if (!drag.started && distance >= DRAG_THRESHOLD_PX && drag.pieceId
            && this.#options.allowsDrag?.(drag.pointerType)) {
            if (this.#options.onDragStart?.(drag.from, drag) === false) {
                this.cancel(false);
                return;
            }
            drag.started = true;
            this.#metrics.dragStarts += 1;
            this.#options.onPresentationStart?.(drag);
        }
        if (!drag.started) return;
        if (event.cancelable) event.preventDefault();
        this.#scheduler.update({
            ...drag.resolver.dragPosition(latest.clientX, latest.clientY, drag.grabOffset),
            clientX: latest.clientX,
            clientY: latest.clientY,
            drag
        }, samples.length);
    }

    #onPointerUp(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const to = drag.resolver.squareAt(event.clientX, event.clientY);
        this.#drag = null;
        this.#scheduler.cancel();
        this.#releaseCapture(drag.pointerId);
        if (drag.started && drag.maxDistance < DRAG_THRESHOLD_PX && to === drag.from
            && typeof this.#options.onTap === 'function') {
            this.#options.onPresentationEnd?.(drag);
            this.#options.onTap(to, drag);
            this.#metrics.taps += 1;
            return;
        }
        if (!drag.started) {
            if (to) {
                this.#options.onTap?.(to, drag);
                this.#metrics.taps += 1;
            }
            return;
        }
        this.#options.onDragEnd?.({ from: drag.from, to, cancelled: !to });
        if (to && to !== drag.from) this.#options.onMoveAttempt?.(drag.from, to);
        // Keep the quiet, transition-free presentation in force while the
        // existing move authority synchronously resolves the destination.
        this.#options.onPresentationEnd?.(drag);
        this.#metrics.drops += 1;
    }

    #onPointerCancel(event) {
        if (this.#drag?.pointerId === event.pointerId) this.cancel(true);
    }

    #onLostPointerCapture(event) {
        if (this.#drag?.pointerId !== event.pointerId) return;
        const drag = this.#drag;
        this.#drag = null;
        this.#scheduler.cancel();
        if (drag.started) {
            this.#options.onPresentationEnd?.(drag);
            this.#options.onDragEnd?.({ from: drag.from, to: null, cancelled: true });
            this.#metrics.cancellations += 1;
        }
    }

    #write(point) {
        if (!this.#drag || point.drag !== this.#drag || !this.#drag.started) return;
        this.#options.onVisualWrite?.(point.drag, point.x, point.y);
    }

    #releaseCapture(pointerId) {
        try {
            if (this.#root.hasPointerCapture?.(pointerId)) this.#root.releasePointerCapture(pointerId);
        } catch (_) {}
    }
}
