import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { PuzzleSession, labelFor, poolFor } from './model.js';
import { PuzzleEngine } from './engine.js';

const $ = id => document.getElementById(id);
const state = { data: null, category: 'Phases', theme: '', target: 1800, difficulty: 'normal', seen: new Set(), solved: 0, session: null, orientation: 'white', humanColor: 'w' };
const board = new CaissaBoardAdapter($('puzzle-board'), { position: 'start', interactive: true, animation: true, label: 'CAISSA puzzle position' });
const engine = new PuzzleEngine(showEvaluation, engineMove, message => {
    $('engine-toggle').checked = false;
    $('engine-state').textContent = message;
});

function activePool() {
    return poolFor(state.data.puzzles, { category: state.data.categories[state.category], theme: state.theme, target: state.target, difficulty: state.difficulty });
}

function feedback(text) { $('puzzle-feedback').textContent = text; }
function switchTab(name) {
    for (const tab of ['engine', 'themes', 'level']) {
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
            switchTab('engine');
        });
        return button;
    }));
    $('level-availability').textContent = `${activePool().length} puzzles in this selection`;
}

function stopEngine() {
    engine.stop();
    $('engine-toggle').checked = false;
    $('engine-toggle').disabled = true;
    $('engine-state').textContent = 'Available after solving';
    $('engine-eval').textContent = '';
}

function nextPuzzle() {
    stopEngine();
    const pool = activePool();
    if (!pool.length) {
        state.session = null;
        board.setInteractive(false);
        $('puzzle-prompt').textContent = 'No puzzles in this range';
        feedback('Try another difficulty, rating, or theme.');
        $('next-puzzle').disabled = true;
        $('continue-position').disabled = true;
        $('source-game').hidden = true;
        return;
    }
    let choices = pool.filter(puzzle => !state.seen.has(puzzle.id));
    if (!choices.length) { state.seen.clear(); choices = pool; }
    const choice = choices[Math.floor(Math.random() * choices.length)];
    try { state.session = new PuzzleSession(choice); }
    catch (error) {
        console.error('Invalid puzzle position', choice.id, error);
        state.seen.add(choice.id);
        if (state.seen.size < pool.length) return nextPuzzle();
        feedback('No valid positions in this selection.');
        return;
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
    drawMoves();
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
    if (!revealed) {
        state.solved += 1;
        $('session-count').textContent = `${state.solved} solved this session`;
    }
    $('puzzle-prompt').textContent = revealed ? 'Solution shown' : 'Puzzle solved';
    feedback(terminal
        ? (revealed ? 'Checkmate. Review the moves or choose the next puzzle.' : 'Well done. Checkmate! Choose the next puzzle.')
        : (revealed ? 'Review the moves, or choose the next puzzle.' : 'Well done. Analyze it or continue against Stockfish.'));
    $('hint').disabled = true;
    $('reveal').disabled = true;
    $('engine-toggle').disabled = terminal;
    $('engine-state').textContent = terminal ? 'Game over' : 'Off';
    $('engine-eval').textContent = terminal ? 'Checkmate. No legal moves remain.' : '';
    $('continue-position').disabled = terminal;
    board.setInteractive(false);
}

board.on('moveAttempt', ({ from, to, promotion }) => {
    const session = state.session;
    if (!session) return;
    if (session.continuing && session.game.turn() !== state.humanColor) return;
    const result = session.attempt(from, to, promotion || 'q');
    if (result.status === 'incorrect') { feedback('That is not the solution. Try again.'); board.highlightSquares([{ square: to, type: 'error' }]); return; }
    if (result.status === 'illegal' || result.status === 'complete') return;
    renderPosition();
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

for (const name of ['engine', 'themes', 'level']) {
    $(`tab-${name}`).addEventListener('click', () => switchTab(name));
    $(`tab-${name}`).addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const tabs = ['engine', 'themes', 'level'];
        const next = tabs[(tabs.indexOf(name) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
        switchTab(next);
        $(`tab-${next}`).focus();
    });
}
$('flip-board').addEventListener('click', () => {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    board.setOrientation(state.orientation);
});
$('next-puzzle').addEventListener('click', nextPuzzle);
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
    if (!state.session?.solved) return;
    if (event.target.checked) { engine.start(); engine.analyze(state.session.game.fen()); $('engine-state').textContent = 'Analyzing'; }
    else { engine.stop(); $('engine-state').textContent = 'Off'; $('engine-eval').textContent = ''; }
});
$('continue-position').addEventListener('click', () => {
    const session = state.session;
    if (!session?.solved || session.continuing || session.game.isGameOver()) return;
    session.continuing = true;
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
window.addEventListener('pagehide', () => { engine.stop(); board.destroy(); }, { once: true });

try {
    const response = await fetch('/data/puzzles/lichess-curated-preview.json');
    if (!response.ok) throw new Error(`Puzzle collection HTTP ${response.status}`);
    state.data = await response.json();
    drawCategories();
    drawThemes();
    nextPuzzle();
} catch (error) {
    console.error(error);
    board.setInteractive(false);
    feedback('The puzzle collection could not load. Refresh to try again.');
    $('next-puzzle').disabled = true;
}
