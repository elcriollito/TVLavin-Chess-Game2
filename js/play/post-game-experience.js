(function installPostGameExperience(global) {
    'use strict';

    const SCHEMA_VERSION = '1.8.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.8.0';
    const STATUSES = Object.freeze(['idle', 'ready', 'visible', 'busy', 'error', 'disposed']);
    const ACTIONS = Object.freeze([
        'rematch', 'analyze', 'copy-pgn', 'download-pgn', 'save-game', 'new-game',
        'mentor-review', 'guided-replay', 'mentor-summary'
    ]);
    const RESULT_TYPES = Object.freeze(['white-win', 'black-win', 'draw', 'aborted', 'unknown']);
    const REASONS = Object.freeze({
        MOUNTED: 'MOUNTED', ALREADY_MOUNTED: 'ALREADY_MOUNTED', HYDRATED: 'HYDRATED',
        SHOWN: 'SHOWN', HIDDEN: 'HIDDEN', INCOMPLETE: 'INCOMPLETE',
        INVALID_RECORD: 'INVALID_RECORD', INVALID_ACTION: 'INVALID_ACTION',
        ACTION_UNAVAILABLE: 'ACTION_UNAVAILABLE', ACTION_BUSY: 'ACTION_BUSY',
        REMATCH_STARTED: 'REMATCH_STARTED', NEW_GAME_STARTED: 'NEW_GAME_STARTED',
        ANALYZE_OPENED: 'ANALYZE_OPENED', PGN_COPIED: 'PGN_COPIED',
        PGN_DOWNLOADED: 'PGN_DOWNLOADED', GAME_SAVED: 'GAME_SAVED',
        MENTOR_REQUEST_CREATED: 'MENTOR_REQUEST_CREATED',
        CONSENT_REQUIRED: 'CONSENT_REQUIRED', ACTION_FAILED: 'ACTION_FAILED',
        UNMOUNTED: 'UNMOUNTED', DISPOSED: 'DISPOSED', INVALID_HOST: 'INVALID_HOST'
    });
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const MAX_PGN = 1_000_000;
    let sequence = 0;

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(item => dangerous(item, seen));
    }
    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }
    function element(tag, className, attributes = {}) {
        const node = global.document.createElement(tag);
        node.className = className;
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }
    function resultType(record) {
        if (record.status === 'aborted') return 'aborted';
        if (record.result.value === '1-0') return 'white-win';
        if (record.result.value === '0-1') return 'black-win';
        if (record.result.value === '1/2-1/2') return 'draw';
        return 'unknown';
    }
    function formatClock(value) {
        if (!Number.isFinite(value)) return 'Unavailable';
        const seconds = Math.max(0, Math.ceil(value / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function actionState(enabled, primary = false, reason = null) {
        return { enabled, primary, reason };
    }

    class PostGameExperience {
        #id = `post-game-${++sequence}`;
        #root = null; #host = null; #disposed = false; #visible = false; #busy = false;
        #status = 'idle'; #record = null; #configuration = null; #listeners = []; #analyticsContext = null; #analyticsActionSequence = null;
        #consent = 'unknown'; #saved = false; #feedback = ''; #mentorRequest = null;
        #analysisRun = null; #analysisResult = null; #criticalMomentSelection = null;
        #guidedReplaySession = null; #knowledgeMapping = null; #mentorSummary = null;
        #compatibility; #records; #persistence; #handoff; #navigation; #rail; #onVisibilityChange;
        #clipboard; #url; #Blob; #actionEpoch = 0; #pendingAction = null; #pendingPromise = null;
        #diagnostics = {
            hydrations: 0, displays: 0, duplicateCompletions: 0, actions: 0,
            rematches: 0, newGames: 0, handoffs: 0, copies: 0, downloads: 0,
            saves: 0, failures: 0, lastReasonCode: null
        };

        constructor(options = {}) {
            this.#compatibility = options.compatibility || global.CaissaPlayCompatibility;
            this.#records = options.records || global.CaissaGameRecord;
            this.#persistence = options.persistence || global.CaissaGameRecordPersistence;
            this.#handoff = options.handoff || global.CaissaAnalyzeHandoff;
            this.#navigation = options.navigation || global.CaissaNavigation;
            this.#rail = options.rail || global.CaissaEvaluationRailInstance;
            this.#onVisibilityChange = typeof options.onVisibilityChange === 'function'
                ? options.onVisibilityChange : null;
            this.#clipboard = options.clipboard || global.navigator?.clipboard;
            this.#url = options.url || global.URL;
            this.#Blob = options.Blob || global.Blob;
        }
        mount(options = {}) {
            if (this.#disposed) return this.#recordOperation(result(false, 'disposed', REASONS.DISPOSED));
            if (this.#root) return result(true, 'unchanged', REASONS.ALREADY_MOUNTED, this.getSnapshot());
            const host = options.host || options;
            if (!host?.appendChild) return this.#recordOperation(result(false, 'rejected', REASONS.INVALID_HOST));
            this.#host = host;
            this.#root = element('section', 'caissa-post-game caissa-vc caissa-vc-game-over', {
                'data-caissa-post-game': '', 'data-visual-component': 'game-over-card',
                'aria-labelledby': `${this.#id}-title`, tabindex: '-1'
            });
            this.#root.hidden = true;
            const title = element('h2', 'caissa-post-game__title', { id: `${this.#id}-title` });
            title.textContent = 'Game Over';
            const announcement = element('p', 'caissa-post-game__announcement', { 'data-post-game-result': '' });
            const summary = element('dl', 'caissa-post-game__summary', { 'data-post-game-summary': '' });
            const actions = element('div', 'caissa-post-game__actions', { 'aria-label': 'Post-game actions' });
            const definitions = [
                ['rematch', 'Rematch', true], ['analyze', 'Analyze This Game', false],
                ['copy-pgn', 'Copy PGN', false], ['download-pgn', 'Download PGN', false],
                ['save-game', 'Save Game', false], ['new-game', 'New Game', false]
            ];
            definitions.forEach(([action, label, primary]) => {
                const button = element('button',
                    `caissa-post-game__action${primary ? ' caissa-post-game__action--primary' : ''}`,
                    { type: 'button', 'data-post-game-action': action });
                button.textContent = label; actions.appendChild(button);
            });
            const consent = element('label', 'caissa-post-game__consent');
            const consentInput = element('input', '', { type: 'checkbox', 'data-post-game-consent': '' });
            const consentText = element('span', '');
            consentText.textContent = 'Allow this completed game to be stored in local game history.';
            consent.append(consentInput, consentText);
            const mentor = element('button', 'caissa-post-game__action', {
                type: 'button', disabled: '', 'aria-disabled': 'true', 'data-post-game-action': 'mentor-review'
            });
            mentor.textContent = 'Review with Mentor';
            const replay = element('button', 'caissa-post-game__action', {
                type: 'button', disabled: '', 'aria-disabled': 'true', 'data-post-game-action': 'guided-replay'
            });
            replay.textContent = 'Start Guided Replay';
            const createSummary = element('button', 'caissa-post-game__action', {
                type: 'button', disabled: '', 'aria-disabled': 'true',
                'data-post-game-action': 'mentor-summary'
            });
            createSummary.textContent = 'Create Mentor Summary';
            const mentorSummary = element('section', 'caissa-post-game__mentor-summary', {
                'aria-label': 'Mentor Summary', 'data-mentor-summary': '', tabindex: '-1'
            });
            mentorSummary.hidden = true;
            const mentorNote = element('p', 'caissa-post-game__mentor-note');
            mentorNote.textContent = 'A review request can be prepared after the game. Educational analysis is not available yet.';
            const feedback = element('p', 'caissa-post-game__feedback', { 'data-post-game-feedback': '' });
            const concepts = element('aside', 'caissa-post-game__concepts', {
                'aria-label': 'Reviewed concepts', 'data-post-game-concepts': ''
            });
            this.#root.append(title, announcement, summary, concepts, actions, consent, mentor,
                replay, createSummary, mentorSummary, mentorNote, feedback);
            host.appendChild(this.#root);
            this.#listen(this.#root, 'click', event => {
                const action = event.target?.closest?.('[data-post-game-action]')?.dataset?.postGameAction;
                if (action) this.execute(action);
            });
            this.#listen(consentInput, 'change', () => {
                const changed = this.#persistence?.setConsent?.(consentInput.checked ? 'granted' : 'denied');
                this.#consent = changed?.ok ? (consentInput.checked ? 'granted' : 'denied') : this.#consent;
                this.#render();
            });
            this.#status = 'ready';
            return this.#recordOperation(result(true, 'accepted', REASONS.MOUNTED, this.getSnapshot()));
        }
        syncFromPlay() {
            if (this.#disposed) return this.#recordOperation(result(false, 'disposed', REASONS.DISPOSED));
            const snapshot = this.#compatibility?.getSnapshot?.();
            if (!snapshot) return this.#recordOperation(result(false, 'unavailable', REASONS.INVALID_RECORD));
            global.CaissaGameLifecycle?.sync?.(snapshot,
                snapshot.game?.active === false && snapshot.game?.result ? 'GAME_COMPLETED' : 'LEGACY_STATE_SYNCED');
            const lifecycle = global.CaissaGameLifecycle?.getSnapshot?.();
            if (lifecycle?.state !== 'completed') {
                this.hide();
                return this.#recordOperation(result(false, 'unchanged', REASONS.INCOMPLETE));
            }
            let record;
            try { record = this.#records?.buildFromPlay?.(); }
            catch (_) { return this.#recordOperation(result(false, 'failed', REASONS.INVALID_RECORD)); }
            return this.hydrateFromGame({ record, snapshot });
        }
        hydrateFromGame(input = {}) {
            if (!input || typeof input !== 'object' || dangerous(input))
                return this.#recordOperation(result(false, 'rejected', REASONS.INVALID_RECORD));
            const validation = this.#records?.validate?.(input.record);
            if (!validation?.valid || !['completed', 'aborted'].includes(input.record.status)
                || input.record.result.complete !== true) {
                this.hide();
                return this.#recordOperation(result(false, 'rejected', REASONS.INVALID_RECORD));
            }
            if (this.#record?.recordId === input.record.recordId && this.#visible) {
                this.#diagnostics.duplicateCompletions += 1;
                return this.#recordOperation(result(true, 'unchanged', REASONS.HYDRATED, this.getSnapshot()));
            }
            this.#record = input.record;
            const snapshot = input.snapshot || this.#compatibility?.getSnapshot?.();
            this.#configuration = {
                mode: snapshot?.mode === 'engine' ? 'engine' : null,
                color: snapshot?.playerColor === 'white' || snapshot?.playerColor === 'black'
                    ? snapshot.playerColor : null,
                timeControl: Number.isInteger(snapshot?.clocks?.timeControlSeconds)
                    ? snapshot.clocks.timeControlSeconds : null
            };
            this.#consent = this.#persistence?.getConsent?.().value?.state || 'unknown';
            this.#saved = false; this.#feedback = ''; this.#mentorRequest = null;
            this.#actionEpoch += 1;
            global.CaissaGuidedReplayView?.unmount?.();
            this.#analysisRun = null; this.#analysisResult = null; this.#criticalMomentSelection = null;
            this.#guidedReplaySession = null; this.#knowledgeMapping = null; this.#mentorSummary = null;
            this.#diagnostics.hydrations += 1;
            const completion = input.record.status === 'aborted'
                ? global.CaissaPlayCompletionAnalytics?.observeAborted?.({ record: input.record })
                : global.CaissaPlayCompletionAnalytics?.observeCompleted?.({ record: input.record });
            this.#analyticsContext = completion?.ok ? { completionSequence: completion.completionSequence,
                ...completion.categories, qaEligible: true, productionEligible: false } : null;
            const shown = this.show();
            if (shown?.ok && this.#analyticsContext) global.CaissaPlayPostGameAnalytics?.observeShown?.(this.#analyticsContext);
            this.#rail?.setMode?.('post-game'); this.#render();
            return this.#recordOperation(result(true, 'accepted', REASONS.HYDRATED, this.getSnapshot()));
        }
        show() {
            if (!this.#root || !this.#record) return this.#recordOperation(result(false, 'rejected', REASONS.INVALID_RECORD));
            if (!this.#visible) this.#diagnostics.displays += 1;
            this.#visible = true; this.#status = 'visible'; this.#root.hidden = false;
            this.#onVisibilityChange?.(true); this.#render(); this.#root.focus?.();
            global.CaissaPlayAnnouncementManager?.announce?.('GAME_OVER', { priority: 'assertive' });
            return this.#recordOperation(result(true, 'accepted', REASONS.SHOWN, this.getSnapshot()));
        }
        hide() {
            this.#visible = false; if (this.#root) this.#root.hidden = true;
            if (!this.#disposed) this.#status = 'ready';
            this.#onVisibilityChange?.(false);
            return this.#recordOperation(result(true, 'accepted', REASONS.HIDDEN, this.getSnapshot()));
        }
        execute(action) {
            if (!ACTIONS.includes(action)) return this.#recordOperation(result(false, 'rejected', REASONS.INVALID_ACTION));
            if (this.#busy && this.#pendingAction === action && this.#pendingPromise) return this.#pendingPromise;
            if (this.#busy) return this.#recordOperation(result(false, 'rejected', REASONS.ACTION_BUSY));
            const availability = this.#actions()[action];
            if (!availability?.enabled) return this.#recordOperation(result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE));
            const observed = this.#analyticsContext && global.CaissaPlayPostGameAnalytics?.observeActionSelected?.({
                ...this.#analyticsContext, action });
            this.#analyticsActionSequence = observed?.actionSequence || null;
            this.#busy = true; this.#status = 'busy'; this.#diagnostics.actions += 1; this.#render();
            let operation;
            try {
                if (action === 'rematch' || action === 'new-game') operation = this.#start(action);
                else if (action === 'analyze') operation = this.#analyze();
                else if (action === 'copy-pgn') operation = this.#copy();
                else if (action === 'download-pgn') operation = this.#download();
                else if (action === 'save-game') operation = this.#save();
                else if (action === 'mentor-review') operation = this.#requestMentorReview();
                else if (action === 'guided-replay') operation = this.#startGuidedReplay();
                else if (action === 'mentor-summary') operation = this.#createMentorSummary();
                else operation = result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE);
            } catch (_) { operation = result(false, 'failed', REASONS.ACTION_FAILED); }
            if (operation && typeof operation.then === 'function') {
                this.#pendingAction = action;
                const pending = operation.then(value => this.#finish(value)).catch(() =>
                    this.#finish(result(false, 'failed', REASONS.ACTION_FAILED))).finally(() => {
                    if (this.#pendingPromise === pending) {
                        this.#pendingAction = null; this.#pendingPromise = null;
                    }
                });
                this.#pendingPromise = pending;
                return pending;
            }
            return this.#finish(operation);
        }
        rematch() { return this.execute('rematch'); }
        analyze() { return this.execute('analyze'); }
        copyPgn() { return this.execute('copy-pgn'); }
        downloadPgn() { return this.execute('download-pgn'); }
        saveGame() { return this.execute('save-game'); }
        startNewGame() { return this.execute('new-game'); }
        requestMentorReview() { return this.execute('mentor-review'); }
        createMentorSummary() { return this.execute('mentor-summary'); }
        prepareTechnicalAnalysis(options = {}) {
            if (!this.#mentorRequest?.requestId)
                return this.#recordOperation(result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE));
            const prepared = global.CaissaEducationalAnalysisPipeline?.prepare?.(
                this.#mentorRequest.requestId, options);
            if (!prepared?.ok) return this.#recordOperation(result(false,
                prepared?.status || 'failed', prepared?.reasonCode || REASONS.ACTION_FAILED));
            this.#analysisRun = prepared.value;
            global.CaissaPlayMentorEngagementAnalytics?.observeReviewReady?.(
                this.#mentorAnalyticsContext());
            this.#feedback = 'Technical analysis is prepared to run. Mentor educational review is not available yet.';
            this.#render();
            return this.#recordOperation(result(true, 'prepared', 'TECHNICAL_ANALYSIS_PREPARED', prepared.value));
        }
        selectCriticalMoments(analysisResult = null) {
            if (!global.CaissaCriticalMoments?.select && global.CaissaPlayLazyLoader?.load) {
                return this.#loadThen('mentor-critical-moments',
                    () => !!global.CaissaCriticalMoments?.select,
                    () => this.selectCriticalMoments(analysisResult),
                    'Loading critical-moment review…');
            }
            if (!this.#mentorRequest?.requestId)
                return this.#recordOperation(result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE));
            const technical = analysisResult || (this.#analysisRun?.runId
                ? global.CaissaEducationalAnalysisPipeline?.getResult?.(this.#analysisRun.runId) : null);
            const selected = global.CaissaCriticalMoments?.select?.(technical, this.#mentorRequest);
            if (!selected?.ok) return this.#recordOperation(result(false, 'unavailable',
                selected?.reasonCode || REASONS.ACTION_UNAVAILABLE));
            this.#criticalMomentSelection = selected.value;
            global.CaissaPlayMentorEngagementAnalytics?.observeCriticalMomentsOpened?.(
                this.#mentorAnalyticsContext());
            this.#analysisResult = technical;
            this.#feedback = `${selected.value.selectedCount} technical moment${selected.value.selectedCount === 1
                ? '' : 's'} selected. Mentor explanations and guided replay are not available yet.`;
            this.#render();
            return this.#recordOperation(result(true, 'selected', 'CRITICAL_MOMENTS_SELECTED', selected.value));
        }
        prepareGuidedReplay(analysisResult = null, selection = null, options = {}) {
            if ((!global.CaissaMentorGuidedReplay?.prepare || !global.CaissaEducationalConceptMapper?.map)
                && global.CaissaPlayLazyLoader?.load) {
                return this.#loadThen('mentor-knowledge',
                    () => !!global.CaissaMentorGuidedReplay?.prepare
                        && !!global.CaissaEducationalConceptMapper?.map,
                    () => this.prepareGuidedReplay(analysisResult, selection, options),
                    'Loading Guided Replay and learning concepts…');
            }
            const technical = analysisResult || (this.#analysisRun?.runId
                ? global.CaissaEducationalAnalysisPipeline?.getResult?.(this.#analysisRun.runId) : null);
            const moments = selection || this.#criticalMomentSelection;
            if (!this.#mentorRequest || !technical || !moments || !this.#record)
                return this.#recordOperation(result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE));
            const prepared = global.CaissaMentorGuidedReplay?.prepare?.({
                request: this.#mentorRequest, analysisResult: technical,
                selection: moments, source: this.#record,
                ChessFactory: options.ChessFactory
            });
            if (!prepared?.ok) return this.#recordOperation(result(false,
                prepared?.status || 'failed', prepared?.reasonCode || REASONS.ACTION_FAILED));
            this.#guidedReplaySession = prepared.value;
            const evidence = moments.selectedMoments.map(moment =>
                global.CaissaConceptEvidence?.fromCriticalMoment?.(moment, {
                    requestId: this.#mentorRequest.requestId
                })).filter(created => created?.ok).map(created => created.value);
            const mappingRequest = global.CaissaKnowledgeMappingContracts?.createRequest?.({
                mappingRequestId: `knowledge:${this.#mentorRequest.requestId}:${moments.selectionId}`,
                mentorRequestId: this.#mentorRequest.requestId,
                analysisResultId: technical.runId, selectionId: moments.selectionId,
                replaySessionId: prepared.value.sessionId,
                knowledgeReleaseId: this.#mentorRequest.knowledge.releaseId,
                evidence, requestedConceptLimit: 3
            });
            const mapped = mappingRequest?.ok
                ? global.CaissaEducationalConceptMapper?.map?.(mappingRequest) : null;
            if (mapped?.ok) {
                this.#knowledgeMapping = mapped.value;
                global.CaissaKnowledgeMappingRegistry?.register?.(mapped.value);
                global.CaissaMentorGuidedReplay?.enrichKnowledge?.(prepared.value.sessionId, mapped.value);
            }
            this.#feedback = `${prepared.value.totalSteps} guided replay step${
                prepared.value.totalSteps === 1 ? '' : 's'} prepared.`;
            this.#render();
            return this.#recordOperation(result(true, 'prepared', 'GUIDED_REPLAY_PREPARED', prepared.value));
        }
        getSnapshot() {
            const record = this.#record;
            const mismatch = record?.notation?.hasResultMismatch === true;
            return deepFreeze({
                schemaVersion: SNAPSHOT_SCHEMA_VERSION, experienceId: this.#id,
                mounted: !!this.#root, visible: this.#visible, disposed: this.#disposed, status: this.#status,
                gameRecordId: record?.recordId || null,
                result: record ? {
                    type: resultType(record), value: record.result.value, winner: record.result.winner,
                    termination: record.result.termination, complete: record.result.complete
                } : { type: 'unknown', value: null, winner: null, termination: null, complete: false },
                player: { color: record?.player?.color || null },
                opponent: {
                    type: record?.opponent?.type || null,
                    name: record?.opponent?.name || global.CaissaCoachRegistry?.get?.(record?.opponent?.id)?.name
                        || global.CaissaBotRegistry?.get?.(record?.opponent?.id)?.name
                        || (record?.opponent?.type === 'engine' ? 'CAISSA Engine' : null),
                    strengthLabel: global.CaissaBotRegistry?.get?.(record?.opponent?.id)?.difficultyBand
                        || (record?.opponent?.type === 'engine' ? 'Full Power' : null)
                },
                timing: {
                    durationMs: record?.timing?.durationMs ?? null,
                    finalClocks: record ? { ...record.timing.finalClocks } : null
                },
                moves: { count: record?.moves?.count ?? null },
                notation: {
                    pgnAvailable: typeof record?.notation?.pgn === 'string' && record.notation.pgn.length > 0,
                    resultMismatch: mismatch
                },
                actions: this.#actions(),
                mentor: {
                    selectedMentorId: this.#resolveMentor()?.mentor?.id || null,
                    selectionSource: this.#resolveMentor()?.source || 'unavailable',
                    request: this.#mentorRequest, analysisRun: this.#analysisRun,
                    criticalMomentSelection: this.#criticalMomentSelection,
                    guidedReplaySession: this.#guidedReplaySession?.sessionId
                        ? global.CaissaMentorGuidedReplay?.getSnapshot?.(
                            this.#guidedReplaySession.sessionId) || this.#guidedReplaySession
                        : null,
                    knowledgeMapping: this.#knowledgeMapping,
                    summary: this.#mentorSummary
                },
                persistence: { consent: this.#consent, saved: this.#saved },
                listenerCount: this.#listeners.length, diagnostics: { ...this.#diagnostics }
            });
        }
        inspect() { return this.getSnapshot(); }
        unmount() {
            this.#removeListeners(); this.#root?.remove(); this.#root = null; this.#host = null;
            return result(true, 'accepted', REASONS.UNMOUNTED);
        }
        dispose() {
            if (this.#disposed) return result(true, 'unchanged', REASONS.DISPOSED);
            this.#actionEpoch += 1;
            global.CaissaGuidedReplayView?.unmount?.();
            this.hide(); this.unmount(); this.#disposed = true; this.#status = 'disposed';
            return this.#recordOperation(result(true, 'accepted', REASONS.DISPOSED));
        }
        #actions() {
            const valid = !!this.#record && this.#record.result.complete === true;
            const pgn = valid && typeof this.#record.notation.pgn === 'string'
                && this.#record.notation.pgn.length > 0 && this.#record.notation.pgn.length <= MAX_PGN;
            const config = this.#configuration?.mode === 'engine'
                && ['white', 'black'].includes(this.#configuration.color)
                && Number.isInteger(this.#configuration.timeControl);
            const replaySession = this.#guidedReplaySession?.sessionId
                ? global.CaissaMentorGuidedReplay?.getSnapshot?.(this.#guidedReplaySession.sessionId)
                : this.#guidedReplaySession;
            return {
                rematch: actionState(valid && config, true, config ? null : 'Configuration unavailable'),
                analyze: actionState(valid && pgn && typeof this.#navigation?.navigateToSection === 'function'),
                'copy-pgn': actionState(pgn),
                'download-pgn': actionState(pgn && !!this.#Blob && !!this.#url?.createObjectURL),
                'save-game': actionState(valid && this.#consent === 'granted' && !this.#saved),
                'new-game': actionState(valid && config),
                'mentor-review': actionState(this.#mentorReadiness().ready
                    || (valid && !!global.CaissaPlayLazyLoader), false,
                    valid ? null : 'Requirements unavailable'),
                'guided-replay': actionState(!!replaySession
                    && ['prepared', 'active', 'awaiting-attempt', 'attempted', 'revealed']
                        .includes(replaySession.status),
                    false, replaySession ? null : 'Prepare selected moments first'),
                'mentor-summary': actionState(!!this.#mentorRequest && !!this.#analysisResult
                    && !!this.#criticalMomentSelection, false,
                    this.#criticalMomentSelection ? null : 'Select reviewed moments first')
            };
        }
        #resolveMentor() {
            return global.CaissaMentorSelectionResolver?.resolve?.({
                academyMentorId: global.CaissaAcademySection?.getMentorSelection?.().mentorId
            }) || null;
        }
        #mentorSource() {
            if (this.#record?.opponent?.type === 'coach') return 'coach';
            if (global.CaissaBotRegistry?.get?.(this.#record?.opponent?.id)) return 'bot';
            return 'games';
        }
        #mentorReadiness() {
            const selection = this.#resolveMentor();
            return global.CaissaMentorReviewReadiness?.evaluate?.({
                mentorId: selection?.mentor?.id, source: this.#mentorSource(), record: this.#record,
                knowledgeReleaseId: global.CaissaMentorCapabilities?.releaseId
            }) || { ready: false, missingRequirements: ['mentor-foundation'] };
        }
        #requestMentorReview() {
            if ((!global.CaissaMentorFoundation?.createRequest
                || !global.CaissaEducationalAnalysisPipeline?.prepare) && global.CaissaPlayLazyLoader?.load) {
                return this.#loadThen('mentor-analysis',
                    () => !!global.CaissaMentorFoundation?.createRequest
                        && !!global.CaissaEducationalAnalysisPipeline?.prepare,
                    () => this.#requestMentorReview(), 'Loading Mentor review…');
            }
            const selection = this.#resolveMentor();
            const created = global.CaissaMentorFoundation?.createRequest?.({
                mentorId: selection?.mentor?.id, source: this.#mentorSource(), record: this.#record,
                playerLevel: 'novice', focus: 'general', analysisDepth: 'standard',
                criticalMomentLimit: 3, explanationStyle: 'balanced', requestOrigin: 'post-game',
                knowledgeReleaseId: global.CaissaMentorCapabilities?.releaseId
            });
            if (!created?.ok) {
                global.CaissaPlayMentorEngagementAnalytics?.observeReviewFailed?.({
                    ...this.#mentorAnalyticsContext(), failureReason: 'dependency-unavailable'
                });
                return result(false, created?.status || 'unavailable',
                    created?.reasonCode || REASONS.ACTION_UNAVAILABLE);
            }
            this.#mentorRequest = created.value;
            global.CaissaPlayMentorEngagementAnalytics?.observeReviewRequested?.(
                this.#mentorAnalyticsContext());
            return result(true, 'accepted', REASONS.MENTOR_REQUEST_CREATED, created.value);
        }
        #startGuidedReplay() {
            if ((!global.CaissaMentorGuidedReplay?.start || !global.CaissaGuidedReplayView?.mount)
                && global.CaissaPlayLazyLoader?.load) {
                return this.#loadThen('mentor-guided-replay',
                    () => !!global.CaissaMentorGuidedReplay?.start
                        && !!global.CaissaGuidedReplayView?.mount,
                    () => this.#startGuidedReplay(), 'Loading Guided Replay…');
            }
            const current = global.CaissaMentorGuidedReplay?.getSnapshot?.(
                this.#guidedReplaySession?.sessionId);
            const started = current?.status === 'prepared'
                ? global.CaissaMentorGuidedReplay?.start?.(current.sessionId)
                : { ok: !!current, status: current?.status, value: current };
            if (!started?.ok) return result(false, started?.status || 'failed',
                started?.reasonCode || REASONS.ACTION_FAILED);
            this.#guidedReplaySession = started.value;
            const mounted = global.CaissaGuidedReplayView?.getSnapshot?.().mounted
                ? global.CaissaGuidedReplayView.show()
                : global.CaissaGuidedReplayView?.mount?.(this.#root, started.value.sessionId,
                    this.#mentorAnalyticsContext());
            if (!mounted?.ok) return result(false, 'failed', mounted?.reasonCode || REASONS.ACTION_FAILED);
            global.CaissaPlayMentorEngagementAnalytics?.observeGuidedReplayStarted?.(
                this.#mentorAnalyticsContext());
            return result(true, 'accepted', 'GUIDED_REPLAY_STARTED', started.value);
        }
        #createMentorSummary() {
            if (!global.CaissaMentorSummary?.generate && global.CaissaPlayLazyLoader?.load) {
                return this.#loadThen('mentor-summary', () => !!global.CaissaMentorSummary?.generate,
                    () => this.#createMentorSummary(), 'Loading Mentor Summary…');
            }
            global.CaissaPlayMentorEngagementAnalytics?.observeSummaryRequested?.(
                this.#mentorAnalyticsContext());
            const replay = this.#guidedReplaySession?.sessionId
                ? global.CaissaMentorGuidedReplay?.getSnapshot?.(this.#guidedReplaySession.sessionId)
                : this.#guidedReplaySession;
            const generated = global.CaissaMentorSummary?.generate?.({
                request: this.#mentorRequest, analysisResult: this.#analysisResult,
                selection: this.#criticalMomentSelection, replaySession: replay || null,
                mappingResult: this.#knowledgeMapping || null
            }, {
                mentorName: this.#resolveMentor()?.mentor?.name || null,
                style: this.#mentorRequest?.review?.explanationStyle || 'balanced'
            });
            if (!generated?.ok) {
                global.CaissaPlayMentorEngagementAnalytics?.observeSummaryFailed?.({
                    ...this.#mentorAnalyticsContext(), failureReason: 'summary-unavailable'
                });
                return result(false, 'unavailable', generated?.reasonCode || REASONS.ACTION_UNAVAILABLE);
            }
            this.#mentorSummary = generated.value;
            global.CaissaPlayMentorEngagementAnalytics?.observeSummaryReady?.(
                this.#mentorAnalyticsContext());
            return result(true, 'accepted', 'MENTOR_SUMMARY_CREATED', generated.value);
        }
        #mentorAnalyticsContext() {
            return { completionSequence: this.#analyticsContext?.completionSequence || 0 };
        }
        #start(action) {
            const start = () => this.#compatibility.execute('startNewGame', { ...this.#configuration });
            const opponent = this.#record?.opponent;
            const mode = opponent?.type === 'coach' ? 'coach'
                : (global.CaissaBotSession?.getSnapshot?.()?.activeBotId
                    || (opponent?.id && global.CaissaBotRegistry?.get?.(opponent.id))) ? 'bots' : 'games';
            const startWithWorker = () => {
                if (mode === 'bots' && global.CaissaPlayV2BotWorkerReadiness) {
                    return global.CaissaPlayV2BotWorkerReadiness.begin({
                        color: this.#configuration.color, timeControl: this.#configuration.timeControl
                    }).then(prepared => {
                        if (!prepared.ok) return prepared;
                        const started = start();
                        if (started?.ok) global.CaissaPlayV2BotWorkerReadiness?.markPlaying?.();
                        return started;
                    });
                }
                return start();
            };
            const started = global.CaissaPlayGameStartAnalytics?.observePanelStart?.({ mode,
                startSource: action === 'rematch' ? 'rematch' : 'new-game',
                timeControlSeconds: this.#configuration.timeControl, color: this.#configuration.color,
                opponentType: mode === 'coach' ? 'coach-engine' : mode === 'bots' ? 'bot-catalog' : 'engine',
                assistanceCategory: mode === 'coach' ? 'coach-assisted' : 'engine-opponent', qaEligible: true,
                productionEligible: true, actionKey: `post-game-${action}` }, startWithWorker) ?? startWithWorker();
            if (started && typeof started.then === 'function') return started.then(value => {
                if (!value?.ok) return result(false, value?.status || 'failed', REASONS.ACTION_FAILED);
                if (action === 'rematch') this.#diagnostics.rematches += 1;
                else this.#diagnostics.newGames += 1;
                this.hide(); this.#rail?.reset?.();
                return result(true, 'accepted', action === 'rematch' ? REASONS.REMATCH_STARTED : REASONS.NEW_GAME_STARTED);
            });
            if (!started?.ok) return result(false, started?.status || 'failed', REASONS.ACTION_FAILED);
            if (action === 'rematch') this.#diagnostics.rematches += 1;
            else this.#diagnostics.newGames += 1;
            this.hide(); this.#rail?.reset?.();
            return result(true, 'accepted', action === 'rematch' ? REASONS.REMATCH_STARTED : REASONS.NEW_GAME_STARTED);
        }
        #analyze() {
            if (!this.#handoff?.createFromCompletedPlayRecord) return result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE);
            if (!global.AnalyzeSection?.onEnter && global.CaissaPlayLazyLoader?.load) {
                return this.#loadThen('analyze-deep', () => !!global.AnalyzeSection?.onEnter,
                    () => this.#analyze(), 'Loading Analyze…', false);
            }
            const handoff = this.#handoff.createFromCompletedPlayRecord(this.#record);
            if (!handoff?.ok) return result(false, 'failed', REASONS.ACTION_FAILED);
            const navigated = this.#navigation.navigateToSection('analyze', { handoffToken: handoff.value.token });
            if (navigated === false) return result(false, 'failed', REASONS.ACTION_FAILED);
            this.#diagnostics.handoffs += 1;
            return result(true, 'accepted', REASONS.ANALYZE_OPENED);
        }
        #loadThen(resourceId, readiness, resume, message, qa = true) {
            const loader = global.CaissaPlayLazyLoader;
            if (!loader?.load) return result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE);
            const epoch = this.#actionEpoch;
            const recordId = this.#record?.recordId;
            this.#feedback = message; this.#render();
            return loader.load(resourceId, { qa, retry: true }).then(() => {
                if (this.#disposed || epoch !== this.#actionEpoch
                    || recordId !== this.#record?.recordId || !this.#visible) {
                    return result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE);
                }
                if (!readiness()) return result(false, 'failed', REASONS.ACTION_FAILED);
                return resume();
            });
        }
        async #copy() {
            if (!this.#clipboard?.writeText) return result(false, 'unavailable', REASONS.ACTION_UNAVAILABLE);
            await this.#clipboard.writeText(this.#record.notation.pgn);
            this.#diagnostics.copies += 1;
            return result(true, 'accepted', REASONS.PGN_COPIED);
        }
        #download() {
            const blob = new this.#Blob([this.#record.notation.pgn], { type: 'application/x-chess-pgn' });
            const objectUrl = this.#url.createObjectURL(blob);
            const anchor = element('a', '', {
                href: objectUrl, download: `caissa-game-${this.#record.recordId.replace(/[^a-z0-9._-]/gi, '_')}.pgn`
            });
            this.#root.appendChild(anchor); anchor.click(); anchor.remove(); this.#url.revokeObjectURL(objectUrl);
            this.#diagnostics.downloads += 1;
            return result(true, 'accepted', REASONS.PGN_DOWNLOADED);
        }
        #save() {
            const saved = this.#persistence.saveCompleted(this.#record);
            if (!saved?.ok) return result(false, saved?.status || 'failed',
                saved?.status === 'consent-required' ? REASONS.CONSENT_REQUIRED : REASONS.ACTION_FAILED);
            this.#saved = true; this.#diagnostics.saves += 1;
            return result(true, 'accepted', REASONS.GAME_SAVED);
        }
        #finish(operation) {
            if (this.#analyticsActionSequence) {
                const context = { actionSequence: this.#analyticsActionSequence };
                if (operation?.ok) global.CaissaPlayPostGameAnalytics?.observeActionSucceeded?.(context);
                else if (operation?.status === 'unavailable' || operation?.status === 'rejected')
                    global.CaissaPlayPostGameAnalytics?.observeActionBlocked?.({ ...context,
                        failureReason: this.#actionFailureReason(this.#pendingAction) });
                else global.CaissaPlayPostGameAnalytics?.observeActionFailed?.({ ...context,
                    failureReason: this.#actionFailureReason(this.#pendingAction) });
                this.#analyticsActionSequence = null;
            }
            this.#busy = false; this.#status = this.#visible ? 'visible' : 'ready';
            if (!operation?.ok) this.#diagnostics.failures += 1;
            this.#feedback = operation?.ok ? {
                REMATCH_STARTED: 'Rematch started.', NEW_GAME_STARTED: 'New game started.',
                ANALYZE_OPENED: 'Opening Analyze.', PGN_COPIED: 'PGN copied.',
                PGN_DOWNLOADED: 'PGN downloaded.', GAME_SAVED: 'Game saved locally.',
                MENTOR_REQUEST_CREATED: 'Mentor review request prepared. Educational analysis is not available yet.',
                GUIDED_REPLAY_STARTED: 'Guided Replay started. The engine reference stays hidden until your attempt.'
                ,MENTOR_SUMMARY_CREATED: 'Mentor Summary created from the reviewed evidence.'
            }[operation.reasonCode] || '' : operation?.reasonCode === REASONS.CONSENT_REQUIRED
                ? 'Enable local game history before saving.' : 'That action is unavailable.';
            this.#render();
            if (operation?.reasonCode === 'MENTOR_SUMMARY_CREATED')
                this.#root?.querySelector('[data-mentor-summary]')?.focus?.();
            if (operation?.reasonCode === 'MENTOR_SUMMARY_CREATED')
                global.CaissaPlayAnnouncementManager?.announce?.('MENTOR_SUMMARY_READY');
            if (operation?.reasonCode === 'GUIDED_REPLAY_STARTED')
                global.CaissaPlayAnnouncementManager?.announce?.('REPLAY_STARTED');
            return this.#recordOperation(operation || result(false, 'failed', REASONS.ACTION_FAILED));
        }
        #actionFailureReason(action) {
            return ({ analyze: 'analyze-unavailable', 'copy-pgn': 'clipboard-unavailable',
                'download-pgn': 'download-unavailable', 'mentor-review': 'mentor-unavailable',
                'guided-replay': 'replay-unavailable', 'mentor-summary': 'summary-unavailable' })[action]
                || 'dependency-unavailable';
        }
        #render() {
            if (!this.#root) return;
            const record = this.#record;
            const announcement = this.#root.querySelector('[data-post-game-result]');
            const summary = this.#root.querySelector('[data-post-game-summary]');
            if (record) {
                const type = resultType(record);
                announcement.textContent = type === 'draw' ? 'Draw.'
                    : record.result.winner ? `${record.result.winner === 'white' ? 'White' : 'Black'} wins.`
                    : type === 'aborted' ? 'Game aborted.' : 'Game complete.';
                const rows = [
                    ['Result', record.result.value || 'Unknown'],
                    ['Termination', record.result.termination ? record.result.termination.replace(/-/g, ' ') : 'Unknown'],
                    ['Played as', record.player.color || 'Unknown'],
                    ['Opponent', record.opponent.type === 'coach'
                        ? `${global.CaissaCoachRegistry?.get?.(record.opponent.id)?.name || 'CAISSA Coach'} · session coaching`
                        : record.opponent.type === 'engine'
                        ? `${global.CaissaBotRegistry?.get?.(record.opponent.id)?.name || 'CAISSA Engine'} · ${
                            global.CaissaBotRegistry?.get?.(record.opponent.id)?.difficultyBand || 'Full Power'}`
                        : 'Unknown'],
                    ['Moves', String(record.moves.count)],
                    ['White clock', formatClock(record.timing.finalClocks.whiteMilliseconds)],
                    ['Black clock', formatClock(record.timing.finalClocks.blackMilliseconds)]
                ];
                if (record.opponent.type === 'coach') {
                    const coachSummary = global.CaissaCoachSession?.getSummary?.();
                    rows.splice(4, 0, ['Coach session', coachSummary?.quiet
                        ? coachSummary?.focus === 'endgames'
                            ? 'The Coach did not detect a supported endgame lesson.'
                            : 'The Coach remained quiet.'
                        : `${coachSummary.interventionCount} prompts · ${coachSummary.conceptCount || 0} supported concepts · ${
                            coachSummary.frequentCategory || 'general'} · ${
                            coachSummary.practicedHabit || 'Review the position carefully.'}`]);
                }
                summary.replaceChildren(...rows.flatMap(([term, description]) => {
                    const dt = element('dt', ''); dt.textContent = term;
                    const dd = element('dd', ''); dd.textContent = description;
                    return [dt, dd];
                }));
            }
            const actions = this.#actions();
            this.#root.querySelectorAll('[data-post-game-action]').forEach(button => {
                const state = actions[button.dataset.postGameAction];
                button.disabled = !state?.enabled || this.#busy;
                button.setAttribute('aria-disabled', String(!state?.enabled || this.#busy));
            });
            const consent = this.#root.querySelector('[data-post-game-consent]');
            if (consent) {
                consent.checked = this.#consent === 'granted';
            }
            const mentorNote = this.#root.querySelector('.caissa-post-game__mentor-note');
            if (mentorNote) {
                const selection = this.#resolveMentor();
                mentorNote.textContent = this.#mentorRequest
                    ? `${selection?.mentor?.name || 'Mentor'} request prepared. Guided Replay uses fixed technical templates; generated explanations are not available.`
                    : `${selection?.mentor?.name || 'Mentor'} can prepare a review request after this game. No analysis is performed yet.`;
            }
            const concepts = this.#root.querySelector('[data-post-game-concepts]');
            if (concepts) {
                concepts.replaceChildren();
                const mappings = this.#knowledgeMapping?.mappings || [];
                if (mappings.length) {
                    const heading = element('h3', ''); heading.textContent = 'Reviewed concepts';
                    const list = element('ul', 'caissa-post-game__concept-list');
                    mappings.forEach(mapping => {
                        const item = element('li', '');
                        item.append(global.document.createTextNode(mapping.conceptId.replace(/-/g, ' ')));
                        if (mapping.knowledgeUnit?.publicUrl) {
                            const link = element('a', '', { href: mapping.knowledgeUnit.publicUrl });
                            link.textContent = ` Open ${mapping.knowledgeUnit.title}`;
                            item.appendChild(link);
                        }
                        list.appendChild(item);
                    });
                    concepts.append(heading, list);
                }
            }
            const mentorSummary = this.#root.querySelector('[data-mentor-summary]');
            if (mentorSummary) {
                mentorSummary.replaceChildren();
                mentorSummary.hidden = !this.#mentorSummary;
                if (this.#mentorSummary) {
                    const title = element('h3', ''); title.textContent =
                        `${this.#mentorSummary.mentor.name || 'Mentor'} Summary`;
                    const status = element('p', 'caissa-post-game__mentor-status');
                    status.textContent = `Evidence: ${this.#mentorSummary.evidenceStatus}`;
                    mentorSummary.append(title, status);
                    if (this.#mentorSummary.strength) {
                        const heading = element('h4', ''); heading.textContent = 'Reviewed strength';
                        const copy = element('p', '');
                        copy.textContent = this.#mentorSummary.presentation.strengthTemplate.text;
                        mentorSummary.append(heading, copy);
                    }
                    if (this.#mentorSummary.improvementArea) {
                        const heading = element('h4', ''); heading.textContent = 'Improvement area';
                        const copy = element('p', '');
                        copy.textContent = this.#mentorSummary.presentation.improvementTemplate.text;
                        mentorSummary.append(heading, copy);
                    }
                    if (!this.#mentorSummary.strength && !this.#mentorSummary.improvementArea) {
                        const copy = element('p', '');
                        copy.textContent = this.#mentorSummary.presentation.statusTemplate.text;
                        mentorSummary.appendChild(copy);
                    }
                    if (this.#mentorSummary.moments.length) {
                        const heading = element('h4', ''); heading.textContent = 'Reviewed moments';
                        const list = element('ol', 'caissa-post-game__mentor-moments');
                        this.#mentorSummary.moments.forEach(moment => {
                            const item = element('li', '');
                            item.textContent = `Move ${Math.ceil(moment.ply / 2)} · ${
                                moment.category.replace(/-/g, ' ')} · ${moment.technicalImportance} importance`;
                            list.appendChild(item);
                        });
                        mentorSummary.append(heading, list);
                    }
                    const nextHeading = element('h4', ''); nextHeading.textContent = 'Next action';
                    const next = element('p', '');
                    next.textContent = this.#mentorSummary.prioritizedAction.template.text;
                    mentorSummary.append(nextHeading, next);
                    const unit = this.#mentorSummary.prioritizedAction.knowledgeUnit;
                    if (unit?.publicUrl) {
                        const link = element('a', 'caissa-post-game__mentor-link', { href: unit.publicUrl });
                        link.textContent = `Open ${unit.title}`;
                        mentorSummary.appendChild(link);
                    }
                    const goalHeading = element('h4', ''); goalHeading.textContent = 'Rematch goal';
                    const goal = element('p', '');
                    goal.textContent = this.#mentorSummary.rematchGoal.template.text;
                    mentorSummary.append(goalHeading, goal);
                }
            }
            this.#root.querySelector('[data-post-game-feedback]').textContent = this.#feedback;
        }
        #listen(target, type, handler) {
            target.addEventListener(type, handler); this.#listeners.push({ target, type, handler });
        }
        #removeListeners() {
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
        }
        #recordOperation(operation) { this.#diagnostics.lastReasonCode = operation.reasonCode; return operation; }
    }

    global.CaissaPostGameExperience = Object.freeze({
        schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        statuses: STATUSES, actions: ACTIONS, resultTypes: RESULT_TYPES, reasonCodes: REASONS,
        create: options => new PostGameExperience(options)
    });
})(typeof window !== 'undefined' ? window : globalThis);
