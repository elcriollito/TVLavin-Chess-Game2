import { ChessRulesFacade } from '../chess-rules-facade.js';
import { EndgameBoardView } from '../endgame-board-view.js';
import { formatElapsedTime } from './endgame-v2-contracts.js';
import {
    DEFAULT_CURATED_POOL, loadCuratedPool, selectCuratedPositions
} from './curated-pool-consumer.js';
import { QuickChallengeOrchestrator } from './quick-challenge-orchestrator.js';
import { shouldActivateMultiMovePilot } from './multi-move-pilot.js';
import { mountMultiMovePilotPage, unmountMultiMovePilotPage } from './multi-move-pilot-page.js';
import { shouldActivateEndgameRun } from './endgame-run.js';
import { mountEndgameRunPage, unmountEndgameRunPage } from './endgame-run-page.js';

let mounted = null;

function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (element) element.textContent = value;
}

function setAction(root, action, visible, disabled = false) {
    const button = root.querySelector(`[data-v2-action="${action}"]`);
    if (!button) return;
    button.hidden = !visible;
    button.disabled = disabled;
}

function setPresentationState(root, phase, feedback = '') {
    const primaryByPhase = {
        ready: 'start',
        feedback: 'continue',
        unavailable: 'continue',
        recovering: 'retry',
        error: 'retry'
    };
    root.querySelectorAll('[data-v2-action]').forEach((button) => {
        if (button.hidden) {
            delete button.dataset.actionPriority;
            return;
        }
        button.dataset.actionPriority = button.dataset.v2Action === primaryByPhase[phase] ? 'primary' : 'secondary';
    });
    const output = root.querySelector('[data-v2-feedback]');
    if (!output) return;
    output.dataset.tone = phase === 'feedback'
        ? (/correct|success|completed/i.test(feedback) ? 'success' : 'instruction')
        : (['unavailable', 'recovering', 'error'].includes(phase) ? 'technical' : 'neutral');
}

export function mountEndgameTrainerV2Page({ document: doc = globalThis.document, window: win = globalThis } = {}) {
    if (shouldActivateEndgameRun(win.location?.search ?? '')) return mountEndgameRunPage({ document: doc, window: win });
    if (shouldActivateMultiMovePilot(win.location?.search ?? '')) return mountMultiMovePilotPage({ document: doc, window: win });
    if (mounted) return mounted;
    const root = doc?.querySelector('[data-endgame-trainer-page]');
    const boardElement = root?.querySelector('[data-board]');
    if (!root || !boardElement) throw new Error('endgame-v2-root-unavailable');
    const abort = new AbortController();
    const { signal } = abort;
    root.classList.add('is-v2');
    root.dataset.state = 'v2-ready';
    root.querySelector('[data-endgame-v2-shell]').hidden = false;
    const empty = root.querySelector('[data-empty-board-overlay]');
    if (empty) empty.hidden = true;
    setPresentationState(root, 'ready');

    let orchestrator;
    const board = new EndgameBoardView({
        element: boardElement,
        rulesFactory: (fen) => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
        onMove: (intent) => {
            if (!orchestrator) return false;
            const accepted = orchestrator.submitMove(intent);
            const result = orchestrator.getState().results.at(-1);
            if (accepted && result?.resultingFen) board.setPosition(result.resultingFen, intent);
            return accepted;
        },
        onError: () => setText(root, '[data-v2-feedback]', 'That move could not be submitted.'),
        options: { label: 'Quick Challenge endgame board' }
    }).initialize();
    board.setInteractive(false);

    const render = (state) => {
        const active = state.phase === 'active';
        const feedback = state.phase === 'feedback';
        setText(root, '[data-v2-progress]', `${Math.max(0, state.index + 1)} / 5`);
        setText(root, '[data-v2-score]', state.score);
        setText(root, '[data-v2-streak]', state.currentStreak);
        setText(root, '[data-v2-time]', formatElapsedTime(state.elapsedMs));
        setText(root, '[data-v2-item-label]', state.item ? `Position ${state.index + 1} of 5 · ${state.item.title}` : state.phase === 'completed' ? 'Session complete' : 'Ready for a five-position session.');
        setText(root, '[data-v2-objective]', state.item?.objective?.label || (state.phase === 'completed' ? `Final local practice score: ${state.score}` : 'Find the authored move.'));
        setText(root, '[data-v2-feedback]', state.feedback);
        setAction(root, 'start', state.phase === 'ready');
        setAction(root, 'hint', active, state.hintLevel >= 2);
        const hintButton = root.querySelector('[data-v2-action="hint"]');
        if (hintButton) hintButton.textContent = state.hintLevel === 1 ? 'Reveal answer' : 'Hint';
        setAction(root, 'skip', active);
        setAction(root, 'continue', feedback || state.phase === 'unavailable');
        setAction(root, 'retry', ['recovering', 'error'].includes(state.phase));
        setAction(root, 'abandon', !['configured', 'completed', 'abandoned'].includes(state.phase));
        setPresentationState(root, state.phase, state.feedback);
        const summary = root.querySelector('[data-v2-summary]');
        if (summary) summary.hidden = state.phase !== 'completed';
        if (state.phase === 'completed') {
            setText(root, '[data-v2-summary-completed]', state.results.filter((result) => result.kind !== 'unavailable').length);
            setText(root, '[data-v2-summary-successful]', state.completedItems);
            setText(root, '[data-v2-summary-independent]', state.results.filter((result) => result.correct && !result.hintUsed).length);
            setText(root, '[data-v2-summary-assisted]', state.results.filter((result) => result.correct && result.hintUsed).length);
            setText(root, '[data-v2-summary-skipped]', state.skippedItems);
            setText(root, '[data-v2-summary-unavailable]', state.unavailableItems);
            setText(root, '[data-v2-summary-score]', state.score);
            setText(root, '[data-v2-summary-streak]', state.bestStreak);
            setText(root, '[data-v2-summary-time]', formatElapsedTime(state.elapsedMs));
            summary.querySelector('h2')?.focus();
        }
        board.setInteractive(active);
        root.dataset.state = `v2-${state.phase}`;
    };
    let poolPromise = null;
    const getPool = () => {
        if (!poolPromise) {
            poolPromise = loadCuratedPool({
                ...DEFAULT_CURATED_POOL,
                fetchImpl: win.fetch?.bind(win)
            });
        }
        return poolPromise;
    };
    const startButton = root.querySelector('[data-v2-action="start"]');
    startButton?.addEventListener('click', async () => {
        if (orchestrator || startButton.disabled) return;
        startButton.disabled = true;
        setText(root, '[data-v2-feedback]', 'Loading curated positions…');
        try {
            const pool = await getPool();
            const sessionId = `qc-${Date.now()}`;
            const items = selectCuratedPositions(pool, { count: 5, seed: sessionId });
            orchestrator = new QuickChallengeOrchestrator({
                pool, items, sessionId,
                loadItem: async (item) => {
                    board.setPosition(item.fen);
                    board.setOrientation(item.sideToMove);
                    return true;
                },
                onChange: render
            });
            if (mounted) mounted.orchestrator = orchestrator;
            render(orchestrator.getState());
            await orchestrator.start();
        } catch {
            poolPromise = null;
            startButton.disabled = false;
            setText(root, '[data-v2-feedback]', 'Curated positions are unavailable. Return to Custom Lab or try again later.');
            root.dataset.state = 'v2-unavailable';
            setPresentationState(root, 'unavailable', 'Curated positions are unavailable.');
        }
    }, { signal });
    root.querySelector('[data-v2-action="hint"]')?.addEventListener('click', () => orchestrator?.revealHint(), { signal });
    root.querySelector('[data-v2-action="skip"]')?.addEventListener('click', () => orchestrator?.skip(), { signal });
    root.querySelector('[data-v2-action="continue"]')?.addEventListener('click', () => orchestrator?.continue(), { signal });
    root.querySelector('[data-v2-action="retry"]')?.addEventListener('click', () => orchestrator?.retry(), { signal });
    root.querySelector('[data-v2-action="abandon"]')?.addEventListener('click', () => {
        if (orchestrator?.abandon()) win.location.assign('/endgame-trainer');
    }, { signal });
    root.querySelector('[data-v2-replay]')?.addEventListener('click', () => win.location.reload(), { signal });
    const timer = win.setInterval?.(() => {
        orchestrator?.tick();
        if (orchestrator) setText(root, '[data-v2-time]', formatElapsedTime(orchestrator.getState().elapsedMs));
    }, 250);

    const dialog = root.querySelector('[data-v2-modes-dialog]');
    const modeList = dialog?.querySelector('[data-v2-mode-list]');
    const confirm = dialog?.querySelector('[data-v2-leave-confirm]');
    const leave = dialog?.querySelector('[data-v2-leave]');
    let opener = null;
    const closeDialog = () => { if (dialog?.open) dialog.close(); };
    root.querySelector('[data-v2-open-modes]')?.addEventListener('click', (event) => {
        opener = event.currentTarget;
        modeList.hidden = false; confirm.hidden = true;
        dialog?.showModal();
        dialog?.querySelector('[data-v2-close-modes]')?.focus();
    }, { signal });
    dialog?.querySelector('[data-v2-close-modes]')?.addEventListener('click', closeDialog, { signal });
    dialog?.addEventListener('close', () => opener?.focus(), { signal });
    dialog?.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); }, { signal });
    dialog?.querySelector('[data-v2-mode-list]')?.addEventListener('click', (event) => {
        const mode = event.target.closest?.('[data-v2-mode]');
        if (!mode) return;
        if (mode.dataset.v2Mode === 'quick-challenge') { closeDialog(); return; }
        const href = mode.dataset.v2Href;
        const activeSession = orchestrator &&
            !['configured', 'completed', 'abandoned'].includes(orchestrator.getState().phase);
        if (!activeSession) { win.location.assign(href); return; }
        leave.href = href; modeList.hidden = true; confirm.hidden = false; confirm.querySelector('h2')?.focus?.();
    }, { signal });
    dialog?.querySelector('[data-v2-stay]')?.addEventListener('click', () => {
        modeList.hidden = false; confirm.hidden = true; dialog.querySelector('[data-v2-close-modes]')?.focus();
    }, { signal });

    mounted = { root, board, orchestrator, abort, timer, window: win };
    return mounted;
}

export function unmountEndgameTrainerV2Page() {
    if (!mounted) return unmountEndgameRunPage() || unmountMultiMovePilotPage();
    if (!mounted) return false;
    mounted.abort.abort();
    mounted.orchestrator?.abandon();
    mounted.window.clearInterval?.(mounted.timer);
    mounted.board.dispose();
    mounted.root.classList.remove('is-v2');
    mounted = null;
    return true;
}
