(function installBotsAnalysisSummaryPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const QUALITY_ORDER = Object.freeze(['Book', 'Best', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const CLASSIFICATIONS = Object.freeze(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const QUALITY_ICONS = Object.freeze({ Book: 'fa-book-open', Best: 'fa-star', Acceptable: 'fa-check',
        Inaccuracy: 'fa-question', Mistake: 'fa-exclamation', Blunder: 'fa-bolt' });
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    const element = (tag, className, attributes = {}) => {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    };

    function sideReview(results) {
        const counts = Object.fromEntries(CLASSIFICATIONS.map(quality => [quality, 0])); let best = 0;
        results.forEach(item => {
            if (CLASSIFICATIONS.includes(item.quality)) counts[item.quality] += 1;
            if (item.isBestMove === true) best += 1;
        });
        const accuracy = root.CaissaAnalyzeReviewPolicy?.accuracy?.(results);
        return freeze({ accuracy: accuracy?.ok ? accuracy.value : null, counts: freeze(counts), best });
    }

    function createModel(input = {}) {
        const analyze = input.analyze; const handoff = input.handoff; const phase = analyze?.analysisPhase || 'idle';
        if (!analyze || root.CaissaBotsReviewContext?.isBotsReview?.(input.context) !== true || !handoff?.payload)
            return result(false, 'rejected', 'INVALID_BOTS_REVIEW_EVIDENCE');
        const progress = analyze.totalPositions > 0
            ? Math.max(0, Math.min(100, Math.round((analyze.analyzedPositions / analyze.totalPositions) * 100))) : 0;
        if (phase !== 'complete') return result(true, 'accepted', 'BOTS_REVIEW_PENDING', freeze({
            phase: phase === 'failed' || phase === 'cancelled' ? 'unavailable' : 'loading', progress,
            progressText: analyze.totalPositions > 0
                ? `Reviewing move ${Math.min(analyze.analyzedPositions + 1, analyze.totalPositions)} of ${analyze.totalPositions}`
                : 'Preparing your review'
        }));
        const analyzed = Array.isArray(analyze.analysisResults)
            ? analyze.analysisResults.filter(item => item && !item.unavailable) : [];
        if (!analyzed.length) return result(true, 'accepted', 'BOTS_REVIEW_PENDING',
            freeze({ phase: 'unavailable', progress: 100 }));
        const white = sideReview(analyzed.filter(item => item.moveIndex % 2 === 0));
        const black = sideReview(analyzed.filter(item => item.moveIndex % 2 === 1));
        const playerColor = handoff.payload.playerColor === 'black' ? 'black' : 'white';
        const player = playerColor === 'white' ? white : black;
        const bot = playerColor === 'white' ? black : white;
        const playerLabel = playerColor === 'white' ? handoff.payload.whiteLabel : handoff.payload.blackLabel;
        const botLabel = playerColor === 'white' ? handoff.payload.blackLabel : handoff.payload.whiteLabel;
        const rows = QUALITY_ORDER.map(label => freeze({ label,
            player: label === 'Best' ? player.best : player.counts[label],
            bot: label === 'Best' ? bot.best : bot.counts[label]
        })).filter(row => row.player + row.bot > 0);
        return result(true, 'accepted', 'BOTS_REVIEW_SUMMARY_READY', freeze({
            phase: 'summary', playerLabel: String(playerLabel || 'You').slice(0, 48),
            botLabel: String(input.identity?.name || botLabel || 'Bot').replace(/\s+Bot$/i, '').slice(0, 48),
            botAvatarSrc: input.identity?.avatarSrc || '', playerAccuracy: player.accuracy,
            botAccuracy: bot.accuracy, rows: freeze(rows)
        }));
    }

    function createStructure() {
        const head = element('div', 'caissa-bots-analysis-summary__head', { 'data-bots-analysis-head': '' });
        const caissa = element('img', 'caissa-bots-analysis-summary__caissa', {
            src: '/assets/play/caissa-coach-goddess.png', alt: 'Caissa, goddess of chess', width: '512', height: '512'
        });
        const speech = element('div', 'caissa-bots-analysis-summary__speech');
        speech.textContent = "Let's review the key moments from this game."; head.append(caissa, speech);

        const body = element('section', 'caissa-bots-analysis-summary', {
            'data-bots-analysis-summary': '', 'data-bots-phase-content': 'analysis-summary',
            'aria-label': 'Bot game analysis summary'
        });
        const loading = element('div', 'caissa-bots-analysis-summary__loading', { role: 'status', 'aria-live': 'polite' });
        const progress = element('div', 'caissa-bots-analysis-summary__progress', {
            role: 'progressbar', 'aria-label': 'Game analysis progress', 'aria-valuemin': '0', 'aria-valuemax': '100'
        });
        const progressFill = element('span', 'caissa-bots-analysis-summary__progress-fill');
        const progressText = element('span', 'caissa-bots-analysis-summary__progress-text');
        progress.append(progressFill); loading.append(progress, progressText);
        const comparison = element('div', 'caissa-bots-analysis-summary__comparison');
        const profiles = element('div', 'caissa-bots-analysis-summary__profiles');
        const playerProfile = element('div', 'caissa-bots-analysis-summary__profile');
        const playerAvatar = element('span', 'caissa-bots-analysis-summary__player-avatar', { role: 'img', 'aria-label': 'Player avatar' });
        const playerRole = element('strong', 'caissa-bots-analysis-summary__role'); playerRole.textContent = 'Player';
        const playerName = element('span', 'caissa-bots-analysis-summary__name');
        playerProfile.append(playerAvatar, playerRole, playerName);
        const botProfile = element('div', 'caissa-bots-analysis-summary__profile');
        const botAvatar = element('span', 'caissa-bots-analysis-summary__bot-avatar', { role: 'img', 'aria-label': 'Selected bot avatar' });
        const botRole = element('strong', 'caissa-bots-analysis-summary__role'); botRole.textContent = 'Bot';
        const botName = element('span', 'caissa-bots-analysis-summary__name');
        botProfile.append(botAvatar, botRole, botName); profiles.append(playerProfile, botProfile);
        const accuracy = element('div', 'caissa-bots-analysis-summary__accuracy');
        const accuracyLabel = element('span', 'caissa-bots-analysis-summary__accuracy-label'); accuracyLabel.textContent = 'Accuracy';
        const playerAccuracy = element('strong', 'caissa-bots-analysis-summary__accuracy-value');
        const botAccuracy = element('strong', 'caissa-bots-analysis-summary__accuracy-value');
        accuracy.append(accuracyLabel, playerAccuracy, botAccuracy);
        const table = element('div', 'caissa-bots-analysis-summary__table', {
            role: 'table', 'aria-label': 'Player and Bot move classifications'
        });
        comparison.append(profiles, accuracy, table); body.append(loading, comparison);

        const foot = element('div', 'caissa-bots-analysis-summary__foot', {
            'data-bots-foot-content': 'analysis-summary', role: 'group', 'aria-label': 'Analysis summary actions'
        });
        const newGame = element('button', 'caissa-bots-analysis-summary__new-game', { type: 'button' });
        newGame.textContent = 'New Game';
        const review = element('button', 'caissa-bots-analysis-summary__review', { type: 'button', disabled: '' });
        review.textContent = 'Review Game';
        const live = element('span', 'sr-only', { 'aria-live': 'polite' }); foot.append(newGame, review, live);
        return { head, body, foot, loading, progress, progressFill, progressText, comparison, playerAvatar,
            playerName, botAvatar, botName, playerAccuracy, botAccuracy, table, newGame, review, live };
    }

    function displayAccuracy(value) { return value === null ? '\u2014' : `${value}%`; }

    function render(model) {
        if (!mounted) return;
        const ui = mounted.ui; mounted.model = model;
        ui.loading.hidden = model.phase === 'summary'; ui.comparison.hidden = model.phase !== 'summary';
        ui.review.disabled = model.phase !== 'summary';
        if (model.phase === 'loading') {
            ui.progress.hidden = false; ui.progressFill.style.width = `${model.progress}%`;
            ui.progress.setAttribute('aria-valuenow', String(model.progress)); ui.progressText.textContent = model.progressText; return;
        }
        if (model.phase === 'unavailable') {
            ui.progress.hidden = true; ui.progressText.textContent = 'Analysis is unavailable. Your completed game is preserved.'; return;
        }
        ui.playerName.textContent = model.playerLabel; ui.playerAvatar.textContent = model.playerLabel.slice(0, 1).toUpperCase() || 'P';
        ui.botName.textContent = model.botLabel; ui.botAvatar.replaceChildren();
        if (model.botAvatarSrc) {
            const image = element('img', '', { src: model.botAvatarSrc, alt: '' }); ui.botAvatar.append(image);
        }
        ui.playerAccuracy.textContent = displayAccuracy(model.playerAccuracy);
        ui.botAccuracy.textContent = displayAccuracy(model.botAccuracy);
        ui.table.replaceChildren();
        model.rows.forEach(row => {
            const line = element('div', 'caissa-bots-analysis-summary__row', { role: 'row', 'data-quality': row.label });
            const label = element('span', 'caissa-bots-analysis-summary__quality', { role: 'rowheader' }); label.textContent = row.label;
            const player = element('strong', 'caissa-bots-analysis-summary__count', { role: 'cell', 'data-side': 'player' });
            const icon = element('span', 'caissa-bots-analysis-summary__quality-icon', { 'aria-hidden': 'true' });
            icon.append(element('i', `fas ${QUALITY_ICONS[row.label] || 'fa-circle'}`));
            const bot = element('strong', 'caissa-bots-analysis-summary__count', { role: 'cell', 'data-side': 'bot' });
            player.textContent = String(row.player); bot.textContent = String(row.bot); line.append(label, player, icon, bot);
            ui.table.append(line);
        });
    }

    function update() {
        if (!mounted?.analyze) return;
        const modeled = createModel({ analyze: mounted.analyze, handoff: mounted.handoff,
            context: mounted.context, identity: mounted.identity });
        if (!modeled.ok) return;
        const fingerprint = `${modeled.value.phase}:${modeled.value.progress || 0}:${mounted.analyze.analysisResults?.length || 0}`;
        if (fingerprint === mounted.fingerprint) return;
        mounted.fingerprint = fingerprint; render(modeled.value);
        if (modeled.value.phase !== 'loading' && mounted.timer) { root.clearInterval(mounted.timer); mounted.timer = null; }
    }

    function mount(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        if (root.CaissaBotsReviewContext?.isBotsReview?.(options.context) !== true || !options.handoff?.payload
            || !root.CaissaBotsPanelInstance?.present) return result(false, 'rejected', 'INVALID_BOTS_REVIEW_CONTEXT');
        const ui = createStructure(); const identity = root.CaissaBotsPanelInstance.getSelectedReviewIdentity?.() || null;
        const shown = root.CaissaBotsPanelInstance.present({ phase: 'analysis-summary', head: ui.head, content: ui.body, foot: ui.foot });
        if (!shown?.ok) return result(false, 'rejected', 'BOTS_SHELL_UNAVAILABLE');
        mounted = { context: options.context, handoff: options.handoff, identity, ui, analyze: null,
            model: null, timer: null, fingerprint: null, analysisStartRequests: 0, reviewRequests: 0 };
        root.document.body.classList.add('caissa-bots-analysis-summary-active');
        ui.newGame.addEventListener('click', () => {
            if (!mounted || ui.newGame.disabled) return; ui.newGame.disabled = true;
            root.CaissaPlayV2InlineAnalyze?.close?.();
            Promise.resolve(root.CaissaPostGameExperienceInstance?.execute?.('new-game')).catch(() => {});
        });
        ui.review.addEventListener('click', () => {
            if (!mounted || ui.review.disabled) return;
            mounted.reviewRequests += 1;
            root.dispatchEvent(new CustomEvent('caissa:bots-guided-review-request', { detail: freeze({
                contextId: mounted.context.contextId, handoffId: mounted.handoff.handoffId,
                analysisOwner: 'AnalyzeSection'
            }) }));
            ui.live.textContent = 'Guided Review handoff is ready.';
        });
        render({ phase: 'loading', progress: 0, progressText: 'Preparing your review' });
        return result(true, 'accepted', 'BOTS_ANALYSIS_SUMMARY_MOUNTED', getSnapshot());
    }

    function begin(options = {}) {
        if (!mounted || !options.analyze?.startAnalysis) return result(false, 'rejected', 'BOTS_REVIEW_NOT_MOUNTED');
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
        mounted.ui.head.remove(); mounted.ui.body.remove(); mounted.ui.foot.remove();
        root.document.body.classList.remove('caissa-bots-analysis-summary-active');
        mounted = null; root.CaissaBotsPanelInstance?.restorePostGamePhase?.();
        return result(true, 'accepted', 'BOTS_ANALYSIS_SUMMARY_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted,
            contextId: mounted?.context?.contextId || null, phase: mounted?.model?.phase || null,
            analysisStartRequests: mounted?.analysisStartRequests || 0, reviewRequests: mounted?.reviewRequests || 0,
            renderedRows: mounted?.model?.rows?.map(row => row.label) || [], analysisOwner: 'AnalyzeSection',
            analysisResultsOwner: 'AnalyzeSection.analysisResults' });
    }

    root.CaissaBotsAnalysisSummaryPresentation = freeze({ schemaVersion: SCHEMA_VERSION, qualityOrder: QUALITY_ORDER,
        createModel, mount, begin, unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
