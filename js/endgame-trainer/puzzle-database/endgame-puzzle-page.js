import { CaissaBoardAdapter } from '../../board/caissa-board-adapter.js';
import { PuzzleCatalogSource, ratingBounds } from '../../puzzles/catalog-source.js';
import { EngineMatch, PuzzleEngine, readablePrincipalVariation } from '../../puzzles/engine.js';
import { PuzzleSession, labelFor } from '../../puzzles/model.js';
import {
    discoverEndgameThemes,
    endgameCount,
    endgameSelection,
    isEndgamePuzzle,
} from './endgame-catalog.js';

const MAX_INVALID_PUZZLES = 24;
let mounted = null;

export function mountEndgamePuzzleDatabasePage({ document: doc = globalThis.document, window: win = globalThis,
    catalog: suppliedCatalog = null } = {}) {
    if (mounted) return mounted;
    const root = doc?.querySelector('[data-endgame-trainer-page]');
    const shell = root?.querySelector('[data-endgame-database-shell]');
    const boardElement = doc?.getElementById('egt-board');
    if (!root || !shell || !boardElement) throw new Error('endgame-puzzle-database-root-unavailable');

    const $ = id => doc.getElementById(id);
    const abort = new AbortController();
    const { signal } = abort;
    const catalog = suppliedCatalog || new PuzzleCatalogSource();
    const state = {
        preview: null,
        themes: [],
        theme: '',
        target: 1800,
        difficulty: 'normal',
        seen: new Set(),
        session: null,
        currentPuzzle: null,
        loadToken: 0,
        movePending: false,
        orientation: 'white',
        outcomeRecorded: false,
        scoringActive: true,
        assisted: false,
        solved: 0,
        failed: 0,
        streak: 0,
        analysisActive: false,
        analysisFen: null,
        matchSnapshot: null,
        activeTab: 'themes',
        activeAnalysisMode: 'engine',
    };

    root.classList.add('is-puzzle-database');
    root.dataset.state = 'puzzle-database-loading';
    shell.hidden = false;

    const board = new CaissaBoardAdapter(boardElement, {
        position: 'start',
        interactive: true,
        animation: false,
        label: 'CAISSA endgame puzzle board',
    });
    const engine = new PuzzleEngine(showEvaluation, () => {}, message => {
        stopAnalysis({ clear: false });
        $('egt-engine-state').textContent = message;
    });
    const engineMatch = new EngineMatch({
        onUpdate: updateEngineMatch,
        onState: updateEngineMatchState,
        onError: message => { $('egt-match-state').textContent = message; },
    });
    let promotionResolver = null;

    function countText(count) {
        return count
            ? `${count.total.toLocaleString()} total · ${count.matching.toLocaleString()} available at your level`
            : 'Catalog count unavailable';
    }

    function selectedThemeLabel() {
        return state.theme ? state.themes.find(theme => theme.id === state.theme)?.label || labelFor(state.theme) : 'All Endgames';
    }

    function renderSessionMetrics() {
        $('egt-solved').textContent = String(state.solved);
        $('egt-failed').textContent = String(state.failed);
        $('egt-streak').textContent = String(state.streak);
    }

    function renderSelection() {
        const [minimum, maximum] = ratingBounds(state.target, state.difficulty);
        $('egt-selected-theme').textContent = selectedThemeLabel();
        $('egt-selected-range').textContent = `Puzzle rating ${minimum}–${maximum}`;
        $('egt-difficulty-range').textContent = `Puzzle ratings ${minimum}–${maximum}. Uses the same rating bands as CAISSA Puzzles.`;
        $('egt-rating-output').value = String(state.target);
    }

    function renderThemes() {
        renderSelection();
        const choices = [{ id: '', label: 'All Endgames' }, ...state.themes];
        $('egt-theme-list').replaceChildren(...choices.map(theme => {
            const button = doc.createElement('button');
            const title = doc.createElement('strong');
            const count = doc.createElement('small');
            title.textContent = theme.label;
            count.textContent = countText(endgameCount(catalog, theme.id, state.target, state.difficulty));
            button.type = 'button';
            button.setAttribute('aria-pressed', String(theme.id === state.theme));
            button.append(title, count);
            button.addEventListener('click', () => {
                state.theme = theme.id;
                renderThemes();
                switchTab('training');
                void nextPuzzle();
            }, { signal });
            return button;
        }));
        $('egt-theme-status').textContent = catalog.counts
            ? `${choices.length.toLocaleString()} training pools`
            : 'Training available · counts temporarily unavailable';
    }

    function switchTab(name, { focus = false } = {}) {
        if (!['themes', 'training', 'analysis'].includes(name)) return;
        if (state.activeTab === 'analysis' && name !== 'analysis') stopTrainingTools({ restore: true });
        state.activeTab = name;
        for (const tab of ['themes', 'training', 'analysis']) {
            const active = tab === name;
            $(`egt-tab-${tab}`).setAttribute('aria-selected', String(active));
            $(`egt-tab-${tab}`).tabIndex = active ? 0 : -1;
            $(`egt-panel-${tab}`).hidden = !active;
        }
        if (name === 'analysis') renderAnalysisAccess();
        if (focus) $(`egt-tab-${name}`).focus();
    }

    function switchAnalysisMode(mode) {
        if (!['engine', 'match'].includes(mode)) return;
        if (mode === 'engine') stopEngineMatch({ restore: true });
        else stopAnalysis();
        state.activeAnalysisMode = mode;
        for (const item of ['engine', 'match']) {
            const active = item === mode;
            $(`egt-analysis-${item}-tab`).setAttribute('aria-selected', String(active));
            $(`egt-analysis-${item}-tab`).tabIndex = active ? 0 : -1;
            $(`egt-analysis-${item}`).hidden = !active;
        }
    }

    function showLastMove(move, extraHighlights = []) {
        board.clearHighlights();
        board.clearArrows();
        if (!move?.from || !move?.to) return;
        board.highlightSquares([
            { square: move.from, type: 'last' },
            { square: move.to, type: 'last' },
            ...extraHighlights,
        ]);
        board.drawArrow(move.from, move.to, { color: '#e5bc58', opacity: 0.58 });
    }

    function drawMoves() {
        const history = state.session?.game.history({ verbose: true }) || [];
        $('egt-move-list').replaceChildren(...history.map((move, index) => {
            const item = doc.createElement('li');
            const number = doc.createElement('span');
            const san = doc.createElement('span');
            number.className = 'move-number';
            number.textContent = `${move.before.split(' ')[5]}${move.color === 'w' ? '.' : '…'}`;
            san.textContent = move.san;
            if (index === 0) san.className = 'opponent';
            item.append(number, san);
            return item;
        }));
    }

    function renderPosition({ animate = false } = {}) {
        if (!state.session) return;
        board.setPosition(state.session.game.fen(), { animate });
        showLastMove(state.session.game.history({ verbose: true }).at(-1));
        drawMoves();
        $('egt-side-to-move').textContent = `${state.session.game.turn() === 'w' ? 'White' : 'Black'} to move`;
    }

    function clearPuzzleDetails() {
        $('egt-puzzle-id').textContent = 'Endgame puzzle';
        $('egt-puzzle-rating').textContent = 'Rating —';
        $('egt-theme-tags').replaceChildren();
        $('egt-source-game').hidden = true;
        $('egt-move-list').replaceChildren();
    }

    function renderPuzzleDetails(puzzle, source) {
        $('egt-puzzle-id').textContent = `Puzzle ${puzzle.id}`;
        $('egt-puzzle-rating').textContent = `Rating ${puzzle.rating}`;
        $('egt-training-kicker').textContent = `${selectedThemeLabel()} · ${source === 'curated-fallback' ? 'incident fallback' : 'full catalog'}`;
        $('egt-theme-tags').replaceChildren(...puzzle.themes.filter(theme => theme === 'endgame' || /Endgame$/u.test(theme)).map(theme => {
            const tag = doc.createElement('span');
            tag.textContent = labelFor(theme);
            return tag;
        }));
        const safeSource = /^https:\/\/lichess[.]org\//u.test(puzzle.gameUrl || '');
        $('egt-source-game').hidden = !safeSource;
        if (safeSource) $('egt-source-game').href = puzzle.gameUrl;
    }

    function recordOutcome(outcome) {
        if (state.outcomeRecorded) return false;
        state.outcomeRecorded = true;
        state.scoringActive = false;
        if (outcome === 'solved') {
            state.solved += 1;
            state.streak = state.assisted ? 0 : state.streak + 1;
        } else {
            state.failed += 1;
            state.streak = 0;
        }
        renderSessionMetrics();
        $('egt-retry').disabled = false;
        renderAnalysisAccess();
        return true;
    }

    function analysisUnlocked() {
        return Boolean(state.session && (state.outcomeRecorded || state.session.solved || !state.scoringActive));
    }

    function renderAnalysisAccess() {
        const unlocked = analysisUnlocked();
        $('egt-analysis-lock').hidden = unlocked;
        $('egt-analysis-tools').hidden = !unlocked;
        if (!unlocked) stopTrainingTools({ restore: true });
    }

    function clearEngineOutput() {
        $('egt-engine-eval').textContent = '—';
        $('egt-engine-best').textContent = 'Start Stockfish to analyze this position.';
        $('egt-engine-pv').textContent = '';
    }

    function stopAnalysis({ clear = true } = {}) {
        engine.stop();
        state.analysisActive = false;
        state.analysisFen = null;
        $('egt-engine-toggle').setAttribute('aria-pressed', 'false');
        $('egt-engine-toggle').textContent = 'Start engine';
        if (clear) clearEngineOutput();
    }

    function startAnalysis() {
        if (!analysisUnlocked() || !state.session) return;
        stopEngineMatch({ restore: true });
        stopAnalysis();
        state.analysisFen = state.session.game.fen();
        state.analysisActive = true;
        $('egt-engine-toggle').setAttribute('aria-pressed', 'true');
        $('egt-engine-toggle').textContent = 'Stop engine';
        $('egt-engine-state').textContent = 'Analyzing';
        $('egt-engine-best').textContent = 'Calculating best move…';
        engine.start();
        engine.analyze(state.analysisFen);
    }

    function showEvaluation({ depth, type, score, pv, fen }) {
        if (!state.analysisActive || fen !== state.analysisFen) return;
        const readable = readablePrincipalVariation(fen, pv);
        if (!readable) return;
        $('egt-engine-state').textContent = `Depth ${depth}`;
        $('egt-engine-eval').textContent = type === 'mate' ? `Mate ${score}` : `${(score / 100).toFixed(2)} for side to move`;
        $('egt-engine-best').textContent = `Best move: ${readable.bestMove}`;
        $('egt-engine-pv').textContent = readable.variation;
    }

    function stopEngineMatch({ restore = false } = {}) {
        const active = Boolean(state.matchSnapshot);
        engineMatch.stop({ notify: false });
        state.matchSnapshot = null;
        $('egt-match-moves').replaceChildren();
        $('egt-match-pause').disabled = true;
        $('egt-match-pause').textContent = 'Pause';
        $('egt-match-stop').disabled = true;
        if (restore && active && state.session) {
            renderPosition();
            board.setInteractive(!state.session.solved);
        }
    }

    function stopTrainingTools({ restore = false } = {}) {
        stopAnalysis();
        stopEngineMatch({ restore });
        cancelPromotion();
    }

    function updateEngineMatch(snapshot) {
        if (!snapshot) return;
        state.matchSnapshot = snapshot;
        board.setPosition(snapshot.fen, { animate: false });
        showLastMove(snapshot.verboseMoves.at(-1));
        $('egt-side-to-move').textContent = `${snapshot.turn === 'w' ? 'White' : 'Black'} to move · Engine game`;
        $('egt-match-moves').replaceChildren(...snapshot.verboseMoves.map(move => {
            const item = doc.createElement('li');
            item.textContent = `${move.before.split(' ')[5]}${move.color === 'w' ? '.' : '…'} ${move.san}`;
            return item;
        }));
        $('egt-match-moves').scrollTop = $('egt-match-moves').scrollHeight;
    }

    function updateEngineMatchState({ status, reason }) {
        const labels = { running: 'Engines are playing', paused: 'Engine game paused', stopped: 'Engine game stopped', finished: 'Engine game finished' };
        $('egt-match-state').textContent = reason || labels[status] || status;
        $('egt-match-pause').disabled = !['running', 'paused'].includes(status);
        $('egt-match-pause').textContent = status === 'paused' ? 'Resume' : 'Pause';
        $('egt-match-stop').disabled = !['running', 'paused'].includes(status);
    }

    function startEngineMatch() {
        if (!analysisUnlocked() || !state.session) return;
        stopAnalysis();
        board.setInteractive(false);
        $('egt-match-moves').replaceChildren();
        try { engineMatch.start(state.session.game.fen()); }
        catch {
            $('egt-match-state').textContent = 'This position cannot start an engine game.';
            renderPosition();
        }
    }

    function cancelPromotion() {
        const resolver = promotionResolver;
        promotionResolver = null;
        if ($('egt-promotion').open) $('egt-promotion').close();
        resolver?.(null);
    }

    function choosePromotion() {
        cancelPromotion();
        const dialog = $('egt-promotion');
        return new Promise(resolve => {
            promotionResolver = choice => {
                promotionResolver = null;
                if (dialog.open) dialog.close();
                resolve(choice);
            };
            dialog.showModal();
            dialog.querySelector('[data-egt-promotion="q"]')?.focus();
        });
    }

    async function handleMoveAttempt({ from, to, promotion }) {
        const session = state.session;
        if (!session || state.movePending || state.matchSnapshot || session.solved) return;
        const loadToken = state.loadToken;
        const piece = board.getPieceAt(from);
        let selectedPromotion = promotion;
        if (!selectedPromotion && piece?.type === 'P' && (to[1] === '1' || to[1] === '8')) {
            state.movePending = true;
            board.setInteractive(false);
            selectedPromotion = await choosePromotion();
            state.movePending = false;
            if (loadToken !== state.loadToken || !selectedPromotion) {
                if (loadToken === state.loadToken) board.setInteractive(true);
                return;
            }
            board.setInteractive(true);
        }
        const result = session.attempt(from, to, selectedPromotion || 'q');
        if (result.status === 'incorrect') {
            recordOutcome('failed');
            $('egt-prompt').textContent = 'Try again';
            $('egt-feedback').textContent = 'That move is legal, but it is not the puzzle solution. Analysis is now available.';
            showLastMove(session.game.history({ verbose: true }).at(-1), [{ square: to, type: 'error' }]);
            return;
        }
        if (result.status === 'illegal') {
            $('egt-feedback').textContent = 'That move is not legal in this position.';
            return;
        }
        if (result.status === 'complete') return;
        renderPosition();
        if (result.status === 'correct') {
            $('egt-prompt').textContent = 'Keep going';
            $('egt-feedback').textContent = 'Correct. Find the next move in the line.';
        }
        if (result.status === 'solved') {
            const freshSolve = recordOutcome('solved');
            board.setInteractive(false);
            $('egt-prompt').textContent = freshSolve ? 'Puzzle solved' : 'Line completed';
            $('egt-feedback').textContent = freshSolve
                ? (state.assisted ? 'Solved with a hint. Review it in Analysis or continue.' : 'Well done. Review it in Analysis or continue.')
                : 'You completed the line after the result was recorded. Review it in Analysis or continue.';
        }
    }

    async function nextPuzzle({ invalidAttempts = 0 } = {}) {
        const loadToken = ++state.loadToken;
        stopTrainingTools();
        state.session = null;
        state.currentPuzzle = null;
        state.outcomeRecorded = false;
        state.scoringActive = true;
        state.assisted = false;
        state.movePending = false;
        clearPuzzleDetails();
        board.setInteractive(false);
        $('egt-next').disabled = true;
        $('egt-hint').disabled = true;
        $('egt-reveal').disabled = true;
        $('egt-retry').disabled = true;
        $('egt-prompt').textContent = 'Loading puzzle';
        $('egt-feedback').textContent = 'Selecting a verified puzzle from the Endgame universe.';
        renderAnalysisAccess();
        let selected;
        try {
            selected = await catalog.next(endgameSelection(state), state.seen, {
                allowRemote: invalidAttempts < 12,
            });
        } catch { selected = { puzzle: null, source: null }; }
        if (loadToken !== state.loadToken) return;
        const puzzle = selected?.puzzle;
        if (!puzzle) {
            $('egt-prompt').textContent = 'No puzzles in this range';
            $('egt-feedback').textContent = 'Choose another theme, difficulty, or rating and try again.';
            $('egt-next').disabled = false;
            root.dataset.state = 'puzzle-database-empty';
            return;
        }
        if (!isEndgamePuzzle(puzzle, state.theme)) {
            state.seen.add(puzzle.id);
            if (invalidAttempts + 1 < MAX_INVALID_PUZZLES) return nextPuzzle({ invalidAttempts: invalidAttempts + 1 });
            $('egt-prompt').textContent = 'No verified endgame puzzle available';
            $('egt-feedback').textContent = 'The catalog returned positions outside this Endgame filter. Try another selection.';
            $('egt-next').disabled = false;
            root.dataset.state = 'puzzle-database-filter-error';
            return;
        }
        try { state.session = new PuzzleSession(puzzle); }
        catch {
            state.seen.add(puzzle.id);
            if (invalidAttempts + 1 < MAX_INVALID_PUZZLES) return nextPuzzle({ invalidAttempts: invalidAttempts + 1 });
            $('egt-prompt').textContent = 'No valid puzzle available';
            $('egt-feedback').textContent = 'Try another theme or rating range.';
            $('egt-next').disabled = false;
            root.dataset.state = 'puzzle-database-position-error';
            return;
        }
        state.currentPuzzle = puzzle;
        state.seen.add(puzzle.id);
        state.orientation = state.session.game.turn() === 'w' ? 'white' : 'black';
        board.setOrientation(state.orientation);
        board.setPosition(state.session.game.fen(), { animate: false });
        showLastMove(state.session.setupMove);
        board.setInteractive(true);
        drawMoves();
        renderPuzzleDetails(puzzle, selected.source);
        $('egt-prompt').textContent = 'Find the best move';
        $('egt-feedback').textContent = `${state.orientation === 'white' ? 'White' : 'Black'} to move. Play the full solution on the board.`;
        $('egt-side-to-move').textContent = `${state.orientation === 'white' ? 'White' : 'Black'} to move`;
        $('egt-next').disabled = false;
        $('egt-hint').disabled = false;
        $('egt-reveal').disabled = false;
        root.dataset.state = 'puzzle-database-ready';
        renderAnalysisAccess();
    }

    function retryPuzzle() {
        if (!state.currentPuzzle || !state.outcomeRecorded) return;
        stopTrainingTools();
        try { state.session = new PuzzleSession(state.currentPuzzle); }
        catch { return; }
        state.scoringActive = false;
        state.assisted = true;
        state.orientation = state.session.game.turn() === 'w' ? 'white' : 'black';
        board.setOrientation(state.orientation);
        board.setPosition(state.session.game.fen(), { animate: false });
        showLastMove(state.session.setupMove);
        board.setInteractive(true);
        drawMoves();
        $('egt-prompt').textContent = 'Practice retry';
        $('egt-feedback').textContent = 'This retry is for practice. Your session result for this puzzle is already recorded.';
        $('egt-hint').disabled = false;
        $('egt-reveal').disabled = false;
        renderAnalysisAccess();
    }

    board.on('moveAttempt', payload => { void handleMoveAttempt(payload); });

    for (const name of ['themes', 'training', 'analysis']) {
        $(`egt-tab-${name}`).addEventListener('click', () => switchTab(name), { signal });
        $(`egt-tab-${name}`).addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const tabs = ['themes', 'training', 'analysis'];
            const direction = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
            switchTab(tabs[(tabs.indexOf(name) + direction) % tabs.length], { focus: true });
        }, { signal });
    }
    $('egt-analysis-engine-tab').addEventListener('click', () => switchAnalysisMode('engine'), { signal });
    $('egt-analysis-match-tab').addEventListener('click', () => switchAnalysisMode('match'), { signal });
    for (const mode of ['engine', 'match']) {
        $(`egt-analysis-${mode}-tab`).addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const next = mode === 'engine' ? 'match' : 'engine';
            switchAnalysisMode(next);
            $(`egt-analysis-${next}-tab`).focus();
        }, { signal });
    }
    $('egt-flip').addEventListener('click', () => {
        state.orientation = state.orientation === 'white' ? 'black' : 'white';
        board.setOrientation(state.orientation);
    }, { signal });
    $('egt-next').addEventListener('click', () => { switchTab('training'); void nextPuzzle(); }, { signal });
    $('egt-retry').addEventListener('click', retryPuzzle, { signal });
    $('egt-hint').addEventListener('click', () => {
        if (!state.session || state.session.solved) return;
        state.assisted = true;
        const square = state.session.moves[state.session.index]?.slice(0, 2);
        showLastMove(state.session.game.history({ verbose: true }).at(-1), square ? [{ square, type: 'hint' }] : []);
        $('egt-feedback').textContent = 'The piece that starts the next solution move is highlighted.';
    }, { signal });
    $('egt-reveal').addEventListener('click', () => {
        if (!state.session || state.session.solved) return;
        state.assisted = true;
        recordOutcome('failed');
        state.session.reveal();
        renderPosition();
        board.setInteractive(false);
        $('egt-prompt').textContent = 'Solution shown';
        $('egt-feedback').textContent = 'Review the solution in Analysis, retry for practice, or continue.';
        $('egt-hint').disabled = true;
        $('egt-reveal').disabled = true;
    }, { signal });
    $('egt-engine-toggle').addEventListener('click', () => {
        if (state.analysisActive) {
            stopAnalysis();
            $('egt-engine-state').textContent = 'Engine off';
        } else startAnalysis();
    }, { signal });
    $('egt-match-start').addEventListener('click', startEngineMatch, { signal });
    $('egt-match-pause').addEventListener('click', () => {
        if (engineMatch.running) engineMatch.pause();
        else engineMatch.resume();
    }, { signal });
    $('egt-match-stop').addEventListener('click', () => {
        stopEngineMatch({ restore: true });
        $('egt-match-state').textContent = 'Engine game stopped';
    }, { signal });
    $('egt-target-rating').addEventListener('input', event => { $('egt-rating-output').value = event.target.value; }, { signal });
    $('egt-target-rating').addEventListener('change', event => {
        state.target = Number(event.target.value);
        renderThemes();
        void nextPuzzle();
    }, { signal });
    $('egt-difficulty').addEventListener('change', event => {
        state.difficulty = event.target.value;
        renderThemes();
        void nextPuzzle();
    }, { signal });
    for (const button of $('egt-promotion').querySelectorAll('[data-egt-promotion]')) {
        button.addEventListener('click', () => promotionResolver?.(button.dataset.egtPromotion), { signal });
    }
    $('egt-promotion-cancel').addEventListener('click', cancelPromotion, { signal });
    $('egt-promotion').addEventListener('cancel', event => { event.preventDefault(); cancelPromotion(); }, { signal });

    const pagehide = () => unmountEndgamePuzzleDatabasePage();
    win.addEventListener?.('pagehide', pagehide, { once: true });
    mounted = { root, shell, board, engine, engineMatch, catalog, state, abort, window: win, pagehide };

    void (async () => {
        try {
            state.preview = await catalog.initialize();
            state.themes = discoverEndgameThemes(state.preview);
            const countsAvailable = await catalog.loadCounts();
            if (!countsAvailable) catalog.counts = null;
            renderThemes();
            renderSessionMetrics();
            renderSelection();
            await nextPuzzle();
        } catch {
            root.dataset.state = 'puzzle-database-error';
            board.setInteractive(false);
            $('egt-theme-status').textContent = 'Catalog unavailable';
            $('egt-prompt').textContent = 'Endgame Trainer is unavailable';
            $('egt-feedback').textContent = 'Refresh to try loading the puzzle catalog again.';
            $('egt-next').disabled = false;
        }
    })();

    return mounted;
}

export function unmountEndgamePuzzleDatabasePage() {
    if (!mounted) return false;
    const current = mounted;
    mounted = null;
    current.abort.abort();
    current.engine.stop();
    current.engineMatch.stop({ notify: false });
    current.board.destroy();
    current.root.classList.remove('is-puzzle-database');
    current.shell.hidden = true;
    return true;
}
