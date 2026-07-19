import { createEndgameTrainerRuntime } from './endgame-trainer-runtime.js';

const CATEGORIES = ['KQK', 'KRK', 'KPK', 'KPKP'];
const STRENGTH = { beginner: { depth: 5, skillLevel: 2 }, intermediate: { depth: 8, skillLevel: 8 }, advanced: { depth: 12, skillLevel: 14 }, strong: { depth: 15, skillLevel: 20 } };
const PUBLIC_ERRORS = { 'candidate-selection-failed': 'No suitable position was found.', 'engine-not-ready': 'The chess engine could not start.', 'engine-search-timeout': 'The engine took too long.', 'engine-load-failed': 'The chess engine could not load.', 'engine-move-failed': 'The engine could not complete its move.', 'invalid-move': 'That move is not legal.', 'invalid-options': 'Check the selected settings.', 'board-initialization-failed': 'The board could not start.', 'session-disposed': 'The session has ended.' };
let mounted = null;
const copy = value => structuredClone(value);
const text = (node, value) => { if (node) node.textContent = value ?? '—'; };

function promotion(root, signal) {
    const dialog = root.querySelector('[data-promotion]'); let settle = null;
    const cancel = () => settle?.(null);
    const resolve = () => new Promise(done => { let closed = false; settle = value => { if (closed) return; closed = true; settle = null; dialog.close(); done(value); }; dialog.showModal(); dialog.querySelector('[data-promotion-piece="q"]')?.focus(); });
    dialog?.addEventListener('click', event => { const value = event.target?.dataset?.promotionPiece; if (value !== undefined) settle?.(value || null); }, { signal });
    dialog?.addEventListener('cancel', event => { event.preventDefault(); cancel(); }, { signal });
    return { resolve, cancel };
}

function renderHistory(root, moves = []) {
    const list = root.querySelector('[data-history]'); if (!list) return;
    list.replaceChildren(); const doc = root.ownerDocument;
    if (!moves.length) { const li = doc.createElement('li'); li.textContent = 'No moves yet.'; list.append(li); return; }
    for (const entry of moves) { const li = doc.createElement('li'); li.textContent = `${entry.actor}: ${entry.move?.san || entry.move?.lan || 'move'}`; list.append(li); }
    list.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
}

function update(root, page, snapshot) {
    const state = snapshot?.controllerState ?? page.controllerState ?? { status: 'idle', moveHistory: [] };
    page.controllerState = copy(state); page.operation = snapshot?.loading ?? null; page.hint = snapshot?.hint ?? page.hint;
    const status = state.status === 'idle' ? 'empty' : page.operation ? 'loading' : state.status === 'completed' ? 'completed' : state.status === 'error' ? 'error' : state.status;
    root.dataset.state = ['empty', 'loading', 'error', 'completed'].includes(status) ? status : 'ready';
    root.querySelector('[data-diagnostic-state]')?.setAttribute('aria-busy', String(Boolean(page.operation || state.engineThinking)));
    const field = name => root.querySelector(`[data-field="${name}"]`);
    text(field('objective'), state.objective); text(field('turn'), state.sideToMove ? `${state.sideToMove[0].toUpperCase()}${state.sideToMove.slice(1)} to move` : '—');
    text(field('status'), state.status === 'user-turn' ? 'Your turn' : state.status); text(field('attempt'), state.attemptNumber); text(field('hints'), state.hintsUsed ?? 0); text(field('undos'), state.undosUsed ?? 0);
    text(field('engine'), state.engineThinking ? 'Thinking' : page.disposed ? 'Disposed' : state.sessionId ? 'Ready' : 'Not initialized'); text(field('result'), state.result?.gameResult); text(field('score'), state.score);
    text(root.querySelector('[data-hint-output]'), page.hint?.suggestedMove ? `Suggested move: ${page.hint.suggestedMove}` : ''); renderHistory(root, state.moveHistory);
    const overlay = root.querySelector('[data-board-overlay]'); if (overlay) overlay.hidden = !state.engineThinking;
    const enabled = page.disposed ? {} : { prepare: ['idle', 'error'].includes(state.status) && !page.operation, start: state.status === 'ready' && !page.operation, hint: state.status === 'user-turn' && !page.operation, undo: state.status === 'user-turn' && state.moveHistory?.length > 0 && !page.operation, restart: Boolean(state.sessionId), new: Boolean(state.sessionId), resign: Boolean(state.sessionId) && !['completed', 'resigned', 'error'].includes(state.status), flip: true };
    for (const button of root.querySelectorAll('[data-action]')) button.disabled = !enabled[button.dataset.action];
}

export function mountEndgameTrainerPage(options = {}) {
    const doc = options.document ?? globalThis.document, win = options.window ?? globalThis.window;
    const root = options.root ?? doc?.querySelector?.('[data-endgame-trainer-page]');
    if (!root?.querySelector || !doc || !win) throw new TypeError('invalid-root');
    if (mounted?.root === root) return copy(mounted.page);
    if (mounted) unmountEndgameTrainerPage();
    const abort = new AbortController(), signal = abort.signal, promo = promotion(root, signal), board = root.querySelector('[data-board]');
    const params = new URLSearchParams(win.location?.search ?? '');
    const diagnosticState = params.get('diagnostic') === '1' && ['empty', 'loading', 'error', 'completed'].includes(params.get('diagnosticState')) ? params.get('diagnosticState') : null;
    const page = { mounted: true, navOpen: false, runtimeAttached: false, operation: null, hint: null, error: null, disposed: false, diagnosticState, controllerState: null, seedSequence: 0 };
    const runtimeFactory = options.runtimeFactory ?? createEndgameTrainerRuntime;
    let runtime = null;
    if (board) { runtime = runtimeFactory({ boardElement: board, promotionResolver: promo.resolve, callbacks: { onStateChange: snap => update(root, page, snap), onAnnouncement: value => text(root.querySelector('[data-announcement]'), value), onError: error => { if (error.code !== 'stale-operation') { page.error = { code: error.code }; text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[error.code] || 'The trainer encountered an error.'); } } } }).initialize(); page.runtimeAttached = true; }
    const nav = root.querySelector('[data-mobile-nav]'), toggle = root.querySelector('[data-mobile-nav-toggle]');
    root.querySelectorAll('[data-nav-key]').forEach(item => { const active = item.dataset.navKey === 'endgame-trainer'; item.classList.toggle('is-active', active); active ? item.setAttribute('aria-current', 'page') : item.removeAttribute('aria-current'); });
    const closeNav = focus => { page.navOpen = false; root.classList.remove('is-nav-open'); toggle?.setAttribute('aria-expanded', 'false'); if (focus) toggle?.focus?.(); };
    toggle?.addEventListener('click', () => { page.navOpen = !page.navOpen; root.classList.toggle('is-nav-open', page.navOpen); toggle.setAttribute('aria-expanded', String(page.navOpen)); }, { signal });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && page.navOpen) closeNav(true); }, { signal }); doc.addEventListener('click', e => { if (page.navOpen && !nav?.contains(e.target) && !toggle?.contains(e.target)) closeNav(); }, { signal });
    win.addEventListener?.('resize', () => { if (page.navOpen && win.innerWidth > 768) closeNav(); }, { signal });
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
    mounted = { root, page, runtime, abort, promo, closeNav }; update(root, page, runtime?.binding.getState()); if (diagnosticState) root.dataset.state = diagnosticState; return copy(page);
}

export function unmountEndgameTrainerPage() { if (!mounted) return false; mounted.page.disposed = true; update(mounted.root, mounted.page, mounted.runtime?.binding.getState()); mounted.promo.cancel(); mounted.abort.abort(); mounted.closeNav(); mounted.runtime?.dispose(); mounted.page.runtimeAttached = false; mounted.page.mounted = false; mounted = null; return true; }
export function getEndgameTrainerPageState() { return copy(mounted?.page ?? { mounted: false, navOpen: false, runtimeAttached: false, operation: null, hint: null, error: null, disposed: true, controllerState: null }); }
if (globalThis.document) { const start = () => mountEndgameTrainerPage(); document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start(); globalThis.addEventListener?.('pagehide', () => unmountEndgameTrainerPage(), { once: true }); }
