(function (global) {
    'use strict';
    const policy = global.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy;
    if (!global.__caissaIpadAnalyzeDiagnosticAuthorized || !policy?.isAuthorizedLocation?.(global.location)) return;
    if (global.CaissaIpadAnalyzeDiagnostic) return;
    const capacity = policy.capacity;
    const records = [];
    let capturing = false, startedAt = 0, sequence = 0, generation = 0, observers = [], lastSurface = 'play';
    const launcher = global.document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'caissa-ipad-analyze-diagnostic-launcher';
    launcher.dataset.diagnosticLauncher = '';
    launcher.textContent = 'Analyze diagnostic';
    const panel = global.document.createElement('dialog');
    panel.className = 'caissa-ipad-analyze-diagnostic';
    panel.dataset.ipadAnalyzeDiagnostic = '';
    panel.setAttribute('aria-labelledby', 'caissa-ipad-analyze-diagnostic-title');
    panel.innerHTML = '<div class="caissa-ipad-analyze-diagnostic__heading"><strong id="caissa-ipad-analyze-diagnostic-title">iPad Analyze diagnostic</strong>'
        + '<span class="caissa-ipad-analyze-diagnostic__surface" data-diagnostic-surface>Surface: Play</span></div>'
        + '<div class="caissa-ipad-analyze-diagnostic__body">'
        + '<div class="caissa-ipad-analyze-diagnostic__actions">'
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
        target?.focus?.({ preventScroll: true }); closeFocusTarget = 'launcher';
    });
    const status = text => { panel.querySelector('[data-diagnostic-status]').textContent = text; };
    const showSurface = surface => { const node = panel.querySelector('[data-diagnostic-surface]');
        if (node) node.textContent = `Surface: ${surface[0].toUpperCase()}${surface.slice(1)}`; };
    const box = selector => {
        const node = global.document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect(), style = global.getComputedStyle(node);
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
            width: rect.width, height: rect.height, display: style.display,
            visibility: style.visibility, minWidth: style.minWidth, minHeight: style.minHeight,
            maxWidth: style.maxWidth, maxHeight: style.maxHeight, aspectRatio: style.aspectRatio };
    };
    const visible = node => { const rect = node.getBoundingClientRect(), style = global.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const state = () => {
        const viewport = global.visualViewport;
        const host = box('#analyzeChessboard'), inner = box('#analyzeChessboard .board-b72b1');
        const close = box('[data-play-v2-analyze-close]');
        const viewportWidth = viewport?.width || global.innerWidth;
        const violations = [];
        if (inner && (inner.width <= 0 || inner.height <= 0)) violations.push('BOARD_NON_POSITIVE');
        if (inner?.width > 0 && Math.abs(inner.width - inner.height) > 2) violations.push('BOARD_NOT_SQUARE');
        if (host && inner && (Math.abs(host.width - inner.width) > 2 || Math.abs(host.height - inner.height) > 2))
            violations.push('HOST_INNER_DIVERGENCE');
        const visibleBoards = [...global.document.querySelectorAll('.board-b72b1')].filter(visible).length;
        if (visibleBoards > 1) violations.push('MULTIPLE_VISIBLE_BOARDS');
        if (close && (close.x < (viewport?.offsetLeft || 0) || close.right > (viewport?.offsetLeft || 0) + viewportWidth + 1))
            violations.push('BACK_OUTSIDE_VIEWPORT');
        if (global.document.documentElement.scrollWidth > global.document.documentElement.clientWidth + 1)
            violations.push('HORIZONTAL_OVERFLOW');
        const play = global.document.getElementById('playSection');
        const analyze = global.document.getElementById('analyzeSection');
        return { generation, mode: global.CaissaPlayRouteController?.getCurrent?.()?.mode || null,
            lifecycle: global.CaissaGameLifecycle?.getSnapshot?.()?.state || null,
            surface: analyze?.classList.contains('active') ? 'analyze'
                : global.CaissaPostGameExperienceInstance?.getSnapshot?.()?.visible ? 'postgame' : 'play',
            viewport: { innerWidth: global.innerWidth, innerHeight: global.innerHeight,
                clientWidth: global.document.documentElement.clientWidth,
                clientHeight: global.document.documentElement.clientHeight,
                visualWidth: viewport?.width ?? null, visualHeight: viewport?.height ?? null,
                offsetTop: viewport?.offsetTop ?? null, offsetLeft: viewport?.offsetLeft ?? null,
                scale: viewport?.scale ?? null },
            orientation: global.screen?.orientation?.type || null,
            scroll: { x: global.scrollX, y: global.scrollY }, visibilityState: global.document.visibilityState,
            presentation: { playHidden: !!play?.hidden, playInert: !!play?.inert,
                playAriaHidden: play?.getAttribute('aria-hidden') ?? null,
                analyzeHidden: !!analyze?.hidden, analyzeAriaHidden: analyze?.getAttribute('aria-hidden') ?? null },
            geometry: { overlay: box('#analyzeSection'), workspace: box('#analyzeSection .analyze-layout'),
                boardZone: box('#analyzeSection .analyze-board-zone'), evaluationRail: box('#analyzeSection .evaluation-rail'),
                host, inner, back: close }, mountedBoards: global.document.querySelectorAll('.board-b72b1').length,
            visibleBoards, scrollWidth: global.document.documentElement.scrollWidth,
            clientWidth: global.document.documentElement.clientWidth, violations };
    };
    const append = entry => { records.push(entry); if (records.length > capacity) records.shift(); };
    const record = eventType => {
        if (!capturing) return;
        const snapshot = state();
        if (snapshot.surface === 'analyze' && lastSurface !== 'analyze') append({ sequence: ++sequence,
            elapsedMs: Math.round((global.performance.now() - startedAt) * 10) / 10, eventType: 'analyze-open', ...snapshot });
        lastSurface = snapshot.surface; showSurface(snapshot.surface);
        const entry = { sequence: ++sequence, elapsedMs: Math.round((global.performance.now() - startedAt) * 10) / 10,
            eventType, ...snapshot };
        append(entry);
        if (entry.violations.length) status(`Capture active. ${entry.violations.join(', ')}`);
    };
    const frames = eventType => {
        record(`${eventType}:callback`);
        global.queueMicrotask(() => record(`${eventType}:microtask`));
        let frame = 0;
        const next = () => global.requestAnimationFrame(() => {
            record(`${eventType}:raf-${++frame}`); if (frame < 3) next();
            else global.setTimeout(() => record(`${eventType}:bounded-check`), 0);
        });
        next();
    };
    const listen = (target, type, label = type) => {
        const handler = () => frames(label); target?.addEventListener?.(type, handler);
        observers.push(() => target?.removeEventListener?.(type, handler));
    };
    const wrapOwner = () => {
        const owner = global.AnalyzeSection;
        if (!owner || owner.__caissaIpadDiagnosticWrapped) return;
        const enter = owner.onEnter.bind(owner), exit = owner.onExit?.bind(owner);
        owner.onEnter = (...args) => { generation += 1; record('onEnter:call'); const value = enter(...args); frames('onEnter:return'); wrapBoard(); return value; };
        if (exit) owner.onExit = (...args) => { record('onExit:call'); const value = exit(...args); frames('onExit:return'); return value; };
        owner.__caissaIpadDiagnosticWrapped = true;
    };
    const wrapBoard = () => {
        const board = global.AnalyzeSection?.board;
        if (!board?.resize || board.__caissaIpadDiagnosticWrapped) return;
        const resize = board.resize.bind(board);
        board.resize = (...args) => { record('board-resize:call'); const value = resize(...args); frames('board-resize:return'); return value; };
        board.__caissaIpadDiagnosticWrapped = true;
    };
    const start = () => {
        if (capturing) return; records.length = 0; sequence = 0; generation = 0; lastSurface = 'play';
        capturing = true; startedAt = global.performance.now();
        listen(global, 'resize', 'window-resize'); listen(global, 'orientationchange', 'orientationchange');
        listen(global.visualViewport, 'resize', 'visualViewport-resize'); listen(global.visualViewport, 'scroll', 'visualViewport-scroll');
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
        headObserver.observe(global.document.head, { childList: true }); observers.push(() => headObserver.disconnect());
        const resizeObserver = new ResizeObserver(entries => entries.forEach(entry => frames(`resizeObserver:${entry.target.id || entry.target.className}`)));
        ['#analyzeSection', '#analyzeSection .analyze-board-zone', '#analyzeChessboard'].forEach(selector => {
            const node = global.document.querySelector(selector); if (node) resizeObserver.observe(node);
        });
        observers.push(() => resizeObserver.disconnect()); wrapOwner(); wrapBoard(); frames('capture-start');
        panel.querySelector('[data-diagnostic-start]').disabled = true;
        panel.querySelector('[data-diagnostic-stop]').disabled = false; status('Capture active.'); closePanel('play');
    };
    const completeness = () => {
        const missing = [];
        if (!records.some(item => item.surface === 'analyze')) missing.push('surface:analyze');
        if (!records.some(item => item.eventType === 'analyze-open')) missing.push('analyze-open');
        if (!records.some(item => item.eventType === 'onEnter:call')) missing.push('AnalyzeSection.onEnter');
        if (!records.some(item => item.surface === 'analyze' && item.geometry.host?.width > 0
            && item.geometry.host?.height > 0 && item.geometry.inner?.width > 0 && item.geometry.inner?.height > 0))
            missing.push('visible-analyze-board');
        return { captureCompleteness: missing.length ? 'partial' : 'complete', missingRequiredEvents: missing };
    };
    const stop = () => { if (!capturing) return; record('capture-stop'); capturing = false;
        observers.splice(0).forEach(dispose => dispose()); panel.querySelector('[data-diagnostic-start]').disabled = false;
        panel.querySelector('[data-diagnostic-stop]').disabled = true; const complete = completeness();
        status(complete.captureCompleteness === 'complete' ? `Capture complete. ${records.length} records.` : 'Analyze was not captured'); };
    const json = () => JSON.stringify({ contractId: policy.contractId, schemaVersion: '1.0.0',
        ...completeness(), records }, null, 2);
    const copy = async () => { await global.navigator.clipboard.writeText(json()); status('Diagnostic JSON copied.'); };
    const download = () => { const link = global.document.createElement('a'); link.download = 'caissa-ipad-analyze-diagnostic.json';
        link.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' })); link.click(); URL.revokeObjectURL(link.href);
        status('Diagnostic JSON downloaded.'); };
    const clear = () => { records.length = 0; sequence = 0; lastSurface = 'play'; showSurface('play');
        status(capturing ? 'Capture active. Buffer cleared.' : 'Diagnostic memory cleared.'); };
    panel.addEventListener('click', event => { if (event.target.closest('[data-diagnostic-start]')) start();
        else if (event.target.closest('[data-diagnostic-stop]')) stop(); else if (event.target.closest('[data-diagnostic-copy]')) copy();
        else if (event.target.closest('[data-diagnostic-download]')) download(); else if (event.target.closest('[data-diagnostic-clear]')) clear();
        else if (event.target.closest('[data-diagnostic-close]')) closePanel('launcher'); });
    launcher.addEventListener('click', () => { if (!panel.open) { closeFocusTarget = 'launcher'; panel.showModal(); } });
    global.CaissaIpadAnalyzeDiagnostic = Object.freeze({ inspect: () => Object.freeze({ capturing, count: records.length,
        capacity, violations: records.filter(item => item.violations.length).length }), exportJson: json, clear });
})(window);
