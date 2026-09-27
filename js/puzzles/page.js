import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { PuzzleSession, labelFor, poolFor } from './model.js';
import { PuzzleEngine } from './engine.js';
import { createSessionRating, recordOutcome } from './session-rating.js';
import { PuzzleCatalogSource } from './catalog-source.js';

const $ = id => document.getElementById(id);
const MAX_REMOTE_INVALID_ATTEMPTS = 12;
const MAX_INVALID_ATTEMPTS = 24;
const state = { data: null, category: 'Phases', theme: '', target: 1800, difficulty: 'normal', seen: new Set(), progress: createSessionRating(), outcomeRecorded: false, session: null, orientation: 'white', humanColor: 'w', reviewIndex: null, autoNext: false, nextTimer: null, loadToken: 0 };
const board = new CaissaBoardAdapter($('puzzle-board'), { position: 'start', interactive: true, animation: true, label: 'CAISSA puzzle position' });
const catalog = new PuzzleCatalogSource();
const engine = new PuzzleEngine(showEvaluation, engineMove, message => {
    $('engine-toggle').checked = false;
    $('engine-state').textContent = message;
});

function activePool() {
    return poolFor(state.data.puzzles, { category: state.data.categories[state.category], theme: state.theme, target: state.target, difficulty: state.difficulty });
}

function feedback(text) { $('puzzle-feedback').textContent = text; }
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
        button.type = 'button';
        button.textContent = category;
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
    const options = ['', ...tags.filter(tag => state.data.puzzles.some(puzzle => puzzle.themes.includes(tag)))];
    $('subthemes').replaceChildren(...options.map(tag => {
        const button = document.createElement('button');
        const title = document.createElement('span');
        const count = document.createElement('small');
        title.textContent = tag ? labelFor(tag) : `All ${state.category.toLowerCase()}`;
        count.textContent = `${poolFor(state.data.puzzles, { category: tags, theme: tag, target: state.target, difficulty: state.difficulty }).length}`;
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
    $('level-availability').textContent = `${activePool().length} puzzles in this selection`;
}

function stopEngine() {
    engine.stop();
    $('engine-toggle').checked = false;
    $('engine-toggle').disabled = true;
    $('engine-state').textContent = 'Available after a miss or solution';
    $('engine-eval').textContent = '';
}

async function nextPuzzle({ invalidAttempts = 0 } = {}) {
    const loadToken = ++state.loadToken;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    stopEngine();
    state.outcomeRecorded = false;
    state.reviewIndex = null;
    updateReview();
    board.setInteractive(false);
    $('next-puzzle').disabled = true;
    $('puzzle-prompt').textContent = 'Loading puzzle';
    feedback('Selecting a verified puzzle for this training range.');
    const selected = await catalog.next({
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
    state.orientation = state.session.game.turn() === 'w' ? 'white' : 'black';
    state.humanColor = state.session.game.turn();
    board.setOrientation(state.orientation);
    board.setPosition(state.session.game.fen(), { animate: false });
    board.clearHighlights();
    board.setInteractive(true);
    $('puzzle-prompt').textContent = 'Find the best move';
    feedback(`${state.orientation === 'white' ? 'White' : 'Black'} to move. Play the combination on the board.`);
    $('side-to-move').textContent = `${state.orientation === 'white' ? 'White' : 'Black'} to move`;
    $('puzzle-id').textContent = `Puzzle ${choice.id}`;
    $('puzzle-rating').textContent = `Puzzle rating ${choice.rating}`;
    $('continue-position').disabled = true;
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
    $('level-availability').textContent = fullCatalog
        ? `${selected.estimatedTotal == null ? '' : `About ${Number(selected.estimatedTotal).toLocaleString()} `}matching full-catalog puzzles`
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
}

function updateReview() {
    const count = state.session?.game.history().length || 0;
    const available = Boolean(state.session?.solved && !state.session.continuing && count > 1);
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
    if ($('engine-toggle').checked) {
        engine.stop();
        $('engine-toggle').checked = false;
        $('engine-state').textContent = 'Off';
        $('engine-eval').textContent = '';
    }
    board.clearHighlights();
    board.setPosition(history[state.reviewIndex - 1].after, { animate: false });
    $('side-to-move').textContent = `${history[state.reviewIndex - 1].after.split(' ')[1] === 'w' ? 'White' : 'Black'} to move`;
    drawMoves();
    updateReview();
}

function renderProgress() {
    const { rating, solved, failed, last } = state.progress;
    $('session-rating').textContent = rating;
    $('stats-solved').textContent = solved;
    $('stats-failed').textContent = failed;
    $('session-count').textContent = `${solved} solved this session`;
    $('rating-change').textContent = last ? `${last.change > 0 ? '+' : ''}${last.change} on last rated puzzle` : 'Complete a puzzle to see a change.';
    $('stats-last').textContent = last ? `${last.outcome === 'solved' ? 'Solved' : 'Missed'} a ${last.puzzleRating}-rated puzzle.` : 'Your results will appear here.';
}

function recordSessionOutcome(outcome) {
    if (state.outcomeRecorded || !state.session || state.session.revealed) return;
    state.outcomeRecorded = true;
    state.progress = recordOutcome(state.progress, state.session.puzzle.rating, outcome);
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
    board.clearHighlights();
    board.setPosition(state.session.game.fen(), { animate: true });
    drawMoves();
    $('side-to-move').textContent = `${state.session.game.turn() === 'w' ? 'White' : 'Black'} to move`;
}

function completed(revealed = false) {
    const terminal = state.session.game.isGameOver();
    if (!revealed) recordSessionOutcome('solved');
    $('puzzle-prompt').textContent = revealed ? 'Solution shown' : 'Puzzle solved';
    const cleanSolve = !revealed && state.progress.last?.outcome === 'solved' && state.outcomeRecorded;
    feedback(terminal
        ? (revealed ? 'Checkmate. Review the moves or choose the next puzzle.' : `${cleanSolve ? 'Well done. ' : ''}Checkmate! Choose the next puzzle.`)
        : (revealed ? 'Review the moves, or choose the next puzzle.' : `${cleanSolve ? 'Well done. ' : ''}Analyze it or continue against Stockfish.`));
    $('hint').disabled = true;
    $('reveal').disabled = true;
    $('engine-toggle').disabled = terminal;
    $('engine-state').textContent = terminal ? 'Game over' : 'Off';
    $('engine-eval').textContent = terminal ? 'Checkmate. No legal moves remain.' : '';
    $('continue-position').disabled = terminal;
    board.setInteractive(false);
    updateReview();
    if (!revealed && state.autoNext) state.nextTimer = setTimeout(nextPuzzle, 1300);
}

board.on('moveAttempt', ({ from, to, promotion }) => {
    const session = state.session;
    if (!session) return;
    if (session.continuing && session.game.turn() !== state.humanColor) return;
    const result = session.attempt(from, to, promotion || 'q');
    if (result.status === 'incorrect') {
        recordSessionOutcome('failed');
        $('engine-toggle').disabled = false;
        $('engine-state').textContent = 'Off · available after a miss';
        feedback('That is not the solution. Try again, or use Stockfish in Training for help.');
        board.highlightSquares([{ square: to, type: 'error' }]);
        return;
    }
    if (result.status === 'illegal') { feedback('That move is not legal in this position. Try another move.'); return; }
    if (result.status === 'complete') return;
    renderPosition();
    if ($('engine-toggle').checked && !session.continuing) engine.analyze(session.game.fen());
    if (result.status === 'correct') feedback('Good move. Find the next one.');
    if (result.status === 'solved') completed();
    if (result.status === 'continued') {
        if (session.game.isGameOver()) { feedback('Game over. Choose another puzzle.'); board.setInteractive(false); }
        else { board.setInteractive(false); engine.play(session.game.fen()); feedback('Stockfish is thinking…'); }
    }
});
board.on('promotionRequest', () => {
    const requested = window.prompt('Promote to Q, R, B, or N', 'Q');
    return /^[qrbn]$/i.test(requested || '') ? requested.toUpperCase() : 'Q';
});

function showEvaluation({ depth, type, score }) {
    if (!state.session || state.session.continuing) return;
    const value = type === 'mate' ? `Mate ${score}` : `${(score / 100).toFixed(2)}`;
    $('engine-eval').textContent = `Depth ${depth} · ${value} for side to move`;
}

function engineMove(uci) {
    const session = state.session;
    if (!session?.continuing) return;
    try {
        session.playUci(uci);
        renderPosition();
        feedback(session.game.isGameOver() ? 'Game over. Choose another puzzle.' : 'Your move.');
        board.setInteractive(!session.game.isGameOver());
    } catch { feedback('Engine returned an invalid move.'); }
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
$('hint').addEventListener('click', () => {
    if (!state.session || state.session.solved) return;
    const square = state.session.moves[state.session.index].slice(0, 2);
    board.highlightSquares([{ square, type: 'hint' }]);
    feedback('The piece to move is highlighted.');
});
$('reveal').addEventListener('click', () => {
    if (!state.session || state.session.solved) return;
    state.session.reveal();
    renderPosition();
    completed(true);
});
$('engine-toggle').addEventListener('change', event => {
    if (!state.session?.solved && !state.outcomeRecorded) return;
    if (event.target.checked) {
        clearTimeout(state.nextTimer);
        state.nextTimer = null;
        if (state.reviewIndex !== null) {
            reviewTo(state.session.game.history().length);
            event.target.checked = true;
        }
        engine.start(); engine.analyze(state.session.game.fen()); $('engine-state').textContent = 'Analyzing';
    }
    else { engine.stop(); $('engine-state').textContent = 'Off'; $('engine-eval').textContent = ''; }
});
$('continue-position').addEventListener('click', () => {
    const session = state.session;
    if (!session?.solved || session.continuing || session.game.isGameOver()) return;
    session.continuing = true;
    state.reviewIndex = null;
    renderPosition();
    updateReview();
    // A fresh worker prevents an old analysis bestmove from being mistaken for a play move.
    engine.stop();
    engine.start();
    $('engine-toggle').checked = true;
    $('engine-toggle').disabled = true;
    $('engine-state').textContent = 'Playing against Stockfish';
    $('continue-position').disabled = true;
    board.setInteractive(false);
    feedback('Stockfish is thinking…');
    engine.play(session.game.fen());
});
$('target-rating').addEventListener('input', event => { $('rating-output').value = event.target.value; });
$('target-rating').addEventListener('change', event => { state.target = Number(event.target.value); drawThemes(); nextPuzzle(); });
$('difficulty').addEventListener('change', event => { state.difficulty = event.target.value; drawThemes(); nextPuzzle(); });
window.addEventListener('pagehide', () => { clearTimeout(state.nextTimer); engine.stop(); board.destroy(); }, { once: true });

try {
    state.data = await catalog.initialize();
    drawCategories();
    drawThemes();
    await nextPuzzle();
    renderProgress();
} catch (error) {
    console.error(error);
    board.setInteractive(false);
    feedback('The puzzle collection could not load. Refresh to try again.');
    $('next-puzzle').disabled = true;
}
