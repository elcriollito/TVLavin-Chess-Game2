(function installPlayV2InlineAnalyze(root) {
    'use strict';

    const VERSION = '1.3.0';
    let openState = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode = null) => freeze({ ok, status, reasonCode });

    function restore() {
        if (!openState) return result(true, 'unchanged', 'ALREADY_CLOSED');
        const { section, playSection, closeButton, previous, copyObserver, reviewPresentation,
            viewport, scrollPosition, embeddedReview } = openState;
        copyObserver.disconnect();
        viewport?.removeEventListener?.('resize', updateViewportGeometry);
        viewport?.removeEventListener?.('scroll', updateViewportGeometry);
        root.removeEventListener('resize', updateViewportGeometry);
        root.AnalyzeSection?.onExit?.();
        reviewPresentation?.unmount?.();
        closeButton.remove();
        section.classList.remove('caissa-play-v2-inline-analyze');
        if (!embeddedReview) {
            section.classList.toggle('active', previous.active);
            for (const [name, value] of Object.entries(previous.attributes)) {
                if (value === null) section.removeAttribute(name);
                else section.setAttribute(name, value);
            }
            root.document.body.classList.remove('caissa-play-v2-analyze-open');
        }
        if (playSection) {
            playSection.inert = previous.playInert;
            if (previous.playAriaHidden === null) playSection.removeAttribute('aria-hidden');
            else playSection.setAttribute('aria-hidden', previous.playAriaHidden);
        }
        for (const property of previous.viewportProperties) {
            root.document.documentElement.style.removeProperty(property);
        }
        root.removeEventListener('keydown', onKeydown);
        openState = null;
        root.scrollTo(scrollPosition.x, scrollPosition.y);
        root.CaissaPostGameExperienceInstance?.show?.();
        const restoreFocus = () => root.document
            .querySelector('[data-post-game-action="analyze"]')?.focus?.();
        restoreFocus();
        root.requestAnimationFrame?.(() => {
            restoreFocus();
            root.requestAnimationFrame?.(restoreFocus);
        });
        root.setTimeout(restoreFocus, 0);
        return result(true, 'accepted', 'ANALYZE_CLOSED');
    }

    function updateViewportGeometry() {
        if (!openState) return;
        const viewport = root.visualViewport;
        const width = viewport?.width || root.innerWidth;
        const height = viewport?.height || root.innerHeight;
        const offsetLeft = viewport?.offsetLeft || 0;
        const offsetTop = viewport?.offsetTop || 0;
        const style = root.document.documentElement.style;
        style.setProperty('--play-v2-analyze-viewport-width', `${width}px`);
        style.setProperty('--play-v2-analyze-viewport-height', `${height}px`);
        style.setProperty('--play-v2-analyze-viewport-left', `${offsetLeft}px`);
        style.setProperty('--play-v2-analyze-viewport-top', `${offsetTop}px`);
        root.AnalyzeSection?.board?.resize?.();
    }

    function onKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            restore();
            return;
        }
        if (event.key !== 'Tab' || !openState) return;
        const focusable = [...(openState.focusRoot || openState.section).querySelectorAll(
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
        const playSection = root.document.getElementById('playSection');
        if (!section || typeof root.AnalyzeSection?.onEnter !== 'function')
            return result(false, 'unavailable', 'ANALYZE_UNAVAILABLE');
        const resolved = root.CaissaAnalyzeHandoff?.consume?.(input.token);
        if (!resolved?.ok) return result(false, 'rejected', 'INVALID_HANDOFF');

        const closeButton = root.document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'caissa-play-v2-inline-analyze__close';
        closeButton.dataset.playV2AnalyzeClose = '';
        closeButton.textContent = 'Back to game result';
        closeButton.addEventListener('click', restore, { once: true });
        const previous = {
            active: section.classList.contains('active'),
            playInert: Boolean(playSection?.inert),
            playAriaHidden: playSection?.getAttribute('aria-hidden') ?? null,
            viewportProperties: [
                '--play-v2-analyze-viewport-width', '--play-v2-analyze-viewport-height',
                '--play-v2-analyze-viewport-left', '--play-v2-analyze-viewport-top'
            ],
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
        const viewport = root.visualViewport;
        const scrollPosition = { x: root.scrollX, y: root.scrollY };
        const coachReview = root.CaissaCoachReviewContext?.isCoachReview?.(input.reviewContext) === true;
        const botsReview = root.CaissaBotsReviewContext?.isBotsReview?.(input.reviewContext) === true;
        const embeddedReview = coachReview || botsReview;
        const reviewPresentation = coachReview ? root.CaissaCoachReviewPresentation
            : botsReview ? root.CaissaBotsAnalysisSummaryPresentation : null;
        const phaseHost = coachReview ? playSection?.querySelector?.('[data-caissa-coach-phase-host]')
            : botsReview ? playSection?.querySelector?.('[data-caissa-bots-body]') : null;
        if (embeddedReview && (!phaseHost || !reviewPresentation?.mount))
            return result(false, 'unavailable', coachReview ? 'PLAY_COACH_HOST_UNAVAILABLE' : 'PLAY_BOTS_HOST_UNAVAILABLE');
        openState = { section, playSection, closeButton, previous, copyObserver,
            reviewPresentation, viewport, scrollPosition, coachReview, botsReview, embeddedReview,
            focusRoot: embeddedReview ? (phaseHost.closest?.('[data-caissa-coach-shell], [data-caissa-bots-shell]') || phaseHost) : section };
        if (!embeddedReview && playSection) {
            playSection.inert = true;
            playSection.setAttribute('aria-hidden', 'true');
        }
        if (embeddedReview) {
            // AnalyzeSection's token attribution uses this existing marker as its
            // activity contract. The section remains hidden and never becomes the UI host.
            section.classList.add('caissa-play-v2-inline-analyze');
            const mounted = reviewPresentation.mount({ section, host: phaseHost, close: closeButton,
                context: input.reviewContext, handoff: resolved.value });
            if (!mounted?.ok) {
                section.classList.remove('caissa-play-v2-inline-analyze');
                openState = null;
                return result(false, 'unavailable', mounted?.reasonCode || (coachReview
                    ? 'COACH_REVIEW_MOUNT_FAILED' : 'BOTS_REVIEW_MOUNT_FAILED'));
            }
        } else {
            section.prepend(closeButton);
            section.classList.add('active', 'caissa-play-v2-inline-analyze');
            section.setAttribute('role', 'dialog');
            section.setAttribute('aria-modal', 'true');
            section.setAttribute('aria-label', 'Analyze completed game');
            section.setAttribute('tabindex', '-1');
            root.document.body.classList.add('caissa-play-v2-analyze-open');
            updateViewportGeometry();
            viewport?.addEventListener?.('resize', updateViewportGeometry);
            viewport?.addEventListener?.('scroll', updateViewportGeometry);
            root.addEventListener('resize', updateViewportGeometry);
        }
        root.addEventListener('keydown', onKeydown);
        root.AnalyzeSection.onEnter({ handoff: resolved.value, owner: 'play-v2-postgame' });
        reviewPresentation?.begin?.({ analyze: root.AnalyzeSection });
        normalizeCopy();
        if (!embeddedReview) copyObserver.observe(section, { childList: true, subtree: true, characterData: true });
        closeButton.focus();
        return result(true, 'accepted', coachReview ? 'COACH_REVIEW_OPENED_IN_PLAY'
            : botsReview ? 'BOTS_REVIEW_SUMMARY_OPENED_IN_PLAY' : 'ANALYZE_OPENED_INLINE');
    }

    root.CaissaPlayV2InlineAnalyze = freeze({ schemaVersion: VERSION, open, close: restore,
        isOpen: () => openState !== null });
})(typeof window !== 'undefined' ? window : globalThis);
