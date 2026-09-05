(function installBotsGuidedReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const REVIEW_WORTHY = Object.freeze(['Inaccuracy', 'Mistake', 'Blunder']);
    let mounted = null;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    const element = (tag, className, attributes = {}) => {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    };

    function formatEvaluation(item) {
        if (Number.isFinite(item?.mateAfter)) return item.mateAfter > 0 ? `M+${item.mateAfter}` : `M${item.mateAfter}`;
        if (!Number.isFinite(item?.evalAfter)) return '\u2014';
        return `${item.evalAfter >= 0 ? '+' : ''}${item.evalAfter.toFixed(2)}`;
    }

    function findReviewMoments(analyze) {
        const results = Array.isArray(analyze?.analysisResults) ? analyze.analysisResults : [];
        return freeze(results.map((item, position) => ({ item, position }))
            .filter(({ item }) => item && item.unavailable !== true && REVIEW_WORTHY.includes(item.quality))
            .map(({ item, position }) => Number.isInteger(item.moveIndex) ? item.moveIndex : position)
            .sort((left, right) => left - right));
    }

    function findNextReviewMoment(analyze) {
        const current = Number.isInteger(analyze?.currentMoveIndex) ? analyze.currentMoveIndex : -1;
        return findReviewMoments(analyze).find(index => index > current) ?? null;
    }

    function createGuidedModel(input = {}) {
        const analyze = input.analyze; const index = analyze?.currentMoveIndex;
        const moves = analyze?.getLoadedMoves?.() || []; const move = moves[index] || '';
        const item = analyze?.analysisResults?.[index] || null;
        if (!Number.isInteger(index) || index < 0 || !move || !item) return freeze({ index: -1,
            quality: 'Review', move: 'Starting position', annotation: '', evaluation: '\u2014',
            message: 'Select a move from the notation to review it.', detail: '', nextMoment: findNextReviewMoment(analyze) });
        if (item.unavailable) return freeze({ index, quality: 'Analysis unavailable', move, annotation: '',
            evaluation: '\u2014', message: 'Complete analysis evidence is unavailable for this move.',
            detail: 'Choose another move to continue.', nextMoment: findNextReviewMoment(analyze) });
        const quality = item.isBestMove === true ? 'Best' : (item.quality || 'Acceptable');
        const playerParity = input.handoff?.payload?.playerColor === 'black' ? 1 : 0;
        const subject = index % 2 === playerParity ? 'You played' : 'Your opponent played';
        let message = `${subject} ${move}.`;
        let detail = 'The completed analysis found no stronger evidence-backed correction for this move.';
        if (quality === 'Book') {
            message = item.bookEvidence?.name ? `${move} is recognized in ${item.bookEvidence.name}.`
                : `${move} is supported by CAISSA's opening evidence.`;
            detail = item.bookEvidence?.name ? `This move appears in ${item.bookEvidence.name}.`
                : 'The repository opening lookup supplied this classification.';
        } else if (quality === 'Best') {
            message = `${move} matched the leading analyzed continuation.`;
            detail = 'The completed analysis identified this exact move as its leading continuation.';
        } else if (REVIEW_WORTHY.includes(quality) && item.recommendationAvailable && item.bestMoveSan) {
            message = `${subject} ${move}. ${item.bestMoveSan} was the stronger continuation.`;
            detail = `From the position before ${move}, the completed analysis preferred ${item.bestMoveSan}.`;
        } else if (REVIEW_WORTHY.includes(quality)) {
            message = `${subject} ${move}, classified as ${quality.toLowerCase()}.`;
            detail = 'No evidence-backed alternative is available, so CAISSA will not invent one.';
        } else {
            message = `${move} stayed within CAISSA's acceptable range.`;
            detail = 'The completed analysis did not classify this move as a review-worthy error.';
        }
        return freeze({ index, quality, move, annotation: item.annotation || '', evaluation: formatEvaluation(item),
            message, detail, nextMoment: findNextReviewMoment(analyze) });
    }

    function createStructure() {
        const head = element('div', 'caissa-bots-guided__head', { 'data-bots-guided-head': '' });
        const avatar = element('img', 'caissa-bots-guided__caissa', {
            src: '/assets/play/caissa-coach-goddess.png', alt: 'Caissa, goddess of chess', width: '512', height: '512'
        });
        const speech = element('div', 'caissa-bots-guided__speech', { 'data-bots-guided-speech': '', 'aria-live': 'polite' });
        head.append(avatar, speech);

        const body = element('section', 'caissa-bots-guided', { 'data-bots-guided-review': '',
            'data-bots-phase-content': 'guided-review', 'aria-label': 'Guided Bot game review' });
        const actions = element('div', 'caissa-bots-guided__actions', { role: 'group', 'aria-label': 'Guided review actions' });
        const explain = element('button', 'caissa-bots-guided__explain', { type: 'button',
            'data-bots-guided-explain': '', 'aria-expanded': 'false' });
        explain.innerHTML = '<i class="fas fa-lightbulb" aria-hidden="true"></i><span>Explain</span>';
        const nextMoment = element('button', 'caissa-bots-guided__next-moment', { type: 'button',
            'data-bots-guided-next-moment': '', 'aria-label': 'Next review-worthy moment' });
        nextMoment.innerHTML = '<span>Next Moment</span><i class="fas fa-arrow-right" aria-hidden="true"></i>';
        actions.append(explain, nextMoment);
        const detail = element('p', 'caissa-bots-guided__detail', { 'data-bots-guided-detail': '', 'aria-live': 'polite' });
        detail.hidden = true;
        const notation = element('div', 'caissa-bots-guided__notation', { 'data-bots-guided-notation': '',
            'aria-label': 'Classified game notation' });
        body.append(actions, detail, notation);

        const foot = element('div', 'caissa-bots-guided__foot', { 'data-bots-foot-content': 'guided-review' });
        const navigation = element('div', 'caissa-bots-guided__navigation', { role: 'group', 'aria-label': 'Review move navigation' });
        const navButtons = {};
        [['first', 'First position', 'fa-step-backward'], ['previous', 'Previous move', 'fa-chevron-left'],
            ['next', 'Next move', 'fa-chevron-right'], ['last', 'Last move', 'fa-step-forward']]
            .forEach(([action, label, icon]) => {
                const button = element('button', 'caissa-bots-guided__nav-button', { type: 'button',
                    'data-bots-guided-nav': action, 'aria-label': label, title: label });
                button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
                navButtons[action] = button; navigation.append(button);
            });
        const secondary = element('div', 'caissa-bots-guided__secondary', { role: 'group', 'aria-label': 'Review actions' });
        const newGame = element('button', 'caissa-bots-guided__new-game', { type: 'button' }); newGame.textContent = 'New Game';
        const analysis = element('button', 'caissa-bots-guided__analysis', { type: 'button' });
        analysis.innerHTML = '<span>Analysis</span><i class="fas fa-search" aria-hidden="true"></i>';
        const live = element('span', 'sr-only', { 'aria-live': 'polite' }); secondary.append(newGame, analysis, live);
        foot.append(navigation, secondary);
        return { head, speech, body, explain, nextMoment, detail, notation, foot, navigation, navButtons,
            newGame, analysis, live };
    }

    function renderHead(model) {
        const speech = mounted.ui.speech; speech.replaceChildren();
        const quality = element('span', 'caissa-bots-guided__classification'); quality.textContent = model.quality.toUpperCase();
        const headline = element('span', 'caissa-bots-guided__headline');
        const move = element('strong', 'caissa-bots-guided__move'); move.textContent = `${model.move}${model.annotation || ''}`;
        const evaluation = element('span', 'caissa-bots-guided__evaluation'); evaluation.textContent = model.evaluation;
        const message = element('span', 'caissa-bots-guided__message'); message.textContent = model.message;
        headline.append(move, evaluation); speech.append(quality, headline, message);
    }

    function renderNotation() {
        const analyze = mounted.analyze; const moves = analyze.getLoadedMoves(); const results = analyze.analysisResults || [];
        const fragment = root.document.createDocumentFragment();
        for (let index = 0; index < moves.length; index += 2) {
            const row = element('div', 'caissa-bots-guided__notation-row');
            const number = element('span', 'caissa-bots-guided__move-number'); number.textContent = `${Math.floor(index / 2) + 1}.`;
            row.append(number);
            [index, index + 1].forEach(ply => {
                if (ply >= moves.length) { row.append(element('span', 'caissa-bots-guided__move-spacer')); return; }
                const item = results[ply] || null; const button = element('button', 'caissa-bots-guided__notation-move', {
                    type: 'button', 'data-bots-guided-ply': String(ply),
                    'aria-label': `${moves[ply]}, ${item?.isBestMove === true ? 'Best' : item?.quality || 'Not analyzed'}`
                });
                button.textContent = moves[ply];
                if (item?.annotation && item.annotation !== '-') {
                    const annotation = element('strong', 'caissa-bots-guided__annotation', { 'aria-hidden': 'true' });
                    annotation.textContent = item.annotation; button.append(annotation);
                }
                if (ply === analyze.currentMoveIndex) { button.classList.add('is-current'); button.setAttribute('aria-current', 'move'); }
                row.append(button);
            });
            fragment.append(row);
        }
        mounted.ui.notation.replaceChildren(fragment);
    }

    function syncEvaluationRail(item, beforeMove = false) {
        const rail = root.CaissaEvaluationRailInstance; if (!rail) return false;
        if (rail.getSnapshot?.().displayMode !== 'post-game') rail.setMode?.('post-game');
        const mate = beforeMove ? item?.mateBefore : item?.mateAfter;
        const evaluation = beforeMove ? item?.evalBefore : item?.evalAfter;
        if (Number.isFinite(mate) && mate !== 0)
            return rail.setMate?.(mate, { source: 'bots-guided-review-ply' })?.ok === true;
        if (Number.isFinite(evaluation))
            return rail.setEvaluation?.(evaluation * 100, { source: 'bots-guided-review-ply' })?.ok === true;
        return false;
    }

    function update() {
        if (!mounted) return;
        const model = createGuidedModel({ analyze: mounted.analyze, handoff: mounted.handoff }); mounted.model = model;
        mounted.ui.body.dataset.authoritativePly = String(model.index); renderHead(model); renderNotation();
        mounted.ui.detail.textContent = model.detail;
        mounted.ui.detail.hidden = !mounted.explanationExpanded || !model.detail;
        mounted.ui.explain.setAttribute('aria-expanded', String(mounted.explanationExpanded));
        mounted.ui.nextMoment.disabled = model.nextMoment === null;
        const last = mounted.analyze.getLoadedMoves().length - 1;
        mounted.ui.navButtons.first.disabled = model.index < 0;
        mounted.ui.navButtons.previous.disabled = model.index < 0;
        mounted.ui.navButtons.next.disabled = model.index >= last;
        mounted.ui.navButtons.last.disabled = model.index >= last;
        syncEvaluationRail(model.index < 0 ? mounted.analyze.analysisResults?.[0]
            : mounted.analyze.analysisResults?.[model.index], model.index < 0);
        mounted.ui.notation.querySelector('[aria-current="move"]')?.scrollIntoView?.({ block: 'nearest' });
    }

    function navigate(index) {
        if (!mounted || !Number.isInteger(index)) return;
        mounted.explanationExpanded = false; mounted.analyze.jumpToMove(index); update();
    }

    function enter(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        if (root.CaissaBotsReviewContext?.isBotsReview?.(options.context) !== true
            || options.analyze?.analysisPhase !== 'complete' || !root.CaissaBotsPanelInstance?.present)
            return result(false, 'rejected', 'INVALID_BOTS_GUIDED_REVIEW_EVIDENCE');
        const ui = createStructure();
        const shown = root.CaissaBotsPanelInstance.present({ phase: 'guided-review', head: ui.head,
            content: ui.body, foot: ui.foot });
        if (!shown?.ok) return result(false, 'rejected', 'BOTS_SHELL_UNAVAILABLE');
        mounted = { context: options.context, handoff: options.handoff, analyze: options.analyze, ui,
            model: null, explanationExpanded: false, pgn: options.handoff?.payload?.pgn || null,
            history: freeze([...(options.analyze.getLoadedMoves?.() || [])]) };
        root.document.body.classList.add('caissa-bots-guided-review-active');
        ui.explain.addEventListener('click', () => { if (!mounted) return;
            mounted.explanationExpanded = !mounted.explanationExpanded; update(); });
        ui.nextMoment.addEventListener('click', () => { const target = findNextReviewMoment(mounted?.analyze);
            if (target !== null) navigate(target); });
        ui.notation.addEventListener('click', event => { const button = event.target?.closest?.('[data-bots-guided-ply]');
            if (button) navigate(Number(button.dataset.botsGuidedPly)); });
        ui.navigation.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-bots-guided-nav]'); if (!button || button.disabled || !mounted) return;
            const last = mounted.analyze.getLoadedMoves().length - 1;
            const targets = { first: -1, previous: mounted.analyze.currentMoveIndex - 1,
                next: mounted.analyze.currentMoveIndex + 1, last };
            navigate(targets[button.dataset.botsGuidedNav]);
        });
        ui.newGame.addEventListener('click', () => { if (!mounted || ui.newGame.disabled) return;
            ui.newGame.disabled = true; root.CaissaPlayV2InlineAnalyze?.close?.();
            Promise.resolve(root.CaissaPostGameExperienceInstance?.execute?.('new-game')).catch(() => {}); });
        ui.analysis.addEventListener('click', () => {
            if (!mounted) return;
            root.dispatchEvent(new CustomEvent('caissa:bots-analysis-exploration-request', { detail: freeze({
                contextId: mounted.context.contextId, currentMoveIndex: mounted.analyze.currentMoveIndex,
                analysisOwner: 'AnalyzeSection'
            }) }));
            ui.live.textContent = 'Analysis exploration handoff is ready.';
        });
        root.addEventListener('caissa:bots-review-ply-change', update);
        options.analyze.jumpToMove(0); update(); ui.explain.focus?.();
        return result(true, 'accepted', 'BOTS_GUIDED_REVIEW_MOUNTED', getSnapshot());
    }

    function unmount() {
        if (!mounted) return result(true, 'unchanged', 'ALREADY_UNMOUNTED');
        root.removeEventListener('caissa:bots-review-ply-change', update);
        mounted.ui.head.remove(); mounted.ui.body.remove(); mounted.ui.foot.remove();
        root.document.body.classList.remove('caissa-bots-guided-review-active'); mounted = null;
        return result(true, 'accepted', 'BOTS_GUIDED_REVIEW_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted, phase: mounted ? 'guided-review' : null,
            currentMoveIndex: mounted?.analyze?.currentMoveIndex ?? null,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex', analysisResultsOwner: 'AnalyzeSection.analysisResults',
            moveHistoryOwner: 'AnalyzeSection loaded handoff', reviewMoments: mounted ? findReviewMoments(mounted.analyze) : [] });
    }

    root.CaissaBotsGuidedReviewPresentation = freeze({ schemaVersion: SCHEMA_VERSION,
        reviewWorthyClassifications: REVIEW_WORTHY, findReviewMoments, findNextReviewMoment,
        createGuidedModel, enter, unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
