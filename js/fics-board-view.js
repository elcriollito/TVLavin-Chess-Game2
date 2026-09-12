(function installFicsBoardView(root) {
    'use strict';

    const FLAG = 'CAISSA_FICS_PERSISTENT_BOARD_PILOT';
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const ADAPTER_URL = '/js/board/caissa-board-adapter.js';
    const STYLESHEET_URL = '/css/caissa-board.css';

    function featureEnabled(host = root) {
        return host?.[FLAG] === true;
    }

    function observeEligible(state = {}) {
        const relation = Number(state.relation);
        return state.observedGame === true
            && state.status === 'observing'
            && state.gameActive !== true
            && relation !== 1
            && relation !== -1;
    }

    function placement(fen) {
        if (fen === 'start') return START_FEN.split(' ')[0];
        return String(fen || '').trim().split(/\s+/)[0] || null;
    }

    function percentile(values, fraction) {
        if (!values.length) return 0;
        const ordered = [...values].sort((left, right) => left - right);
        return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
    }

    function loadStylesheet(documentRef) {
        if (!documentRef?.head) return Promise.resolve();
        const existing = documentRef.querySelector?.(`link[data-caissa-fics-board-pilot="true"]`);
        if (existing?.sheet) return Promise.resolve();
        if (existing) {
            return new Promise((resolve, reject) => {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', () => reject(new Error('Persistent board stylesheet failed to load.')), { once: true });
            });
        }
        const link = documentRef.createElement('link');
        link.rel = 'stylesheet';
        link.href = STYLESHEET_URL;
        link.dataset.caissaFicsBoardPilot = 'true';
        const ready = new Promise((resolve, reject) => {
            link.addEventListener('load', resolve, { once: true });
            link.addEventListener('error', () => reject(new Error('Persistent board stylesheet failed to load.')), { once: true });
        });
        documentRef.head.append(link);
        return ready;
    }

    function createFicsBoardView(options = {}) {
        const container = options.container;
        if (!container || typeof container.replaceChildren !== 'function') {
            throw new TypeError('FICS board view requires a board container.');
        }
        if (typeof options.createLegacy !== 'function') {
            throw new TypeError('FICS board view requires the existing legacy board factory.');
        }

        const host = options.host || root;
        const documentRef = options.document || container.ownerDocument || host.document;
        const requestFrame = options.requestAnimationFrame
            || host.requestAnimationFrame?.bind(host)
            || (callback => host.setTimeout(callback, 0));
        const cancelFrame = options.cancelAnimationFrame
            || host.cancelAnimationFrame?.bind(host)
            || (handle => host.clearTimeout(handle));
        const loadAdapter = options.loadAdapter || (() => import(ADAPTER_URL));
        const ensureStyles = options.loadStyles || (() => loadStylesheet(documentRef));
        const clock = options.now || (() => host.performance?.now?.() || Date.now());
        const durations = [];
        const metrics = {
            legacyCreates: 0,
            persistentCreates: 0,
            rendererSwitches: 0,
            canonicalUpdates: 0,
            visualUpdates: 0,
            semanticMoves: 0,
            snapshotFallbacks: 0,
            duplicatePositions: 0,
            coalescedVisualUpdates: 0,
            staleActivations: 0,
            activationFailures: 0,
            inputEvents: 0,
            snapshotFallbackReasons: {}
        };

        let renderer = null;
        let rendererKind = null;
        let latest = null;
        let activation = null;
        let activationGeneration = 0;
        let visualFrame = null;
        let pendingVisual = null;
        let idlePromise = Promise.resolve();
        let resolveIdle = null;
        let destroyed = false;

        function markBusy() {
            if (resolveIdle) return;
            idlePromise = new Promise(resolve => { resolveIdle = resolve; });
        }

        function markIdle() {
            const resolve = resolveIdle;
            resolveIdle = null;
            resolve?.();
        }

        function activePosition() {
            if (rendererKind === 'persistent') return renderer?.getPosition?.().placement || null;
            if (rendererKind === 'legacy') return renderer?.position?.('fen') || null;
            return null;
        }

        function activeOrientation() {
            if (rendererKind === 'persistent') return renderer?.getOrientation?.() || 'white';
            if (rendererKind === 'legacy') return renderer?.orientation?.() || 'white';
            return 'white';
        }

        function createLegacy(position = 'start', orientation = 'white') {
            container.replaceChildren();
            renderer = options.createLegacy(position, orientation);
            rendererKind = 'legacy';
            metrics.legacyCreates += 1;
            container.removeAttribute('data-fics-board-renderer');
            options.onRendererChange?.('legacy', facade);
            return renderer;
        }

        function cancelVisualUpdate() {
            if (visualFrame !== null) cancelFrame(visualFrame);
            visualFrame = null;
            pendingVisual = null;
            markIdle();
        }

        function switchToLegacy(position, orientation) {
            activationGeneration += 1;
            cancelVisualUpdate();
            if (rendererKind === 'legacy') return renderer;
            renderer?.destroy?.();
            renderer = null;
            rendererKind = null;
            metrics.rendererSwitches += 1;
            return createLegacy(position || 'start', orientation || 'white');
        }

        function persistentOptions(position, orientation) {
            return {
                label: 'FICS observed game chessboard',
                position: position || START_FEN,
                orientation: orientation === 'black' ? 'black' : 'white',
                interactive: false,
                readOnly: true,
                animation: true,
                coalesce: false,
                onSquareTap: () => { metrics.inputEvents += 1; },
                onMoveAttempt: () => { metrics.inputEvents += 1; },
                onDragStart: () => { metrics.inputEvents += 1; return false; },
                onError: error => options.onError?.(error)
            };
        }

        function activatePersistent() {
            if (activation || rendererKind === 'persistent' || destroyed) return activation || Promise.resolve(renderer);
            const generation = ++activationGeneration;
            markBusy();
            activation = Promise.all([loadAdapter(), ensureStyles()])
                .then(([module]) => {
                    if (destroyed || generation !== activationGeneration || !featureEnabled(host)
                        || !observeEligible(latest?.state)) {
                        metrics.staleActivations += 1;
                        return renderer;
                    }
                    const create = module?.create;
                    if (typeof create !== 'function') throw new TypeError('CaissaBoardAdapter factory is unavailable.');
                    const current = latest;
                    renderer?.destroy?.();
                    renderer = null;
                    rendererKind = null;
                    container.replaceChildren();
                    renderer = create(container, persistentOptions(current.position, current.orientation));
                    renderer.setInteractive(false);
                    renderer.setReadOnly(true);
                    rendererKind = 'persistent';
                    metrics.persistentCreates += 1;
                    metrics.rendererSwitches += 1;
                    container.setAttribute('data-fics-board-renderer', 'persistent');
                    options.onRendererChange?.('persistent', facade);
                    return renderer;
                })
                .catch(error => {
                    metrics.activationFailures += 1;
                    options.onError?.(error);
                    if (!renderer && latest) createLegacy(latest.position || 'start', latest.orientation || 'white');
                    return renderer;
                })
                .finally(() => {
                    activation = null;
                    if (visualFrame === null) markIdle();
                });
            return activation;
        }

        function commitVisual(update) {
            if (rendererKind !== 'persistent' || !renderer || update.reviewing) return false;
            const started = clock();
            const currentPlacement = renderer.getPosition?.().renderedPlacement || renderer.getPosition?.().placement;
            const targetPlacement = placement(update.position);
            if (currentPlacement === targetPlacement) {
                renderer.setPosition(update.position, { animate: false, coalesce: false });
                metrics.duplicatePositions += 1;
                metrics.visualUpdates += 1;
                durations.push(Math.max(0, clock() - started));
                return true;
            }
            const canApplySemantic = update.count === 1
                && update.semanticMove
                && currentPlacement === placement(update.previousFen);
            let fallbackReason = update.count > 1 ? 'VISUAL_BURST'
                : !update.semanticMove ? 'NO_TRUSTWORTHY_MOVE'
                    : currentPlacement !== placement(update.previousFen) ? 'VISUAL_BASELINE_MISMATCH'
                        : 'SEMANTIC_MOVE_REJECTED';
            if (canApplySemantic) {
                const response = renderer.applyMove(update.semanticMove, {
                    fen: update.position,
                    animate: update.animate !== false
                });
                if (response?.ok) {
                    metrics.semanticMoves += 1;
                    metrics.visualUpdates += 1;
                    durations.push(Math.max(0, clock() - started));
                    return true;
                }
                fallbackReason = response?.reasonCode || fallbackReason;
            }
            renderer.setPosition(update.position, {
                animate: update.animate === true,
                coalesce: false
            });
            metrics.snapshotFallbacks += 1;
            metrics.snapshotFallbackReasons[fallbackReason] = (metrics.snapshotFallbackReasons[fallbackReason] || 0) + 1;
            metrics.visualUpdates += 1;
            durations.push(Math.max(0, clock() - started));
            return true;
        }

        function queueVisual(update) {
            if (pendingVisual) {
                metrics.coalescedVisualUpdates += 1;
                pendingVisual = { ...update, count: pendingVisual.count + 1 };
                return;
            }
            pendingVisual = { ...update, count: 1 };
            markBusy();
            visualFrame = requestFrame(() => {
                visualFrame = null;
                const pending = pendingVisual;
                pendingVisual = null;
                if (pending && rendererKind === 'persistent') commitVisual(pending);
                if (!activation) markIdle();
            });
        }

        function presentCanonicalState(update = {}) {
            if (destroyed || !update.position) return false;
            metrics.canonicalUpdates += 1;
            latest = {
                ...update,
                orientation: update.orientation === 'black' ? 'black' : 'white'
            };
            if (!featureEnabled(host) || !observeEligible(latest.state)) {
                const legacy = switchToLegacy(latest.position, latest.orientation);
                if (legacy?.orientation?.() !== latest.orientation) legacy?.orientation?.(latest.orientation);
                legacy?.position?.(latest.position, update.animate === true);
                return true;
            }
            if (rendererKind !== 'persistent') {
                renderer?.orientation?.(latest.orientation);
                renderer?.position?.(latest.position, false);
                activatePersistent();
                return true;
            }
            renderer.setInteractive(false);
            renderer.setReadOnly(true);
            renderer.setOrientation(latest.orientation);
            if (!latest.reviewing) queueVisual(latest);
            return true;
        }

        const facade = {
            position(value, animate) {
                if (arguments.length === 0) return activePosition();
                cancelVisualUpdate();
                if (rendererKind === 'persistent') {
                    return renderer.setPosition(value, { animate: animate === true, coalesce: false });
                }
                return renderer?.position?.(value, animate);
            },
            orientation(value) {
                if (arguments.length === 0) return activeOrientation();
                const normalized = value === 'black' ? 'black' : 'white';
                return rendererKind === 'persistent'
                    ? renderer?.setOrientation?.(normalized)
                    : renderer?.orientation?.(normalized);
            },
            resize() {
                return renderer?.resize?.();
            },
            destroy() {
                return destroy();
            }
        };

        function getSnapshot() {
            const average = durations.length
                ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
                : 0;
            return Object.freeze({
                featureFlag: FLAG,
                enabled: featureEnabled(host),
                renderer: rendererKind,
                eligible: observeEligible(latest?.state),
                readOnly: rendererKind === 'persistent',
                pendingVisual: pendingVisual !== null,
                position: activePosition(),
                orientation: activeOrientation(),
                metrics: Object.freeze({
                    ...metrics,
                    snapshotFallbackReasons: Object.freeze({ ...metrics.snapshotFallbackReasons }),
                    averageUpdateDurationMs: average,
                    p95UpdateDurationMs: percentile(durations, 0.95),
                    renderer: rendererKind === 'persistent' ? renderer?.getMetrics?.() || null : null
                })
            });
        }

        async function whenIdle() {
            if (activation) await activation;
            await idlePromise;
            renderer?.flushPending?.();
            return getSnapshot();
        }

        function destroy() {
            if (destroyed) return false;
            destroyed = true;
            activationGeneration += 1;
            cancelVisualUpdate();
            renderer?.destroy?.();
            renderer = null;
            rendererKind = null;
            container.removeAttribute('data-fics-board-renderer');
            return true;
        }

        createLegacy(options.position || 'start', options.orientation || 'white');
        return Object.freeze({ board: facade, presentCanonicalState, getSnapshot, whenIdle, destroy });
    }

    root.CaissaFICSBoardView = Object.freeze({
        FLAG,
        featureEnabled,
        observeEligible,
        createFicsBoardView
    });
})(typeof window !== 'undefined' ? window : globalThis);
