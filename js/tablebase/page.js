import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { START_FEN, moverOutcome, positionOutcome, resultLabel, outcomeChange } from './model.js';

const $ = id => document.getElementById(id);
const game = new Chess(START_FEN);
const board = new CaissaBoardAdapter($('tablebase-board'), { position: START_FEN, interactive: true, animation: true, label: 'CAISSA endgame tablebase board' });
let origin = START_FEN;
let result = null;
let request = null;
let generation = 0;
let activeTab = 'result';
let revealed = false;
let feedback = '';

function tab(name) {
    activeTab = name;
    for (const key of ['result', 'moves', 'train']) {
        const selected = key === name;
        $(`tab-${key}`).setAttribute('aria-selected', String(selected));
        $(`tab-${key}`).tabIndex = selected ? 0 : -1;
        $(`panel-${key}`).hidden = !selected;
    }
    if (name === 'train') renderTraining();
}

function renderTraining() {
    $('train-prompt').textContent = result
        ? `Find a move that preserves the ${positionOutcome(result.category) === 'win' ? 'win' : positionOutcome(result.category) === 'draw' ? 'draw' : 'best available result'}.`
        : 'Load a supported position to practice.';
    $('train-feedback').textContent = feedback || (revealed ? 'Solution shown. Choose a move from the Moves tab to continue.' : 'The move list stays hidden until you reveal it.');
    $('reveal-answer').disabled = !result;
    $('reveal-answer').textContent = revealed ? 'View moves' : 'Reveal moves';
}

function moveRow(move) {
    const outcome = moverOutcome(move.category);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tb-move tb-${outcome}`;
    const san = document.createElement('strong');
    san.textContent = move.san;
    const detail = document.createElement('span');
    detail.textContent = [outcome.toUpperCase(), move.zeroing ? 'Zeroing' : move.dtz !== null ? `DTZ ${Math.abs(move.dtz)}` : null,
        move.dtm !== null ? `DTM ${Math.abs(move.dtm)}` : null].filter(Boolean).join(' · ');
    button.append(san, detail);
    button.addEventListener('click', () => play(move.uci));
    return button;
}

function renderMoves() {
    const groups = $('move-groups');
    groups.replaceChildren();
    if (!result) { groups.textContent = 'No tablebase moves available.'; return; }
    for (const outcome of ['win', 'draw', 'loss', 'unknown']) {
        const moves = result.moves.filter(move => moverOutcome(move.category) === outcome);
        if (!moves.length) continue;
        const section = document.createElement('section');
        section.className = 'tb-move-group';
        const heading = document.createElement('h3');
        heading.textContent = `${{ win: 'Winning', draw: 'Drawing', loss: 'Losing', unknown: 'Uncertain' }[outcome]} moves · ${moves.length}`;
        section.append(heading, ...moves.map(moveRow));
        groups.append(section);
    }
}

function renderPosition(lastMove) {
    board.setPosition(game.fen(), { animate: Boolean(lastMove) });
    board.clearHighlights();
    if (lastMove) board.highlightSquares([{ square: lastMove.from, type: 'last' }, { square: lastMove.to, type: 'last' }]);
    $('fen-input').value = game.fen();
    $('side-to-move').textContent = `${game.turn() === 'w' ? 'White' : 'Black'} to move`;
    $('piece-count').textContent = `${game.board().flat().filter(Boolean).length} pieces`;
    $('undo-move').disabled = game.history().length === 0;
    history.replaceState(null, '', `${location.pathname}?fen=${encodeURIComponent(game.fen())}`);
}

function renderResult(note = '') {
    if (!result) {
        $('result-label').textContent = 'Result unavailable';
        $('result-label').dataset.outcome = 'unknown';
        $('result-dtz').textContent = '—';
        $('result-dtm').textContent = '—';
        $('result-note').textContent = note || 'Try again shortly.';
    } else {
        $('result-label').textContent = resultLabel(result.category, game.turn());
        $('result-label').dataset.outcome = positionOutcome(result.category);
        $('result-dtz').textContent = result.dtz === null ? '—' : String(Math.abs(result.dtz));
        $('result-dtm').textContent = result.dtm === null ? '—' : String(Math.abs(result.dtm));
        $('result-note').textContent = note || (result.category === 'cursed-win' || result.category === 'blessed-loss'
            ? 'The 50-move rule changes the theoretical outcome.'
            : result.checkmate ? 'Checkmate.' : result.stalemate ? 'Stalemate.'
            : result.insufficientMaterial ? 'Insufficient material.' : 'Exact result with perfect play.');
    }
    renderMoves();
    renderTraining();
}

async function lookup() {
    const token = ++generation;
    request?.abort();
    request = new AbortController();
    const fen = game.fen();
    result = null;
    $('result-label').textContent = 'Checking tablebase…';
    $('result-note').textContent = 'Contacting the tablebase.';
    $('result-dtz').textContent = $('result-dtm').textContent = '—';
    $('move-groups').textContent = 'Loading legal moves…';
    renderTraining();
    try {
        const response = await fetch(`/api/tablebase/standard?fen=${encodeURIComponent(fen)}`, { signal: request.signal });
        const data = await response.json();
        if (token !== generation) return;
        if (!response.ok) throw new Error(data.error || 'Tablebase unavailable');
        if (data.fen !== fen) throw new Error('Tablebase position mismatch');
        result = data;
        renderResult();
    } catch (error) {
        if (token !== generation || error.name === 'AbortError') return;
        renderResult(error.message);
    }
}

function play(uci, promotion = 'q') {
    const previous = result;
    let move;
    try { move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || promotion }); }
    catch { return false; }
    const known = previous?.moves.find(item => item.uci === move.lan);
    feedback = activeTab === 'train' && !revealed && known
        ? `${move.san}: ${outcomeChange(previous.category, known.category)}` : '';
    revealed = false;
    $('fen-error').textContent = '';
    renderPosition(move);
    void lookup();
    if (activeTab === 'train') $('train-feedback').textContent = feedback;
    return true;
}

board.on('moveAttempt', ({ from, to, promotion }) => { play(`${from}${to}`, promotion || 'q'); });

$('fen-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
        const candidate = new Chess($('fen-input').value.trim());
        const count = candidate.board().flat().filter(Boolean).length;
        if (count < 2 || count > 7) throw new Error('Use a position with 2 to 7 pieces.');
        if (candidate.fen().split(' ')[2] !== '-') throw new Error('Castling rights are not supported.');
        game.load(candidate.fen());
        origin = game.fen();
        feedback = ''; revealed = false;
        $('fen-error').textContent = '';
        renderPosition();
        void lookup();
    } catch (error) { $('fen-error').textContent = error.message === 'Invalid FEN' ? 'Enter a valid chess FEN.' : error.message; }
});

$('reset-position').addEventListener('click', () => { game.load(origin); feedback = ''; revealed = false; renderPosition(); void lookup(); });
$('undo-move').addEventListener('click', () => { if (game.undo()) { feedback = ''; revealed = false; renderPosition(); void lookup(); } });
$('flip-board').addEventListener('click', () => board.setOrientation(board.getOrientation() === 'white' ? 'black' : 'white'));
$('copy-fen').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(game.fen()); $('copy-fen').textContent = 'Copied'; setTimeout(() => { $('copy-fen').textContent = 'Copy FEN'; }, 1800); }
    catch { $('fen-input').select(); }
});
$('reveal-answer').addEventListener('click', () => { revealed = true; tab('moves'); });
for (const key of ['result', 'moves', 'train']) {
    $(`tab-${key}`).addEventListener('click', () => tab(key));
    $(`tab-${key}`).addEventListener('keydown', event => {
        const keys = ['result', 'moves', 'train'];
        const index = keys.indexOf(key);
        const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : -1;
        if (next !== -1) { event.preventDefault(); tab(keys[next]); $(`tab-${keys[next]}`).focus(); }
    });
}

const linkedFen = new URLSearchParams(location.search).get('fen');
if (linkedFen) {
    $('fen-input').value = linkedFen;
    $('fen-form').requestSubmit();
} else { renderPosition(); void lookup(); }
