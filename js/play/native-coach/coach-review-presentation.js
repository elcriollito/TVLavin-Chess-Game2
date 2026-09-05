(function installCoachReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.6.1';
    const QUALITY_ORDER = Object.freeze(['Book', 'Best', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const CLASSIFICATIONS = Object.freeze(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const REVIEW_WORTHY_CLASSIFICATIONS = Object.freeze(['Inaccuracy', 'Mistake', 'Blunder']);
    const QUALITY_ICONS = Object.freeze({ Book: 'fa-book-open', Best: 'fa-star', Acceptable: 'fa-check',
        Inaccuracy: 'fa-question', Mistake: 'fa-exclamation', Blunder: 'fa-bolt' });
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function element(tag, className, attributes = {}) {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
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
        return freeze({ index, quality, move, annotation: item.annotation || '', evaluation: formatEvaluation(item),
            message, detail: expanded ? detail : '' });
    }

    function createSummaryStructure(close) {
        const panel = element('section', 'caissa-coach-review-summary', { 'data-caissa-coach-review-shell': '',
            'data-caissa-coach-review-summary': '', 'aria-labelledby': 'caissa-coach-review-title' });
        const header = element('header', 'caissa-coach-review-summary__header');
        const heading = element('div', 'caissa-coach-review-summary__heading');
        const eyebrow = element('span', 'caissa-coach-review-summary__eyebrow'); eyebrow.textContent = 'CAISSA';
        const title = element('h1', 'caissa-coach-review-summary__title', { id: 'caissa-coach-review-title' });
        title.textContent = 'Game Review'; heading.append(eyebrow, title); header.append(heading); if (close) header.append(close);
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
        const playerAccuracy = element('strong', 'caissa-coach-review-summary__accuracy-value', { 'data-coach-review-player-accuracy': '' });
        const coachAccuracy = element('strong', 'caissa-coach-review-summary__accuracy-value', { 'data-coach-review-coach-accuracy': '' });
        accuracy.append(accuracyLabel, playerAccuracy, coachAccuracy);
        const table = element('div', 'caissa-coach-review-summary__table', { role: 'table',
            'aria-label': 'Player and Coach move classifications', 'data-coach-review-classifications': '' });
        comparison.append(profiles, accuracy, table); panel.append(header, loading, comparison);
        const action = element('button', 'caissa-coach-review-summary__action', { type: 'button',
            'data-coach-review-guided-action': '' }); action.textContent = 'Start Review';
        const foot = element('div', 'caissa-native-coach-panel__foot-content caissa-native-coach-panel__foot-content--review',
            { 'data-caissa-coach-review-foot': '' }); foot.append(action);
        return { panel, close, loading, progressTrack, progressFill, progressText, comparison, playerAvatar,
            playerName, coachName, playerAccuracy, coachAccuracy, table, action, foot };
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
        const status = element('p', 'caissa-coach-exploration__status', { 'data-coach-exploration-status': '', role: 'status' });
        status.textContent = 'Engine is preparing this position.';
        const evalRow = element('div', 'caissa-coach-exploration__evaluation');
        const evalLabel = element('span', 'caissa-coach-exploration__label'); evalLabel.textContent = 'Evaluation';
        const evalValue = element('strong', 'caissa-coach-exploration__value', { 'data-coach-exploration-evaluation': '' });
        evalValue.textContent = '\u2014'; evalRow.append(evalLabel, evalValue);
        const pv = element('div', 'caissa-coach-exploration__line');
        const pvLabel = element('span', 'caissa-coach-exploration__label'); pvLabel.textContent = 'Principal variation';
        const pvValue = element('p', 'caissa-coach-exploration__pv', { 'data-coach-exploration-pv': '' });
        pvValue.textContent = 'Waiting for a candidate continuation.'; pv.append(pvLabel, pvValue);
        const note = element('p', 'caissa-coach-exploration__note');
        note.textContent = 'Moves here are temporary and do not change your reviewed game.';
        exploration.append(status, evalRow, pv, note); content.append(guided, exploration);
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
        newGame.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i><span>New Game</span>'; newGame.hidden = true;
        secondaryActions.append(analysis, newGame); reviewTools.append(navigation, secondaryActions);
        const explorationTools = element('div', 'caissa-coach-guided__exploration-tools', { 'data-coach-exploration-foot': '' });
        explorationTools.hidden = true;
        const back = element('button', 'caissa-coach-guided__back-review', { type: 'button', 'data-coach-exploration-back': '' });
        back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i><span>Back to Review</span>';
        const engine = element('button', 'caissa-coach-guided__engine', { type: 'button',
            'data-coach-exploration-engine': '', 'aria-pressed': 'true' });
        engine.innerHTML = '<i class="fas fa-brain" aria-hidden="true"></i><span>Engine On</span>';
        explorationTools.append(back, engine); foot.append(reviewTools, explorationTools);
        return { content, guided, actions, explain, next, detail, notation, exploration, status, evalValue,
            pvValue, foot, reviewTools, navigation, secondaryActions, analysis, newGame,
            explorationTools, back, engine };
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
            icon.append(element('i', `fas ${QUALITY_ICONS[row.label] || 'fa-circle'}`));
            const coach = element('strong', 'caissa-coach-review-summary__count', { role: 'cell', 'data-side': 'coach' });
            player.textContent = displayCount(row.player); coach.textContent = displayCount(row.coach);
            line.append(label, player, icon, coach); mounted.summary.table.append(line); });
    }

    function updateGuided() {
        if (!mounted?.analyze || mounted.phase !== 'guided-review') return;
        const model = createGuidedModel(mounted.analyze, mounted.explanationExpanded, mounted.handoff);
        mounted.guided.content.dataset.authoritativePly = String(model.index);
        mounted.guided.detail.textContent = model.detail;
        mounted.guided.detail.hidden = !mounted.explanationExpanded || !model.detail;
        mounted.guided.explain.setAttribute('aria-expanded', String(mounted.explanationExpanded));
        const moments = findReviewMoments(mounted.analyze);
        const finalMoment = moments.at(-1) ?? null;
        const complete = mounted.reviewComplete || (finalMoment !== null && model.index === finalMoment);
        mounted.guided.next.disabled = complete;
        mounted.guided.next.querySelector('span').textContent = complete ? 'Review Complete' : 'Next Moment';
        mounted.guided.newGame.hidden = !complete;
        mounted.guided.reviewTools.dataset.reviewComplete = String(complete);
        if (complete) {
            mounted.guided.secondaryActions.prepend(mounted.guided.newGame);
            if (mounted.flipTool?.node) mounted.guided.newGame.after(mounted.flipTool.node);
        } else if (mounted.flipTool?.node) mounted.guided.secondaryActions.prepend(mounted.flipTool.node);
        renderCoachHead({ eyebrow: model.quality.toUpperCase(), title: `${model.move}${model.annotation || ''}`,
            evaluation: model.evaluation, message: model.message });
        mounted.guided.notation.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' });
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
            mounted.guided.secondaryActions.prepend(mounted.flipTool.node);
        }
        root.document.body?.classList?.add('caissa-coach-guided-review-active');
        root.CaissaNativeCoachPanel?.present?.({ phase: 'guided-review', content: mounted.guided.content,
            foot: mounted.guided.foot, message: 'Reviewing the first move.' });
        analyze.jumpToMove(0); updateGuided(); mounted.guided.explain.focus?.();
    }

    function renderExplorationAnalysis(info) {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        const status = info?.status || 'unavailable';
        mounted.guided.status.textContent = status === 'loading' ? 'Engine is evaluating this position.'
            : status === 'off' ? 'Engine is off. You can continue moving pieces.'
                : status === 'ready' ? 'Engine evaluation for the current exploration position.'
                    : 'Engine evaluation is temporarily unavailable.';
        if (status !== 'ready') { mounted.guided.evalValue.textContent = '\u2014';
            mounted.guided.pvValue.textContent = status === 'off' ? 'Turn Engine On to calculate a continuation.'
                : 'Waiting for a candidate continuation.'; return; }
        mounted.guided.evalValue.textContent = Number.isFinite(info.mate) ? (info.mate > 0 ? `M+${info.mate}` : `M${info.mate}`)
            : Number.isFinite(info.evaluation) ? `${info.evaluation >= 0 ? '+' : ''}${info.evaluation.toFixed(2)}` : '\u2014';
        mounted.guided.pvValue.textContent = info.pv?.length ? info.pv.join(' ') : 'No principal variation available yet.';
    }

    function enterExploration() {
        if (!mounted?.analyze || mounted.phase !== 'guided-review') return;
        const projection = mounted.analyze.getCoachReviewProjection?.(); if (!projection?.fen) return;
        mounted.phase = 'analysis-exploration'; mounted.summary.panel.dataset.coachReviewPhase = 'analysis-exploration';
        mounted.guided.guided.hidden = true; mounted.guided.exploration.hidden = false;
        mounted.guided.reviewTools.hidden = true; mounted.guided.explorationTools.hidden = false;
        mounted.guided.engine.setAttribute('aria-pressed', 'true'); mounted.guided.engine.querySelector('span').textContent = 'Engine On';
        renderCoachHead({ eyebrow: 'ANALYSIS', title: 'Explore this position', evaluation: '',
            message: 'Try legal continuations here. Your reviewed game remains unchanged.' });
        const entered = root.CaissaCoachReviewExploration?.enter?.({ fen: projection.fen, analyze: mounted.analyze,
            onPosition: () => {}, onAnalysis: renderExplorationAnalysis,
            restore: () => mounted?.analyze?.projectCoachReviewBoardAssistance?.() });
        if (!entered?.ok) { mounted.phase = 'guided-review'; mounted.guided.guided.hidden = false;
            mounted.guided.exploration.hidden = true; mounted.guided.reviewTools.hidden = false;
            mounted.guided.explorationTools.hidden = true; updateGuided(); return; }
        mounted.guided.back.focus?.();
    }

    function leaveExploration() {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        root.CaissaCoachReviewExploration?.leave?.(); mounted.phase = 'guided-review';
        mounted.summary.panel.dataset.coachReviewPhase = 'guided-review'; mounted.guided.guided.hidden = false;
        mounted.guided.exploration.hidden = true; mounted.guided.reviewTools.hidden = false;
        mounted.guided.explorationTools.hidden = true; updateGuided(); mounted.guided.analysis.focus?.();
    }

    function update() {
        if (!mounted?.analyze) return; if (mounted.phase !== 'review-summary') { updateGuided(); return; }
        const modeled = createSummaryModel({ analyze: mounted.analyze, handoff: mounted.handoff, context: mounted.context });
        if (!modeled.ok) return; const model = modeled.value;
        const fingerprint = `${model.phase}:${model.progress || 0}:${mounted.analyze.analysisResults?.length || 0}`;
        if (fingerprint === mounted.fingerprint) return;
        mounted.fingerprint = fingerprint; mounted.model = model; renderModel(model);
        if (model.phase !== 'loading' && mounted.timer) {
            root.clearInterval(mounted.timer); mounted.timer = null;
        }
    }

    function mount(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        if (!options.section?.querySelector || !options.host?.appendChild
            || root.CaissaCoachReviewContext?.isCoachReview?.(options.context) !== true || !options.handoff?.payload)
            return result(false, 'rejected', 'INVALID_COACH_REVIEW_CONTEXT');
        const summary = createSummaryStructure(options.close); const guided = createGuidedStructure();
        if (summary.close) { summary.close.textContent = '\u2190 Back'; summary.close.setAttribute('aria-label', 'Back to game result');
            summary.close.classList.add('caissa-coach-review-summary__back'); }
        const shell = root.CaissaNativeCoachPanel?.present?.({ phase: 'review-summary', content: summary.panel,
            foot: summary.foot, message: 'Reviewing your game...', transient: true });
        if (!shell?.ok) return result(false, 'rejected', 'COACH_SHELL_UNAVAILABLE');
        summary.panel.dataset.caissaReviewContext = 'coach'; summary.panel.dataset.coachReviewPhase = 'loading';
        root.document.body?.classList?.add('caissa-coach-review-summary-active');
        mounted = { section: options.section, host: options.host, context: options.context, handoff: options.handoff,
            summary, guided, analyze: null, model: null, phase: 'review-summary', fingerprint: null,
            analysisStartRequests: 0, timer: null, moveList: null, navigation: null, flipTool: null,
            explanationExpanded: false, reviewComplete: false };
        summary.action.addEventListener('click', enterGuidedReview);
        guided.explain.addEventListener('click', () => { if (!mounted) return;
            mounted.explanationExpanded = !mounted.explanationExpanded; updateGuided(); });
        guided.next.addEventListener('click', () => { if (!mounted?.analyze) return;
            const destination = findNextReviewMoment(mounted.analyze);
            mounted.explanationExpanded = false;
            if (destination === null) { mounted.reviewComplete = true; updateGuided(); return; }
            mounted.reviewComplete = false; mounted.analyze.jumpToMove(destination); updateGuided(); });
        guided.newGame.addEventListener('click', () => {
            if (!mounted || guided.newGame.disabled) return;
            guided.newGame.disabled = true;
            root.CaissaPlayV2InlineAnalyze?.close?.();
            Promise.resolve(root.CaissaPostGameExperienceInstance?.execute?.('new-game')).then(outcome => {
                if (mounted && !outcome?.ok) guided.newGame.disabled = false;
            }).catch(() => { if (mounted) guided.newGame.disabled = false; });
        });
        guided.analysis.addEventListener('click', enterExploration); guided.back.addEventListener('click', leaveExploration);
        guided.engine.addEventListener('click', () => { const enabled = guided.engine.getAttribute('aria-pressed') !== 'true';
            const changed = root.CaissaCoachReviewExploration?.setEngineEnabled?.(enabled); if (!changed?.ok) return;
            guided.engine.setAttribute('aria-pressed', String(enabled));
            guided.engine.querySelector('span').textContent = enabled ? 'Engine On' : 'Engine Off'; });
        root.addEventListener('caissa:coach-review-ply-change', updateGuided);
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
        if (mounted.phase === 'analysis-exploration') root.CaissaCoachReviewExploration?.leave?.();
        if (mounted.flipTool?.node) {
            mounted.flipTool.node.querySelector('span').textContent = 'Flip';
            delete mounted.flipTool.node.dataset.coachGuidedFlip;
            restoreRemembered(mounted.flipTool);
        }
        restoreRemembered(mounted.moveList); restoreRemembered(mounted.navigation);
        root.document.querySelector('[data-caissa-coach-shell] [data-coach-narration]')
            ?.classList?.remove('caissa-coach-guided__speech');
        mounted.summary.panel.remove(); mounted.summary.foot.remove(); mounted.guided.content.remove(); mounted.guided.foot.remove();
        root.removeEventListener('caissa:coach-review-ply-change', updateGuided);
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
        findReviewMoments, findNextReviewMoment, createSummaryModel, createGuidedModel, mount, begin, unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
