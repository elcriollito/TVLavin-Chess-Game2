(function installBotsGuidedReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.4.0';
    const REVIEW_WORTHY = Object.freeze(['Inaccuracy', 'Mistake', 'Blunder']);
    const REQUIRED_PRESENTATION_SYMBOLS = Object.freeze({ Mistake: '?', Blunder: '??' });
    let mounted = null;
    let mentorStudyRequested = false;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    const element = (tag, className, attributes = {}) => {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        return node;
    };
    const presentationAnnotation = item => {
        if (!item || item.unavailable === true) return '';
        return REQUIRED_PRESENTATION_SYMBOLS[item.quality]
            || (typeof item.annotation === 'string' && item.annotation !== '-' ? item.annotation : '');
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
        return freeze({ index, quality, move, annotation: presentationAnnotation(item), evaluation: formatEvaluation(item),
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

    function createExplorationStructure() {
        const head = element('div', 'caissa-bots-exploration__head', { 'data-bots-exploration-head': '' });
        const avatar = element('img', 'caissa-bots-exploration__caissa', {
            src: '/assets/play/caissa-coach-goddess.png', alt: 'Caissa, goddess of chess', width: '512', height: '512'
        });
        const speech = element('div', 'caissa-bots-exploration__speech');
        const eyebrow = element('span', 'caissa-bots-exploration__eyebrow'); eyebrow.textContent = 'ANALYSIS';
        const titleRow = element('span', 'caissa-bots-exploration__title-row');
        const title = element('strong', 'caissa-bots-exploration__title'); title.textContent = 'Explore this position';
        const evaluation = element('strong', 'caissa-bots-exploration__evaluation', { 'data-bots-exploration-evaluation': '' });
        evaluation.textContent = '\u2014'; titleRow.append(title, evaluation);
        const message = element('span', 'caissa-bots-exploration__message');
        message.textContent = 'Try legal continuations here. Your reviewed game remains unchanged.';
        const pv = element('span', 'caissa-bots-exploration__pv', { 'data-bots-exploration-pv': '', 'aria-live': 'polite' });
        pv.textContent = 'Principal variation: preparing\u2026'; speech.append(eyebrow, titleRow, message, pv); head.append(avatar, speech);

        const body = element('section', 'caissa-bots-exploration', { 'data-bots-analysis-exploration': '',
            'aria-label': 'Game study and temporary position analysis' });
        const mentor = element('aside', 'caissa-bots-exploration__mentor', {
            'data-bots-mentor-study': '', 'aria-label': 'Contextual Mentor guidance' });
        mentor.hidden = true;
        const mentorHeading = element('div', 'caissa-bots-exploration__mentor-heading');
        const mentorTitle = element('strong', 'caissa-bots-exploration__mentor-title'); mentorTitle.textContent = 'Mentor';
        const leaveMentor = element('button', 'caissa-bots-exploration__mentor-leave', {
            type: 'button', 'data-bots-mentor-leave': '', 'aria-label': 'Leave Mentor' });
        leaveMentor.textContent = 'Leave Mentor'; mentorHeading.append(mentorTitle, leaveMentor);
        const mentorMessage = element('p', 'caissa-bots-exploration__mentor-message', {
            'data-bots-mentor-message': '', 'aria-live': 'polite' });
        mentorMessage.textContent = "I'm looking at this position. What would you like help with?";
        const mentorActions = element('div', 'caissa-bots-exploration__mentor-actions', {
            role: 'group', 'aria-label': 'Mentor questions' });
        [['explain', 'Explain this position'], ['mistake', 'What was the mistake?'],
            ['move', 'What should I play?'], ['threat', 'Show the threat'], ['plan', 'What is the plan?']]
            .forEach(([action, label]) => {
                const button = element('button', 'caissa-bots-exploration__mentor-action', {
                    type: 'button', 'data-bots-mentor-action': action });
                button.textContent = label; mentorActions.append(button);
            });
        mentor.append(mentorHeading, mentorMessage, mentorActions);
        const sourceSection = element('section', 'caissa-bots-exploration__line');
        const sourceTitle = element('h3', 'caissa-bots-exploration__line-title'); sourceTitle.textContent = 'Game moves (study)';
        const sourceNotation = element('div', 'caissa-bots-exploration__notation', {
            'data-bots-exploration-source': '', 'aria-label': 'Read-only completed game notation' });
        sourceSection.append(sourceTitle, sourceNotation);
        const variationSection = element('section', 'caissa-bots-exploration__line', {
            'data-bots-exploration-variation-section': '' });
        const variationTitle = element('h3', 'caissa-bots-exploration__line-title'); variationTitle.textContent = 'Temporary variation';
        const notation = element('div', 'caissa-bots-exploration__notation', { 'data-bots-exploration-notation': '',
            'aria-label': 'Temporary exploration notation', 'aria-live': 'polite' });
        variationSection.append(variationTitle, notation); body.append(mentor, sourceSection, variationSection);

        const foot = element('div', 'caissa-bots-exploration__foot', { 'data-bots-foot-content': 'analysis-exploration' });
        const navigation = element('div', 'caissa-bots-exploration__navigation', { role: 'group',
            'aria-label': 'Temporary line navigation' });
        const navButtons = {};
        [['first', 'First study position', 'fa-step-backward'], ['previous', 'Previous study move', 'fa-chevron-left'],
            ['next', 'Next study move', 'fa-chevron-right'], ['last', 'Last study position', 'fa-step-forward']]
            .forEach(([action, label, icon]) => {
                const button = element('button', 'caissa-bots-exploration__nav-button', { type: 'button',
                    'data-bots-exploration-nav': action, 'aria-label': label, title: label });
                button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
                navButtons[action] = button; navigation.append(button);
            });
        const actions = element('div', 'caissa-bots-exploration__actions');
        const back = element('button', 'caissa-bots-exploration__back', { type: 'button',
            'data-bots-exploration-back': '' });
        back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i><span>Back to Review</span>';
        const engine = element('button', 'caissa-bots-exploration__engine', { type: 'button',
            'data-bots-exploration-engine': '', 'aria-pressed': 'false', 'aria-label': 'Engine Off' });
        engine.innerHTML = '<span class="caissa-bots-exploration__led" aria-hidden="true"></span>'
            + '<span data-bots-exploration-engine-label>Engine Off</span>';
        actions.append(back, engine); foot.append(navigation, actions);
        return { head, evaluation, pv, body, mentor, mentorMessage, mentorActions, leaveMentor,
            sourceNotation, variationSection, notation, foot, navigation, navButtons, back, engine };
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
                const symbol = presentationAnnotation(item);
                if (symbol) {
                    const annotation = element('strong', 'caissa-bots-guided__annotation', { 'aria-hidden': 'true' });
                    annotation.textContent = symbol; button.append(annotation);
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

    function renderExplorationAnalysis(info = {}) {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        mounted.explorationAnalysis = freeze({ evaluation: info.evaluation, mate: info.mate,
            pv: freeze([...(info.pv || [])]), status: info.status || 'unknown' });
        const ui = mounted.exploration; const hasEvaluation = Number.isFinite(info.mate) || Number.isFinite(info.evaluation);
        if (Number.isFinite(info.mate)) ui.evaluation.textContent = info.mate > 0 ? `M+${info.mate}` : `M${info.mate}`;
        else if (Number.isFinite(info.evaluation))
            ui.evaluation.textContent = `${info.evaluation >= 0 ? '+' : ''}${info.evaluation.toFixed(2)}`;
        else if (!hasEvaluation && info.status !== 'off') ui.evaluation.textContent = '\u2014';
        if (info.pv?.length) ui.pv.textContent = `Principal variation: ${info.pv.join(' ')}`;
        else if (info.status === 'loading') ui.pv.textContent = 'Principal variation: preparing\u2026';
        else if (info.status !== 'off') ui.pv.textContent = 'Principal variation: unavailable.';
        const rail = root.CaissaEvaluationRailInstance;
        if (rail && info.status === 'ready') {
            if (rail.getSnapshot?.().displayMode !== 'post-game') rail.setMode?.('post-game');
            if (Number.isFinite(info.mate) && info.mate !== 0) rail.setMate?.(info.mate, { source: 'bots-analysis-exploration' });
            else if (Number.isFinite(info.evaluation)) rail.setEvaluation?.(info.evaluation * 100,
                { source: 'bots-analysis-exploration' });
        }
    }

    function mentorEvidence() {
        const state = root.CaissaBotsAnalysisExploration?.getSnapshot?.();
        const sourcePly = state?.mode === 'source' ? state.sourceCursor - 1 : (state?.branchSourceCursor ?? 0) - 1;
        return { state, result: sourcePly >= 0 ? mounted?.analyze?.analysisResults?.[sourcePly] || null : null,
            analysis: mounted?.explorationAnalysis || null };
    }

    function mentorAnswer(action) {
        const { result: evidence, analysis } = mentorEvidence(); const pv = analysis?.pv || [];
        const evaluation = Number.isFinite(analysis?.mate) && analysis.mate !== 0
            ? `mate ${analysis.mate > 0 ? `in ${analysis.mate}` : `against in ${Math.abs(analysis.mate)}`}`
            : Number.isFinite(analysis?.evaluation) ? `${analysis.evaluation >= 0 ? '+' : ''}${analysis.evaluation.toFixed(2)}` : null;
        if (action === 'mistake') {
            if (evidence && REVIEW_WORTHY.includes(evidence.quality)) {
                const correction = evidence.recommendationAvailable && evidence.bestMoveSan
                    ? ` The completed review preferred ${evidence.bestMoveSan}.` : '';
                return `${evidence.move || 'The selected source move'} was classified as ${evidence.quality.toLowerCase()}.${correction}`;
            }
            return 'The completed review has no evidence-backed mistake attached to this study position.';
        }
        if (action === 'move') return pv.length
            ? `The current engine line begins ${pv.slice(0, 3).join(' ')}. You can choose whether to try it in the study draft.`
            : 'A supported move suggestion is not available yet. Keep the engine on and wait for a principal variation.';
        if (action === 'threat') return pv.length
            ? `Use the current principal line as the concrete threat check: ${pv.slice(0, 4).join(' ')}.`
            : 'No evidence-backed threat is available for this position, so I will not invent one.';
        if (action === 'plan') return pv.length
            ? `Start by comparing candidate moves with ${pv[0]}; the displayed principal line is the available concrete evidence.`
            : 'Compare legal candidate moves while the engine prepares evidence; no specific plan is asserted yet.';
        return evaluation
            ? `The current position is evaluated at ${evaluation}${pv.length ? `, with a principal line beginning ${pv.slice(0, 3).join(' ')}` : ''}.`
            : 'I am following this position. Use the legal moves and engine line to compare concrete continuations.';
    }

    function syncMentorContext({ resetMessage = true } = {}) {
        if (!mounted?.mentorActive || mounted.phase !== 'analysis-exploration') return;
        const state = root.CaissaBotsAnalysisExploration?.getSnapshot?.(); const ui = mounted.exploration;
        ui.mentor.hidden = false; ui.mentor.dataset.mentorFen = state?.currentFen || '';
        ui.mentor.dataset.mentorContext = state?.mode || 'source';
        if (resetMessage) ui.mentorMessage.textContent = "I'm looking at this position. What would you like help with?";
    }

    function renderExplorationPosition() {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        const owner = root.CaissaBotsAnalysisExploration; const state = owner?.getSnapshot?.(); const ui = mounted.exploration;
        const renderLine = (container, line, kind) => {
            container.replaceChildren(); const rows = new Map();
            line.forEach(move => {
            if (!rows.has(move.moveNumber)) rows.set(move.moveNumber, { white: null, black: null });
            rows.get(move.moveNumber)[move.color === 'b' ? 'black' : 'white'] = move;
            });
            rows.forEach((moves, moveNumber) => {
            const row = element('div', 'caissa-bots-exploration__notation-row');
            const number = element('span', 'caissa-bots-exploration__move-number'); number.textContent = `${moveNumber}.`; row.append(number);
            ['white', 'black'].forEach(color => {
                const move = moves[color];
                if (!move) { row.append(element('span', 'caissa-bots-exploration__spacer', { 'aria-hidden': 'true' })); return; }
                const evidence = kind === 'source' ? mounted.analyze.analysisResults?.[move.index] || null : null;
                const symbol = presentationAnnotation(evidence);
                const classification = evidence?.isBestMove === true ? 'Best' : evidence?.quality || null;
                const attributes = { type: 'button', 'aria-label': `${kind === 'source' ? 'Study' : 'Temporary'} move ${move.san}`
                    + (classification ? `, ${classification}` : '') };
                attributes[kind === 'source' ? 'data-bots-exploration-source-cursor' : 'data-bots-exploration-cursor']
                    = String(move.index + 1);
                const button = element('button', 'caissa-bots-exploration__move', attributes);
                button.textContent = move.san; button.dataset.future = String(move.future);
                if (kind === 'source' && symbol) {
                    const annotation = element('strong', 'caissa-bots-exploration__annotation', {
                        'data-bots-exploration-annotation': '', 'data-quality': evidence.quality, 'aria-hidden': 'true' });
                    annotation.textContent = symbol; button.append(annotation);
                }
                if (move.branchAnchor) button.classList.add('is-branch-anchor');
                if (move.current) button.setAttribute('aria-current', 'move'); row.append(button);
            });
                container.append(row);
            });
        };
        const sourceLine = owner?.getSourceLine?.() || []; const line = owner?.getLine?.() || [];
        renderLine(ui.sourceNotation, sourceLine, 'source'); renderLine(ui.notation, line, 'temporary');
        ui.variationSection.hidden = line.length === 0;
        ui.navButtons.first.disabled = !state || state.atFirst; ui.navButtons.previous.disabled = !state || state.atFirst;
        ui.navButtons.next.disabled = !state || state.atLast; ui.navButtons.last.disabled = !state || state.atLast;
        ui.body.querySelector('[aria-current="move"]')?.scrollIntoView?.({ block: 'nearest' });
        syncMentorContext();
    }

    function syncExplorationEngine() {
        if (!mounted?.exploration) return;
        const enabled = root.CaissaBotsAnalysisExploration?.getSnapshot?.().engineEnabled === true;
        const label = enabled ? 'Engine On' : 'Engine Off'; const button = mounted.exploration.engine;
        button.setAttribute('aria-pressed', String(enabled)); button.setAttribute('aria-label', label);
        button.querySelector('[data-bots-exploration-engine-label]').textContent = label;
    }

    function enterExploration(options = {}) {
        if (!mounted || mounted.phase !== 'guided-review') return;
        const anchor = mounted.analyze.currentMoveIndex; const projection = mounted.analyze.getCoachReviewProjection?.();
        if (!Number.isInteger(anchor) || !projection?.fen) return;
        mounted.phase = 'analysis-exploration'; mounted.entryReviewPly = anchor;
        mounted.mentorActive = options.mentor === true; mounted.exploration.mentor.hidden = !mounted.mentorActive;
        const shown = root.CaissaBotsPanelInstance.present({ phase: 'analysis-exploration',
            head: mounted.exploration.head, content: mounted.exploration.body, foot: mounted.exploration.foot });
        if (!shown?.ok) { mounted.phase = 'guided-review'; return; }
        root.document.querySelectorAll('#chessboard [data-caissa-coach-move-annotation]').forEach(node => node.remove());
        const entered = root.CaissaBotsAnalysisExploration?.enter?.({ fen: projection.fen,
            sourceInitialFen: mounted.analyze.loadedGame?.initialFen || new root.Chess().fen(),
            sourceMoves: mounted.analyze.getLoadedMoves?.({ verbose: true }) || [], sourceCursor: anchor + 1,
            analyze: mounted.analyze,
            entryReviewPly: anchor, onPosition: renderExplorationPosition, onAnalysis: renderExplorationAnalysis,
            restore: () => mounted?.analyze?.jumpToMove?.(anchor) });
        if (!entered?.ok) { mounted.phase = 'guided-review';
            root.CaissaBotsPanelInstance.present({ phase: 'guided-review', head: mounted.ui.head,
                content: mounted.ui.body, foot: mounted.ui.foot }); update(); return; }
        syncExplorationEngine(); renderExplorationPosition();
        (mounted.mentorActive ? mounted.exploration.mentorActions.querySelector('button') : mounted.exploration.back)?.focus?.();
    }

    function leaveExploration() {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        const anchor = mounted.entryReviewPly; root.CaissaBotsAnalysisExploration?.leave?.();
        mounted.phase = 'guided-review'; mounted.entryReviewPly = null;
        root.CaissaBotsPanelInstance.present({ phase: 'guided-review', head: mounted.ui.head,
            content: mounted.ui.body, foot: mounted.ui.foot });
        mounted.analyze.jumpToMove(anchor); update(); mounted.ui.analysis.focus?.();
    }

    function enter(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        if (root.CaissaBotsReviewContext?.isBotsReview?.(options.context) !== true
            || options.analyze?.analysisPhase !== 'complete' || !root.CaissaBotsPanelInstance?.present)
            return result(false, 'rejected', 'INVALID_BOTS_GUIDED_REVIEW_EVIDENCE');
        const ui = createStructure(); const exploration = createExplorationStructure();
        const shown = root.CaissaBotsPanelInstance.present({ phase: 'guided-review', head: ui.head,
            content: ui.body, foot: ui.foot });
        if (!shown?.ok) return result(false, 'rejected', 'BOTS_SHELL_UNAVAILABLE');
        mounted = { context: options.context, handoff: options.handoff, analyze: options.analyze, ui, exploration,
            model: null, explanationExpanded: false, pgn: options.handoff?.payload?.pgn || null,
            history: freeze([...(options.analyze.getLoadedMoves?.() || [])]), phase: 'guided-review', entryReviewPly: null,
            mentorActive: false, explorationAnalysis: null };
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
        ui.analysis.addEventListener('click', enterExploration);
        exploration.navigation.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-bots-exploration-nav]'); if (!button || button.disabled) return;
            root.CaissaBotsAnalysisExploration?.[button.dataset.botsExplorationNav]?.();
        });
        exploration.notation.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-bots-exploration-cursor]');
            if (button) root.CaissaBotsAnalysisExploration?.goTo?.(Number(button.dataset.botsExplorationCursor));
        });
        exploration.sourceNotation.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-bots-exploration-source-cursor]');
            if (button) root.CaissaBotsAnalysisExploration?.goToSource?.(Number(button.dataset.botsExplorationSourceCursor));
        });
        exploration.mentorActions.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-bots-mentor-action]');
            if (!button || !mounted?.mentorActive) return;
            mounted.exploration.mentorMessage.textContent = mentorAnswer(button.dataset.botsMentorAction);
        });
        exploration.leaveMentor.addEventListener('click', () => {
            if (!mounted?.mentorActive) return; mounted.mentorActive = false;
            exploration.mentor.hidden = true; exploration.back.focus?.();
        });
        exploration.back.addEventListener('click', leaveExploration);
        exploration.engine.addEventListener('click', () => {
            const enabled = root.CaissaBotsAnalysisExploration?.getSnapshot?.().engineEnabled === true;
            root.CaissaBotsAnalysisExploration?.setEngineEnabled?.(!enabled); syncExplorationEngine();
        });
        root.addEventListener('caissa:bots-review-ply-change', update);
        options.analyze.jumpToMove(0); update();
        if (options.mentorStudy === true) enterExploration({ mentor: true }); else ui.explain.focus?.();
        return result(true, 'accepted', 'BOTS_GUIDED_REVIEW_MOUNTED', getSnapshot());
    }

    function requestMentorStudy() {
        mentorStudyRequested = true;
        return result(true, 'accepted', 'BOTS_MENTOR_STUDY_REQUESTED');
    }
    function cancelMentorStudyRequest() {
        mentorStudyRequested = false;
        return result(true, 'accepted', 'BOTS_MENTOR_STUDY_CANCELLED');
    }
    function enterMentorStudy(options = {}) {
        mentorStudyRequested = false;
        return enter({ ...options, mentorStudy: true });
    }

    function unmount() {
        if (!mounted) return result(true, 'unchanged', 'ALREADY_UNMOUNTED');
        if (mounted.phase === 'analysis-exploration') root.CaissaBotsAnalysisExploration?.leave?.();
        root.removeEventListener('caissa:bots-review-ply-change', update);
        mounted.ui.head.remove(); mounted.ui.body.remove(); mounted.ui.foot.remove();
        root.document.body.classList.remove('caissa-bots-guided-review-active'); mounted = null;
        return result(true, 'accepted', 'BOTS_GUIDED_REVIEW_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted, phase: mounted?.phase || null,
            currentMoveIndex: mounted?.analyze?.currentMoveIndex ?? null,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex', analysisResultsOwner: 'AnalyzeSection.analysisResults',
            moveHistoryOwner: 'AnalyzeSection loaded handoff', entryReviewPly: mounted?.entryReviewPly ?? null,
            mentorActive: mounted?.mentorActive === true, mentorStudyRequested,
            exploration: root.CaissaBotsAnalysisExploration?.getSnapshot?.() || null,
            reviewMoments: mounted ? findReviewMoments(mounted.analyze) : [] });
    }

    root.CaissaBotsGuidedReviewPresentation = freeze({ schemaVersion: SCHEMA_VERSION,
        reviewWorthyClassifications: REVIEW_WORTHY, findReviewMoments, findNextReviewMoment,
        createGuidedModel, presentationAnnotation, requestMentorStudy, cancelMentorStudyRequest,
        hasMentorStudyRequest: () => mentorStudyRequested, enterMentorStudy, enter, unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
