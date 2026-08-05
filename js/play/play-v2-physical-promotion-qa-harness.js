(function (global) {
    'use strict';
    const policy = global.CaissaPlayV2PhysicalPromotionQAPolicy;
    if (!global.__caissaPhysicalPromotionQaBootAuthorized || !policy?.isAuthorizedLocation?.(global.location)) return;
    let active = null;
    let completed = new Set();
    const workerCount = () => (global.CaissaWorkerLifecycle?.inspect?.() || [])
        .filter(context => !['terminated', 'disposed'].includes(context.state)).length;
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const panel = document.createElement('section');
    panel.className = 'caissa-promotion-qa';
    panel.dataset.physicalPromotionQa = 'true';
    panel.setAttribute('aria-labelledby', 'promotionQaTitle');
    panel.innerHTML = `<h2 id="promotionQaTitle">Internal Promotion QA</h2>
      <p data-qa-boundary>Fixed, versioned cases. No data is stored.</p>
      <label for="promotionQaCase">Case</label>
      <select id="promotionQaCase">${policy.listCases().map(item => `<option value="${escape(item.id)}">${escape(item.label)}</option>`).join('')}</select>
      <div class="caissa-promotion-qa__actions">
        <button type="button" data-promotion-qa-start>Start case</button>
        <button type="button" data-promotion-qa-finish disabled>Finish in PostGame</button>
        <button type="button" data-promotion-qa-next disabled>Next case</button>
      </div><output data-promotion-qa-status aria-live="polite">Ready. No case started.</output>`;
    const mount = () => document.querySelector('.caissa-simplified-shell__context')?.prepend(panel);
    const status = text => { panel.querySelector('[data-promotion-qa-status]').textContent = text; };
    const syncPosition = fixture => {
        if (!global.newGame({ mode: 'human', color: fixture.color, timeControl: 300, increment: 0 })) return false;
        global.App.engineEnabled = false;
        global.App.enginePlaysAs = null;
        global.App.engine?.stop?.();
        global.CaissaEngineRequestIsolation?.cancelSession?.();
        if (!global.App.game.load(fixture.position)) throw new Error('ALLOWLISTED_POSITION_REJECTED');
        global.App.game.header('SetUp', '1', 'FEN', fixture.position);
        global.App.moveHistory = [];
        global.App.currentMoveIndex = -1;
        global.App.pendingPromotion = null;
        global.App.isPlayerTurn = true;
        global.App.gameActive = true;
        global.App.board.position(fixture.position, false);
        global.App.board.orientation(fixture.color);
        global.App.isFlipped = fixture.color === 'black';
        global.CaissaClockService?.configure?.({ mode: 'physical-promotion-qa', initialTimeMs: 300000,
            incrementMs: 0, activeColor: fixture.color });
        global.CaissaClockService?.start?.({ activeColor: fixture.color });
        global.updateMoveHistory?.(); global.updateStatus?.(); global.updateTimers?.();
        global.CaissaGameLifecycle?.sync?.(global.CaissaPlayCompatibility?.getSnapshot?.(), 'GAME_STARTED');
        return true;
    };
    function start() {
        const fixture = policy.resolveCase(panel.querySelector('select').value);
        if (!fixture || !syncPosition(fixture)) { status('Case could not start.'); return; }
        active = fixture;
        panel.querySelector('[data-promotion-qa-finish]').disabled = true;
        panel.querySelector('[data-promotion-qa-next]').disabled = true;
        status(`${fixture.label}: use tap-to-move ${fixture.from} to ${fixture.to}, then choose ${fixture.piece.toUpperCase()}.`);
    }
    function inspectPromotion() {
        if (!active || global.App.pendingPromotion) return;
        const placed = global.App.game.get(active.to);
        const history = global.App.game.history();
        const san = history.at(-1) || '';
        const clock = global.CaissaClockService?.getSnapshot?.();
        global.CaissaGameLifecycle?.sync?.(global.CaissaPlayCompatibility?.getSnapshot?.(), 'LEGACY_STATE_SYNCED');
        const lifecycle = global.CaissaGameLifecycle?.getSnapshot?.();
        const checks = {
            piece: placed?.type === active.piece && placed?.color === active.color[0],
            san: san.includes(`=${active.piece.toUpperCase()}`), pgn: global.App.game.pgn().includes(san),
            board: document.querySelectorAll('#chessboard .board-b72b1').length === 1,
            orientation: global.App.board.orientation() === active.color, worker: workerCount() === 0,
            clock: typeof clock?.running === 'boolean', lifecycle: ['active', 'completed'].includes(lifecycle?.state)
        };
        const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
        if (failed.length) { status(`${active.label}: verification failed (${failed.join(', ')}).`); return; }
        completed.add(active.id);
        panel.querySelector('[data-promotion-qa-finish]').disabled = false;
        status(`${active.label}: promotion, SAN, PGN, orientation, single board, clock and lifecycle verified.`);
    }
    function finish() { if (active && global.App.gameActive) global.resignGame(); }
    function next() {
        const cases = policy.listCases();
        const index = Math.max(0, cases.findIndex(item => item.id === active?.id));
        panel.querySelector('select').value = cases[(index + 1) % cases.length].id;
        start();
    }
    panel.addEventListener('click', event => {
        if (event.target.closest('[data-promotion-qa-start]')) start();
        if (event.target.closest('[data-promotion-qa-finish]')) finish();
        if (event.target.closest('[data-promotion-qa-next]')) next();
        if (event.target.closest('.promotion-btn')) setTimeout(inspectPromotion, 50);
    });
    document.addEventListener('click', event => {
        if (event.target.closest('.promotion-btn')) setTimeout(inspectPromotion, 0);
    });
    new MutationObserver(() => {
        const visible = global.CaissaPostGameExperienceInstance?.getSnapshot?.().visible === true;
        const next = panel.querySelector('[data-promotion-qa-next]');
        const reachedFinalState = visible || global.App?.gameActive === false;
        const disabled = !reachedFinalState || !active || !completed.has(active.id);
        if (next.disabled !== disabled) next.disabled = disabled;
    }).observe(document.body, { subtree: true, attributes: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
    global.CaissaPhysicalPromotionQAHarness = Object.freeze({
        contractId: policy.contractId, startCase: start,
        inspect: () => Object.freeze({ activeCaseId: active?.id || null, completed: [...completed], workerCount: workerCount() })
    });
})(window);
