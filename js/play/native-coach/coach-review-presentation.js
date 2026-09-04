(function installCoachReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function element(tag, className, attributes = {}) {
        const node = root.document.createElement(tag);
        node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    }

    function mount(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        const section = options.section;
        const context = options.context;
        if (!section?.prepend || root.CaissaCoachReviewContext?.isCoachReview?.(context) !== true) {
            return result(false, 'rejected', 'INVALID_COACH_REVIEW_CONTEXT');
        }

        const shell = element('header', 'caissa-coach-review-shell', {
            'data-caissa-coach-review-shell': '',
            'aria-labelledby': 'caissa-coach-review-title'
        });
        const avatar = element('img', 'caissa-coach-review-shell__avatar', {
            src: '/assets/play/caissa-coach-goddess.png',
            alt: 'Caissa, goddess of chess',
            width: '512',
            height: '512'
        });
        const copy = element('div', 'caissa-coach-review-shell__copy');
        const eyebrow = element('span', 'caissa-coach-review-shell__eyebrow');
        eyebrow.textContent = 'CAISSA';
        const title = element('h1', 'caissa-coach-review-shell__title', { id: 'caissa-coach-review-title' });
        title.textContent = 'Coach Review';
        const speech = element('p', 'caissa-coach-review-shell__speech', { 'data-coach-review-message': '' });
        speech.textContent = 'Your game is ready. Let’s look at the decisions that shaped it.';
        copy.append(eyebrow, title, speech);
        shell.append(avatar, copy);

        section.classList.add('caissa-coach-review-context');
        section.dataset.caissaReviewContext = 'coach';
        section.dataset.coachReviewPhase = 'shell';
        section.prepend(shell);
        mounted = { section, shell, context };
        return result(true, 'accepted', 'COACH_REVIEW_SHELL_MOUNTED', getSnapshot());
    }

    function unmount() {
        if (!mounted) return result(true, 'unchanged', 'ALREADY_UNMOUNTED');
        mounted.shell.remove();
        mounted.section.classList.remove('caissa-coach-review-context');
        delete mounted.section.dataset.caissaReviewContext;
        delete mounted.section.dataset.coachReviewPhase;
        mounted = null;
        return result(true, 'accepted', 'COACH_REVIEW_SHELL_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            mounted: !!mounted,
            contextId: mounted?.context?.contextId || null,
            sourceMode: mounted?.context?.sourceMode || null,
            phase: mounted ? 'shell' : null,
            activePlyOwner: 'AnalyzeSection.currentMoveIndex'
        });
    }

    root.CaissaCoachReviewPresentation = freeze({ schemaVersion: SCHEMA_VERSION, mount, unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
