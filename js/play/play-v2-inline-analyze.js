(function installPlayV2InlineAnalyze(root) {
    'use strict';

    const VERSION = '1.0.0';
    let openState = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode = null) => freeze({ ok, status, reasonCode });

    function restore() {
        if (!openState) return result(true, 'unchanged', 'ALREADY_CLOSED');
        const { section, closeButton, previous, copyObserver } = openState;
        copyObserver.disconnect();
        root.AnalyzeSection?.onExit?.();
        closeButton.remove();
        section.classList.remove('caissa-play-v2-inline-analyze');
        section.classList.toggle('active', previous.active);
        for (const [name, value] of Object.entries(previous.attributes)) {
            if (value === null) section.removeAttribute(name);
            else section.setAttribute(name, value);
        }
        root.document.body.classList.remove('caissa-play-v2-analyze-open');
        root.removeEventListener('keydown', onKeydown);
        openState = null;
        root.CaissaPostGameExperienceInstance?.show?.();
        root.document.querySelector('[data-post-game-action="analyze"]')?.focus?.();
        return result(true, 'accepted', 'ANALYZE_CLOSED');
    }

    function onKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            restore();
            return;
        }
        if (event.key !== 'Tab' || !openState) return;
        const focusable = [...openState.section.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && root.document.activeElement === first) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && root.document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    }

    function open(input = {}) {
        if (openState) return result(false, 'rejected', 'ALREADY_OPEN');
        const section = root.document.getElementById('analyzeSection');
        if (!section || typeof root.AnalyzeSection?.onEnter !== 'function')
            return result(false, 'unavailable', 'ANALYZE_UNAVAILABLE');
        const resolved = root.CaissaAnalyzeHandoff?.resolve?.(input.token);
        if (!resolved?.ok) return result(false, 'rejected', 'INVALID_HANDOFF');

        const closeButton = root.document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'caissa-play-v2-inline-analyze__close';
        closeButton.dataset.playV2AnalyzeClose = '';
        closeButton.textContent = 'Back to game result';
        closeButton.addEventListener('click', restore, { once: true });
        const previous = {
            active: section.classList.contains('active'),
            attributes: {
                role: section.getAttribute('role'),
                'aria-modal': section.getAttribute('aria-modal'),
                'aria-label': section.getAttribute('aria-label'),
                tabindex: section.getAttribute('tabindex')
            }
        };
        const normalizeCopy = () => section.querySelectorAll('p, span').forEach(node => {
            if (node.textContent?.trim() === 'Run analysis to highlight training moments.')
                node.textContent = 'Run analysis to highlight critical positions.';
        });
        const copyObserver = new root.MutationObserver(normalizeCopy);
        openState = { section, closeButton, previous, copyObserver };
        section.prepend(closeButton);
        section.classList.add('active', 'caissa-play-v2-inline-analyze');
        section.setAttribute('role', 'dialog');
        section.setAttribute('aria-modal', 'true');
        section.setAttribute('aria-label', 'Analyze completed game');
        section.setAttribute('tabindex', '-1');
        root.document.body.classList.add('caissa-play-v2-analyze-open');
        root.addEventListener('keydown', onKeydown);
        root.AnalyzeSection.onEnter({ handoff: resolved.value, owner: 'play-v2-postgame' });
        normalizeCopy();
        copyObserver.observe(section, { childList: true, subtree: true, characterData: true });
        closeButton.focus();
        return result(true, 'accepted', 'ANALYZE_OPENED_INLINE');
    }

    root.CaissaPlayV2InlineAnalyze = freeze({ schemaVersion: VERSION, open, close: restore,
        isOpen: () => openState !== null });
})(typeof window !== 'undefined' ? window : globalThis);
