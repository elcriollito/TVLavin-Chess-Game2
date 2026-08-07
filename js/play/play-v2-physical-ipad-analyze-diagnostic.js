(function (global) {
    'use strict';
    const policy = global.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy;
    if (!global.__caissaIpadAnalyzeDiagnosticAuthorized || !policy?.isAuthorizedLocation?.(global.location)) return;
    if (global.CaissaIpadAnalyzeDiagnostic) return;

    const capacity = policy.capacity;
    const evidenceCapacity = policy.requiredEvidenceGenerationCapacity;
    const records = [];
    const requiredEvidence = new Map();
    let capturing = false, startedAt = 0, sequence = 0, generation = 0, recordsDropped = 0;
    let evidenceGenerationsDropped = 0, observers = [], lastSurface = 'play', exitingAnalyze = false;

    const launcher = global.document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'caissa-ipad-analyze-diagnostic-launcher';
    launcher.dataset.diagnosticLauncher = '';
    launcher.textContent = 'Analyze diagnostic';
    const panel = global.document.createElement('dialog');
    panel.className = 'caissa-ipad-analyze-diagnostic';
    panel.dataset.ipadAnalyzeDiagnostic = '';
    panel.dataset.captureCompleteness = 'partial';
    panel.setAttribute('aria-labelledby', 'caissa-ipad-analyze-diagnostic-title');
    panel.innerHTML = '<div class="caissa-ipad-analyze-diagnostic__heading"><strong id="caissa-ipad-analyze-diagnostic-title">iPad Analyze diagnostic</strong>'
        + '<span class="caissa-ipad-analyze-diagnostic__surface" data-diagnostic-surface>Surface: Play</span></div>'
        + '<div class="caissa-ipad-analyze-diagnostic__body"><div class="caissa-ipad-analyze-diagnostic__actions">'
        + '<button type="button" data-diagnostic-start>Start capture</button>'
        + '<button type="button" data-diagnostic-stop disabled>Stop capture</button>'
        + '<button type="button" data-diagnostic-copy>Copy diagnostic JSON</button>'
        + '<button type="button" data-diagnostic-download>Download diagnostic JSON</button>'
        + '<button type="button" data-diagnostic-clear>Clear</button>'
        + '<button type="button" data-diagnostic-close>Close</button></div>'
        + '<output data-diagnostic-status role="status" aria-live="polite">Ready. Capture is off.</output></div>';
    global.document.body.append(launcher, panel);

    let closeFocusTarget = 'launcher';
    const closePanel = target => { closeFocusTarget = target; if (panel.open) panel.close(); };
    panel.addEventListener('cancel', () => { closeFocusTarget = 'launcher'; });
    panel.addEventListener('close', () => {
        const target = closeFocusTarget === 'play'
            ? global.document.querySelector('[data-shell-mode][aria-selected="true"]') : launcher;
        target?.focus?.({ preventScroll: true });
        closeFocusTarget = 'launcher';
    });
    const status = text => { panel.querySelector('[data-diagnostic-status]').textContent = text; };
    const showSurface = surface => {
        const node = panel.querySelector('[data-diagnostic-surface]');
        if (node) node.textContent = `Surface: ${surface[0].toUpperCase()}${surface.slice(1)}`;
    };
    const box = selector => {
        const node = global.document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect(), style = global.getComputedStyle(node);
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
            width: rect.width, height: rect.height, display: style.display,
            visibility: style.visibility, minWidth: style.minWidth, minHeight: style.minHeight,
            maxWidth: style.maxWidth, maxHeight: style.maxHeight, aspectRatio: style.aspectRatio };
    };
    const visible = node => {
        const rect = node.getBoundingClientRect(), style = global.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const squareTolerance = ({ width, height, devicePixelRatio = 1, scale = 1 }) => Math.max(
        2 / Math.max(Number(devicePixelRatio) || 1, 1),
        2 / Math.max(Number(scale) || 1, 1),
        Math.max(Number(width) || 0, Number(height) || 0) * 0.01
    );
    const assessBoardGeometry = ({ width, height, devicePixelRatio = 1, scale = 1, applicable = true }) => {
        const safeWidth = Number(width) || 0, safeHeight = Number(height) || 0;
        const toleranceCssPx = squareTolerance({ width: safeWidth, height: safeHeight, devicePixelRatio, scale });
        const larger = Math.max(safeWidth, safeHeight), smaller = Math.min(safeWidth, safeHeight);
        const aspectRatio = larger > 0 ? smaller / larger : 0;
        const violations = [];
        if (applicable) {
            if (safeWidth <= 0 || safeHeight <= 0) violations.push('BOARD_NON_POSITIVE');
            else if (aspectRatio < 0.75) violations.push('BOARD_MATERIAL_STRIP');
            else if (Math.abs(safeWidth - safeHeight) > toleranceCssPx) violations.push('BOARD_NOT_SQUARE');
        }
        return Object.freeze({ applicable, toleranceCssPx, aspectRatio, violations: Object.freeze(violations) });
    };
    const currentSurface = () => {
        const analyze = global.document.getElementById('analyzeSection');
        return analyze?.classList.contains('active') ? 'analyze'
            : global.CaissaPostGameExperienceInstance?.getSnapshot?.()?.visible ? 'postgame' : 'play';
    };
    const state = options => {
        const viewport = global.visualViewport;
        const surface = currentSurface();
        const overlay = box('#analyzeSection');
        const host = box('#analyzeChessboard'), inner = box('#analyzeChessboard .board-b72b1');
        const close = box('[data-play-v2-analyze-close]');
        const viewportWidth = viewport?.width || global.innerWidth;
        const analyzeObservable = surface === 'analyze' && !exitingAnalyze && !options?.forceNotApplicable
            && overlay?.display !== 'none' && overlay?.visibility !== 'hidden';
        const geometryAssessment = assessBoardGeometry({ width: inner?.width, height: inner?.height,
            devicePixelRatio: global.devicePixelRatio, scale: viewport?.scale, applicable: analyzeObservable });
        const violations = [...geometryAssessment.violations];
        const tolerance = geometryAssessment.toleranceCssPx;
        if (analyzeObservable && host && inner
            && (Math.abs(host.width - inner.width) > tolerance || Math.abs(host.height - inner.height) > tolerance))
            violations.push('HOST_INNER_DIVERGENCE');
        const visibleBoards = [...global.document.querySelectorAll('.board-b72b1')].filter(visible).length;
        if (analyzeObservable && visibleBoards > 1) violations.push('MULTIPLE_VISIBLE_BOARDS');
        if (analyzeObservable && close && (close.x < (viewport?.offsetLeft || 0)
            || close.right > (viewport?.offsetLeft || 0) + viewportWidth + 1)) violations.push('BACK_OUTSIDE_VIEWPORT');
        if (analyzeObservable && global.document.documentElement.scrollWidth
            > global.document.documentElement.clientWidth + 1) violations.push('HORIZONTAL_OVERFLOW');
        const play = global.document.getElementById('playSection');
        const analyze = global.document.getElementById('analyzeSection');
        return { generation, mode: global.CaissaPlayRouteController?.getCurrent?.()?.mode || null,
            lifecycle: global.CaissaGameLifecycle?.getSnapshot?.()?.state || null, surface,
            viewport: { innerWidth: global.innerWidth, innerHeight: global.innerHeight,
                clientWidth: global.document.documentElement.clientWidth,
                clientHeight: global.document.documentElement.clientHeight,
                visualWidth: viewport?.width ?? null, visualHeight: viewport?.height ?? null,
                offsetTop: viewport?.offsetTop ?? null, offsetLeft: viewport?.offsetLeft ?? null,
                scale: viewport?.scale ?? null, devicePixelRatio: global.devicePixelRatio ?? null },
            orientation: global.screen?.orientation?.type || null,
            scroll: { x: global.scrollX, y: global.scrollY }, visibilityState: global.document.visibilityState,
            presentation: { playHidden: !!play?.hidden, playInert: !!play?.inert,
                playAriaHidden: play?.getAttribute('aria-hidden') ?? null,
                analyzeHidden: !!analyze?.hidden, analyzeAriaHidden: analyze?.getAttribute('aria-hidden') ?? null },
            geometryApplicability: { applicable: analyzeObservable,
                reason: analyzeObservable ? 'ANALYZE_OBSERVABLE'
                    : options?.forceNotApplicable || (surface !== 'analyze' ? 'ANALYZE_INACTIVE' : 'ANALYZE_HIDDEN') },
            geometryAssessment: { squareToleranceCssPx: tolerance,
                squareToleranceFormula: 'max(2/devicePixelRatio, 2/visualViewport.scale, 1% of larger board dimension)',
                boardAspectRatio: geometryAssessment.aspectRatio },
            geometry: { overlay, workspace: box('#analyzeSection .analyze-layout'),
                boardZone: box('#analyzeSection .analyze-board-zone'), evaluationRail: box('#analyzeSection .evaluation-rail'),
                host, inner, back: close }, mountedBoards: global.document.querySelectorAll('.board-b72b1').length,
            visibleBoards, scrollWidth: global.document.documentElement.scrollWidth,
            clientWidth: global.document.documentElement.clientWidth, violations };
    };

    const append = entry => {
        records.push(entry);
        if (records.length > capacity) { records.shift(); recordsDropped += 1; }
    };
    const evidenceFor = value => {
        if (!requiredEvidence.has(value)) {
            if (requiredEvidence.size >= evidenceCapacity) {
                requiredEvidence.delete(requiredEvidence.keys().next().value);
                evidenceGenerationsDropped += 1;
            }
            requiredEvidence.set(value, { generation: value, firstSequence: null, lastSequence: null,
                observed: { analyzeOpen: false, analyzeSectionOnEnter: false, hostVisible: false, innerBoardVisible: false },
                visibleAnalyzeBoard: null });
        }
        return requiredEvidence.get(value);
    };
    const preserveRequiredEvidence = entry => {
        if (entry.generation <= 0) return;
        const evidence = evidenceFor(entry.generation);
        evidence.firstSequence ??= entry.sequence;
        evidence.lastSequence = entry.sequence;
        if (entry.eventType === 'analyze-open') evidence.observed.analyzeOpen = true;
        if (entry.eventType === 'onEnter:call') evidence.observed.analyzeSectionOnEnter = true;
        const hostVisible = entry.surface === 'analyze' && entry.geometry.host?.width > 0 && entry.geometry.host?.height > 0;
        const innerVisible = entry.surface === 'analyze' && entry.geometry.inner?.width > 0 && entry.geometry.inner?.height > 0;
        if (hostVisible) evidence.observed.hostVisible = true;
        if (innerVisible) evidence.observed.innerBoardVisible = true;
        if (hostVisible && innerVisible && !evidence.visibleAnalyzeBoard) evidence.visibleAnalyzeBoard = {
            sequence: entry.sequence, hostWidth: entry.geometry.host.width, hostHeight: entry.geometry.host.height,
            boardWidth: entry.geometry.inner.width, boardHeight: entry.geometry.inner.height
        };
    };
    const createEntry = (eventType, snapshot) => ({ sequence: ++sequence,
        elapsedMs: Math.round((global.performance.now() - startedAt) * 10) / 10, eventType, ...snapshot });
    const record = (eventType, options) => {
        if (!capturing) return;
        const snapshot = state(options);
        if (snapshot.surface === 'analyze' && lastSurface !== 'analyze') {
            const opened = createEntry('analyze-open', snapshot); append(opened); preserveRequiredEvidence(opened);
        }
        lastSurface = snapshot.surface;
        showSurface(snapshot.surface);
        const entry = createEntry(eventType, snapshot);
        append(entry);
        preserveRequiredEvidence(entry);
        if (entry.violations.length) status(`Capture active. ${entry.violations.join(', ')}`);
    };
    const frames = (eventType, options) => {
        record(`${eventType}:callback`, options);
        global.queueMicrotask(() => record(`${eventType}:microtask`, options));
        let frame = 0;
        const next = () => global.requestAnimationFrame(() => {
            record(`${eventType}:raf-${++frame}`, options);
            if (frame < 3) next(); else global.setTimeout(() => record(`${eventType}:bounded-check`, options), 0);
        });
        next();
    };
    const listen = (target, type, label = type) => {
        const handler = () => frames(label);
        target?.addEventListener?.(type, handler);
        observers.push(() => target?.removeEventListener?.(type, handler));
    };
    const wrapOwner = () => {
        const owner = global.AnalyzeSection;
        if (!owner || owner.__caissaIpadDiagnosticWrapped) return;
        const enter = owner.onEnter.bind(owner), exit = owner.onExit?.bind(owner);
        owner.onEnter = (...args) => {
            generation += 1;
            record('onEnter:call');
            const value = enter(...args);
            frames('onEnter:return');
            wrapBoard();
            return value;
        };
        if (exit) owner.onExit = (...args) => {
            exitingAnalyze = true;
            record('onExit:call', { forceNotApplicable: 'ANALYZE_EXIT' });
            const value = exit(...args);
            frames('onExit:return', { forceNotApplicable: 'ANALYZE_EXIT' });
            exitingAnalyze = false;
            return value;
        };
        owner.__caissaIpadDiagnosticWrapped = true;
    };
    const wrapBoard = () => {
        const board = global.AnalyzeSection?.board;
        if (!board?.resize || board.__caissaIpadDiagnosticWrapped) return;
        const resize = board.resize.bind(board);
        board.resize = (...args) => {
            record('board-resize:call');
            const value = resize(...args);
            frames('board-resize:return');
            return value;
        };
        board.__caissaIpadDiagnosticWrapped = true;
    };
    const resetMemory = () => {
        records.length = 0;
        requiredEvidence.clear();
        sequence = 0;
        generation = 0;
        recordsDropped = 0;
        evidenceGenerationsDropped = 0;
        lastSurface = 'play';
    };
    const start = () => {
        if (capturing) return;
        resetMemory();
        capturing = true;
        startedAt = global.performance.now();
        listen(global, 'resize', 'window-resize');
        listen(global, 'orientationchange', 'orientationchange');
        listen(global.visualViewport, 'resize', 'visualViewport-resize');
        listen(global.visualViewport, 'scroll', 'visualViewport-scroll');
        const actionHandler = event => {
            const action = event.target.closest?.('[data-post-game-action]')?.dataset.postGameAction;
            if (action) record(`postgame-action:${action}`);
        };
        global.document.addEventListener('click', actionHandler, true);
        observers.push(() => global.document.removeEventListener('click', actionHandler, true));
        const mutation = new MutationObserver(() => { wrapOwner(); wrapBoard(); frames('mutation'); });
        mutation.observe(global.document.getElementById('analyzeSection'), { attributes: true, childList: true, subtree: true });
        observers.push(() => mutation.disconnect());
        const headObserver = new MutationObserver(entries => entries.forEach(entry => entry.addedNodes.forEach(node => {
            if (node.tagName === 'SCRIPT' && /analyze-section\.js/i.test(node.src || ''))
                node.addEventListener('load', () => { wrapOwner(); record('analyze-owner-loaded'); }, { once: true });
        })));
        headObserver.observe(global.document.head, { childList: true });
        observers.push(() => headObserver.disconnect());
        const resizeObserver = new ResizeObserver(entries => entries.forEach(entry =>
            frames(`resizeObserver:${entry.target.id || entry.target.className}`)));
        ['#analyzeSection', '#analyzeSection .analyze-board-zone', '#analyzeChessboard'].forEach(selector => {
            const node = global.document.querySelector(selector);
            if (node) resizeObserver.observe(node);
        });
        observers.push(() => resizeObserver.disconnect());
        wrapOwner(); wrapBoard(); frames('capture-start');
        panel.querySelector('[data-diagnostic-start]').disabled = true;
        panel.querySelector('[data-diagnostic-stop]').disabled = false;
        status('Capture active.');
        closePanel('play');
    };

    const evidenceSnapshot = () => [...requiredEvidence.values()].map(item => ({
        generation: item.generation, firstSequence: item.firstSequence, lastSequence: item.lastSequence,
        observed: { ...item.observed }, visibleAnalyzeBoard: item.visibleAnalyzeBoard ? { ...item.visibleAnalyzeBoard } : null
    }));
    const completeness = evidence => {
        const complete = evidence.find(item => item.observed.analyzeOpen && item.observed.analyzeSectionOnEnter
            && item.observed.hostVisible && item.observed.innerBoardVisible);
        const aggregate = evidence.reduce((value, item) => ({
            analyzeOpen: value.analyzeOpen || item.observed.analyzeOpen,
            analyzeSectionOnEnter: value.analyzeSectionOnEnter || item.observed.analyzeSectionOnEnter,
            hostVisible: value.hostVisible || item.observed.hostVisible,
            innerBoardVisible: value.innerBoardVisible || item.observed.innerBoardVisible
        }), { analyzeOpen: false, analyzeSectionOnEnter: false, hostVisible: false, innerBoardVisible: false });
        const missing = [];
        if (!aggregate.analyzeOpen) missing.push('analyze-open');
        if (!aggregate.analyzeSectionOnEnter) missing.push('AnalyzeSection.onEnter');
        if (!aggregate.hostVisible) missing.push('visible-analyze-host');
        if (!aggregate.innerBoardVisible) missing.push('visible-analyze-board');
        return { captureCompleteness: complete ? 'complete' : 'partial', missingRequiredEvents: complete ? [] : missing,
            completeGeneration: complete?.generation ?? null };
    };
    const exportSnapshot = () => {
        const evidence = evidenceSnapshot();
        return { contractId: policy.contractId, schemaVersion: '1.1.0', verdictSequence: sequence,
            verdictElapsedMs: capturing ? Math.round((global.performance.now() - startedAt) * 10) / 10
                : records.at(-1)?.elapsedMs ?? 0,
            ...completeness(evidence), ringBufferCapacity: capacity, recordsRetained: records.length,
            recordsDropped, firstRetainedSequence: records[0]?.sequence ?? null,
            lastRetainedSequence: records.at(-1)?.sequence ?? null,
            requiredEventEvidence: { generationCapacity: evidenceCapacity,
                generationsRetained: evidence.length, generationsDropped: evidenceGenerationsDropped, generations: evidence },
            records: records.slice() };
    };
    const applyVerdict = (snapshot, prefix = '') => {
        panel.dataset.captureCompleteness = snapshot.captureCompleteness;
        const verdict = snapshot.captureCompleteness === 'complete'
            ? `Capture complete. ${snapshot.recordsRetained} records retained.` : 'Analyze was not captured';
        status(prefix ? `${prefix} ${verdict}` : verdict);
    };
    const stop = () => {
        if (!capturing) return;
        record('capture-stop');
        capturing = false;
        observers.splice(0).forEach(dispose => dispose());
        panel.querySelector('[data-diagnostic-start]').disabled = false;
        panel.querySelector('[data-diagnostic-stop]').disabled = true;
        applyVerdict(exportSnapshot());
    };
    const json = () => JSON.stringify(exportSnapshot(), null, 2);
    const copy = async () => {
        const snapshot = exportSnapshot();
        await global.navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
        applyVerdict(snapshot, 'Diagnostic JSON copied.');
    };
    const download = () => {
        const snapshot = exportSnapshot();
        const link = global.document.createElement('a');
        link.download = 'caissa-ipad-analyze-diagnostic.json';
        link.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
        link.click();
        URL.revokeObjectURL(link.href);
        applyVerdict(snapshot, 'Diagnostic JSON downloaded.');
    };
    const clear = () => {
        resetMemory();
        showSurface('play');
        panel.dataset.captureCompleteness = 'partial';
        status(capturing ? 'Capture active. Buffer and required evidence cleared.' : 'Diagnostic memory cleared.');
    };
    panel.addEventListener('click', event => {
        if (event.target.closest('[data-diagnostic-start]')) start();
        else if (event.target.closest('[data-diagnostic-stop]')) stop();
        else if (event.target.closest('[data-diagnostic-copy]')) copy();
        else if (event.target.closest('[data-diagnostic-download]')) download();
        else if (event.target.closest('[data-diagnostic-clear]')) clear();
        else if (event.target.closest('[data-diagnostic-close]')) closePanel('launcher');
    });
    launcher.addEventListener('click', () => {
        if (!panel.open) { closeFocusTarget = 'launcher'; panel.showModal(); }
    });
    global.CaissaIpadAnalyzeDiagnostic = Object.freeze({
        inspect: () => {
            const snapshot = exportSnapshot();
            return Object.freeze({ capturing, count: records.length, capacity, recordsDropped,
                violations: records.filter(item => item.geometryApplicability.applicable && item.violations.length).length,
                captureCompleteness: snapshot.captureCompleteness,
                missingRequiredEvents: Object.freeze(snapshot.missingRequiredEvents.slice()) });
        },
        exportJson: json, clear, assessBoardGeometry
    });
})(window);
