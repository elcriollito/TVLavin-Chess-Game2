import { CaissaPointerController } from './caissa-quiet-drag.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const QA_QUERY = 'quiet-drag-lab';
const instances = new Set();
let qaMode = 'quiet';
let qaPanel = null;

function normalizeOrientation(value) {
    return value === 'black' ? 'black' : 'white';
}

function pieceCode(node) {
    const explicit = node?.dataset?.piece;
    if (/^[wb][KQRBNP]$/.test(explicit || '')) return explicit;
    const match = String(node?.getAttribute?.('src') || '').match(/\/([wb][KQRBNP])\.(?:png|svg|webp)(?:\?|$)/i);
    return match ? `${match[1][0].toLowerCase()}${match[1][1].toUpperCase()}` : null;
}

function squareSurfaceRect(root) {
    const first = root?.querySelector?.('.square-55d63');
    const rect = first?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return root.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width * 8,
        height: rect.height * 8
    };
}

function localQaRequested(view) {
    if (!LOCAL_HOSTS.has(view?.location?.hostname)) return false;
    return new URLSearchParams(view.location.search).get(QA_QUERY) === '1';
}

function syncQaPanel() {
    if (!qaPanel) return;
    qaPanel.querySelectorAll('[data-caissa-legacy-drag-mode]').forEach(button => {
        const selected = button.dataset.caissaLegacyDragMode === qaMode;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

function setQaMode(mode) {
    qaMode = mode === 'legacy' ? 'legacy' : 'quiet';
    for (const instance of instances) instance.refreshEnabledState();
    syncQaPanel();
    return qaMode;
}

function installQaPanel(documentRef) {
    const view = documentRef?.defaultView;
    if (!localQaRequested(view) || qaPanel?.isConnected) return;
    qaPanel = documentRef.createElement('aside');
    qaPanel.className = 'caissa-legacy-drag-qa';
    qaPanel.setAttribute('aria-label', 'FICS drag comparison');
    qaPanel.innerHTML = `
        <span>FICS drag</span>
        <button type="button" data-caissa-legacy-drag-mode="legacy">Legacy Drag</button>
        <button type="button" data-caissa-legacy-drag-mode="quiet">Quiet Drag</button>
    `;
    qaPanel.addEventListener('click', event => {
        const button = event.target.closest?.('[data-caissa-legacy-drag-mode]');
        if (button) setQaMode(button.dataset.caissaLegacyDragMode);
    });
    documentRef.body.append(qaPanel);
    syncQaPanel();
}

export class CaissaLegacyQuietDragAdapter {
    #root;
    #board;
    #options;
    #controller;
    #activeDrag = null;
    #enabled = true;
    #destroyed = false;
    #legacyStartBlocker;
    #metrics = {
        presentationStarts: 0,
        presentationEnds: 0,
        movementVisualWrites: 0,
        dropAttempts: 0,
        acceptedDrops: 0,
        rejectedDrops: 0,
        originalPiecesMoved: 0
    };

    constructor(container, options = {}) {
        this.#root = container?.querySelector?.('.board-b72b1');
        this.#board = options.board;
        this.#options = options;
        if (!this.#root || !this.#board) {
            throw new TypeError('Legacy Quiet Drag requires a mounted Chessboard.js board.');
        }

        this.#controller = new CaissaPointerController(this.#root, {
            canInteract: () => this.#canInteract(),
            getOrientation: () => normalizeOrientation(this.#board.orientation?.()),
            getBoardRect: () => squareSurfaceRect(this.#root),
            preventDefaultOnPointerDown: true,
            startImmediately: true,
            allowsDrag: () => true,
            resolvePiece: square => {
                const node = this.#root.querySelector(`.square-${square} .piece-417db`);
                const id = pieceCode(node);
                return node && id ? { id, node } : null;
            },
            onDragStart: (source, drag) => this.#options.onDragStart?.(source, drag.pieceId) !== false,
            onTap: square => this.#options.onTap?.(square),
            onMoveAttempt: (source, target) => this.#drop(source, target),
            onPresentationStart: drag => this.#beginPresentation(drag),
            onVisualWrite: (drag, x, y) => this.#write(drag, x, y),
            onPresentationEnd: drag => this.#endPresentation(drag)
        });
        this.#legacyStartBlocker = event => {
            if (!this.#canInteract() || !event.target?.closest?.('.square-55d63')) return;
            if (event.cancelable) event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        };
        this.#root.addEventListener('mousedown', this.#legacyStartBlocker, true);
        this.#root.addEventListener('touchstart', this.#legacyStartBlocker, { capture: true, passive: false });
        instances.add(this);
        installQaPanel(this.#root.ownerDocument);
        this.refreshEnabledState();
    }

    #canInteract() {
        return !this.#destroyed
            && this.#enabled
            && this.#options.isEnabled?.() !== false
            && this.#root.isConnected !== false;
    }

    #beginPresentation(drag) {
        this.#endPresentation(this.#activeDrag);
        const node = drag.node;
        if (!node) return;
        const start = drag.resolver.dragPosition(drag.startX, drag.startY, drag.grabOffset);
        drag.presentationOrigin = Object.freeze({
            x: (drag.pieceRect?.left || 0) - drag.resolver.geometry.left,
            y: (drag.pieceRect?.top || 0) - drag.resolver.geometry.top
        });
        drag.previousTransform = node.style.transform;
        node.classList.add('caissa-legacy-quiet-drag-piece');
        node.setAttribute('data-caissa-quiet-drag-piece', 'true');
        node.closest?.('.square-55d63')?.setAttribute('data-caissa-quiet-drag-source', 'true');
        node.style.transform = `translate3d(${start.x - drag.presentationOrigin.x}px, ${start.y - drag.presentationOrigin.y}px, 0)`;
        this.#root.setAttribute('data-caissa-legacy-quiet-drag-active', 'true');
        this.#activeDrag = drag;
        this.#metrics.presentationStarts += 1;
        this.#metrics.originalPiecesMoved += 1;
    }

    #write(drag, x, y) {
        if (drag !== this.#activeDrag || !drag.node || !drag.presentationOrigin) return;
        drag.node.style.transform = `translate3d(${x - drag.presentationOrigin.x}px, ${y - drag.presentationOrigin.y}px, 0)`;
        this.#metrics.movementVisualWrites += 1;
    }

    #drop(source, target) {
        this.#metrics.dropAttempts += 1;
        const outcome = this.#options.onDrop?.(source, target, { caissaQuietDrag: true });
        if (outcome === 'snapback') this.#metrics.rejectedDrops += 1;
        else this.#metrics.acceptedDrops += 1;
        this.#options.onSnapEnd?.();
        return outcome;
    }

    #endPresentation(drag) {
        const active = drag || this.#activeDrag;
        if (active?.node) {
            active.node.classList.remove('caissa-legacy-quiet-drag-piece');
            active.node.removeAttribute('data-caissa-quiet-drag-piece');
            if (active.previousTransform) active.node.style.transform = active.previousTransform;
            else active.node.style.removeProperty('transform');
        }
        active?.node?.closest?.('.square-55d63')?.removeAttribute?.('data-caissa-quiet-drag-source');
        this.#root.removeAttribute('data-caissa-legacy-quiet-drag-active');
        if (this.#activeDrag) this.#metrics.presentationEnds += 1;
        this.#activeDrag = null;
    }

    setEnabled(value) {
        this.#enabled = value === true;
        if (!this.#enabled) this.#controller.cancel(false);
        this.#options.onEnabledChange?.(this.#enabled);
        this.#root.setAttribute('data-caissa-legacy-quiet-drag-enabled', String(this.#enabled));
        return this.#enabled;
    }

    refreshEnabledState() {
        const view = this.#root.ownerDocument?.defaultView;
        const enabled = !localQaRequested(view) || qaMode === 'quiet';
        return this.setEnabled(enabled);
    }

    getMetrics() {
        return Object.freeze({
            ...this.#metrics,
            enabled: this.#enabled,
            active: this.#activeDrag !== null,
            representationCount: this.#root.querySelectorAll('.caissa-legacy-quiet-drag-piece').length,
            legacyInput: this.#options.getLegacyInputState?.() || null,
            controller: this.#controller.getMetrics()
        });
    }

    destroy() {
        if (this.#destroyed) return false;
        this.#destroyed = true;
        this.#controller.destroy();
        this.#root.removeEventListener('mousedown', this.#legacyStartBlocker, true);
        this.#root.removeEventListener('touchstart', this.#legacyStartBlocker, true);
        this.#endPresentation(this.#activeDrag);
        this.#root.removeAttribute('data-caissa-legacy-quiet-drag-enabled');
        this.#options.onEnabledChange?.(false);
        instances.delete(this);
        return true;
    }
}

export function create(container, options) {
    return new CaissaLegacyQuietDragAdapter(container, options);
}

const publicApi = Object.freeze({ create, setQaMode, getQaMode: () => qaMode });

if (typeof window !== 'undefined') window.CaissaLegacyQuietDragAdapter = publicApi;
