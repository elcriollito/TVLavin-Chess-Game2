const STATES = new Set(['empty', 'loading', 'error', 'completed']);
let mounted = null;

const snapshot = (value) => structuredClone(value);

export function mountEndgameTrainerPage(options = {}) {
    const doc = options.document ?? globalThis.document;
    const win = options.window ?? globalThis.window;
    const root = options.root ?? doc?.querySelector?.('[data-endgame-trainer-page]');
    if (!root?.querySelector || !doc || !win) throw new TypeError('invalid-root');
    if (mounted?.root === root) return snapshot(mounted.state);
    if (mounted) unmountEndgameTrainerPage();
    const abort = new AbortController();
    const signal = abort.signal;
    const nav = root.querySelector('[data-mobile-nav]');
    const toggle = root.querySelector('[data-mobile-nav-toggle]');
    const stateRegion = root.querySelector('[data-diagnostic-state]');
    const preview = root.querySelector('[data-preview-message]');
    const active = [...root.querySelectorAll('[data-nav-key]')];
    active.forEach((item) => {
        const current = item.dataset.navKey === 'endgame-trainer';
        item.classList.toggle('is-active', current);
        current ? item.setAttribute('aria-current', 'page') : item.removeAttribute('aria-current');
    });
    const requested = new URLSearchParams(win.location?.search ?? '').get('state');
    const diagnosticState = STATES.has(requested) ? requested : 'empty';
    root.dataset.state = diagnosticState;
    stateRegion?.setAttribute('aria-busy', String(diagnosticState === 'loading'));
    const state = { mounted: true, navOpen: false, diagnosticState, previewSelection: null };
    const close = (returnFocus = false) => {
        state.navOpen = false; root.classList.remove('is-nav-open');
        toggle?.setAttribute('aria-expanded', 'false');
        if (returnFocus) toggle?.focus?.();
    };
    toggle?.addEventListener('click', () => {
        state.navOpen = !state.navOpen; root.classList.toggle('is-nav-open', state.navOpen);
        toggle.setAttribute('aria-expanded', String(state.navOpen));
        if (state.navOpen) nav?.querySelector('a')?.focus?.();
    }, { signal });
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.navOpen) close(true); }, { signal });
    doc.addEventListener('click', (event) => { if (state.navOpen && !nav?.contains(event.target) && !toggle?.contains(event.target)) close(); }, { signal });
    nav?.addEventListener('click', (event) => { if (state.navOpen && event.target?.closest?.('a')) close(); }, { signal });
    win.addEventListener?.('resize', () => { if (state.navOpen && win.innerWidth > 768) close(); }, { signal });
    root.querySelectorAll('[data-preview-option]').forEach((control) => control.addEventListener('change', () => {
        state.previewSelection = control.value; if (preview) preview.textContent = `Preview selection: ${control.value}`;
    }, { signal }));
    root.querySelector('[data-preview-cta]')?.addEventListener('click', () => {
        if (preview) preview.textContent = 'Runtime integration coming next.';
    }, { signal });
    mounted = { root, doc, abort, state, close };
    return snapshot(state);
}

export function unmountEndgameTrainerPage() {
    if (!mounted) return false;
    mounted.close(); mounted.abort.abort(); mounted.root.classList.remove('is-nav-open');
    mounted = null; return true;
}

export function getEndgameTrainerPageState() {
    return snapshot(mounted?.state ?? { mounted: false, navOpen: false, diagnosticState: null, previewSelection: null });
}

if (globalThis.document) {
    const start = () => mountEndgameTrainerPage();
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start();
}
