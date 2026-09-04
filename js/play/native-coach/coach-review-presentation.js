(function installCoachReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.2.0';
    const QUALITY_ORDER = Object.freeze(['Book', 'Best', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const CLASSIFICATIONS = Object.freeze(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const QUALITY_ICONS = Object.freeze({
        Book: 'fa-book-open', Best: 'fa-star', Acceptable: 'fa-check',
        Inaccuracy: 'fa-question', Mistake: 'fa-exclamation', Blunder: 'fa-bolt'
    });
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function element(tag, className, attributes = {}) {
        const node = root.document.createElement(tag);
        node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    }

    function sideReview(results) {
        const counts = Object.fromEntries(CLASSIFICATIONS.map(quality => [quality, 0]));
        let best = 0;
        results.forEach(item => {
            if (CLASSIFICATIONS.includes(item.quality)) counts[item.quality] += 1;
            if (item.isBestMove === true) best += 1;
        });
        const accuracy = root.CaissaAnalyzeReviewPolicy?.accuracy?.(results);
        return freeze({ accuracy: accuracy?.ok ? accuracy.value : null, counts: freeze(counts), best });
    }

    function reviewMessage(player) {
        const corrections = player.counts.Inaccuracy + player.counts.Mistake + player.counts.Blunder;
        if (player.counts.Blunder > 0 || player.counts.Mistake > 0)
            return "A few decisions shifted the game. Let's review the moments with the biggest impact.";
        if (corrections > 0)
            return 'You played a steady game with a few decisions worth revisiting.';
        return "You played a consistent game. Let's review the decisions that shaped the result.";
    }

    function createSummaryModel(input = {}) {
        const analyze = input.analyze;
        const handoff = input.handoff;
        const phase = analyze?.analysisPhase || 'idle';
        if (!analyze || root.CaissaCoachReviewContext?.isCoachReview?.(input.context) !== true
            || !handoff?.payload)
            return result(false, 'rejected', 'INVALID_COACH_REVIEW_EVIDENCE');
        const progress = analyze.totalPositions > 0
            ? Math.max(0, Math.min(100, Math.round((analyze.analyzedPositions / analyze.totalPositions) * 100)))
            : 0;
        if (phase !== 'complete') {
            return result(true, 'accepted', 'COACH_REVIEW_PENDING', freeze({
                phase: phase === 'failed' || phase === 'cancelled' ? 'unavailable' : 'loading',
                progress,
                progressText: analyze.totalPositions > 0
                    ? `Reviewing move ${Math.min(analyze.analyzedPositions + 1, analyze.totalPositions)} of ${analyze.totalPositions}`
                    : 'Preparing your review'
            }));
        }

        const analyzed = Array.isArray(analyze.analysisResults)
            ? analyze.analysisResults.filter(item => item && !item.unavailable)
            : [];
        if (!analyzed.length)
            return result(true, 'accepted', 'COACH_REVIEW_PENDING', freeze({ phase: 'unavailable', progress: 100 }));
        const white = sideReview(analyzed.filter(item => item.moveIndex % 2 === 0));
        const black = sideReview(analyzed.filter(item => item.moveIndex % 2 === 1));
        const playerColor = handoff.payload.playerColor === 'black' ? 'black' : 'white';
        const player = playerColor === 'white' ? white : black;
        const coach = playerColor === 'white' ? black : white;
        const playerLabel = playerColor === 'white' ? handoff.payload.whiteLabel : handoff.payload.blackLabel;
        const rows = QUALITY_ORDER.map(label => ({
            label,
            player: label === 'Best' ? player.best : player.counts[label],
            coach: label === 'Best' ? coach.best : coach.counts[label]
        })).filter(row => row.player + row.coach > 0).map(freeze);
        return result(true, 'accepted', 'COACH_REVIEW_SUMMARY_READY', freeze({
            phase: 'summary',
            playerLabel: String(playerLabel || 'You').slice(0, 48),
            coachLabel: 'CAISSA',
            playerAccuracy: player.accuracy,
            coachAccuracy: coach.accuracy,
            rows: freeze(rows),
            message: reviewMessage(player)
        }));
    }

    function createStructure(section) {
        const contextPanel = section.querySelector('.context-panel');
        if (!contextPanel) return null;
        const panel = element('section', 'caissa-coach-review-summary', {
            'data-caissa-coach-review-shell': '',
            'data-caissa-coach-review-summary': '',
            'aria-labelledby': 'caissa-coach-review-title'
        });
        const header = element('header', 'caissa-coach-review-summary__header');
        const heading = element('div', 'caissa-coach-review-summary__heading');
        const eyebrow = element('span', 'caissa-coach-review-summary__eyebrow');
        eyebrow.textContent = 'CAISSA';
        const title = element('h1', 'caissa-coach-review-summary__title', { id: 'caissa-coach-review-title' });
        title.textContent = 'Game Review';
        heading.append(eyebrow, title);
        const close = section.querySelector('[data-play-v2-analyze-close]');
        header.append(heading);
        if (close) header.append(close);

        const loading = element('div', 'caissa-coach-review-summary__loading', {
            'data-coach-review-loading': '', role: 'status', 'aria-live': 'polite'
        });
        const progressTrack = element('div', 'caissa-coach-review-summary__progress', {
            role: 'progressbar', 'aria-label': 'Game review progress', 'aria-valuemin': '0', 'aria-valuemax': '100'
        });
        const progressFill = element('span', 'caissa-coach-review-summary__progress-fill');
        progressTrack.append(progressFill);
        const progressText = element('span', 'caissa-coach-review-summary__progress-text');
        loading.append(progressTrack, progressText);

        const comparison = element('div', 'caissa-coach-review-summary__comparison', {
            'data-coach-review-comparison': ''
        });
        const profiles = element('div', 'caissa-coach-review-summary__profiles');
        const playerProfile = element('div', 'caissa-coach-review-summary__profile');
        const playerAvatar = element('span', 'caissa-coach-review-summary__player-avatar', {
            role: 'img', 'aria-label': 'Player avatar'
        });
        playerAvatar.textContent = 'P';
        const playerRole = element('strong', 'caissa-coach-review-summary__role'); playerRole.textContent = 'Player';
        const playerName = element('span', 'caissa-coach-review-summary__name', { 'data-coach-review-player-name': '' });
        playerProfile.append(playerAvatar, playerRole, playerName);
        const coachProfile = element('div', 'caissa-coach-review-summary__profile');
        const coachAvatar = element('span', 'caissa-coach-review-summary__profile-avatar', {
            role: 'img', 'aria-label': 'Caissa Coach avatar'
        });
        coachAvatar.textContent = '\u265b';
        const coachRole = element('strong', 'caissa-coach-review-summary__role'); coachRole.textContent = 'Coach';
        const coachName = element('span', 'caissa-coach-review-summary__name', { 'data-coach-review-coach-name': '' });
        coachProfile.append(coachAvatar, coachRole, coachName);
        profiles.append(playerProfile, coachProfile);

        const accuracy = element('div', 'caissa-coach-review-summary__accuracy');
        const accuracyLabel = element('span', 'caissa-coach-review-summary__accuracy-label'); accuracyLabel.textContent = 'Accuracy';
        const playerAccuracy = element('strong', 'caissa-coach-review-summary__accuracy-value', { 'data-coach-review-player-accuracy': '' });
        const coachAccuracy = element('strong', 'caissa-coach-review-summary__accuracy-value', { 'data-coach-review-coach-accuracy': '' });
        accuracy.append(accuracyLabel, playerAccuracy, coachAccuracy);
        const table = element('div', 'caissa-coach-review-summary__table', {
            role: 'table', 'aria-label': 'Player and Coach move classifications', 'data-coach-review-classifications': ''
        });
        comparison.append(profiles, accuracy, table);

        const action = element('button', 'caissa-coach-review-summary__action', {
            type: 'button', 'data-coach-review-guided-action': ''
        });
        action.textContent = 'Review Game';
        const placeholder = element('div', 'caissa-coach-review-summary__placeholder', {
            'data-coach-review-guided-placeholder': '', role: 'status', tabindex: '-1'
        });
        placeholder.hidden = true;
        const placeholderTitle = element('strong', 'caissa-coach-review-summary__placeholder-title');
        placeholderTitle.textContent = 'Guided Review is next';
        const placeholderCopy = element('p', 'caissa-coach-review-summary__placeholder-copy');
        placeholderCopy.textContent = 'Your completed summary is preserved. Guided move-by-move review continues in the next milestone.';
        placeholder.append(placeholderTitle, placeholderCopy);
        action.addEventListener('click', () => {
            if (!mounted) return;
            mounted.comparison.hidden = true;
            mounted.action.hidden = true;
            mounted.placeholder.hidden = false;
            mounted.section.dataset.coachReviewPhase = 'guided-placeholder';
            mounted.placeholder.focus?.();
        });

        panel.append(header, loading, comparison, action, placeholder);
        contextPanel.append(panel);
        return { panel, close, loading, progressTrack, progressFill, progressText,
            comparison, playerAvatar, playerName, coachName, playerAccuracy, coachAccuracy, table, action, placeholder };
    }

    function displayCount(value) { return value > 0 ? String(value) : '\u2014'; }

    function renderModel(model) {
        if (!mounted || !model) return;
        mounted.section.dataset.coachReviewPhase = model.phase;
        mounted.loading.hidden = model.phase !== 'loading';
        mounted.comparison.hidden = model.phase !== 'summary';
        mounted.action.hidden = model.phase !== 'summary';
        mounted.placeholder.hidden = true;
        if (model.phase === 'loading') {
            root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', message: 'Reviewing your game...' });
            mounted.progressFill.style.width = `${model.progress}%`;
            mounted.progressTrack.setAttribute('aria-valuenow', String(model.progress));
            mounted.progressText.textContent = model.progressText;
            return;
        }
        if (model.phase === 'unavailable') {
            mounted.loading.hidden = false;
            root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary',
                message: 'Review unavailable. Your game result is preserved.' });
            mounted.progressTrack.hidden = true;
            mounted.progressText.hidden = false;
            mounted.progressText.textContent = 'Return to the result and try again when ready.';
            return;
        }
        root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', message: model.message });
        mounted.playerName.textContent = model.playerLabel;
        mounted.playerAvatar.textContent = model.playerLabel.slice(0, 1).toUpperCase() || 'P';
        mounted.coachName.textContent = model.coachLabel;
        mounted.playerAccuracy.textContent = model.playerAccuracy === null ? '\u2014' : `${model.playerAccuracy}%`;
        mounted.coachAccuracy.textContent = model.coachAccuracy === null ? '\u2014' : `${model.coachAccuracy}%`;
        mounted.table.replaceChildren();
        model.rows.forEach(row => {
            const line = element('div', 'caissa-coach-review-summary__row', { role: 'row', 'data-quality': row.label });
            const label = element('span', 'caissa-coach-review-summary__quality', { role: 'rowheader' }); label.textContent = row.label;
            const player = element('strong', 'caissa-coach-review-summary__count', { role: 'cell', 'data-side': 'player' });
            const icon = element('span', 'caissa-coach-review-summary__quality-icon', { 'aria-hidden': 'true' });
            const iconGlyph = element('i', `fas ${QUALITY_ICONS[row.label] || 'fa-circle'}`);
            const coach = element('strong', 'caissa-coach-review-summary__count', { role: 'cell', 'data-side': 'coach' });
            icon.append(iconGlyph);
            player.textContent = displayCount(row.player); coach.textContent = displayCount(row.coach);
            line.append(label, player, icon, coach); mounted.table.append(line);
        });
    }

    function update() {
        if (!mounted?.analyze) return;
        const modeled = createSummaryModel({ analyze: mounted.analyze, handoff: mounted.handoff,
            context: mounted.context });
        if (!modeled.ok) return;
        const model = modeled.value;
        const fingerprint = `${model.phase}:${model.progress || 0}:${mounted.analyze.analysisResults?.length || 0}`;
        if (fingerprint === mounted.fingerprint) return;
        mounted.fingerprint = fingerprint;
        mounted.model = model;
        renderModel(model);
        if (model.phase !== 'loading' && mounted.timer) {
            root.clearInterval(mounted.timer);
            mounted.timer = null;
        }
    }

    function mount(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        const section = options.section;
        const context = options.context;
        if (!section?.querySelector || root.CaissaCoachReviewContext?.isCoachReview?.(context) !== true
            || !options.handoff?.payload) {
            return result(false, 'rejected', 'INVALID_COACH_REVIEW_CONTEXT');
        }
        const close = section.querySelector('[data-play-v2-analyze-close]');
        const closeState = close ? {
            parent: close.parentNode, next: close.nextSibling, text: close.textContent,
            ariaLabel: close.getAttribute('aria-label'), className: close.className
        } : null;
        const concealed = [...section.querySelectorAll('.context-panel > .panel, .analyze-evidence-panel, .analyze-study-action, .analyze-engine-toggle')]
            .map(node => ({ node, hidden: node.hidden }));
        concealed.forEach(item => { item.node.hidden = true; });
        const structure = createStructure(section);
        if (!structure) return result(false, 'rejected', 'INVALID_ANALYZE_HOST');
        const tabs = root.document.querySelector('.caissa-simplified-shell__modes');
        const tabsState = tabs ? { node: tabs, parent: tabs.parentNode, next: tabs.nextSibling } : null;
        if (tabs) section.querySelector('.context-panel')?.insertBefore(tabs, structure.panel);
        if (structure.close) {
            structure.close.textContent = '\u2190 Back';
            structure.close.setAttribute('aria-label', 'Back to game result');
            structure.close.classList.add('caissa-coach-review-summary__back');
        }
        const shell = root.CaissaNativeCoachPanel?.present?.({ host: section.querySelector('.context-panel'),
            phase: 'review-summary', content: structure.panel, message: 'Reviewing your game...', transient: true });
        if (!shell?.ok) {
            concealed.forEach(item => { item.node.hidden = item.hidden; });
            structure.panel.remove();
            if (tabsState) tabsState.parent?.insertBefore?.(tabsState.node, tabsState.next);
            if (structure.close && closeState) {
                structure.close.textContent = closeState.text;
                if (closeState.ariaLabel === null) structure.close.removeAttribute('aria-label');
                else structure.close.setAttribute('aria-label', closeState.ariaLabel);
                structure.close.className = closeState.className;
                closeState.parent?.insertBefore?.(structure.close, closeState.next);
            }
            return result(false, 'rejected', 'COACH_SHELL_UNAVAILABLE');
        }
        const previousAriaLabel = section.getAttribute('aria-label');
        section.setAttribute('aria-label', 'Coach game review');
        section.classList.add('caissa-coach-review-context');
        section.dataset.caissaReviewContext = 'coach';
        section.dataset.coachReviewPhase = 'loading';
        root.document.body?.classList?.add('caissa-coach-review-summary-active');
        mounted = { section, context, handoff: options.handoff, concealed, closeState, tabsState, previousAriaLabel,
            ...structure, analyze: null, model: null, fingerprint: null, analysisStartRequests: 0, timer: null };
        renderModel({ phase: 'loading', progress: 0, progressText: 'Preparing your review' });
        return result(true, 'accepted', 'COACH_REVIEW_SUMMARY_MOUNTED', getSnapshot());
    }

    function begin(options = {}) {
        if (!mounted || !options.analyze?.startAnalysis)
            return result(false, 'rejected', 'COACH_REVIEW_NOT_MOUNTED');
        if (mounted.analysisStartRequests > 0)
            return result(true, 'unchanged', 'ANALYSIS_ALREADY_REQUESTED', getSnapshot());
        mounted.analyze = options.analyze;
        mounted.analysisStartRequests += 1;
        update();
        mounted.timer = root.setInterval(update, 100);
        root.setTimeout(() => {
            if (!mounted || mounted.analyze !== options.analyze) return;
            if (!['preparing', 'analyzing', 'complete'].includes(options.analyze.analysisPhase)) {
                Promise.resolve(options.analyze.startAnalysis()).catch(() => update());
            }
        }, 0);
        return result(true, 'accepted', 'ANALYSIS_START_REQUESTED', getSnapshot());
    }

    function unmount() {
        if (!mounted) return result(true, 'unchanged', 'ALREADY_UNMOUNTED');
        if (mounted.timer) root.clearInterval(mounted.timer);
        mounted.concealed.forEach(item => { item.node.hidden = item.hidden; });
        if (mounted.close && mounted.closeState) {
            mounted.close.textContent = mounted.closeState.text;
            if (mounted.closeState.ariaLabel === null) mounted.close.removeAttribute('aria-label');
            else mounted.close.setAttribute('aria-label', mounted.closeState.ariaLabel);
            mounted.close.className = mounted.closeState.className;
            mounted.closeState.parent?.insertBefore?.(mounted.close, mounted.closeState.next);
        }
        mounted.panel.remove();
        root.CaissaNativeCoachPanel?.restorePresentation?.();
        if (mounted.tabsState) mounted.tabsState.parent?.insertBefore?.(mounted.tabsState.node, mounted.tabsState.next);
        mounted.section.classList.remove('caissa-coach-review-context');
        delete mounted.section.dataset.caissaReviewContext;
        delete mounted.section.dataset.coachReviewPhase;
        if (mounted.previousAriaLabel === null) mounted.section.removeAttribute('aria-label');
        else mounted.section.setAttribute('aria-label', mounted.previousAriaLabel);
        root.document.body?.classList?.remove('caissa-coach-review-summary-active');
        mounted = null;
        return result(true, 'accepted', 'COACH_REVIEW_SUMMARY_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            mounted: !!mounted,
            contextId: mounted?.context?.contextId || null,
            sourceMode: mounted?.context?.sourceMode || null,
            phase: mounted?.section?.dataset?.coachReviewPhase || null,
            analysisStartRequests: mounted?.analysisStartRequests || 0,
            renderedRows: mounted?.model?.rows?.map(row => row.label) || [],
            activePlyOwner: 'AnalyzeSection.currentMoveIndex'
        });
    }

    root.CaissaCoachReviewPresentation = freeze({
        schemaVersion: SCHEMA_VERSION, classifications: CLASSIFICATIONS, qualityOrder: QUALITY_ORDER,
        createSummaryModel, mount, begin, unmount, getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
