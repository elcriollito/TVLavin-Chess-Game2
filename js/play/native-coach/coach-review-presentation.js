(function installCoachReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.14.0';
    const QUALITY_ORDER = Object.freeze(['Book', 'Best', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const CLASSIFICATIONS = Object.freeze(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const REVIEW_WORTHY_CLASSIFICATIONS = Object.freeze(['Inaccuracy', 'Mistake', 'Blunder']);
    const FALLBACK_QUALITY_SYMBOLS = Object.freeze({ Book: '📖', Best: '★', Precise: '!', Good: '✓',
        Acceptable: '✓', Inaccuracy: '?!', Mistake: '?', Blunder: '??' });
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function element(tag, className, attributes = {}) {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    }

    function canonicalQualitySymbol(quality) {
        const key = quality === 'Acceptable' ? 'good' : String(quality || '').toLowerCase();
        return root.CaissaCoachMoveReview?.annotations?.[key]?.symbol || FALLBACK_QUALITY_SYMBOLS[quality] || '';
    }

    function sideReview(results) {
        const counts = Object.fromEntries(CLASSIFICATIONS.map(quality => [quality, 0])); let best = 0;
        results.forEach(item => { if (CLASSIFICATIONS.includes(item.quality)) counts[item.quality] += 1;
            if (item.isBestMove === true) best += 1; });
        const accuracy = root.CaissaAnalyzeReviewPolicy?.accuracy?.(results);
        return freeze({ accuracy: accuracy?.ok ? accuracy.value : null, counts: freeze(counts), best });
    }

    function reviewMessage(player) {
        const corrections = player.counts.Inaccuracy + player.counts.Mistake + player.counts.Blunder;
        if (player.counts.Blunder > 0 || player.counts.Mistake > 0)
            return "A few decisions shifted the game. Let's review the moments with the biggest impact.";
        if (corrections > 0) return 'You played a steady game with a few decisions worth revisiting.';
        return "You played a consistent game. Let's review the decisions that shaped the result.";
    }

    function createSummaryModel(input = {}) {
        const analyze = input.analyze; const handoff = input.handoff; const phase = analyze?.analysisPhase || 'idle';
        if (!analyze || root.CaissaCoachReviewContext?.isCoachReview?.(input.context) !== true || !handoff?.payload)
            return result(false, 'rejected', 'INVALID_COACH_REVIEW_EVIDENCE');
        const progress = analyze.totalPositions > 0
            ? Math.max(0, Math.min(100, Math.round((analyze.analyzedPositions / analyze.totalPositions) * 100))) : 0;
        if (phase !== 'complete') return result(true, 'accepted', 'COACH_REVIEW_PENDING', freeze({
            phase: phase === 'failed' || phase === 'cancelled' ? 'unavailable' : 'loading', progress,
            progressText: analyze.totalPositions > 0
                ? `Reviewing move ${Math.min(analyze.analyzedPositions + 1, analyze.totalPositions)} of ${analyze.totalPositions}`
                : 'Preparing your review' }));
        const analyzed = Array.isArray(analyze.analysisResults)
            ? analyze.analysisResults.filter(item => item && !item.unavailable) : [];
        if (!analyzed.length) return result(true, 'accepted', 'COACH_REVIEW_PENDING',
            freeze({ phase: 'unavailable', progress: 100 }));
        const white = sideReview(analyzed.filter(item => item.moveIndex % 2 === 0));
        const black = sideReview(analyzed.filter(item => item.moveIndex % 2 === 1));
        const playerColor = handoff.payload.playerColor === 'black' ? 'black' : 'white';
        const player = playerColor === 'white' ? white : black; const coach = playerColor === 'white' ? black : white;
        const playerLabel = playerColor === 'white' ? handoff.payload.whiteLabel : handoff.payload.blackLabel;
        const rows = QUALITY_ORDER.map(label => ({ label,
            player: label === 'Best' ? player.best : player.counts[label],
            coach: label === 'Best' ? coach.best : coach.counts[label] }))
            .filter(row => row.player + row.coach > 0).map(freeze);
        return result(true, 'accepted', 'COACH_REVIEW_SUMMARY_READY', freeze({ phase: 'summary',
            playerLabel: String(playerLabel || 'You').slice(0, 48), coachLabel: 'CAISSA',
            playerAccuracy: player.accuracy, coachAccuracy: coach.accuracy,
            rows: freeze(rows), message: reviewMessage(player) }));
    }

    function formatEvaluation(item) {
        if (Number.isFinite(item?.mateAfter)) return item.mateAfter > 0 ? `M+${item.mateAfter}` : `M${item.mateAfter}`;
        if (!Number.isFinite(item?.evalAfter)) return '\u2014';
        return `${item.evalAfter >= 0 ? '+' : ''}${item.evalAfter.toFixed(2)}`;
    }

    function findReviewMoments(analyze) {
        const results = Array.isArray(analyze?.analysisResults) ? analyze.analysisResults : [];
        return freeze(results.map((item, position) => ({ item, position }))
            .filter(({ item, position }) => item && item.unavailable !== true
                && REVIEW_WORTHY_CLASSIFICATIONS.includes(item.quality))
            .map(({ item, position }) => Number.isInteger(item.moveIndex) ? item.moveIndex : position)
            .sort((left, right) => left - right));
    }

    function findNextReviewMoment(analyze) {
        const current = Number.isInteger(analyze?.currentMoveIndex) ? analyze.currentMoveIndex : -1;
        return findReviewMoments(analyze).find(position => position > current) ?? null;
    }

    function isReviewComplete(analyze) {
        return findNextReviewMoment(analyze) === null;
    }

    function createGuidedModel(analyze, expanded = false, handoff = null) {
        const index = analyze?.currentMoveIndex; const move = analyze?.getLoadedMoves?.()[index] || '';
        const item = analyze?.analysisResults?.[index] || null;
        if (!Number.isInteger(index) || index < 0 || !move || !item) return freeze({ index: -1, quality: 'Review',
            move: 'Starting position', annotation: '', evaluation: '\u2014',
            message: 'Choose a move from the notation to review its existing analysis evidence.', detail: '' });
        if (item.unavailable) return freeze({ index, quality: 'Analysis unavailable', move, annotation: '',
            evaluation: '\u2014', message: 'CAISSA does not have complete analysis evidence for this move.',
            detail: 'Select another move to continue the review.' });
        const quality = item.isBestMove === true ? 'Best' : (item.quality || 'Acceptable');
        const playerParity = handoff?.payload?.playerColor === 'black' ? 1 : 0;
        const belongsToPlayer = index % 2 === playerParity;
        let message;
        if (quality === 'Book' && item.bookEvidence?.name) message = `${move} is recognized in ${item.bookEvidence.name}.`;
        else if (quality === 'Book') message = `${move} is backed by CAISSA's opening evidence.`;
        else if (quality === 'Best') message = `${move} matched the engine's leading continuation.`;
        else if (!belongsToPlayer && REVIEW_WORTHY_CLASSIFICATIONS.includes(quality) && item.recommendationAvailable && item.bestMoveSan)
            message = `Your opponent played ${move}, classified as ${quality.toLowerCase()}. ${item.bestMoveSan} was the stronger continuation available to them.`;
        else if (!belongsToPlayer && REVIEW_WORTHY_CLASSIFICATIONS.includes(quality))
            message = `Your opponent played ${move} and crossed CAISSA's ${quality.toLowerCase()} threshold. This gave you an opportunity.`;
        else if (REVIEW_WORTHY_CLASSIFICATIONS.includes(quality) && item.recommendationAvailable && item.bestMoveSan)
            message = `You played ${move}. ${item.bestMoveSan} was the stronger continuation in the analysis.`;
        else if (REVIEW_WORTHY_CLASSIFICATIONS.includes(quality))
            message = `You played ${move}, which crossed CAISSA's ${quality.toLowerCase()} evaluation threshold.`;
        else message = `${move} stayed within CAISSA's acceptable evaluation range.`;
        let detail = '';
        if (quality === 'Book') detail = item.bookEvidence?.name
            ? `The repository opening lookup identified this move in ${item.bookEvidence.name}.`
            : 'The repository opening lookup supplied the evidence for this classification.';
        else if (Number.isFinite(item.evalBefore) && Number.isFinite(item.evalAfter)) {
            const before = `${item.evalBefore >= 0 ? '+' : ''}${item.evalBefore.toFixed(2)}`;
            const after = `${item.evalAfter >= 0 ? '+' : ''}${item.evalAfter.toFixed(2)}`;
            const loss = Number.isFinite(item.loss) ? ` The measured loss was ${item.loss.toFixed(2)} pawns.` : '';
            detail = `The engine evaluation changed from ${before} before the move to ${after} after it.${loss}`;
        } else detail = 'No additional comparable evaluation sample is available for this move.';
        return freeze({ index, quality, move, annotation: canonicalQualitySymbol(quality), evaluation: formatEvaluation(item),
            message, detail: expanded ? detail : '' });
    }

    function createSummaryStructure() {
        const panel = element('section', 'caissa-coach-review-summary', { 'data-caissa-coach-review-shell': '',
            'data-caissa-coach-review-summary': '', 'aria-label': 'Game review statistics' });
        const loading = element('div', 'caissa-coach-review-summary__loading', {
            'data-coach-review-loading': '', role: 'status', 'aria-live': 'polite' });
        const progressTrack = element('div', 'caissa-coach-review-summary__progress', { role: 'progressbar',
            'aria-label': 'Game review progress', 'aria-valuemin': '0', 'aria-valuemax': '100' });
        const progressFill = element('span', 'caissa-coach-review-summary__progress-fill');
        const progressText = element('span', 'caissa-coach-review-summary__progress-text');
        progressTrack.append(progressFill); loading.append(progressTrack, progressText);
        const comparison = element('div', 'caissa-coach-review-summary__comparison', { 'data-coach-review-comparison': '' });
        const profiles = element('div', 'caissa-coach-review-summary__profiles');
        const playerProfile = element('div', 'caissa-coach-review-summary__profile');
        const playerAvatar = element('span', 'caissa-coach-review-summary__player-avatar', { role: 'img', 'aria-label': 'Player avatar' });
        playerAvatar.textContent = 'P'; const playerRole = element('strong', 'caissa-coach-review-summary__role');
        playerRole.textContent = 'Player'; const playerName = element('span', 'caissa-coach-review-summary__name',
            { 'data-coach-review-player-name': '' }); playerProfile.append(playerAvatar, playerRole, playerName);
        const coachProfile = element('div', 'caissa-coach-review-summary__profile');
        const coachAvatar = element('span', 'caissa-coach-review-summary__profile-avatar', { role: 'img', 'aria-label': 'Caissa Coach avatar' });
        coachAvatar.textContent = '\u265b'; const coachRole = element('strong', 'caissa-coach-review-summary__role');
        coachRole.textContent = 'Coach'; const coachName = element('span', 'caissa-coach-review-summary__name',
            { 'data-coach-review-coach-name': '' }); coachProfile.append(coachAvatar, coachRole, coachName);
        profiles.append(playerProfile, coachProfile);
        const accuracy = element('div', 'caissa-coach-review-summary__accuracy');
        const accuracyLabel = element('span', 'caissa-coach-review-summary__accuracy-label'); accuracyLabel.textContent = 'Accuracy';
        const playerAccuracy = element('strong', 'caissa-coach-review-summary__accuracy-value', {
            'data-coach-review-player-accuracy': '', 'data-side': 'player' });
        const coachAccuracy = element('strong', 'caissa-coach-review-summary__accuracy-value', {
            'data-coach-review-coach-accuracy': '', 'data-side': 'coach' });
        accuracy.append(playerAccuracy, accuracyLabel, coachAccuracy);
        const table = element('div', 'caissa-coach-review-summary__table', { role: 'table',
            'aria-label': 'Player and Coach move classifications', 'data-coach-review-classifications': '' });
        comparison.append(profiles, accuracy, table); panel.append(loading, comparison);
        const newGame = element('button', 'caissa-coach-review-summary__new-game', { type: 'button',
            'data-coach-review-new-game': '' });
        newGame.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i><span>New Game</span>';
        const action = element('button', 'caissa-coach-review-summary__action', { type: 'button',
            'data-coach-review-guided-action': '' }); action.textContent = 'Review Game';
        const foot = element('div', 'caissa-native-coach-panel__foot-content caissa-native-coach-panel__foot-content--review',
            { 'data-caissa-coach-review-foot': '' }); foot.append(newGame, action);
        return { panel, loading, progressTrack, progressFill, progressText, comparison, playerAvatar,
            playerName, coachName, playerAccuracy, coachAccuracy, table, newGame, action, foot };
    }

    function createGuidedStructure() {
        const content = element('section', 'caissa-coach-guided', { 'data-caissa-coach-guided-review': '',
            'aria-label': 'Guided game review' });
        const guided = element('div', 'caissa-coach-guided__review', { 'data-coach-guided-view': '' });
        const actions = element('div', 'caissa-coach-guided__top-actions', { role: 'group', 'aria-label': 'Guided review actions' });
        const explain = element('button', 'caissa-coach-guided__secondary', { type: 'button',
            'data-coach-guided-explain': '', 'aria-expanded': 'false' });
        explain.innerHTML = '<i class="fas fa-lightbulb" aria-hidden="true"></i><span>Explain</span>';
        const next = element('button', 'caissa-coach-guided__next', { type: 'button', 'data-coach-guided-next': '',
            'aria-label': 'Next review-worthy moment' });
        next.innerHTML = '<span>Next Moment</span><i class="fas fa-arrow-right" aria-hidden="true"></i>'; actions.append(explain, next);
        const detail = element('p', 'caissa-coach-guided__detail', { 'data-coach-guided-detail': '', 'aria-live': 'polite' });
        detail.hidden = true;
        const notation = element('div', 'caissa-coach-guided__notation', { 'data-coach-guided-notation': '',
            'aria-label': 'Classified game notation' }); guided.append(actions, detail, notation);
        const exploration = element('div', 'caissa-coach-exploration', { 'data-coach-analysis-exploration': '',
            'aria-label': 'Position analysis exploration' }); exploration.hidden = true;
        const sourceWorkspace = element('section', 'caissa-coach-exploration__source', {
            'data-coach-source-game': '', 'aria-labelledby': 'caissaExplorationSourceTitle'
        });
        const sourceTitle = element('h2', 'caissa-coach-exploration__variation-title', {
            id: 'caissaExplorationSourceTitle'
        });
        sourceTitle.textContent = 'GAME MOVES (STUDY)';
        const sourceNotation = element('div', 'caissa-coach-guided__notation caissa-coach-exploration__source-notation', {
            'data-coach-source-notation': '', 'aria-label': 'Completed game study notation'
        });
        sourceWorkspace.append(sourceTitle, sourceNotation);
        const variationWorkspace = element('section', 'caissa-coach-exploration__workspace', {
            'data-coach-exploration-workspace': '', 'aria-labelledby': 'caissaExplorationVariationTitle'
        });
        variationWorkspace.hidden = true;
        const variationTitle = element('h2', 'caissa-coach-exploration__variation-title', {
            id: 'caissaExplorationVariationTitle'
        });
        variationTitle.textContent = 'ANALYSIS VARIATION';
        const variation = element('div', 'caissa-coach-exploration__notation', {
            'data-coach-exploration-notation': '', 'aria-label': 'Analysis variation notation', 'aria-live': 'polite'
        });
        variationWorkspace.append(variationTitle, variation);
        exploration.append(sourceWorkspace, variationWorkspace); content.append(guided, exploration);
        const foot = element('div', 'caissa-native-coach-panel__foot-content caissa-coach-guided__foot',
            { 'data-caissa-coach-guided-foot': '' });
        const reviewTools = element('div', 'caissa-coach-guided__review-tools', { 'data-coach-guided-foot-review': '' });
        const navigation = element('div', 'caissa-coach-guided__navigation-host', { 'data-coach-guided-navigation': '' });
        const secondaryActions = element('div', 'caissa-coach-guided__foot-actions', {
            role: 'group', 'aria-label': 'Guided review secondary actions'
        });
        const analysis = element('button', 'caissa-coach-guided__analysis', { type: 'button', 'data-coach-guided-analysis': '' });
        analysis.innerHTML = '<span>Analysis</span><i class="fas fa-search" aria-hidden="true"></i>';
        const newGame = element('button', 'caissa-coach-guided__new-game', { type: 'button',
            'data-coach-guided-new-game': '' });
        newGame.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i><span>New Game</span>';
        secondaryActions.append(newGame, analysis); reviewTools.append(navigation, secondaryActions);
        const explorationTools = element('div', 'caissa-coach-guided__exploration-tools', { 'data-coach-exploration-foot': '' });
        explorationTools.hidden = true;
        const explorationNavigation = element('div', 'caissa-coach-exploration__navigation', {
            role: 'group', 'aria-label': 'Analysis move navigation'
        });
        const explorationNavButtons = {};
        const navigationActions = [
            ['first', 'First analysis position', 'fa-step-backward'],
            ['previous', 'Previous analysis move', 'fa-chevron-left'],
            ['next', 'Next analysis move', 'fa-chevron-right'],
            ['last', 'Last analysis position', 'fa-step-forward']
        ];
        navigationActions.forEach(([action, label, icon]) => {
            const button = element('button', 'caissa-coach-exploration__nav-button', { type: 'button',
                'data-coach-exploration-nav': action, 'aria-label': label, title: label });
            button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
            explorationNavButtons[action] = button; explorationNavigation.append(button);
        });
        const explorationActions = element('div', 'caissa-coach-exploration__actions');
        const back = element('button', 'caissa-coach-guided__back-review', { type: 'button', 'data-coach-exploration-back': '' });
        back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i><span>Back to Review</span>';
        const engine = element('button', 'caissa-coach-guided__engine', { type: 'button',
            'data-coach-exploration-engine': '', 'aria-pressed': 'false', 'aria-label': 'Engine Off' });
        engine.innerHTML = '<span class="caissa-coach-guided__engine-led" aria-hidden="true"></span>'
            + '<span data-coach-exploration-engine-label>Engine Off</span>';
        explorationActions.append(back, engine); explorationTools.append(explorationNavigation, explorationActions);
        foot.append(reviewTools, explorationTools);
        const settingsDialog = element('dialog', 'caissa-coach-review-settings', {
            'data-coach-review-settings-dialog': '', 'aria-labelledby': 'caissaCoachReviewSettingsTitle'
        });
        const settingsHeader = element('header', 'caissa-coach-review-settings__header');
        const settingsTitle = element('h2', 'caissa-coach-review-settings__title', { id: 'caissaCoachReviewSettingsTitle' });
        settingsTitle.textContent = 'Review Settings';
        const settingsClose = element('button', 'caissa-coach-review-settings__close', { type: 'button',
            'data-coach-review-settings-close': '', 'aria-label': 'Close review settings' });
        settingsClose.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        settingsHeader.append(settingsTitle, settingsClose);
        const gameSection = element('section', 'caissa-coach-review-settings__section', { 'aria-labelledby': 'caissaReviewGameSettings' });
        const gameTitle = element('h3', 'caissa-coach-review-settings__section-title', { id: 'caissaReviewGameSettings' });
        gameTitle.textContent = 'Game';
        const savePgn = element('button', 'caissa-coach-review-settings__save', { type: 'button',
            'data-coach-review-save-pgn': '' });
        savePgn.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i><span>Save PGN</span>';
        const saveCopy = element('p', 'caissa-coach-review-settings__copy');
        saveCopy.textContent = 'Download the original completed game.';
        const saveStatus = element('p', 'caissa-coach-review-settings__status', {
            'data-coach-review-save-status': '', role: 'status', 'aria-live': 'polite'
        });
        gameSection.append(gameTitle, savePgn, saveCopy, saveStatus);
        const boardSection = element('section', 'caissa-coach-review-settings__section', { 'aria-labelledby': 'caissaReviewBoardSettings' });
        const boardTitle = element('h3', 'caissa-coach-review-settings__section-title', { id: 'caissaReviewBoardSettings' });
        boardTitle.textContent = 'Board';
        const flipHost = element('div', 'caissa-coach-review-settings__flip', { 'data-coach-review-flip-host': '' });
        const flipCopy = element('p', 'caissa-coach-review-settings__copy');
        flipCopy.textContent = 'Change the board orientation without changing the reviewed position.';
        boardSection.append(boardTitle, flipHost, flipCopy);
        settingsDialog.append(settingsHeader, gameSection, boardSection); content.append(settingsDialog);
        return { content, guided, actions, explain, next, detail, notation, exploration,
            sourceWorkspace, sourceNotation, variationWorkspace, variation,
            foot, reviewTools, navigation, secondaryActions, analysis, newGame,
            explorationTools, explorationNavigation, explorationNavButtons, back, engine,
            settingsDialog, settingsClose, savePgn, saveStatus, flipHost };
    }

    function rememberNode(node) { return node ? { node, parent: node.parentNode, next: node.nextSibling } : null; }
    function restoreRemembered(item) { if (!item?.node || !item.parent) return;
        if (item.next?.parentNode === item.parent) item.parent.insertBefore(item.node, item.next); else item.parent.append(item.node); }
    function displayCount(value) { return value > 0 ? String(value) : '\u2014'; }

    function renderCoachHead(model) {
        const speech = root.document.querySelector('[data-caissa-coach-shell] [data-coach-narration]'); if (!speech) return;
        speech.classList.add('caissa-coach-guided__speech'); speech.replaceChildren();
        if (model.eyebrow) { const eyebrow = element('span', 'caissa-coach-guided__classification');
            eyebrow.textContent = model.eyebrow; speech.append(eyebrow); }
        if (model.title) { const line = element('span', 'caissa-coach-guided__headline');
            const title = element('strong', 'caissa-coach-guided__move'); title.textContent = model.title;
            const evaluation = element('span', 'caissa-coach-guided__eval'); evaluation.textContent = model.evaluation || '\u2014';
            line.append(title, evaluation); speech.append(line); }
        const copy = element('span', 'caissa-coach-guided__message'); copy.textContent = model.message; speech.append(copy);
    }

    function syncVisibleEvaluationRail(evaluation, mate, source) {
        const rail = root.CaissaEvaluationRailInstance;
        if (!rail) return false;
        if (rail.getSnapshot?.().displayMode !== 'post-game') rail.setMode?.('post-game');
        if (Number.isFinite(mate) && mate !== 0) return rail.setMate?.(mate, { source })?.ok === true;
        if (Number.isFinite(evaluation)) return rail.setEvaluation?.(evaluation * 100, { source })?.ok === true;
        return false;
    }

    function syncReviewEvaluationRail() {
        if (!mounted?.analyze) return false;
        const index = Number.isInteger(mounted.analyze.currentMoveIndex) ? mounted.analyze.currentMoveIndex : -1;
        const selected = index >= 0 && mounted.analyze.analysisPhase === 'complete'
            ? mounted.analyze.analysisResults?.[index] : null;
        if (selected && !selected.unavailable) {
            return syncVisibleEvaluationRail(selected.evalAfter, selected.mateAfter, 'coach-review-ply');
        }
        const current = mounted.analyze.getCurrentEvaluation?.() || {};
        return syncVisibleEvaluationRail(current.evaluation, current.mate, 'coach-review-position');
    }

    function renderModel(model) {
        if (!mounted || !model) return;
        mounted.summary.panel.dataset.coachReviewPhase = model.phase;
        mounted.summary.loading.hidden = model.phase !== 'loading'; mounted.summary.comparison.hidden = model.phase !== 'summary';
        mounted.summary.action.hidden = model.phase !== 'summary';
        if (model.phase === 'loading') { root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', message: 'Reviewing your game...' });
            mounted.summary.progressFill.style.width = `${model.progress}%`;
            mounted.summary.progressTrack.setAttribute('aria-valuenow', String(model.progress));
            mounted.summary.progressText.textContent = model.progressText; return; }
        if (model.phase === 'unavailable') { mounted.summary.loading.hidden = false;
            root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', message: 'Review unavailable. Your game result is preserved.' });
            mounted.summary.progressTrack.hidden = true;
            mounted.summary.progressText.textContent = 'Return to the result and try again when ready.'; return; }
        root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', message: model.message });
        mounted.summary.playerName.textContent = model.playerLabel;
        mounted.summary.playerAvatar.textContent = model.playerLabel.slice(0, 1).toUpperCase() || 'P';
        mounted.summary.coachName.textContent = model.coachLabel;
        mounted.summary.playerAccuracy.textContent = model.playerAccuracy === null ? '\u2014' : `${model.playerAccuracy}%`;
        mounted.summary.coachAccuracy.textContent = model.coachAccuracy === null ? '\u2014' : `${model.coachAccuracy}%`;
        mounted.summary.table.replaceChildren(); model.rows.forEach(row => {
            const line = element('div', 'caissa-coach-review-summary__row', { role: 'row', 'data-quality': row.label });
            const label = element('span', 'caissa-coach-review-summary__quality', { role: 'rowheader' }); label.textContent = row.label;
            const player = element('strong', 'caissa-coach-review-summary__count', { role: 'cell', 'data-side': 'player' });
            const icon = element('span', 'caissa-coach-review-summary__quality-icon', { 'aria-hidden': 'true' });
            icon.textContent = canonicalQualitySymbol(row.label);
            const coach = element('strong', 'caissa-coach-review-summary__count', { role: 'cell', 'data-side': 'coach' });
            player.textContent = displayCount(row.player); coach.textContent = displayCount(row.coach);
            line.append(player, label, icon, coach); mounted.summary.table.append(line); });
    }

    function synchronizeCoachNotation() {
        if (!mounted?.analyze || !mounted.moveList?.node) return;
        mounted.moveList.node.querySelectorAll('[data-index]').forEach(button => {
            const index = Number(button.dataset.index);
            const item = mounted.analyze.analysisResults?.[index];
            const quality = item?.isBestMove === true ? 'Best' : item?.quality;
            const symbol = canonicalQualitySymbol(quality);
            button.querySelectorAll('.analyze-move-annotation').forEach(node => node.remove());
            if (!symbol) return;
            const annotation = element('strong', `analyze-move-annotation coach-review-symbol coach-review-symbol--${String(quality).toLowerCase()}`,
                { 'aria-hidden': 'true', 'data-coach-review-symbol': quality });
            annotation.textContent = symbol; button.append(annotation);
        });
    }

    function updateGuided() {
        if (!mounted?.analyze || mounted.phase !== 'guided-review') return;
        const model = createGuidedModel(mounted.analyze, mounted.explanationExpanded, mounted.handoff);
        mounted.guided.content.dataset.authoritativePly = String(model.index);
        mounted.guided.detail.textContent = model.detail;
        mounted.guided.detail.hidden = !mounted.explanationExpanded || !model.detail;
        mounted.guided.explain.setAttribute('aria-expanded', String(mounted.explanationExpanded));
        const complete = isReviewComplete(mounted.analyze);
        mounted.guided.next.disabled = complete;
        mounted.guided.next.querySelector('span').textContent = complete ? 'Review Complete' : 'Next Moment';
        mounted.guided.newGame.hidden = false;
        mounted.guided.reviewTools.dataset.reviewComplete = String(complete);
        renderCoachHead({ eyebrow: model.quality.toUpperCase(), title: `${model.move}${model.annotation || ''}`,
            evaluation: model.evaluation, message: model.message });
        syncReviewEvaluationRail();
        synchronizeCoachNotation();
        mounted.guided.notation.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' });
    }

    function updateCoachReviewPly() {
        if (!mounted) return;
        if (mounted.phase === 'guided-review') updateGuided();
        else if (mounted.phase === 'review-summary') syncReviewEvaluationRail();
        else if (mounted.phase === 'analysis-exploration' && !mounted.restoringExploration) {
            const projection = mounted.analyze?.getCoachReviewProjection?.();
            if (!projection?.fen) return;
            const selected = mounted.analyze.analysisResults?.[mounted.analyze.currentMoveIndex];
            mounted.explorationLastAnalysis = selected && !selected.unavailable ? {
                evaluation: selected.evalAfter, mate: selected.mateAfter, pv: []
            } : null;
            renderAnalysisSource(); syncReviewEvaluationRail();
            root.CaissaCoachReviewExploration?.rebase?.({ fen: projection.fen, move: projection.move });
            renderExplorationPosition();
        }
    }

    function enterGuidedReview() {
        if (!mounted?.analyze || mounted.model?.phase !== 'summary') return;
        const analyze = mounted.analyze; mounted.phase = 'guided-review'; mounted.explanationExpanded = false;
        mounted.summary.panel.dataset.coachReviewPhase = 'guided-review';
        mounted.moveList = rememberNode(analyze.elements?.moveList);
        mounted.navigation = rememberNode(analyze.elements?.navFirst?.closest?.('.analyze-board-navigation'));
        mounted.flipTool = rememberNode(analyze.elements?.flipBoard);
        if (mounted.moveList?.node) mounted.guided.notation.append(mounted.moveList.node);
        if (mounted.navigation?.node) mounted.guided.navigation.append(mounted.navigation.node);
        if (mounted.flipTool?.node) {
            mounted.flipTool.node.dataset.coachGuidedFlip = '';
            mounted.flipTool.node.querySelector('span').textContent = 'Flip board';
            mounted.guided.flipHost.append(mounted.flipTool.node);
        }
        root.document.body?.classList?.add('caissa-coach-guided-review-active');
        root.CaissaNativeCoachPanel?.present?.({ phase: 'guided-review', content: mounted.guided.content,
            foot: mounted.guided.foot, message: 'Reviewing the first move.' });
        analyze.jumpToMove(0); updateGuided(); mounted.guided.explain.focus?.();
    }

    function startNewGame(button) {
        if (!mounted || button?.disabled) return;
        button.disabled = true;
        if (mounted.analyze?.currentMoveIndex !== -1) mounted.analyze?.jumpToMove?.(-1);
        root.CaissaPlayV2InlineAnalyze?.close?.();
        Promise.resolve(root.CaissaPostGameExperienceInstance?.execute?.('new-game')).then(outcome => {
            if (mounted && !outcome?.ok) button.disabled = false;
        }).catch(() => { if (mounted) button.disabled = false; });
    }

    function formatExplorationEvaluation(info) {
        if (Number.isFinite(info?.mate) && info.mate !== 0) return info.mate > 0 ? `M+${info.mate}` : `M${info.mate}`;
        return Number.isFinite(info?.evaluation) ? `${info.evaluation >= 0 ? '+' : ''}${info.evaluation.toFixed(2)}` : '\u2014';
    }

    function renderAnalysisHead(info = {}) {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        if (info.status === 'ready') mounted.explorationLastAnalysis = {
            evaluation: info.evaluation, mate: info.mate, pv: [...(info.pv || [])]
        };
        const retained = mounted.explorationLastAnalysis;
        const visible = info.status === 'ready' ? info : retained;
        const line = visible?.pv?.length ? visible.pv.join(' ') : 'Evaluating this position.';
        const prefix = info.status === 'off' ? 'Engine off. ' : '';
        renderCoachHead({ eyebrow: 'ANALYSIS', title: 'Explore this position',
            evaluation: formatExplorationEvaluation(visible), message: `${prefix}Principal variation: ${line}` });
        root.document.querySelector('[data-caissa-coach-shell] .caissa-coach-guided__message')
            ?.setAttribute('data-coach-exploration-pv', '');
    }

    function renderExplorationAnalysis(info) {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        renderAnalysisHead(info);
        if (info?.status === 'ready'
            && root.CaissaCoachReviewExploration?.getSnapshot?.().temporaryPlyCount > 0)
            syncVisibleEvaluationRail(info.evaluation, info.mate, 'coach-review-exploration');
    }

    function renderAnalysisSource() {
        if (!mounted?.analyze) return;
        synchronizeCoachNotation();
        mounted.guided.sourceNotation.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' });
        renderAnalysisHead({ status: 'loading' });
    }

    function renderExplorationPosition() {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        const exploration = root.CaissaCoachReviewExploration;
        const state = exploration?.getSnapshot?.();
        const line = exploration?.getLine?.() || [];
        mounted.guided.variationWorkspace.hidden = line.length === 0;
        mounted.guided.variation.replaceChildren();
        const rows = new Map();
        line.forEach(move => {
            if (!rows.has(move.moveNumber)) rows.set(move.moveNumber, { white: null, black: null });
            rows.get(move.moveNumber)[move.color === 'b' ? 'black' : 'white'] = move;
        });
        rows.forEach((moves, moveNumber) => {
            const row = element('div', 'caissa-coach-exploration__notation-row');
            const number = element('span', 'caissa-coach-exploration__move-number'); number.textContent = `${moveNumber}.`;
            row.append(number);
            ['white', 'black'].forEach(color => {
                const move = moves[color];
                if (!move) { row.append(element('span', 'caissa-coach-exploration__move-spacer', { 'aria-hidden': 'true' })); return; }
                const button = element('button', 'caissa-coach-exploration__move', { type: 'button',
                    'data-coach-exploration-move': '', 'data-exploration-cursor': String(move.index + 1) });
                button.textContent = move.san; button.dataset.future = String(move.future);
                if (move.current) button.setAttribute('aria-current', 'move'); row.append(button);
            });
            mounted.guided.variation.append(row);
        });
        const temporary = (state?.temporaryPlyCount || 0) > 0;
        const sourceIndex = mounted.analyze.currentMoveIndex;
        const sourceLast = (mounted.analyze.getLoadedMoves?.().length || 0) - 1;
        const atFirst = temporary ? state.atFirst : sourceIndex <= -1;
        const atLast = temporary ? state.atLast : sourceIndex >= sourceLast;
        mounted.guided.explorationNavButtons.first.disabled = atFirst;
        mounted.guided.explorationNavButtons.previous.disabled = atFirst;
        mounted.guided.explorationNavButtons.next.disabled = atLast;
        mounted.guided.explorationNavButtons.last.disabled = atLast;
        mounted.guided.variation.querySelector('[aria-current="move"]')?.scrollIntoView?.({ block: 'nearest' });
    }

    function syncExplorationEngineControl() {
        if (!mounted?.guided?.engine) return;
        const enabled = root.CaissaCoachReviewExploration?.getSnapshot?.().engineEnabled === true;
        const label = enabled ? 'Engine On' : 'Engine Off';
        mounted.guided.engine.setAttribute('aria-pressed', String(enabled));
        mounted.guided.engine.setAttribute('aria-label', label);
        mounted.guided.engine.querySelector('[data-coach-exploration-engine-label]').textContent = label;
    }

    function navigateExploration(action) {
        const exploration = root.CaissaCoachReviewExploration;
        const state = exploration?.getSnapshot?.();
        if (!mounted?.analyze || !state?.active) return;
        if (state.temporaryPlyCount > 0) { exploration[action]?.(); return; }
        const last = (mounted.analyze.getLoadedMoves?.().length || 0) - 1;
        const current = mounted.analyze.currentMoveIndex;
        const destinations = { first: -1, previous: Math.max(-1, current - 1),
            next: Math.min(last, current + 1), last };
        const destination = destinations[action];
        if (Number.isInteger(destination) && destination !== current) mounted.analyze.jumpToMove(destination);
    }

    function enterExploration() {
        if (!mounted?.analyze || mounted.phase !== 'guided-review') return;
        const projection = mounted.analyze.getCoachReviewProjection?.(); if (!projection?.fen) return;
        const selected = mounted.analyze.analysisResults?.[mounted.analyze.currentMoveIndex];
        mounted.explorationEntryPly = mounted.analyze.currentMoveIndex;
        mounted.explorationLastAnalysis = selected && !selected.unavailable ? {
            evaluation: selected.evalAfter, mate: selected.mateAfter, pv: []
        } : null;
        mounted.phase = 'analysis-exploration'; mounted.summary.panel.dataset.coachReviewPhase = 'analysis-exploration';
        mounted.guided.guided.hidden = true; mounted.guided.exploration.hidden = false;
        mounted.guided.reviewTools.hidden = true; mounted.guided.explorationTools.hidden = false;
        if (mounted.moveList?.node) mounted.guided.sourceNotation.append(mounted.moveList.node);
        renderAnalysisSource(); syncReviewEvaluationRail();
        const entered = root.CaissaCoachReviewExploration?.enter?.({ fen: projection.fen, move: projection.move,
            analyze: mounted.analyze, onPosition: renderExplorationPosition, onAnalysis: renderExplorationAnalysis,
            restore: () => mounted?.analyze?.projectCoachReviewBoardAssistance?.() });
        if (!entered?.ok) {
            mounted.phase = 'guided-review'; mounted.guided.guided.hidden = false; mounted.guided.exploration.hidden = true;
            mounted.guided.reviewTools.hidden = false; mounted.guided.explorationTools.hidden = true;
            if (mounted.moveList?.node) mounted.guided.notation.append(mounted.moveList.node);
            mounted.explorationEntryPly = null; mounted.explorationLastAnalysis = null; updateGuided(); return;
        }
        syncExplorationEngineControl(); renderExplorationPosition(); mounted.guided.back.focus?.();
    }

    function leaveExploration() {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        mounted.restoringExploration = true;
        if (Number.isInteger(mounted.explorationEntryPly)) mounted.analyze.jumpToMove(mounted.explorationEntryPly);
        root.CaissaCoachReviewExploration?.leave?.();
        mounted.phase = 'guided-review'; mounted.summary.panel.dataset.coachReviewPhase = 'guided-review';
        mounted.guided.guided.hidden = false; mounted.guided.exploration.hidden = true;
        mounted.guided.reviewTools.hidden = false; mounted.guided.explorationTools.hidden = true;
        if (mounted.moveList?.node) mounted.guided.notation.append(mounted.moveList.node);
        mounted.restoringExploration = false; mounted.explorationEntryPly = null; mounted.explorationLastAnalysis = null;
        updateGuided(); mounted.guided.analysis.focus?.();
    }

    function openSettings() {
        if (!mounted || mounted.phase !== 'guided-review') return;
        mounted.guided.saveStatus.textContent = '';
        if (typeof mounted.guided.settingsDialog.showModal === 'function') mounted.guided.settingsDialog.showModal();
        else mounted.guided.settingsDialog.setAttribute('open', '');
        mounted.guided.settingsClose.focus?.();
    }

    function closeSettings() {
        const dialog = mounted?.guided?.settingsDialog; if (!dialog?.hasAttribute('open')) return;
        if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    }

    function update() {
        if (!mounted?.analyze) return; if (mounted.phase !== 'review-summary') { updateGuided(); return; }
        const modeled = createSummaryModel({ analyze: mounted.analyze, handoff: mounted.handoff, context: mounted.context });
        if (!modeled.ok) return; const model = modeled.value;
        const fingerprint = `${model.phase}:${model.progress || 0}:${mounted.analyze.analysisResults?.length || 0}`;
        if (fingerprint === mounted.fingerprint) return;
        mounted.fingerprint = fingerprint; mounted.model = model; renderModel(model);
        if (model.phase === 'summary') syncReviewEvaluationRail();
        if (model.phase !== 'loading' && mounted.timer) {
            root.clearInterval(mounted.timer); mounted.timer = null;
        }
    }

    function mount(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        if (!options.section?.querySelector || !options.host?.appendChild
            || root.CaissaCoachReviewContext?.isCoachReview?.(options.context) !== true || !options.handoff?.payload)
            return result(false, 'rejected', 'INVALID_COACH_REVIEW_CONTEXT');
        const summary = createSummaryStructure(); const guided = createGuidedStructure();
        const shell = root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', content: summary.panel,
            foot: summary.foot, message: 'Reviewing your game...', transient: true });
        if (!shell?.ok) return result(false, 'rejected', 'COACH_SHELL_UNAVAILABLE');
        summary.panel.dataset.caissaReviewContext = 'coach'; summary.panel.dataset.coachReviewPhase = 'loading';
        root.document.body?.classList?.add('caissa-coach-review-summary-active');
        mounted = { section: options.section, host: options.host, context: options.context, handoff: options.handoff,
            summary, guided, analyze: null, model: null, phase: 'review-summary', fingerprint: null,
            analysisStartRequests: 0, timer: null, moveList: null, navigation: null, flipTool: null,
            explanationExpanded: false, explorationEntryPly: null, explorationLastAnalysis: null,
            restoringExploration: false };
        summary.action.addEventListener('click', enterGuidedReview);
        summary.newGame.addEventListener('click', () => startNewGame(summary.newGame));
        guided.explain.addEventListener('click', () => { if (!mounted) return;
            mounted.explanationExpanded = !mounted.explanationExpanded; updateGuided(); });
        guided.next.addEventListener('click', () => { if (!mounted?.analyze) return;
            const destination = findNextReviewMoment(mounted.analyze);
            mounted.explanationExpanded = false;
            if (destination === null) { updateGuided(); return; }
            mounted.analyze.jumpToMove(destination); updateGuided(); });
        guided.newGame.addEventListener('click', () => startNewGame(guided.newGame));
        guided.analysis.addEventListener('click', enterExploration);
        guided.back.addEventListener('click', leaveExploration);
        guided.explorationNavigation.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-coach-exploration-nav]');
            if (!button || button.disabled) return; navigateExploration(button.dataset.coachExplorationNav);
        });
        guided.variation.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-exploration-cursor]'); if (!button) return;
            root.CaissaCoachReviewExploration?.goTo?.(Number(button.dataset.explorationCursor));
        });
        guided.engine.addEventListener('click', () => {
            const enabled = root.CaissaCoachReviewExploration?.getSnapshot?.().engineEnabled === true;
            const changed = root.CaissaCoachReviewExploration?.setEngineEnabled?.(!enabled);
            if (changed?.ok) syncExplorationEngineControl();
        });
        guided.settingsClose.addEventListener('click', closeSettings);
        guided.savePgn.addEventListener('click', () => {
            if (!mounted || guided.savePgn.disabled) return;
            guided.savePgn.disabled = true; guided.saveStatus.textContent = 'Preparing PGN...';
            const postGame = root.CaissaPostGameExperienceInstance;
            const download = postGame?.downloadPgn?.({ preservePresentation: true })
                || postGame?.execute?.('download-pgn');
            Promise.resolve(download).then(outcome => {
                guided.saveStatus.textContent = outcome?.ok ? 'Original game PGN downloaded.' : 'PGN download is unavailable.';
            }).catch(() => { guided.saveStatus.textContent = 'PGN download is unavailable.'; }).finally(() => {
                guided.savePgn.disabled = false;
            });
        });
        root.addEventListener('caissa:coach-review-ply-change', updateCoachReviewPly);
        renderModel({ phase: 'loading', progress: 0, progressText: 'Preparing your review' });
        return result(true, 'accepted', 'COACH_REVIEW_SUMMARY_MOUNTED', getSnapshot());
    }

    function begin(options = {}) {
        if (!mounted || !options.analyze?.startAnalysis) return result(false, 'rejected', 'COACH_REVIEW_NOT_MOUNTED');
        if (mounted.analysisStartRequests > 0) return result(true, 'unchanged', 'ANALYSIS_ALREADY_REQUESTED', getSnapshot());
        mounted.analyze = options.analyze; mounted.analysisStartRequests += 1; update();
        mounted.timer = root.setInterval(update, 100);
        root.setTimeout(() => { if (!mounted || mounted.analyze !== options.analyze) return;
            if (!['preparing', 'analyzing', 'complete'].includes(options.analyze.analysisPhase))
                Promise.resolve(options.analyze.startAnalysis()).catch(() => update()); }, 0);
        return result(true, 'accepted', 'ANALYSIS_START_REQUESTED', getSnapshot());
    }

    function unmount() {
        if (!mounted) return result(true, 'unchanged', 'ALREADY_UNMOUNTED');
        if (mounted.timer) root.clearInterval(mounted.timer);
        if (mounted.phase === 'analysis-exploration') leaveExploration();
        if (mounted.flipTool?.node) {
            mounted.flipTool.node.querySelector('span').textContent = 'Flip';
            delete mounted.flipTool.node.dataset.coachGuidedFlip;
            restoreRemembered(mounted.flipTool);
        }
        restoreRemembered(mounted.moveList); restoreRemembered(mounted.navigation);
        const rail = root.CaissaEvaluationRailInstance;
        rail?.setMode?.('post-game');
        if (Number.isFinite(root.App?.lastEvalMate) && root.App.lastEvalMate !== 0)
            rail?.setMate?.(root.App.lastEvalMate, { source: 'post-game-live-final' });
        else if (Number.isFinite(root.App?.lastEvalCp))
            rail?.setEvaluation?.(root.App.lastEvalCp, { source: 'post-game-live-final' });
        else {
            rail?.reset?.(); rail?.setMode?.('post-game');
        }
        root.document.querySelector('[data-caissa-coach-shell] [data-coach-narration]')
            ?.classList?.remove('caissa-coach-guided__speech');
        mounted.summary.panel.remove(); mounted.summary.foot.remove(); mounted.guided.content.remove(); mounted.guided.foot.remove();
        root.removeEventListener('caissa:coach-review-ply-change', updateCoachReviewPly);
        root.CaissaNativeCoachPanel?.restorePresentation?.();
        root.document.body?.classList?.remove('caissa-coach-review-summary-active', 'caissa-coach-guided-review-active');
        mounted = null; return result(true, 'accepted', 'COACH_REVIEW_SUMMARY_UNMOUNTED');
    }

    function getSnapshot() { return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted,
        contextId: mounted?.context?.contextId || null, sourceMode: mounted?.context?.sourceMode || null,
        phase: mounted?.summary?.panel?.dataset?.coachReviewPhase || null,
        analysisStartRequests: mounted?.analysisStartRequests || 0,
        renderedRows: mounted?.model?.rows?.map(row => row.label) || [],
        activePlyOwner: 'AnalyzeSection.currentMoveIndex',
        exploration: root.CaissaCoachReviewExploration?.getSnapshot?.() || null }); }

    root.CaissaCoachReviewPresentation = freeze({ schemaVersion: SCHEMA_VERSION, classifications: CLASSIFICATIONS,
        reviewWorthyClassifications: REVIEW_WORTHY_CLASSIFICATIONS, qualityOrder: QUALITY_ORDER,
        qualitySymbols: FALLBACK_QUALITY_SYMBOLS, canonicalQualitySymbol,
        findReviewMoments, findNextReviewMoment, isReviewComplete,
        createSummaryModel, createGuidedModel, mount, begin, unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
