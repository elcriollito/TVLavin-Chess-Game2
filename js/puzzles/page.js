import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { PuzzleSession, labelFor, poolFor } from './model.js';
import { EngineMatch, PuzzleEngine, readablePrincipalVariation } from './engine.js';
import { createSessionRating, recordOutcome } from './session-rating.js';
import { PuzzleCatalogSource, ratingBounds } from './catalog-source.js';

const $ = id => document.getElementById(id);
const MAX_REMOTE_INVALID_ATTEMPTS = 12;
const MAX_INVALID_ATTEMPTS = 24;
const state = { data: null, category: 'Phases', theme: '', target: 1800, difficulty: 'normal', seen: new Set(), progress: createSessionRating(), visitSolved: 0, accountMode: 'loading', accountUserId: null, pendingOutcomes: [], outcomeRecorded: false, ratedOutcome: null, assisted: false, session: null, orientation: 'white', humanColor: 'w', reviewIndex: null, autoNext: false, nextTimer: null, loadToken: 0, analysisActive: false, analysisFen: null, engineMatchSnapshot: null, movePending: false };
const board = new CaissaBoardAdapter($('puzzle-board'), { position: 'start', interactive: true, animation: true, label: 'CAISSA puzzle position' });
const catalog = new PuzzleCatalogSource();
const engine = new PuzzleEngine(showEvaluation, engineMove, message => {
    stopAnalysis();
    $('engine-state').textContent = message;
});
const engineMatch = new EngineMatch({
    onUpdate: updateEngineMatch,
    onState: updateEngineMatchState,
    onError: message => { $('engine-match-state').textContent = message; },
});
let promotionResolver = null;

function activePool() {
    return poolFor(state.data.puzzles, { category: state.data.categories[state.category], theme: state.theme, target: state.target, difficulty: state.difficulty });
}

function feedback(text) { $('puzzle-feedback').textContent = text; }
function countLabel(count) {
    return count ? `${count.total.toLocaleString()} total · ${count.matching.toLocaleString()} available at your level` : 'Count unavailable';
}
function switchTab(name) {
    for (const tab of ['themes', 'training', 'stats']) {
        const active = tab === name;
        $(`tab-${tab}`).setAttribute('aria-selected', String(active));
        $(`tab-${tab}`).tabIndex = active ? 0 : -1;
        $(`panel-${tab}`).hidden = !active;
    }
}

function drawCategories() {
    $('categories').replaceChildren(...Object.keys(state.data.categories).map(category => {
        const button = document.createElement('button');
        const label = document.createElement('span');
        const count = document.createElement('small');
        button.type = 'button';
        label.textContent = category;
        count.textContent = countLabel(catalog.countFor(category, '', state.target, state.difficulty));
        button.append(label, count);
        button.setAttribute('aria-current', String(category === state.category));
        button.addEventListener('click', () => {
            state.category = category;
            state.theme = '';
            drawCategories();
            drawThemes();
            nextPuzzle();
            switchTab('themes');
        });
        return button;
    }));
}

function drawThemes() {
    $('theme-title').textContent = state.category;
    const tags = state.data.categories[state.category];
    const options = ['', ...tags];
    $('themes-count-note').textContent = catalog.counts
        ? 'Total is the full catalog. Available at your level uses the selected rating, difficulty and quality filters.'
        : 'Full-catalog counts are temporarily unavailable.';
    $('subthemes').replaceChildren(...options.map(tag => {
        const button = document.createElement('button');
        const title = document.createElement('span');
        const count = document.createElement('small');
        title.textContent = tag ? labelFor(tag) : `All ${state.category.toLowerCase()}`;
        const fullCount = catalog.countFor(state.category, tag, state.target, state.difficulty);
        count.textContent = countLabel(fullCount);
        button.append(title, count);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(tag === state.theme));
        button.addEventListener('click', () => {
            state.theme = tag;
            drawThemes();
            nextPuzzle();
            switchTab('training');
        });
        return button;
    }));
    const selectionCount = catalog.countFor(state.category, state.theme, state.target, state.difficulty);
    $('level-availability').textContent = selectionCount
        ? `${selectionCount.matching.toLocaleString()} available at your level (rating bands ${ratingBounds(state.target, state.difficulty).join('–')})`
        : 'Full-catalog count unavailable';
    const [minimum, maximum] = ratingBounds(state.target, state.difficulty);
    $('difficulty-range').textContent = `Puzzle ratings: approximately ${minimum}–${maximum}. Challenge is relative to your selected target, not the same as Lichess Hardest (+600).`;
}

function clearEngineOutput() {
    $('engine-eval').textContent = '';
    $('engine-best-move').textContent = '';
    $('engine-variation').textContent = '';
}

function setAnalysisButton(active) {
    state.analysisActive = active;
    $('engine-toggle').setAttribute('aria-pressed', String(active));
    $('engine-toggle').textContent = active ? 'Stop analysis' : 'Analyze with Stockfish';
}

function stopAnalysis({ clear = true } = {}) {
    engine.stop();
    state.analysisFen = null;
    setAnalysisButton(false);
    if (clear) clearEngineOutput();
}

function runAnalysis(fen) {
    stopEngineMatch({ restore: true });
    // A reviewed position gets a fresh worker. Reusing a worker while its prior
    // search is unwinding can surface a late error or PV from the old position.
    engine.stop();
    state.analysisFen = fen;
    setAnalysisButton(true);
    clearEngineOutput();
    $('engine-state').textContent = 'Analyzing';
    $('engine-best-move').textContent = 'Calculating best move…';
    engine.start();
    engine.analyze(fen);
}

function currentPuzzleFen() {
    const history = state.session?.game.history({ verbose: true }) || [];
    return state.reviewIndex === null ? state.session?.game.fen() : history[state.reviewIndex - 1]?.after;
}

function currentPuzzleMove() {
    const history = state.session?.game.history({ verbose: true }) || [];
    return state.reviewIndex === null ? history.at(-1) : history[state.reviewIndex - 1];
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
    board.drawArrow(move.from, move.to, { color: '#f2b84b', opacity: 0.58 });
}

function setTrainingToolsAvailability() {
    const unlocked = Boolean(state.session && (state.session.solved || state.outcomeRecorded) && !state.session.continuing);
    const finalGameOver = Boolean(state.reviewIndex === null && state.session?.game.isGameOver());
    $('engine-toggle').disabled = !unlocked || finalGameOver || Boolean(state.engineMatchSnapshot);
    $('engine-match-start').disabled = !unlocked || Boolean(state.engineMatchSnapshot);
    $('continue-position').disabled = !state.session?.solved || state.session.continuing
        || state.session.game.isGameOver() || state.reviewIndex !== null || Boolean(state.engineMatchSnapshot);
    if (!unlocked) {
        $('engine-state').textContent = 'Available after a miss or solution';
        $('engine-match-state').textContent = 'Available after a miss or solution';
    }
}

function cancelPromotion() {
    const resolver = promotionResolver;
    promotionResolver = null;
    if ($('promotion-dialog').open) $('promotion-dialog').close();
    resolver?.(null);
}

function stopEngineMatch({ restore = false } = {}) {
    const wasActive = Boolean(state.engineMatchSnapshot);
    engineMatch.stop({ notify: false });
    state.engineMatchSnapshot = null;
    $('engine-match-moves').replaceChildren();
    $('engine-match-pause').disabled = true;
    $('engine-match-pause').textContent = 'Pause';
    $('engine-match-stop').disabled = true;
    if (restore && wasActive && state.session) restorePuzzleDisplay();
}

function stopTrainingTools() {
    stopAnalysis();
    stopEngineMatch();
    cancelPromotion();
    $('engine-toggle').disabled = true;
    $('engine-state').textContent = 'Available after a miss or solution';
    $('engine-match-start').disabled = true;
    $('engine-match-state').textContent = 'Available after a miss or solution';
}

async function nextPuzzle({ invalidAttempts = 0, preferredPuzzleId = null } = {}) {
    const loadToken = ++state.loadToken;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    stopTrainingTools();
    state.outcomeRecorded = false;
    state.ratedOutcome = null;
    state.assisted = false;
    state.reviewIndex = null;
    updateReview();
    board.setInteractive(false);
    $('next-puzzle').disabled = true;
    $('puzzle-prompt').textContent = 'Loading puzzle';
    feedback('Selecting a verified puzzle for this training range.');
    const preferred = preferredPuzzleId && /^[A-Za-z0-9]{5}$/.test(preferredPuzzleId)
        ? state.data?.puzzles.find(puzzle => puzzle.id === preferredPuzzleId) : null;
    const selected = preferred ? { puzzle: preferred, source: 'curated-fallback', estimatedTotal: 1 } : await catalog.next({
        category: state.category, theme: state.theme, target: state.target, difficulty: state.difficulty,
    }, state.seen, { allowRemote: invalidAttempts < MAX_REMOTE_INVALID_ATTEMPTS });
    if (loadToken !== state.loadToken) return;
    const choice = selected.puzzle;
    if (!choice) {
        state.session = null;
        updateReview();
        board.setInteractive(false);
        $('puzzle-prompt').textContent = 'No puzzles in this range';
        feedback('Try another difficulty, rating, or theme.');
        $('next-puzzle').disabled = true;
        $('continue-position').disabled = true;
        $('source-game').hidden = true;
        $('progress-puzzle-id').textContent = 'No puzzle available';
        $('progress-puzzle-rating').textContent = 'Rating —';
        $('progress-puzzle-plays').textContent = 'Played — times';
        $('progress-source').hidden = true;
        $('progress-themes').replaceChildren();
        return;
    }
    try { state.session = new PuzzleSession(choice); }
    catch (error) {
        console.error('Invalid puzzle position', choice.id, error);
        state.seen.add(choice.id);
        if (invalidAttempts + 1 >= MAX_INVALID_ATTEMPTS) {
            state.session = null;
            board.setInteractive(false);
            $('puzzle-prompt').textContent = 'No valid puzzle available';
            feedback('This selection returned invalid positions. Choose another range or try again.');
            $('next-puzzle').disabled = false;
            return;
        }
        return nextPuzzle({ invalidAttempts: invalidAttempts + 1 });
    }
    state.seen.add(choice.id);
    state.movePending = false;
    state.orientation = state.session.game.turn() === 'w' ? 'white' : 'black';
    state.humanColor = state.session.game.turn();
    board.setOrientation(state.orientation);
    board.setPosition(state.session.game.fen(), { animate: false });
    showLastMove(state.session.setupMove);
    board.setInteractive(true);
    $('puzzle-prompt').textContent = 'Find the best move';
    feedback(`${state.orientation === 'white' ? 'White' : 'Black'} to move. Play the combination on the board.`);
    $('side-to-move').textContent = `${state.orientation === 'white' ? 'White' : 'Black'} to move`;
    $('puzzle-id').textContent = `Puzzle ${choice.id}`;
    $('puzzle-rating').textContent = `Puzzle rating ${choice.rating}`;
    $('next-puzzle').disabled = false;
    $('hint').disabled = false;
    $('reveal').disabled = false;
    $('source-game').href = choice.gameUrl;
    $('source-game').hidden = !/^https:\/\/lichess\.org\//.test(choice.gameUrl);
    $('progress-puzzle-id').textContent = `Puzzle ${choice.id}`;
    $('progress-puzzle-rating').textContent = `Rating ${choice.rating}`;
    $('progress-puzzle-plays').textContent = `Played ${Number(choice.plays || 0).toLocaleString()} times`;
    const fullCatalog = selected.source === 'full-catalog' || selected.source === 'local-full-catalog';
    $('catalog-source').textContent = selected.source === 'local-full-catalog' ? 'Full local Lichess catalog'
        : fullCatalog ? 'Full Lichess catalog' : 'Curated fallback';
    const count = catalog.countFor(state.category, state.theme, state.target, state.difficulty);
    $('level-availability').textContent = fullCatalog
        ? `${count ? count.matching.toLocaleString() + ' ' : ''}matching full-catalog puzzles${count ? '' : ' (count unavailable)'}`
        : `${activePool().length} curated fallback puzzles in this selection`;
    $('progress-source').href = choice.gameUrl;
    $('progress-source').hidden = $('source-game').hidden;
    $('progress-themes').replaceChildren(...choice.themes.map(tag => {
        const item = document.createElement('span');
        item.textContent = labelFor(tag);
        return item;
    }));
    drawMoves();
    updateReview();
    setTrainingToolsAvailability();
}

function updateReview() {
    const count = state.session?.game.history().length || 0;
    const available = Boolean(state.session?.solved && !state.session.continuing && !state.engineMatchSnapshot && count > 1);
    const cursor = state.reviewIndex ?? count;
    $('review-start').disabled = !available || cursor <= 1;
    $('review-prev').disabled = !available || cursor <= 1;
    $('review-next').disabled = !available || cursor >= count;
    $('review-end').disabled = !available || cursor >= count;
    $('review-position').textContent = available ? `Move ${cursor - 1} of ${count - 1}` : 'Review after solving';
}

function reviewTo(index) {
    const session = state.session;
    if (!session?.solved || session.continuing) return;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    const history = session.game.history({ verbose: true });
    state.reviewIndex = Math.max(1, Math.min(index, history.length));
    const reviewed = history[state.reviewIndex - 1];
    board.setPosition(reviewed.after, { animate: false });
    showLastMove(reviewed);
    $('side-to-move').textContent = `${reviewed.after.split(' ')[1] === 'w' ? 'White' : 'Black'} to move`;
    drawMoves();
    updateReview();
    setTrainingToolsAvailability();
    if (state.analysisActive) runAnalysis(reviewed.after);
}

function renderProgress() {
    const { rating, solved, failed, last } = state.progress;
    $('session-rating').textContent = rating;
    $('stats-solved').textContent = solved;
    $('stats-failed').textContent = failed;
    $('session-count').textContent = `${state.visitSolved} solved this session`;
    $('rating-change').textContent = last ? `${last.change > 0 ? '+' : ''}${last.change} on last rated puzzle` : 'Complete a puzzle to see a change.';
    $('stats-last').textContent = last ? `${last.outcome === 'solved' ? 'Solved' : 'Missed'} a ${last.puzzleRating}-rated puzzle.` : 'Your results will appear here.';
}

function renderStorageStatus() {
    const messages = {
        loading: 'Checking your account. Results are not saved until the account is ready.',
        guest: 'Guest practice is temporary. Sign in to save future results to your account.',
        saved: 'Your CAISSA training estimate and results are saved to your account. This is separate from other ratings.',
        error: 'Account progress is unavailable. An unsaved result may be pending; keep this page open and retry.',
    };
    $('progress-storage').textContent = messages[state.accountMode];
    $('retry-progress').hidden = state.accountMode !== 'error';
    $('rating-kind').textContent = state.accountMode === 'saved' ? 'Saved CAISSA training estimate' : 'Temporary training estimate';
}

function pendingKey(userId) { return `caissa:puzzles:pending:v1:${userId}`; }
function savePendingOutcomes() {
    if (!state.accountUserId) return;
    try {
        const key = pendingKey(state.accountUserId);
        if (state.pendingOutcomes.length) localStorage.setItem(key, JSON.stringify(state.pendingOutcomes));
        else localStorage.removeItem(key);
    } catch { /* The status remains unsaved if browser storage is unavailable. */ }
}
function loadPendingOutcomes(userId) {
    try {
        const value = JSON.parse(localStorage.getItem(pendingKey(userId)) || '[]');
        return Array.isArray(value) ? value.filter(item =>
            /^[A-Za-z0-9]{5}$/u.test(item?.puzzleId || '')
            && /^[0-9a-f-]{36}$/iu.test(item?.operationId || '')
            && ['solved', 'failed'].includes(item?.outcome)
            && typeof item?.assisted === 'boolean') : [];
    } catch { return []; }
}

async function accountRequest(method, body) {
    const token = await window.CAISSA_AUTH?.getToken?.();
    if (!token) throw new Error('Missing account session');
    const response = await fetch('/api/puzzles/progress', {
        method, cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Account progress HTTP ${response.status}`);
    return response.json();
}

let syncing = false;
async function syncOutcomes() {
    if (syncing || state.accountMode === 'guest' || !state.accountUserId) return;
    syncing = true;
    try {
        while (state.pendingOutcomes.length) {
            const result = await accountRequest('POST', state.pendingOutcomes[0]);
            if (result.progress?.duplicate) {
                const refreshed = await accountRequest('GET');
                state.progress = { ...refreshed.progress, last: null };
            } else {
                state.progress = { rating: result.progress.rating, solved: result.progress.solved,
                    failed: result.progress.failed, last: {
                        outcome: state.pendingOutcomes[0].outcome,
                        puzzleRating: state.pendingOutcomes[0].puzzleRating,
                        change: result.progress.change,
                    } };
            }
            state.pendingOutcomes.shift();
            savePendingOutcomes();
            state.accountMode = 'saved';
            renderStorageStatus();
            renderProgress();
        }
    } catch {
        state.accountMode = 'error';
        renderStorageStatus();
    } finally { syncing = false; }
}

async function initializeAccountProgress() {
    try { await window.CAISSA_AUTH?.whenReady?.(); } catch { /* guest practice remains available */ }
    const auth = window.CAISSA_AUTH;
    const userId = auth?.isSignedIn ? auth.userId : null;
    if (userId === state.accountUserId && state.accountMode !== 'loading') {
        if (state.accountMode === 'error') void syncOutcomes();
        return;
    }
    state.accountUserId = userId;
    state.progress = createSessionRating();
    state.pendingOutcomes = userId ? loadPendingOutcomes(userId) : [];
    if (!userId) state.accountMode = 'guest';
    else {
        try {
            const result = await accountRequest('GET');
            if (state.accountUserId !== userId) return;
            state.progress = { ...result.progress, last: null };
            state.accountMode = 'saved';
            if (state.pendingOutcomes.length) void syncOutcomes();
        } catch { state.accountMode = 'error'; }
    }
    renderStorageStatus();
    renderProgress();
}

function recordSessionOutcome(outcome) {
    if (state.outcomeRecorded || !state.session || state.session.revealed) return;
    state.outcomeRecorded = true;
    state.ratedOutcome = outcome;
    if (outcome === 'solved') state.visitSolved++;
    if (state.accountUserId) {
        state.pendingOutcomes.push({ operationId: crypto.randomUUID(), puzzleId: state.session.puzzle.id,
            puzzleRating: state.session.puzzle.rating, outcome, assisted: state.assisted });
        savePendingOutcomes();
        void syncOutcomes();
    } else state.progress = recordOutcome(state.progress, state.session.puzzle.rating, outcome);
    renderProgress();
}

function drawMoves() {
    const session = state.session;
    if (!session) return;
    const history = session.game.history({ verbose: true });
    $('move-list').replaceChildren(...history.map((move, index) => {
        const item = document.createElement('li');
        if (move.color === 'w' || index === 0) {
            const number = document.createElement('span');
            number.className = 'move-number';
            number.textContent = `${move.color === 'w' ? move.before.split(' ')[5] + '.' : move.before.split(' ')[5] + '…'}`;
            item.append(number);
        }
        const san = document.createElement('span');
        san.textContent = move.san;
        if (index === 0) san.className = 'opponent';
        if (state.reviewIndex === index + 1) item.className = 'review-current';
        item.append(san);
        return item;
    }));
}

function renderPosition() {
    board.setPosition(state.session.game.fen(), { animate: true });
    showLastMove(state.session.game.history({ verbose: true }).at(-1));
    drawMoves();
    $('side-to-move').textContent = `${state.session.game.turn() === 'w' ? 'White' : 'Black'} to move`;
}

function completed(revealed = false) {
    const terminal = state.session.game.isGameOver();
    if (!revealed) recordSessionOutcome('solved');
    $('puzzle-prompt').textContent = revealed ? 'Solution shown' : 'Puzzle solved';
    const cleanSolve = !revealed && !state.assisted && state.ratedOutcome === 'solved';
    feedback(terminal
        ? (revealed ? 'Checkmate. Review the moves or choose the next puzzle.' : `${cleanSolve ? 'Well done. ' : ''}Checkmate! Choose the next puzzle.`)
        : (revealed ? 'Review the moves, or choose the next puzzle.' : `${cleanSolve ? 'Well done. ' : ''}Analyze it or continue against Stockfish.`));
    $('hint').disabled = true;
    $('reveal').disabled = true;
    if (terminal) {
        stopAnalysis();
        $('engine-state').textContent = 'Game over';
        $('engine-eval').textContent = 'Checkmate. No legal moves remain.';
    } else if (state.analysisActive) runAnalysis(state.session.game.fen());
    else { $('engine-state').textContent = 'Off'; clearEngineOutput(); }
    board.setInteractive(false);
    updateReview();
    setTrainingToolsAvailability();
    if (!revealed && state.autoNext) state.nextTimer = setTimeout(nextPuzzle, 1300);
}

function choosePromotion(color) {
    cancelPromotion();
    const dialog = $('promotion-dialog');
    dialog.dataset.pieceColor = color;
    const names = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
    const glyphs = color === 'white'
        ? { q: '♕', r: '♖', b: '♗', n: '♘' }
        : { q: '♛', r: '♜', b: '♝', n: '♞' };
    for (const button of dialog.querySelectorAll('[data-promotion]')) {
        const piece = button.dataset.promotion;
        button.textContent = glyphs[piece];
        button.setAttribute('aria-label', `Promote to ${color} ${names[piece]}`);
    }
    return new Promise(resolve => {
        promotionResolver = choice => {
            promotionResolver = null;
            if (dialog.open) dialog.close();
            resolve(choice);
        };
        dialog.showModal();
        dialog.querySelector('[data-promotion="q"]').focus();
    });
}

async function handleMoveAttempt({ from, to, promotion }) {
    const session = state.session;
    if (!session || state.movePending || state.engineMatchSnapshot) return;
    if (session.continuing && session.game.turn() !== state.humanColor) return;
    const loadToken = state.loadToken;
    const piece = board.getPieceAt(from);
    let selectedPromotion = promotion;
    if (!selectedPromotion && piece?.type === 'P' && (to[1] === '1' || to[1] === '8')) {
        state.movePending = true;
        board.setInteractive(false);
        selectedPromotion = await choosePromotion(piece.color);
        state.movePending = false;
        if (loadToken !== state.loadToken || !selectedPromotion) {
            if (loadToken === state.loadToken) board.setInteractive(!session.solved || session.continuing);
            return;
        }
        board.setInteractive(true);
    }
    const result = session.attempt(from, to, selectedPromotion || 'q');
    if (result.status === 'incorrect') {
        recordSessionOutcome('failed');
        $('engine-state').textContent = 'Off · available after a miss';
        feedback('That is not the solution. Try again, or use Stockfish in Training for help.');
        showLastMove(currentPuzzleMove(), [{ square: to, type: 'error' }]);
        setTrainingToolsAvailability();
        return;
    }
    if (result.status === 'illegal') { feedback('That move is not legal in this position. Try another move.'); return; }
    if (result.status === 'complete') return;
    renderPosition();
    if (result.status === 'correct') feedback('Good move. Find the next one.');
    if (result.status === 'solved') completed();
    else if (state.analysisActive && !session.continuing) runAnalysis(session.game.fen());
    if (result.status === 'continued') {
        if (session.game.isGameOver()) { feedback('Game over. Choose another puzzle.'); board.setInteractive(false); }
        else { board.setInteractive(false); engine.play(session.game.fen()); feedback('Stockfish is thinking…'); }
    }
}
board.on('moveAttempt', payload => { void handleMoveAttempt(payload); });

function showEvaluation({ depth, type, score, pv, fen }) {
    if (!state.session || state.session.continuing || !state.analysisActive || fen !== state.analysisFen) return;
    const readable = readablePrincipalVariation(fen, pv);
    if (!readable) return;
    const value = type === 'mate' ? `Mate ${score}` : `${(score / 100).toFixed(2)}`;
    $('engine-eval').textContent = `Depth ${depth} · ${value} for side to move`;
    $('engine-best-move').textContent = `Best move: ${readable.bestMove} (${readable.bestUci.slice(0, 2)}→${readable.bestUci.slice(2, 4)})`;
    $('engine-variation').textContent = `Variation: ${readable.variation}`;
}

function engineMove(uci) {
    const session = state.session;
    if (!session?.continuing) return;
    try {
        session.playUci(uci);
        renderPosition();
        feedback(session.game.isGameOver() ? 'Game over. Choose another puzzle.' : 'Your move.');
        board.setInteractive(!session.game.isGameOver());
        if (session.game.isGameOver()) engine.stop();
    } catch { feedback('Engine returned an invalid move.'); }
}

function drawEngineMatchMoves(snapshot) {
    const moves = $('engine-match-moves');
    moves.replaceChildren(...snapshot.verboseMoves.map((move, index) => {
        const item = document.createElement('li');
        const number = move.before.split(' ')[5];
        item.textContent = `${move.color === 'w' ? `${number}. ` : `${number}… `}${move.san}`;
        if (index === snapshot.verboseMoves.length - 1) item.setAttribute('aria-current', 'true');
        return item;
    }));
    // Scroll only the move list. scrollIntoView also scrolls its ancestors and
    // can shift the entire page and board every time the engines make a move.
    moves.scrollTop = moves.scrollHeight;
}

function updateEngineMatch(snapshot) {
    if (!snapshot) return;
    state.engineMatchSnapshot = snapshot;
    board.setPosition(snapshot.fen, { animate: true });
    showLastMove(snapshot.verboseMoves.at(-1));
    $('side-to-move').textContent = `${snapshot.turn === 'w' ? 'White' : 'Black'} to move · Engine game`;
    drawEngineMatchMoves(snapshot);
    updateReview();
    setTrainingToolsAvailability();
}

function updateEngineMatchState({ status, reason }) {
    const labels = { running: 'Engines are playing', paused: 'Engine game paused', stopped: 'Engine game stopped' };
    $('engine-match-state').textContent = reason || labels[status] || status;
    $('engine-match-pause').disabled = !['running', 'paused'].includes(status);
    $('engine-match-pause').textContent = status === 'paused' ? 'Resume' : 'Pause';
    $('engine-match-stop').disabled = status === 'stopped';
}

function startEngineMatch() {
    if (!state.session || (!state.session.solved && !state.outcomeRecorded) || state.session.continuing) return;
    const fen = currentPuzzleFen();
    if (!fen) return;
    stopAnalysis();
    board.setInteractive(false);
    $('engine-match-moves').replaceChildren();
    try { engineMatch.start(fen); }
    catch {
        $('engine-match-state').textContent = 'This position cannot start an engine game.';
        restorePuzzleDisplay();
    }
}

function restorePuzzleDisplay() {
    if (!state.session) return;
    const fen = currentPuzzleFen();
    const move = currentPuzzleMove();
    board.setPosition(fen, { animate: false });
    showLastMove(move);
    $('side-to-move').textContent = `${fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move`;
    board.setInteractive(!state.session.solved && !state.session.continuing);
    drawMoves();
    updateReview();
    setTrainingToolsAvailability();
}

for (const name of ['themes', 'training', 'stats']) {
    $(`tab-${name}`).addEventListener('click', () => switchTab(name));
    $(`tab-${name}`).addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const tabs = ['themes', 'training', 'stats'];
        const next = tabs[(tabs.indexOf(name) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        switchTab(next);
        $(`tab-${next}`).focus();
    });
}
$('flip-board').addEventListener('click', () => {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    board.setOrientation(state.orientation);
});
$('next-puzzle').addEventListener('click', () => nextPuzzle());
for (const [id, target] of [['review-start', () => 1], ['review-prev', () => (state.reviewIndex ?? state.session.game.history().length) - 1], ['review-next', () => (state.reviewIndex ?? state.session.game.history().length) + 1], ['review-end', () => state.session.game.history().length]]) {
    $(id).addEventListener('click', () => reviewTo(target()));
}
$('auto-next').addEventListener('change', event => { state.autoNext = event.target.checked; });
$('retry-progress').addEventListener('click', () => {
    if (state.pendingOutcomes.length) void syncOutcomes();
    else void accountRequest('GET').then(result => {
        state.progress = { ...result.progress, last: null };
        state.accountMode = 'saved';
        renderProgress();
        renderStorageStatus();
    }).catch(() => renderStorageStatus());
});
$('hint').addEventListener('click', () => {
    if (!state.session || state.session.solved) return;
    state.assisted = true;
    const square = state.session.moves[state.session.index].slice(0, 2);
    showLastMove(currentPuzzleMove(), [{ square, type: 'hint' }]);
    feedback('The piece to move is highlighted.');
});
$('reveal').addEventListener('click', () => {
    if (!state.session || state.session.solved) return;
    state.session.reveal();
    renderPosition();
    completed(true);
});
$('engine-toggle').addEventListener('click', () => {
    if (!state.session?.solved && !state.outcomeRecorded) return;
    if (!state.analysisActive) {
        clearTimeout(state.nextTimer);
        state.nextTimer = null;
        runAnalysis(currentPuzzleFen());
    }
    else { stopAnalysis(); $('engine-state').textContent = 'Off'; }
});
$('continue-position').addEventListener('click', () => {
    const session = state.session;
    if (!session?.solved || session.continuing || session.game.isGameOver()) return;
    session.continuing = true;
    state.reviewIndex = null;
    renderPosition();
    updateReview();
    // A fresh worker prevents an old analysis bestmove from being mistaken for a play move.
    stopAnalysis();
    engine.start();
    $('engine-toggle').disabled = true;
    $('engine-state').textContent = 'Playing against Stockfish';
    $('continue-position').disabled = true;
    board.setInteractive(false);
    setTrainingToolsAvailability();
    feedback('Stockfish is thinking…');
    engine.play(session.game.fen());
});
$('engine-match-start').addEventListener('click', startEngineMatch);
$('engine-match-pause').addEventListener('click', () => {
    if (engineMatch.running) engineMatch.pause();
    else engineMatch.resume();
});
$('engine-match-stop').addEventListener('click', () => {
    stopEngineMatch({ restore: true });
    $('engine-match-state').textContent = 'Engine game stopped';
});
for (const button of $('promotion-dialog').querySelectorAll('[data-promotion]')) {
    button.addEventListener('click', () => promotionResolver?.(button.dataset.promotion));
}
$('promotion-cancel').addEventListener('click', cancelPromotion);
$('promotion-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelPromotion(); });
$('target-rating').addEventListener('input', event => { $('rating-output').value = event.target.value; });
$('target-rating').addEventListener('change', event => { state.target = Number(event.target.value); drawCategories(); drawThemes(); nextPuzzle(); });
$('difficulty').addEventListener('change', event => { state.difficulty = event.target.value; drawCategories(); drawThemes(); nextPuzzle(); });
window.addEventListener('pagehide', () => { clearTimeout(state.nextTimer); stopTrainingTools(); board.destroy(); }, { once: true });
window.addEventListener('caissa-auth-change', () => { void initializeAccountProgress(); });
window.addEventListener('online', () => { void syncOutcomes(); });

try {
    state.data = await catalog.initialize();
    await catalog.loadCounts();
    drawCategories();
    drawThemes();
    await initializeAccountProgress();
    const requestedPuzzle = new URLSearchParams(window.location.search).get('puzzle');
    await nextPuzzle({ preferredPuzzleId: requestedPuzzle });
    renderProgress();
    renderStorageStatus();
} catch (error) {
    console.error(error);
    board.setInteractive(false);
    feedback('The puzzle collection could not load. Refresh to try again.');
    $('next-puzzle').disabled = true;
}
