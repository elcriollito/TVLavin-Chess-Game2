(function installGuidedReplayView(global) {
    'use strict';
    const SCHEMA_VERSION = '1.1.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function create(options = {}) {
        const replay = options.replay || global.CaissaMentorGuidedReplay;
        let root = null; let board = null; let sessionId = null; let selectedSquare = null;
        const listeners = []; const diagnostics = { mounts: 0, renders: 0, submissions: 0,
            listeners: 0, replayBoards: 0, engineRequests: 0, storageWrites: 0 };
        const listen = (target, type, handler) => {
            target.addEventListener(type, handler); listeners.push({ target, type, handler });
            diagnostics.listeners = listeners.length;
        };
        const node = (tag, className, text = '') => {
            const value = global.document.createElement(tag); value.className = className;
            value.textContent = text; return value;
        };
        function mount(host, id) {
            if (root) return operation(true, 'ALREADY_MOUNTED', getSnapshot());
            if (!host?.appendChild || !replay?.getSnapshot?.(id))
                return operation(false, 'INVALID_REPLAY_HOST');
            sessionId = id; root = node('section', 'caissa-guided-replay');
            root.setAttribute('aria-labelledby', `${id.replace(/[^a-z0-9]/gi, '-')}-title`);
            const header = node('div', 'caissa-guided-replay__header');
            const title = node('h3', '', 'Guided Replay');
            title.id = `${id.replace(/[^a-z0-9]/gi, '-')}-title`;
            const progress = node('p', 'caissa-guided-replay__progress');
            header.append(title, progress);
            const layout = node('div', 'caissa-guided-replay__layout');
            const boardHost = node('div', 'caissa-guided-replay__board guided-replay-board');
            boardHost.id = `guided-replay-board-${id.replace(/[^a-z0-9]/gi, '-')}`;
            const panel = node('div', 'caissa-guided-replay__panel');
            const prompt = node('p', 'caissa-guided-replay__prompt');
            const form = node('form', 'caissa-guided-replay__attempt');
            const label = node('label', '', 'Move in coordinate notation');
            const input = node('input', 'caissa-guided-replay__move');
            input.name = 'move'; input.autocomplete = 'off'; input.maxLength = 5;
            const submit = node('button', '', 'Submit move'); submit.type = 'submit';
            label.appendChild(input); form.append(label, submit);
            const acknowledge = node('button', 'caissa-guided-replay__acknowledge', 'Continue reflection');
            acknowledge.type = 'button';
            const feedback = node('p', 'caissa-guided-replay__feedback');
            feedback.setAttribute('aria-atomic', 'true');
            const reference = node('div', 'caissa-guided-replay__reference');
            const knowledge = node('aside', 'caissa-guided-replay__knowledge');
            const controls = node('div', 'caissa-guided-replay__controls');
            for (const [action, text] of [['previous', 'Previous'], ['reveal', 'Reveal reference'],
                ['next', 'Next'], ['restart', 'Restart'], ['close', 'Back to game summary']]) {
                const button = node('button', '', text); button.type = 'button';
                button.dataset.guidedReplayAction = action; controls.appendChild(button);
            }
            panel.append(prompt, form, acknowledge, feedback, reference, knowledge, controls);
            layout.append(boardHost, panel); root.append(header, layout); host.appendChild(root);
            listen(form, 'submit', event => {
                event.preventDefault(); submitMove(input.value); input.value = '';
            });
            listen(acknowledge, 'click', () => {
                replay.submitChoice(sessionId, 'acknowledge'); diagnostics.submissions += 1; render();
            });
            listen(controls, 'click', event => {
                const action = event.target?.dataset?.guidedReplayAction;
                if (!action) return;
                if (action === 'close') {
                    root.hidden = true;
                    root.parentElement?.querySelector?.('[data-post-game-action="guided-replay"]')?.focus?.();
                    return;
                }
                replay[action]?.(sessionId); render();
                if (action === 'reveal')
                    global.CaissaPlayAnnouncementManager?.announce?.('REPLAY_REFERENCE_REVEALED');
            });
            board = global.CaissaChessboardAdapter?.create?.({
                label: 'Guided Replay chessboard', position: replay.getSnapshot(id).currentStep?.position.fenBefore,
                orientation: replay.getSnapshot(id).currentStep?.position.orientation || 'white',
                getActiveColor: () => replay.getSnapshot(sessionId)?.currentStep?.sideToMove,
                onDrop: (from, to) => submitMove(`${from}${to}`).ok ? undefined : 'snapback',
                onInteraction: event => {
                    if (event.type !== 'square-selected') return;
                    if (!selectedSquare) {
                        selectedSquare = event.square; board.setSelection(event.square);
                        const fen = replay.getSnapshot(sessionId)?.currentStep?.position.fenBefore;
                        try {
                            const game = new global.Chess(fen);
                            board.setLegalTargets(game.moves({ square: event.square, verbose: true })
                                .map(move => move.to));
                        } catch (_) { board.clearLegalTargets(); }
                    } else {
                        const from = selectedSquare; selectedSquare = null;
                        board.clearSelection(); board.clearLegalTargets();
                        submitMove(`${from}${event.square}`);
                    }
                }
            });
            const mounted = board?.mount?.(boardHost);
            if (!mounted?.ok) { unmount(); return operation(false, 'REPLAY_BOARD_UNAVAILABLE'); }
            diagnostics.mounts += 1; diagnostics.replayBoards = 1; render();
            return operation(true, 'REPLAY_VIEW_MOUNTED', getSnapshot());
        }
        function submitMove(move) {
            const result = replay.submitMove(sessionId, move);
            diagnostics.submissions += 1; render();
            global.CaissaPlayAnnouncementManager?.announce?.('REPLAY_ATTEMPT_RECORDED');
            return result;
        }
        function render() {
            if (!root || !sessionId) return;
            const session = replay.getSnapshot(sessionId); if (!session) return;
            const step = session.currentStep;
            root.querySelector('.caissa-guided-replay__progress').textContent =
                session.totalSteps ? `Position ${session.currentStepIndex + 1} of ${session.totalSteps}`
                    : 'No replay positions available';
            root.querySelector('.caissa-guided-replay__prompt').textContent =
                step?.prompt.text || 'Replay complete.';
            const form = root.querySelector('.caissa-guided-replay__attempt');
            const acknowledge = root.querySelector('.caissa-guided-replay__acknowledge');
            form.hidden = step?.prompt.promptType !== 'play-move' || session.status !== 'awaiting-attempt';
            acknowledge.hidden = step?.prompt.promptType !== 'reflect' || session.status !== 'awaiting-attempt';
            root.querySelector('.caissa-guided-replay__feedback').textContent =
                step?.feedback?.message || '';
            const reference = root.querySelector('.caissa-guided-replay__reference');
            reference.textContent = step && !step.answer.hidden
                ? `Reference move: ${step.answer.referenceMove || 'No reference move'}`
                : '';
            const knowledge = root.querySelector('.caissa-guided-replay__knowledge');
            knowledge.replaceChildren();
            if (step?.knowledge && !step.answer.hidden) {
                knowledge.appendChild(node('strong', 'caissa-guided-replay__concept',
                    step.knowledge.conceptId.replace(/-/g, ' ')));
                if (step.knowledge.scaffolding?.promptTemplateId) {
                    knowledge.appendChild(node('p', 'caissa-guided-replay__scaffold',
                        `Practice scaffold: ${step.knowledge.scaffolding.promptTemplateId
                            .replace(/-v\d+$/, '').replace(/-/g, ' ')}`));
                }
                if (step.knowledge.knowledgeUnit?.publicUrl) {
                    const link = node('a', 'caissa-guided-replay__knowledge-link',
                        `Open ${step.knowledge.knowledgeUnit.title}`);
                    link.href = step.knowledge.knowledgeUnit.publicUrl;
                    knowledge.appendChild(link);
                }
            }
            const action = name => root.querySelector(`[data-guided-replay-action="${name}"]`);
            action('previous').disabled = session.currentStepIndex === 0 || ['completed', 'canceled'].includes(session.status);
            action('reveal').disabled = !['attempted', 'revealed'].includes(session.status)
                || !step?.answer.hidden && !step?.answer.referenceMove;
            action('next').disabled = !['attempted', 'revealed'].includes(session.status);
            if (step?.position.fenBefore) {
                board?.setPosition?.(step.position.fenBefore, { animate: false });
                board?.setOrientation?.(step.position.orientation);
                board?.setInteractionEnabled?.(session.status === 'awaiting-attempt'
                    && step.prompt.promptType === 'play-move');
            }
            diagnostics.renders += 1;
        }
        function getSnapshot() {
            return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!root, hidden: root?.hidden === true,
                sessionId, replayBoards: diagnostics.replayBoards,
                listenerCount: listeners.length, diagnostics: freeze({ ...diagnostics }),
                board: board?.getSnapshot?.() || null });
        }
        function show() {
            if (!root) return operation(false, 'REPLAY_VIEW_NOT_MOUNTED');
            root.hidden = false; render(); return operation(true, 'REPLAY_VIEW_SHOWN', getSnapshot());
        }
        function unmount() {
            listeners.splice(0).forEach(({ target, type, handler }) =>
                target.removeEventListener(type, handler));
            board?.dispose?.(); board = null; root?.remove?.(); root = null; sessionId = null;
            selectedSquare = null; diagnostics.listeners = 0; diagnostics.replayBoards = 0;
            return operation(true, 'REPLAY_VIEW_UNMOUNTED');
        }
        return freeze({ schemaVersion: SCHEMA_VERSION, mount, show, render, getSnapshot,
            inspect: getSnapshot, unmount, dispose: unmount });
    }
    const view = create();
    global.CaissaGuidedReplayView = freeze({
        schemaVersion: SCHEMA_VERSION, create,
        mount: (...args) => view.mount(...args), render: () => view.render(),
        show: () => view.show(),
        getSnapshot: () => view.getSnapshot(), inspect: () => view.inspect(),
        unmount: () => view.unmount(), dispose: () => view.dispose()
    });
})(typeof window !== 'undefined' ? window : globalThis);
