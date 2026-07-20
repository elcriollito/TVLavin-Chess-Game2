import { createEndgameTrainerRuntime } from './endgame-trainer-runtime.js';
import { createEndgameProgressStore } from './endgame-progress-store.js';

const CATEGORIES = ['KQK', 'KRK', 'KPK', 'KPKP'];
const STRENGTH = { beginner: { depth: 5, skillLevel: 2 }, intermediate: { depth: 8, skillLevel: 8 }, advanced: { depth: 12, skillLevel: 14 }, strong: { depth: 15, skillLevel: 20 } };
const PUBLIC_ERRORS = { 'candidate-selection-failed': 'No suitable position was found.', 'engine-not-ready': 'The chess engine could not start.', 'engine-search-timeout': 'The engine took too long.', 'engine-load-failed': 'The chess engine could not load.', 'engine-move-failed': 'The engine could not complete its move.', 'invalid-move': 'That move is not legal.', 'invalid-options': 'Check the selected settings.', 'board-initialization-failed': 'The board could not start.', 'session-disposed': 'The session has ended.' };
const RESULT_LABELS = { checkmate: 'Checkmate', resignation: 'Resignation', stalemate: 'Stalemate', draw: 'Draw', abandoned: 'Abandoned' };
let mounted = null;
const copy = value => structuredClone(value);
const text = (node, value) => { if (node) node.textContent = value ?? '—'; };
const resultLabel = value => RESULT_LABELS[value] ?? value;
const publicPage = page => copy({ mounted: page.mounted, navOpen: page.navOpen, runtimeAttached: page.runtimeAttached, operation: page.operation, hint: page.hint, error: page.error, disposed: page.disposed, diagnosticState: page.diagnosticState, controllerState: page.controllerState, progress: page.progressSnapshot, progressDiagnostic: page.diagnosticEnabled ? page.progressStore.getDiagnosticSnapshot() : undefined });
const CATEGORY_LABELS = { KQK: 'Queen vs King', KRK: 'Rook vs King', KPK: 'Pawn vs King', KPKP: 'Pawn vs Pawn' };
const durationLabel = value => { const seconds = Math.max(0, Math.round((value ?? 0) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };

function renderProgress(root, page) {
    const snapshot = page.progressStore.getSnapshot(), doc = root.ownerDocument;
    if (!doc?.createElement) { page.progressSnapshot = snapshot; return; }
    const metrics = root.querySelector('[data-progress-metrics]'); metrics?.replaceChildren();
    for (const [label, value] of [['Sessions', snapshot.totals.sessionsStarted], ['Completed', snapshot.totals.sessionsCompleted], ['Checkmates', snapshot.totals.checkmates], ['Hints', snapshot.totals.hintsUsed], ['Undos', snapshot.totals.undosUsed], ['Completion rate', `${snapshot.completionRate}%`]]) {
        const item = doc.createElement('div'), name = doc.createElement('span'), strong = doc.createElement('strong'); item.className = 'endgame-trainer-page__metric'; name.textContent = label; strong.textContent = String(value); item.append(name, strong); metrics?.append(item);
    }
    const categories = root.querySelector('[data-category-breakdown]'); categories?.replaceChildren();
    for (const id of CATEGORIES) { const item = doc.createElement('li'), title = doc.createElement('strong'); title.textContent = CATEGORY_LABELS[id]; item.append(title); for (const [label, value] of [['sessions', snapshot.categories[id].sessionsStarted], ['completed', snapshot.categories[id].sessionsCompleted], ['checkmates', snapshot.categories[id].checkmates]]) { const span = doc.createElement('span'); span.textContent = `${value} ${label}`; item.append(span); } categories?.append(item); }
    const recent = root.querySelector('[data-recent-sessions]'); recent?.replaceChildren(); const items = snapshot.recentSessions.slice(-5).reverse();
    if (!items.length) { const li = doc.createElement('li'); li.textContent = 'No recent sessions yet.'; recent?.append(li); }
    for (const entry of items) { const li = doc.createElement('li'), badge = doc.createElement('span'), title = doc.createElement('strong'), detail = doc.createElement('small'); badge.className = 'endgame-trainer-page__result-badge'; badge.textContent = resultLabel(entry.result); title.textContent = `${CATEGORY_LABELS[entry.category]} · ${entry.userColor === 'black' ? 'Black' : 'White'}`; detail.textContent = `${entry.moveCount} moves · ${durationLabel(entry.durationMs)} · ${entry.endedAt ? new Date(entry.endedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recently'}`; li.append(badge, title, detail); recent?.append(li); }
    text(root.querySelector('[data-recent-caption]'), items.length ? `Showing the latest ${items.length} session${items.length === 1 ? '' : 's'}.` : '');
    text(root.querySelector('[data-persistence-warning]'), snapshot.persistence.available ? '' : 'Progress could not be saved in this browser.');
    page.progressSnapshot = snapshot;
}

function sessionEntry(state, owner, now) { return { id: state.sessionId, category: state.categoryId, pieceCount: state.initialFen?.split(' ')[0].replace(/[1-8/]/g, '').length ?? 0, userColor: state.userColor, attemptNumber: state.attemptNumber, hintsUsed: state.hintsUsed, undosUsed: state.undosUsed, moveCount: state.moveHistory?.length ?? 0, preparedAt: owner.preparedAt, endedAt: now, durationMs: owner.startedAt ? Math.max(0, now - owner.startedAt) : 0, initialFen: state.initialFen, finalFen: state.currentFen }; }
function reconcileProgress(root, page, state) {
    if (!page.progressStore || page.disposed) return;
    const now = page.now(), previous = page.progressOwner;
    if (previous && state.sessionId && previous.id !== state.sessionId && previous.started && !previous.terminal) { page.progressStore.recordSessionAbandoned(sessionEntry(previous.state, previous, now)); previous.terminal = true; }
    if (!state.sessionId) { renderProgress(root, page); return; }
    let owner = page.progressOwners.get(state.sessionId); if (!owner) { owner = { id: state.sessionId, preparedAt: now, startedAt: null, prepared: false, started: false, terminal: false, state }; page.progressOwners.set(state.sessionId, owner); }
    owner.state = state; page.progressOwner = owner;
    if (!owner.prepared && state.status !== 'preparing') { page.progressStore.recordPreparedPosition({ id: state.sessionId, category: state.categoryId }); owner.prepared = true; }
    if (!owner.started && ['user-turn', 'engine-thinking', 'completed', 'resigned'].includes(state.status)) { owner.startedAt = now; page.progressStore.recordSessionStarted({ id: state.sessionId, category: state.categoryId }); owner.started = true; }
    if (!owner.terminal && state.status === 'completed') { page.progressStore.recordSessionCompleted({ ...sessionEntry(state, owner, now), result: state.result?.gameResult }); owner.terminal = true; }
    if (!owner.terminal && state.status === 'resigned') { page.progressStore.recordSessionResigned(sessionEntry(state, owner, now)); owner.terminal = true; }
    renderProgress(root, page);
}

function renderSummary(root, page, state) {
    const panel = root.querySelector('[data-session-summary]'); if (!panel) return; const visible = ['completed', 'resigned'].includes(state.status); panel.hidden = !visible; if (!visible) return;
    const list = root.querySelector('[data-summary-facts]'), doc = root.ownerDocument; list.replaceChildren(); const owner = page.progressOwners.get(state.sessionId), values = [['Result', resultLabel(state.result?.gameResult)], ['Category', CATEGORY_LABELS[state.categoryId]], ['Side', state.userColor === 'black' ? 'Black' : 'White'], ['Moves', state.moveHistory?.length ?? 0], ['Attempts', state.attemptNumber], ['Hints', state.hintsUsed], ['Undos', state.undosUsed], ['Duration', durationLabel(owner?.startedAt ? page.now() - owner.startedAt : 0)]];
    for (const [label, value] of values) { const div = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd'); dt.textContent = label; dd.textContent = String(value ?? '—'); div.append(dt, dd); list.append(div); }
}

function promotion(root, signal) {
    const dialog = root.querySelector('[data-promotion]'); let settle = null; let returnFocus = null;
    const cancel = () => settle?.(null);
    const resolve = () => new Promise(done => { let closed = false; returnFocus = root.ownerDocument.activeElement; if (returnFocus === root.ownerDocument.body) returnFocus = root.querySelector('[data-board]'); settle = value => { if (closed) return; closed = true; settle = null; dialog.close(); returnFocus?.focus?.(); returnFocus = null; done(value); }; dialog.showModal(); dialog.querySelector('[data-promotion-piece="q"]')?.focus(); });
    dialog?.addEventListener('click', event => { const value = event.target?.dataset?.promotionPiece; if (value !== undefined) settle?.(value || null); }, { signal });
    dialog?.addEventListener('cancel', event => { event.preventDefault(); cancel(); }, { signal });
    return { resolve, cancel };
}

function renderHistory(root, moves = []) {
    const list = root.querySelector('[data-history]'); if (!list) return;
    list.replaceChildren(); const doc = root.ownerDocument;
    if (!moves.length) {
        const li = doc.createElement('li'), title = doc.createElement('strong'), detail = doc.createElement('span');
        title.textContent = 'No moves yet.'; detail.textContent = 'Moves will appear here once the session starts.';
        li.append(title, detail); list.append(li); return;
    }
    for (const entry of moves) { const li = doc.createElement('li'); li.textContent = `${entry.actor}: ${entry.move?.san || entry.move?.lan || 'move'}`; list.append(li); }
    list.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
}

function update(root, page, snapshot) {
    const state = snapshot?.controllerState ?? page.controllerState ?? { status: 'idle', moveHistory: [] };
    reconcileProgress(root, page, state);
    page.controllerState = copy(state); page.operation = snapshot?.loading ?? null; page.hint = snapshot?.hint ?? page.hint;
    const status = page.disposed ? 'disposed'
        : page.operation ? 'preparing'
        : state.engineThinking || state.status === 'engine-thinking' ? 'engine-thinking'
        : state.status === 'idle' ? 'empty'
        : ['ready', 'user-turn', 'completed', 'resigned', 'error'].includes(state.status) ? state.status
        : 'ready';
    root.dataset.state = status;
    for (const name of ['empty', 'preparing', 'ready', 'user-turn', 'engine-thinking', 'completed', 'resigned', 'error', 'disposed']) {
        root.classList.toggle(`is-${name}`, name === status);
    }
    root.querySelector('[data-diagnostic-state]')?.setAttribute('aria-busy', String(Boolean(page.operation || state.engineThinking)));
    const completedCopy = state.result?.gameResult ? `Result: ${resultLabel(state.result.gameResult)}.` : 'Review the final position and start another attempt.';
    const statusCopy = {
        empty: ['Ready to train', 'Prepare a focused endgame position to begin.'],
        preparing: ['Preparing your position', 'Building a focused endgame for this session.'],
        ready: ['Position ready', 'Review the board, then start the session.'],
        'user-turn': ['Your turn', 'Find the best move in the position.'],
        'engine-thinking': ['Stockfish is thinking', 'The board is temporarily locked.'],
        completed: ['Endgame completed', completedCopy],
        resigned: ['Session resigned', 'Prepare a new position when you are ready.'],
        error: ['Unable to continue', 'Review the message and prepare another position.'],
        disposed: ['Trainer closed', 'This training session is no longer active.']
    }[status];
    text(root.querySelector('[data-status-title]'), statusCopy[0]); text(root.querySelector('[data-status-copy]'), statusCopy[1]);
    text(root.querySelector('[data-start-helper]'), status === 'empty' || status === 'error' ? 'Prepare a position first.' : status === 'ready' ? 'The position is ready to start.' : 'Session in progress.');
    const field = name => root.querySelector(`[data-field="${name}"]`);
    text(field('objective'), state.objective); text(field('turn'), state.sideToMove ? `${state.sideToMove[0].toUpperCase()}${state.sideToMove.slice(1)} to move` : '—');
    text(field('status'), state.status === 'user-turn' ? 'Your turn' : state.status); text(field('attempt'), state.attemptNumber); text(field('hints'), state.hintsUsed ?? 0); text(field('undos'), state.undosUsed ?? 0);
    text(field('engine'), state.engineThinking ? 'Thinking' : page.disposed ? 'Disposed' : state.sessionId ? 'Ready' : 'Not initialized'); text(field('result'), resultLabel(state.result?.gameResult)); text(field('score'), state.score);
    text(root.querySelector('[data-hint-output]'), page.hint?.suggestedMove ? `Suggested move: ${page.hint.suggestedMove}` : ''); renderHistory(root, state.moveHistory);
    const emptyOverlay = root.querySelector('[data-empty-board-overlay]'); if (emptyOverlay) emptyOverlay.hidden = !['empty', 'preparing'].includes(status);
    const overlay = root.querySelector('[data-board-overlay]'); if (overlay) overlay.hidden = status !== 'engine-thinking';
    const enabled = page.disposed ? {} : { prepare: ['idle', 'error'].includes(state.status) && !page.operation, start: state.status === 'ready' && !page.operation, hint: state.status === 'user-turn' && !page.operation, undo: state.status === 'user-turn' && state.moveHistory?.length > 0 && !page.operation, restart: Boolean(state.sessionId), new: Boolean(state.sessionId), resign: Boolean(state.sessionId) && !['completed', 'resigned', 'error'].includes(state.status), flip: true };
    for (const button of root.querySelectorAll('[data-action]')) button.disabled = !enabled[button.dataset.action];
    renderSummary(root, page, state);
}

export function mountEndgameTrainerPage(options = {}) {
    const doc = options.document ?? globalThis.document, win = options.window ?? globalThis.window;
    const root = options.root ?? doc?.querySelector?.('[data-endgame-trainer-page]');
    if (!root?.querySelector || !doc || !win) throw new TypeError('invalid-root');
    if (mounted?.root === root) return publicPage(mounted.page);
    if (mounted) unmountEndgameTrainerPage();
    const abort = new AbortController(), signal = abort.signal, promo = promotion(root, signal), board = root.querySelector('[data-board]');
    const params = new URLSearchParams(win.location?.search ?? '');
    const diagnosticEnabled = params.get('diagnostic') === '1', diagnosticState = diagnosticEnabled && ['empty', 'loading', 'error', 'completed'].includes(params.get('diagnosticState')) ? params.get('diagnosticState') : null;
    const progressStoreFactory = options.progressStoreFactory ?? createEndgameProgressStore, progressStore = progressStoreFactory({ storage: options.storage, now: options.now }); progressStore.load();
    const page = { mounted: true, navOpen: false, runtimeAttached: false, operation: null, hint: null, error: null, disposed: false, diagnosticEnabled, diagnosticState, controllerState: null, seedSequence: 0, progressStore, progressOwners: new Map(), progressOwner: null, progressSnapshot: null, now: options.now ?? Date.now };
    const runtimeFactory = options.runtimeFactory ?? createEndgameTrainerRuntime;
    let runtime = null;
    if (board) { runtime = runtimeFactory({ boardElement: board, promotionResolver: promo.resolve, callbacks: { onStateChange: snap => update(root, page, snap), onAnnouncement: value => text(root.querySelector('[data-announcement]'), value), onError: error => { if (error.code !== 'stale-operation') { page.error = { code: error.code }; text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[error.code] || 'The trainer encountered an error.'); } } } }).initialize(); page.runtimeAttached = true; }
    const nav = root.querySelector('[data-mobile-nav]'), toggle = root.querySelector('[data-mobile-nav-toggle]');
    root.querySelectorAll('[data-nav-key]').forEach(item => { const active = item.dataset.navKey === 'endgame-trainer'; item.classList.toggle('is-active', active); active ? item.setAttribute('aria-current', 'page') : item.removeAttribute('aria-current'); });
    const closeNav = focus => { page.navOpen = false; root.classList.remove('is-nav-open'); toggle?.setAttribute('aria-expanded', 'false'); if (focus) toggle?.focus?.(); };
    toggle?.addEventListener('click', () => { page.navOpen = !page.navOpen; root.classList.toggle('is-nav-open', page.navOpen); toggle.setAttribute('aria-expanded', String(page.navOpen)); }, { signal });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && page.navOpen) closeNav(true); }, { signal }); doc.addEventListener('click', e => { if (page.navOpen && !nav?.contains(e.target) && !toggle?.contains(e.target)) closeNav(); }, { signal });
    win.addEventListener?.('resize', () => { if (page.navOpen && win.innerWidth > 768) closeNav(); }, { signal });
    const abandon = () => { const owner = page.progressOwner; if (owner?.started && !owner.terminal) { page.progressStore.recordSessionAbandoned(sessionEntry(owner.state, owner, page.now())); owner.terminal = true; renderProgress(root, page); } };
    win.addEventListener?.('pagehide', abandon, { signal });
    const resetDialog = root.querySelector('[data-reset-dialog]'), resetButton = root.querySelector('[data-reset-progress]'); let resetReturnFocus = null;
    resetButton?.addEventListener('click', () => { resetReturnFocus = resetButton; resetDialog.showModal(); root.querySelector('[data-reset-cancel]')?.focus(); }, { signal });
    const closeReset = () => { resetDialog?.close(); resetReturnFocus?.focus?.(); resetReturnFocus = null; };
    root.querySelector('[data-reset-cancel]')?.addEventListener('click', closeReset, { signal });
    resetDialog?.addEventListener('cancel', event => { event.preventDefault(); closeReset(); }, { signal });
    root.querySelector('[data-reset-confirm]')?.addEventListener('click', () => { page.progressStore.reset(); renderProgress(root, page); text(root.querySelector('[data-progress-announcement]'), 'Local progress reset.'); closeReset(); }, { signal });
    const act = (name, fn, invalidates = false) => root.querySelector(`[data-action="${name}"]`)?.addEventListener('click', async () => { if (invalidates) promo.cancel(); page.error = null; try { await fn(); } catch (error) { if (error?.code !== 'stale-operation') { page.error = { code: error?.code || 'operation-failed' }; text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[page.error.code] || 'The trainer encountered an error.'); } } finally { if (runtime) update(root, page, runtime.binding.getState()); } }, { signal });
    const nextSeed = () => `caissa-product-${Date.now()}-${++page.seedSequence}`;
    const category = seed => {
        const pieces = root.querySelector('[data-setup="pieces"]')?.value;
        const selected = root.querySelector('[data-setup="category"]')?.value;
        const compatible = pieces === '3' ? ['KQK', 'KRK', 'KPK'] : pieces === '4' ? ['KPKP'] : CATEGORIES;
        if (selected !== 'random' && compatible.includes(selected)) return selected;
        let hash = 0; for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return compatible[hash % compatible.length];
    };
    act('prepare', () => { const seed = nextSeed(); return runtime.binding.prepare({ categoryId: category(seed), userColor: root.querySelector('[data-setup="color"]')?.value, seed, candidateCount: 12, engineOptions: STRENGTH[root.querySelector('[data-setup="strength"]')?.value] }); });
    act('start', () => runtime.binding.start()); act('hint', () => runtime.binding.requestHint()); act('undo', () => runtime.binding.undo(), true); act('restart', () => runtime.binding.restart(), true); act('new', () => runtime.binding.newPosition({ seed: nextSeed() }), true); act('resign', () => runtime.binding.resign(), true); act('flip', () => runtime.binding.flip());
    mounted = { root, page, runtime, abort, promo, closeNav, abandon, resetDialog }; update(root, page, runtime?.binding.getState()); if (diagnosticState) root.dataset.state = diagnosticState; return publicPage(page);
}

export function unmountEndgameTrainerPage() { if (!mounted) return false; mounted.abandon(); mounted.page.disposed = true; update(mounted.root, mounted.page, mounted.runtime?.binding.getState()); mounted.promo.cancel(); if (mounted.resetDialog?.open) mounted.resetDialog.close(); mounted.abort.abort(); mounted.closeNav(); mounted.runtime?.dispose(); mounted.page.progressStore.dispose(); mounted.page.runtimeAttached = false; mounted.page.mounted = false; mounted = null; return true; }
export function getEndgameTrainerPageState() { return mounted ? publicPage(mounted.page) : { mounted: false, navOpen: false, runtimeAttached: false, operation: null, hint: null, error: null, disposed: true, controllerState: null, progress: null }; }
if (globalThis.document) { const start = () => mountEndgameTrainerPage(); document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start(); globalThis.addEventListener?.('pagehide', () => unmountEndgameTrainerPage(), { once: true }); }
