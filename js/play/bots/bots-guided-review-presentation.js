(function installBotsGuidedReviewPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.6.0';
    const REVIEW_WORTHY = Object.freeze(['Inaccuracy', 'Mistake', 'Blunder']);
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
        return root.CaissaAnalyzeReviewPolicy?.presentationSymbol?.(item.quality)
            || (typeof item.annotation === 'string' && item.annotation !== '-' ? item.annotation : '');
    };
    const isGamesProduct = options => options?.product === 'games';
    const panelFor = product => product === 'games' ? root.CaissaGamesPanelInstance : root.CaissaBotsPanelInstance;

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
        const sourceSection = element('section', 'caissa-bots-exploration__line');
        const sourceTitle = element('h3', 'caissa-bots-exploration__line-title'); sourceTitle.textContent = 'Game moves (study)';
        const sourceNotation = element('div', 'caissa-bots-exploration__notation', {
            'data-bots-exploration-source': '', 'aria-label': 'Read-only completed game notation' });
        sourceSection.append(sourceTitle, sourceNotation);
        const variationSection = element('section', 'caissa-bots-exploration__line', {
            'data-bots-exploration-variation-section': '' });
        const variationTitle = element('h3', 'caissa-bots-exploration__line-title'); variationTitle.textContent = 'Analysis variation';
        const notation = element('div', 'caissa-bots-exploration__notation', { 'data-bots-exploration-notation': '',
            'aria-label': 'Temporary exploration notation', 'aria-live': 'polite' });
        variationSection.append(variationTitle, notation); body.append(sourceSection, variationSection);

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
        return { head, evaluation, pv, body, sourceNotation, variationSection, notation,
            foot, navigation, navButtons, back, engine };
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
        const source = mounted?.product === 'games' ? 'games-guided-review-ply' : 'bots-guided-review-ply';
        if (Number.isFinite(mate) && mate !== 0)
            return rail.setMate?.(mate, { source })?.ok === true;
        if (Number.isFinite(evaluation))
            return rail.setEvaluation?.(evaluation * 100, { source })?.ok === true;
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

    function captureReviewState() {
        if (!mounted) return null;
        const projection = mounted.analyze.getCoachReviewProjection?.();
        const rail = root.CaissaEvaluationRailInstance?.getSnapshot?.();
        const board = root.App?.boardAdapter?.getSnapshot?.();
        const model = createGuidedModel({ analyze: mounted.analyze, handoff: mounted.handoff });
        return freeze({ currentMoveIndex: mounted.analyze.currentMoveIndex, fen: projection?.fen || null,
            evaluationRail: freeze({ scoreCp: rail?.scoreCp ?? null, mate: rail?.mate ?? null,
                whiteShare: rail?.whiteShare ?? null, accessibleLabel: rail?.accessibleLabel ?? null }),
            lastMove: board?.lastMove ? freeze({ ...board.lastMove }) : null,
            selectedNotation: model.index, classification: model.quality,
            caissaExplanation: model.message });
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
        syncMentorContext();
    }

    function mentorEvidence() {
        const state = root.CaissaBotsAnalysisExploration?.getSnapshot?.();
        const sourcePly = state?.mode === 'source' ? state.sourceCursor - 1 : (state?.branchSourceCursor ?? 0) - 1;
        return { state, result: sourcePly >= 0 ? mounted?.analyze?.analysisResults?.[sourcePly] || null : null,
            analysis: mounted?.explorationAnalysis || null };
    }

    function syncMentorContext() {
        if (!mounted?.mentorSharing || mounted.phase !== 'analysis-exploration') return false;
        const shell = root.CaissaMentorFloatingShell; const { state, result: evidence, analysis } = mentorEvidence();
        if (!shell?.setContext || !state?.currentFen) return false;
        const sourceLine = root.CaissaBotsAnalysisExploration?.getSourceLine?.() || [];
        const temporaryLine = root.CaissaBotsAnalysisExploration?.getLine?.() || [];
        const current = state.mode === 'temporary'
            ? temporaryLine.find(move => move.current) : sourceLine.find(move => move.current);
        return shell.setContext({ source: 'bots-analysis-study', fen: state.currentFen, mode: state.mode,
            san: current?.san || null, classification: state.mode === 'source'
                ? (evidence?.isBestMove === true ? 'Best' : evidence?.quality || null) : null,
            evaluation: analysis?.evaluation, mate: analysis?.mate, pv: analysis?.pv || [] });
    }

    function stopMentorSharing() {
        if (!mounted?.mentorSharing) return;
        mounted.mentorSharing = false; root.CaissaMentorFloatingShell?.clearContext?.();
    }

    function handleMentorContextCleared(event) {
        if (event?.detail?.source === 'bots-analysis-study' && mounted) mounted.mentorSharing = false;
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
        mounted.entryReviewState = captureReviewState();
        mounted.phase = 'analysis-exploration'; mounted.entryReviewPly = anchor;
        mounted.mentorSharing = options.mentor === true;
        const shown = mounted.panel.present({ phase: 'analysis-exploration',
            head: mounted.exploration.head, content: mounted.exploration.body, foot: mounted.exploration.foot });
        if (!shown?.ok) { mounted.phase = 'guided-review'; return; }
        root.document.querySelectorAll('#chessboard [data-caissa-coach-move-annotation]').forEach(node => node.remove());
        const entered = root.CaissaBotsAnalysisExploration?.enter?.({ fen: projection.fen,
            sourceInitialFen: mounted.analyze.loadedGame?.initialFen || new root.Chess().fen(),
            sourceMoves: mounted.analyze.getLoadedMoves?.({ verbose: true }) || [], sourceCursor: anchor + 1,
            analyze: mounted.analyze,
            entryReviewPly: anchor, onPosition: renderExplorationPosition, onAnalysis: renderExplorationAnalysis,
            temporaryOwner: mounted.product === 'games'
                ? 'CaissaGamesAnalysisExploration' : 'CaissaBotsAnalysisExploration',
            bodyClass: mounted.product === 'games'
                ? 'caissa-games-analysis-exploration-active' : 'caissa-bots-analysis-exploration-active',
            teardownReason: `${mounted.product}-analysis-exploration-exit`,
            restore: () => mounted?.analyze?.jumpToMove?.(anchor) });
        if (!entered?.ok) { mounted.phase = 'guided-review';
            mounted.panel.present({ phase: 'guided-review', head: mounted.ui.head,
                content: mounted.ui.body, foot: mounted.ui.foot }); update(); return; }
        syncExplorationEngine(); renderExplorationPosition();
        if (mounted.mentorSharing && syncMentorContext()) root.CaissaMentorFloatingShell?.open?.();
        else mounted.exploration.back?.focus?.();
    }

    function leaveExploration() {
        if (!mounted || mounted.phase !== 'analysis-exploration') return;
        const anchor = mounted.entryReviewPly; stopMentorSharing(); root.CaissaBotsAnalysisExploration?.leave?.();
        mounted.phase = 'guided-review'; mounted.entryReviewPly = null;
        mounted.panel.present({ phase: 'guided-review', head: mounted.ui.head,
            content: mounted.ui.body, foot: mounted.ui.foot });
        mounted.analyze.jumpToMove(anchor); update();
        const restored = captureReviewState();
        mounted.lastRestoration = freeze({ before: mounted.entryReviewState, after: restored,
            exact: JSON.stringify(mounted.entryReviewState) === JSON.stringify(restored) });
        mounted.entryReviewState = null; mounted.ui.analysis.focus?.();
    }

    function enter(options = {}) {
        if (mounted) return result(true, 'unchanged', 'ALREADY_MOUNTED', getSnapshot());
        const product = isGamesProduct(options) ? 'games' : 'bots';
        const contextValid = product === 'games'
            ? root.CaissaGamesReviewContext?.isGamesReview?.(options.context) === true
            : root.CaissaBotsReviewContext?.isBotsReview?.(options.context) === true;
        const panel = panelFor(product);
        if (!contextValid || options.analyze?.analysisPhase !== 'complete' || !panel?.present)
            return result(false, 'rejected', `INVALID_${product.toUpperCase()}_GUIDED_REVIEW_EVIDENCE`);
        const ui = createStructure(); const exploration = createExplorationStructure();
        const shown = panel.present({ phase: 'guided-review', head: ui.head,
            content: ui.body, foot: ui.foot });
        if (!shown?.ok) return result(false, 'rejected', `${product.toUpperCase()}_SHELL_UNAVAILABLE`);
        mounted = { context: options.context, handoff: options.handoff, analyze: options.analyze, ui, exploration,
            model: null, explanationExpanded: false, pgn: options.handoff?.payload?.pgn || null,
            history: freeze([...(options.analyze.getLoadedMoves?.() || [])]), phase: 'guided-review', entryReviewPly: null,
            mentorSharing: false, explorationAnalysis: null, product, panel,
            entryReviewState: null, lastRestoration: null };
        root.document.body.classList.add(`caissa-${product}-guided-review-active`);
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
        exploration.back.addEventListener('click', leaveExploration);
        exploration.engine.addEventListener('click', () => {
            const enabled = root.CaissaBotsAnalysisExploration?.getSnapshot?.().engineEnabled === true;
            root.CaissaBotsAnalysisExploration?.setEngineEnabled?.(!enabled); syncExplorationEngine();
        });
        root.addEventListener(`caissa:${product}-review-ply-change`, update);
        root.addEventListener('caissa:mentor-context-cleared', handleMentorContextCleared);
        options.analyze.jumpToMove(0); update();
        if (options.mentorStudy === true) enterExploration({ mentor: true }); else ui.explain.focus?.();
        return result(true, 'accepted', `${product.toUpperCase()}_GUIDED_REVIEW_MOUNTED`, getSnapshot());
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
        const product = mounted.product;
        stopMentorSharing();
        if (mounted.phase === 'analysis-exploration') root.CaissaBotsAnalysisExploration?.leave?.();
        root.removeEventListener(`caissa:${product}-review-ply-change`, update);
        root.removeEventListener('caissa:mentor-context-cleared', handleMentorContextCleared);
        mounted.ui.head.remove(); mounted.ui.body.remove(); mounted.ui.foot.remove();
        root.document.body.classList.remove(`caissa-${product}-guided-review-active`); mounted = null;
        return result(true, 'accepted', `${product.toUpperCase()}_GUIDED_REVIEW_UNMOUNTED`);
    }

    function getSnapshot() {
        return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted, phase: mounted?.phase || null,
            product: mounted?.product || null,
            currentMoveIndex: mounted?.analyze?.currentMoveIndex ?? null,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex', analysisResultsOwner: 'AnalyzeSection.analysisResults',
            moveHistoryOwner: 'AnalyzeSection loaded handoff', entryReviewPly: mounted?.entryReviewPly ?? null,
            entryReviewState: mounted?.entryReviewState || null,
            lastRestoration: mounted?.lastRestoration || null,
            mentorActive: mounted?.mentorSharing === true, mentorStudyRequested,
            exploration: root.CaissaBotsAnalysisExploration?.getSnapshot?.() || null,
            reviewMoments: mounted ? findReviewMoments(mounted.analyze) : [] });
    }

    root.CaissaBotsGuidedReviewPresentation = freeze({ schemaVersion: SCHEMA_VERSION,
        reviewWorthyClassifications: REVIEW_WORTHY, findReviewMoments, findNextReviewMoment,
        createGuidedModel, presentationAnnotation, requestMentorStudy, cancelMentorStudyRequest,
        hasMentorStudyRequest: () => mentorStudyRequested, enterMentorStudy, enter, unmount, getSnapshot });
    root.CaissaGamesGuidedReviewPresentation = freeze({ schemaVersion: SCHEMA_VERSION,
        reviewWorthyClassifications: REVIEW_WORTHY, findReviewMoments, findNextReviewMoment,
        createGuidedModel, presentationAnnotation,
        enter: options => enter({ ...options, product: 'games' }), unmount, getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
