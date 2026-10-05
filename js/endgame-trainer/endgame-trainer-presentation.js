function markQueryViewNonIndexable(doc = globalThis.document) {
    const robots = doc?.head?.querySelector?.('meta[name="robots"]');
    robots?.setAttribute('content', 'noindex, nofollow');
}

export function applyLegacyEndgameTrainerPresentation(doc = globalThis.document) {
    markQueryViewNonIndexable(doc);
    const root = doc?.body?.querySelector?.('[data-endgame-trainer-page]');
    root?.classList?.add('is-legacy');
    const note = root?.querySelector?.('[data-legacy-note]');
    if (note) note.hidden = false;
}

export function revealEndgameTrainerPresentation(mode, doc = globalThis.document) {
    const root = doc?.body?.querySelector?.('[data-endgame-trainer-page]');
    if (!root || !['v2', 'legacy'].includes(mode)) return false;
    root.classList.remove('trainer-mode-pending', 'trainer-mode-v2', 'trainer-mode-legacy');
    root.classList.add(`trainer-mode-${mode}`);
    root.querySelector('[data-trainer-bootstrap]')?.setAttribute('hidden', '');
    return true;
}

export function renderEndgameTrainerLoadError(doc = globalThis.document, win = globalThis) {
    markQueryViewNonIndexable(doc);
    const root = doc?.body?.querySelector?.('[data-endgame-trainer-page]');
    if (!root) return false;
    root.classList.remove('trainer-mode-pending', 'trainer-mode-v2', 'trainer-mode-legacy');
    root.classList.add('is-v2', 'has-load-error');
    root.dataset.state = 'technical-unavailable';
    root.querySelector('[data-trainer-bootstrap]')?.setAttribute('hidden', '');
    root.querySelector('[data-endgame-v2-shell]')?.setAttribute('hidden', '');
    root.querySelector('[data-endgame-database-shell]')?.setAttribute('hidden', '');
    const panel = root.querySelector('[data-trainer-load-error]');
    if (panel) panel.hidden = false;
    panel?.querySelector('[data-trainer-retry]')?.addEventListener('click', () => win.location?.reload?.(), { once: true });
    panel?.querySelector('h1')?.focus?.();
    return true;
}
