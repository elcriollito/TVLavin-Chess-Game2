(function installGamesAnalysisSummaryPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    const element = (tag, className, attributes = {}) => {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    };

    function createModel(input = {}) {
        if (root.CaissaGamesReviewContext?.isGamesReview?.(input.context) !== true)
            return result(false, 'rejected', 'INVALID_GAMES_REVIEW_EVIDENCE');
        return root.CaissaAnalysisSummaryProjection?.create?.({
            analyze: input.analyze, handoff: input.handoff, playerLabel: 'You', opponentLabel: 'CAISSA',
            acceptableLabel: 'Good'
        }) || result(false, 'unavailable', 'SUMMARY_PROJECTION_UNAVAILABLE');
    }

    function createStructure() {
        const body = element('section', 'caissa-games-analysis', {
            'data-games-analysis': '', 'data-games-phase-content': 'analysis-review',
            'aria-label': 'Play Game analysis'
        });
        const loading = element('div', 'caissa-games-analysis__loading', { role: 'status', 'aria-live': 'polite' });
        const spinner = element('span', 'caissa-games-analysis__spinner', { 'aria-hidden': 'true' });
        const loadingTitle = element('h2', 'caissa-games-analysis__loading-title');
        loadingTitle.textContent = 'Analyzing your game';
        const loadingDescription = element('p', 'caissa-games-analysis__loading-description');
        loadingDescription.textContent = 'Evaluating moves, accuracy and key moments.';
        const progress = element('div', 'caissa-games-analysis__progress', {
            role: 'progressbar', 'aria-label': 'Game analysis progress', 'aria-valuemin': '0', 'aria-valuemax': '100'
        });
        const progressFill = element('span', 'caissa-games-analysis__progress-fill');
        const progressText = element('strong', 'caissa-games-analysis__progress-text');
        progress.append(progressFill); loading.append(spinner, loadingTitle, loadingDescription, progress, progressText);

        const comparison = element('div', 'caissa-games-analysis__comparison');
        const profiles = element('div', 'caissa-games-analysis__profiles');
        const playerProfile = element('div', 'caissa-games-analysis__profile');
        const playerAvatar = element('span', 'caissa-games-analysis__avatar', { 'aria-hidden': 'true' });
        playerAvatar.textContent = '♟';
        const playerRole = element('strong', 'caissa-games-analysis__role'); playerRole.textContent = 'Player';
        const playerName = element('span', 'caissa-games-analysis__name');
        playerProfile.append(playerAvatar, playerRole, playerName);
        const opponentProfile = element('div', 'caissa-games-analysis__profile');
        const opponentAvatar = element('span', 'caissa-games-analysis__avatar caissa-games-analysis__avatar--caissa', { 'aria-hidden': 'true' });
        opponentAvatar.textContent = '♛';
        const opponentRole = element('strong', 'caissa-games-analysis__role'); opponentRole.textContent = 'Opponent';
        const opponentName = element('span', 'caissa-games-analysis__name');
        opponentProfile.append(opponentAvatar, opponentRole, opponentName); profiles.append(playerProfile, opponentProfile);
        const accuracy = element('div', 'caissa-games-analysis__accuracy');
        const accuracyLabel = element('span', 'caissa-games-analysis__accuracy-label'); accuracyLabel.textContent = 'Accuracy';
        const playerAccuracy = element('strong', 'caissa-games-analysis__accuracy-value', { 'data-games-player-accuracy': '' });
        const opponentAccuracy = element('strong', 'caissa-games-analysis__accuracy-value', { 'data-games-opponent-accuracy': '' });
        accuracy.append(accuracyLabel, playerAccuracy, opponentAccuracy);
        const table = element('div', 'caissa-games-analysis__table', {
            role: 'table', 'aria-label': 'Player and CAISSA move classifications', 'data-games-analysis-classifications': ''
        });
        comparison.append(profiles, accuracy, table); body.append(loading, comparison);

        const foot = element('div', 'caissa-games-analysis__foot', {
            'data-games-foot-content': 'analysis-review', role: 'group', 'aria-label': 'Analysis actions'
        });
        const newGame = element('button', 'caissa-games-analysis__new-game', { type: 'button' });
        newGame.textContent = 'New Game';
        const review = element('button', 'caissa-games-analysis__review', { type: 'button', disabled: '' });
        review.textContent = 'Review Game';
        const live = element('span', 'sr-only', { 'aria-live': 'polite' });
        foot.append(newGame, review, live);
        return { body, foot, loading, comparison, progress, progressFill, progressText, playerName, opponentName,
            playerAccuracy, opponentAccuracy, table, newGame, review, live };
    }

    const displayAccuracy = value => value === null ? '—' : `${value}%`;

    function render(model) {
        if (!mounted) return;
        const ui = mounted.ui; mounted.model = model;
        const summary = model.phase === 'summary';
        ui.loading.hidden = summary; ui.comparison.hidden = !summary; ui.review.disabled = !summary;
        root.CaissaGamesPanelInstance?.present?.({
            phase: 'analysis-review', content: ui.body, foot: ui.foot,
            message: summary
                ? { title: 'Your review is ready.', description: "Let's see what happened." }
                : { title: "I'm analyzing your game...", description: 'This will just take a moment.' }
        });
        if (model.phase === 'loading') {
            ui.progress.hidden = false; ui.progressFill.style.width = `${model.progress}%`;
            ui.progress.setAttribute('aria-valuenow', String(model.progress)); ui.progressText.textContent = model.progressText;
            return;
        }
        if (model.phase === 'unavailable') {
            ui.progress.hidden = true; ui.progressText.textContent = 'Analysis is unavailable. Your completed game is preserved.';
            return;
        }
        ui.playerName.textContent = model.playerLabel; ui.opponentName.textContent = model.opponentLabel;
        ui.playerAccuracy.textContent = displayAccuracy(model.playerAccuracy);
        ui.opponentAccuracy.textContent = displayAccuracy(model.opponentAccuracy);
        ui.table.replaceChildren();
        model.rows.forEach(row => {
            const line = element('div', 'caissa-games-analysis__row', { role: 'row', 'data-quality': row.quality });
            const player = element('strong', 'caissa-games-analysis__count', { role: 'cell', 'data-side': 'player' });
            const quality = element('span', 'caissa-games-analysis__quality', { role: 'rowheader' });
            const icon = element('span', 'caissa-games-analysis__quality-icon', {
                'aria-hidden': 'true', 'data-classification-symbol': ''
            });
            const opponent = element('strong', 'caissa-games-analysis__count', { role: 'cell', 'data-side': 'opponent' });
            player.textContent = String(row.player); quality.textContent = row.label;
            icon.textContent = root.CaissaAnalyzeReviewPolicy?.presentationSymbol?.(row.quality) || '';
            opponent.textContent = String(row.opponent); line.append(player, quality, icon, opponent); ui.table.append(line);
        });
    }

    function update() {
        if (!mounted?.analyze) return;
        const modeled = createModel({ analyze: mounted.analyze, handoff: mounted.handoff, context: mounted.context });
        if (!modeled.ok) return;
        const fingerprint = `${modeled.value.phase}:${modeled.value.progress || 0}:${mounted.analyze.analysisResults?.length || 0}`;
        if (fingerprint !== mounted.fingerprint) { mounted.fingerprint = fingerprint; render(modeled.value); }
        if (modeled.value.phase !== 'loading' && mounted.timer) { root.clearInterval(mounted.timer); mounted.timer = null; }
    }

    function mount(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        if (root.CaissaGamesReviewContext?.isGamesReview?.(options.context) !== true || !options.handoff?.payload
            || !root.CaissaGamesPanelInstance?.present) return result(false, 'rejected', 'INVALID_GAMES_REVIEW_CONTEXT');
        const ui = createStructure();
        mounted = { context: options.context, handoff: options.handoff, ui, analyze: null, model: null,
            timer: null, fingerprint: null, analysisStartRequests: 0, reviewRequests: 0 };
        root.document.body.classList.add('caissa-games-analysis-active');
        ui.newGame.addEventListener('click', () => {
            if (!mounted || ui.newGame.disabled) return; ui.newGame.disabled = true;
            root.CaissaPlayV2InlineAnalyze?.close?.();
            Promise.resolve(root.CaissaPostGameExperienceInstance?.execute?.('new-game')).catch(() => {});
        });
        ui.review.addEventListener('click', () => {
            if (!mounted || ui.review.disabled) return;
            mounted.reviewRequests += 1;
            root.dispatchEvent(new CustomEvent('caissa:games-guided-review-request', { detail: freeze({
                contextId: mounted.context.contextId, handoffId: mounted.handoff.handoffId,
                analysisOwner: 'AnalyzeSection'
            }) }));
            ui.live.textContent = 'Guided Review handoff is ready.';
        });
        render({ phase: 'loading', progress: 0, progressText: 'Preparing your review' });
        return result(true, 'accepted', 'GAMES_ANALYSIS_MOUNTED', getSnapshot());
    }

    function begin(options = {}) {
        if (!mounted || !options.analyze?.startAnalysis) return result(false, 'rejected', 'GAMES_REVIEW_NOT_MOUNTED');
        if (mounted.analysisStartRequests > 0) return result(true, 'unchanged', 'ANALYSIS_ALREADY_REQUESTED', getSnapshot());
        mounted.analyze = options.analyze; mounted.analysisStartRequests += 1; update();
        mounted.timer = root.setInterval(update, 100);
        root.setTimeout(() => {
            if (!mounted || mounted.analyze !== options.analyze) return;
            if (!['preparing', 'analyzing', 'complete'].includes(options.analyze.analysisPhase))
                Promise.resolve(options.analyze.startAnalysis()).catch(() => update());
        }, 0);
        return result(true, 'accepted', 'ANALYSIS_START_REQUESTED', getSnapshot());
    }

    function unmount() {
        if (!mounted) return result(true, 'unchanged', 'ALREADY_UNMOUNTED');
        if (mounted.timer) root.clearInterval(mounted.timer);
        mounted.ui.body.remove(); mounted.ui.foot.remove();
        root.document.body.classList.remove('caissa-games-analysis-active'); mounted = null;
        return result(true, 'accepted', 'GAMES_ANALYSIS_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted,
            contextId: mounted?.context?.contextId || null, phase: mounted?.model?.phase || null,
            analysisStartRequests: mounted?.analysisStartRequests || 0, reviewRequests: mounted?.reviewRequests || 0,
            renderedRows: mounted?.model?.rows?.map(row => row.quality) || [], analysisOwner: 'AnalyzeSection',
            analysisResultsOwner: 'AnalyzeSection.analysisResults', completedPgnOwner: 'AnalyzeSection.loadedGame.pgn',
            moveHistoryOwner: 'AnalyzeSection.getLoadedMoves'
        });
    }

    root.CaissaGamesAnalysisSummaryPresentation = freeze({
        schemaVersion: SCHEMA_VERSION, createModel, mount, begin, unmount, getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
