import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import {
    START_FEN, categoryProfile, exactTrainingMoves, moverOutcome, moveSetupPiece, navigateLine,
    outcomeChange, parseSetupDraft, positionOutcome, resultExplanation, resultLabel,
    setupDraftFen, updateSetupSquare
} from './model.js';

const $ = id => document.getElementById(id);
const TABS = ['setup', 'moves', 'game'];
const game = new Chess(START_FEN);
const board = new CaissaBoardAdapter($('tablebase-board'), {
    position: START_FEN,
    interactive: true,
    animation: true,
    tapPolicy: 'intent-only',
    dragPolicy: 'mouse',
    label: 'CAISSA endgame tablebase board'
});

let origin = START_FEN;
let result = null;
let request = null;
let generation = 0;
let activeTab = 'moves';
let revealed = false;
let feedback = '';
let selectedSquare = null;
let setupDraft = null;
let setupTool = 'move';
let setupSelectedSquare = null;
let pendingPromotion = null;
let future = [];
let replayTimer = null;

function validateCandidate(raw) {
    let candidate;
    try { candidate = new Chess(String(raw).trim()); }
    catch { throw new Error('Enter a valid chess FEN.'); }
    const count = candidate.board().flat().filter(Boolean).length;
    if (count < 2 || count > 7) throw new Error('Use a position with 2 to 7 pieces.');
    const fields = candidate.fen().split(' ');
    if (fields[2] !== '-') throw new Error('Castling rights are not supported.');
    const previousMoverProbe = [...fields];
    previousMoverProbe[1] = fields[1] === 'w' ? 'b' : 'w';
    previousMoverProbe[3] = '-';
    try {
        if (new Chess(previousMoverProbe.join(' ')).inCheck()) throw new Error('The position is not reachable by legal play.');
    } catch (error) {
        if (error.message === 'The position is not reachable by legal play.') throw error;
        throw new Error('Enter a valid chess FEN.');
    }
    return candidate.fen();
}

function tab(name) {
    stopReplay();
    const leavingSetup = activeTab === 'setup' && name !== 'setup';
    activeTab = name;
    for (const key of TABS) {
        const selected = key === name;
        $(`tab-${key}`).setAttribute('aria-selected', String(selected));
        $(`tab-${key}`).tabIndex = selected ? 0 : -1;
        $(`panel-${key}`).hidden = !selected;
    }
    if (name === 'setup') {
        if (!setupDraft) setupDraft = parseSetupDraft(game.fen());
        renderSetup();
    } else {
        if (leavingSetup) renderPosition();
        if (name === 'game') renderTraining();
    }
    renderLine();
}

function stopReplay() {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null;
    $('line-play').textContent = '▶';
    $('line-play').setAttribute('aria-label', 'Replay line');
}

function renderLine() {
    const past = game.history({ verbose: true });
    const line = $('game-line');
    line.replaceChildren();
    if (!past.length && !future.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No moves in this position yet.';
        line.append(empty);
    } else {
        const start = document.createElement('button');
        start.type = 'button';
        start.textContent = 'Start';
        start.setAttribute('aria-label', 'Go to starting position');
        start.disabled = activeTab === 'setup';
        if (!past.length) start.setAttribute('aria-current', 'step');
        start.addEventListener('click', () => goToPly(0));
        line.append(start);
        [...past, ...future].forEach((move, index) => {
            if (move.color === 'w' || index === 0) {
                const number = document.createElement('span');
                number.className = 'tb-move-number';
                const fullmove = Number(move.before?.split(' ')[5] || origin.split(' ')[5]);
                number.textContent = `${fullmove}${move.color === 'b' ? '...' : '.'}`;
                line.append(number);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = move.san;
            button.setAttribute('aria-label', `Go to move ${index + 1}: ${move.san}`);
            button.disabled = activeTab === 'setup';
            if (index + 1 === past.length) button.setAttribute('aria-current', 'step');
            button.addEventListener('click', () => goToPly(index + 1));
            line.append(button);
        });
    }
    const available = activeTab !== 'setup';
    $('line-first').disabled = $('line-prev').disabled = !available || past.length === 0;
    $('line-next').disabled = $('line-last').disabled = !available || future.length === 0;
    $('line-play').disabled = !available || (!past.length && !future.length);
}

function goToPly(target, automatic = false) {
    if (!automatic) stopReplay();
    future = navigateLine(game, future, target);
    feedback = '';
    revealed = false;
    renderPosition();
    void lookup();
}

function boardHelp(text) {
    const target = document.querySelector('.tb-board-foot span:first-child');
    if (target) target.textContent = text;
}

function clearBoardSelection() {
    selectedSquare = null;
    setupSelectedSquare = null;
    board.clearSelection();
    board.clearHighlights();
}

function renderTraining() {
    const profile = result ? categoryProfile(result.category) : null;
    const outcome = result ? positionOutcome(result.category) : 'unknown';
    const solution = $('train-solution');
    solution.replaceChildren();
    solution.hidden = !revealed;

    if (!result) {
        $('train-prompt').textContent = 'Wait for a supported position before practicing.';
        $('reveal-answer').disabled = true;
    } else if (!profile.exact) {
        $('train-prompt').textContent = 'The provider cannot grade this position exactly.';
        $('reveal-answer').disabled = true;
    } else if (!result.moves.length) {
        $('train-prompt').textContent = 'This position is terminal; there is no move to find.';
        $('reveal-answer').disabled = true;
    } else {
        const target = outcome === 'win' ? 'win' : outcome === 'draw' ? 'draw' : 'best available result';
        $('train-prompt').textContent = `Find a move that preserves the ${target}.`;
        $('reveal-answer').disabled = false;
    }

    $('train-feedback').textContent = feedback || (!profile?.exact
        ? 'No exact training grade is available for this provider response.'
        : revealed ? 'The preserving moves are shown below.' : 'The solution stays hidden until you reveal it or play a move.');
    $('reveal-answer').textContent = revealed ? 'Hide solution' : 'Reveal solution';

    if (revealed && result && profile.exact) {
        const moves = exactTrainingMoves(result);
        const intro = document.createElement('p');
        intro.textContent = moves.length ? `${moves.length} move${moves.length === 1 ? '' : 's'} preserve the result:`
            : 'No legal move preserves the current result.';
        solution.append(intro, ...moves.map(moveRow));
    }
}

function moveDetail(move) {
    const outcome = moverOutcome(move.category);
    const labels = { win: 'WIN', draw: 'DRAW', loss: 'LOSS', unknown: 'UNCERTAIN' };
    const fifty = ['cursed-win', 'blessed-loss'].includes(move.category) ? '50-MOVE' : null;
    const distance = move.zeroing ? 'ZEROING' : move.dtz !== null ? `DTZ ${move.preciseDtz === null ? '≈' : ''}${Math.abs(move.dtz)}` : null;
    return [labels[outcome], fifty, distance, move.dtm !== null ? `DTM ${Math.abs(move.dtm)}` : null].filter(Boolean).join(' · ');
}

function moveRow(move) {
    const outcome = moverOutcome(move.category);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tb-move tb-${outcome}`;
    button.dataset.uci = move.uci;
    const san = document.createElement('strong');
    san.textContent = move.san;
    const detail = document.createElement('span');
    detail.textContent = moveDetail(move);
    button.append(san, detail);
    button.addEventListener('click', () => play(move.uci));
    return button;
}

function renderMoves() {
    const groups = $('move-groups');
    groups.replaceChildren();
    if (!result) { groups.textContent = 'No tablebase moves available.'; return; }
    if (!result.moves.length) {
        groups.textContent = result.checkmate ? 'Checkmate. There are no legal moves.'
            : result.stalemate ? 'Stalemate. There are no legal moves.' : 'There are no legal moves.';
        return;
    }
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

function renderPosition(lastMove = null) {
    clearBoardSelection();
    board.setPosition(game.fen(), { animate: Boolean(lastMove) });
    if (lastMove) board.highlightSquares([{ square: lastMove.from, type: 'last' }, { square: lastMove.to, type: 'last' }]);
    $('fen-input').value = game.fen();
    $('side-to-move').textContent = `${game.turn() === 'w' ? 'White' : 'Black'} to move`;
    $('piece-count').textContent = `${game.board().flat().filter(Boolean).length} pieces`;
    $('undo-move').disabled = game.history().length === 0;
    $('reset-position').textContent = 'Reset';
    boardHelp('Play a legal move or choose one from Moves.');
    history.replaceState(null, '', `${location.pathname}?fen=${encodeURIComponent(game.fen())}`);
    renderLine();
}

function resultNote() {
    if (!result) return 'Try again shortly.';
    if (result.checkmate) return 'Checkmate. The side to move has lost.';
    if (result.stalemate) return 'Stalemate.';
    if (result.insufficientMaterial) return 'Draw by insufficient material.';
    const halfmove = Number(game.fen().split(' ')[4]);
    return `${resultExplanation(result.category)} Halfmove clock: ${halfmove}/100 plies.`;
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
        $('result-dtz').textContent = result.dtz === null ? 'DTZ —'
            : `DTZ ${result.preciseDtz === null ? '≈' : ''}${Math.abs(result.dtz)}`;
        $('result-dtm').textContent = result.dtm === null || positionOutcome(result.category) === 'draw'
            ? 'DTM —' : `DTM ${Math.abs(result.dtm)}`;
        $('result-note').textContent = note || resultNote();
    }
    renderMoves();
    renderTraining();
}

async function lookup() {
    if (activeTab === 'setup') return;
    const token = ++generation;
    request?.abort();
    request = new AbortController();
    const fen = game.fen();
    result = null;
    $('result-label').textContent = 'Checking tablebase…';
    $('result-label').dataset.outcome = 'unknown';
    $('result-note').textContent = 'Contacting the tablebase.';
    $('result-dtz').textContent = 'DTZ —';
    $('result-dtm').textContent = 'DTM —';
    $('move-groups').textContent = 'Loading legal moves…';
    renderTraining();
    try {
        const response = await fetch(`/api/tablebase/standard?fen=${encodeURIComponent(fen)}`, { signal: request.signal });
        const data = await response.json().catch(() => ({}));
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

function closePromotion() {
    pendingPromotion = null;
    $('promotion-dialog').hidden = true;
    document.querySelector('.caissa-standalone-layout').inert = false;
    board.setReadOnly(false);
    $('tablebase-board').querySelector('[role="grid"]')?.focus();
}

function openPromotion(from, to, choices) {
    pendingPromotion = { from, to, choices };
    board.setReadOnly(true);
    document.querySelector('.caissa-standalone-layout').inert = true;
    const dialog = $('promotion-dialog');
    dialog.hidden = false;
    dialog.querySelectorAll('[data-promotion]').forEach(button => { button.hidden = !choices.includes(button.dataset.promotion); });
    dialog.querySelector('[data-promotion]:not([hidden])')?.focus();
}

function play(uci, requestedPromotion = null) {
    const previous = result;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    let promotion = (uci[4] || requestedPromotion || '').toLowerCase();
    const candidates = game.moves({ square: from, verbose: true }).filter(move => move.to === to);
    const promotions = [...new Set(candidates.map(move => move.promotion).filter(Boolean))];
    if (promotions.length && !promotion) {
        openPromotion(from, to, promotions);
        return false;
    }
    if (promotions.length && !promotions.includes(promotion)) return false;
    let move;
    try { move = game.move({ from, to, ...(promotion ? { promotion } : {}) }); }
    catch { return false; }
    stopReplay();
    future = [];
    const known = previous?.moves.find(item => item.uci === move.lan);
    feedback = activeTab === 'game' && !revealed
        ? known ? `${move.san}: ${outcomeChange(previous.category, known.category)}`
            : `${move.san}: This move could not be graded from the loaded provider response.` : '';
    revealed = false;
    $('fen-error').textContent = '';
    renderPosition(move);
    void lookup();
    if (activeTab === 'game') $('train-feedback').textContent = feedback;
    return true;
}

function selectLegalSquare(square) {
    const piece = game.get(square);
    if (!piece || piece.color !== game.turn()) { clearBoardSelection(); return; }
    const moves = game.moves({ square, verbose: true });
    if (!moves.length) { clearBoardSelection(); return; }
    selectedSquare = square;
    board.selectSquare(square);
    board.clearHighlights();
    board.highlightSquares(moves.map(move => ({ square: move.to, type: 'legal' })));
}

function handlePlayTap(square) {
    if (!selectedSquare) { selectLegalSquare(square); return; }
    if (selectedSquare === square) { clearBoardSelection(); return; }
    const ownPiece = game.get(square)?.color === game.turn();
    if (ownPiece) { selectLegalSquare(square); return; }
    const from = selectedSquare;
    clearBoardSelection();
    play(`${from}${square}`);
}

function renderSetupPalette() {
    document.querySelectorAll('#setup-palette button').forEach(button => {
        const value = button.dataset.setupPiece || button.dataset.setupTool;
        button.setAttribute('aria-pressed', String(value === setupTool));
    });
}

function renderSetup() {
    clearBoardSelection();
    const fen = setupDraftFen(setupDraft);
    board.setPosition(fen, { animate: false });
    $('setup-turn').value = setupDraft.turn;
    $('setup-halfmove').value = String(setupDraft.halfmove);
    $('side-to-move').textContent = 'Setup draft';
    $('piece-count').textContent = `${Object.keys(setupDraft.pieces).length} pieces`;
    $('reset-position').textContent = 'Restart setup';
    $('undo-move').disabled = true;
    boardHelp('Place, erase, tap, or drag pieces. Load explicitly when the draft is ready.');
    renderSetupPalette();
    renderLine();
}

function updateSetup(next) {
    setupDraft = next;
    $('setup-error').textContent = '';
    renderSetup();
}

function handleSetupTap(square) {
    if (setupTool === 'erase') { updateSetup(updateSetupSquare(setupDraft, square)); return; }
    if (/^[prnbqk]$/i.test(setupTool)) { updateSetup(updateSetupSquare(setupDraft, square, setupTool)); return; }
    if (!setupSelectedSquare) {
        if (!setupDraft.pieces[square]) return;
        setupSelectedSquare = square;
        board.selectSquare(square);
        return;
    }
    if (setupSelectedSquare === square) { clearBoardSelection(); return; }
    updateSetup(moveSetupPiece(setupDraft, setupSelectedSquare, square));
}

board.on('squareTap', square => activeTab === 'setup' ? handleSetupTap(square) : handlePlayTap(square));
board.on('dragStart', square => {
    if (activeTab === 'setup') return Boolean(setupDraft?.pieces[square]);
    const piece = game.get(square);
    if (!piece || piece.color !== game.turn()) return false;
    selectLegalSquare(square);
    return true;
});
board.on('moveAttempt', ({ from, to, promotion }) => {
    if (activeTab === 'setup') updateSetup(moveSetupPiece(setupDraft, from, to));
    else play(`${from}${to}`, promotion);
});

$('fen-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
        const fen = validateCandidate($('fen-input').value);
        game.load(fen);
        origin = game.fen();
        future = [];
        setupDraft = null;
        feedback = '';
        revealed = false;
        $('fen-error').textContent = '';
        tab('moves');
        renderPosition();
        void lookup();
    } catch (error) { $('fen-error').textContent = error.message; }
});

$('reset-position').addEventListener('click', () => {
    if (activeTab === 'setup') { setupDraft = parseSetupDraft(game.fen()); renderSetup(); return; }
    game.load(origin);
    stopReplay();
    future = [];
    setupDraft = null;
    feedback = '';
    revealed = false;
    renderPosition();
    void lookup();
});
$('undo-move').addEventListener('click', () => {
    if (activeTab !== 'setup' && game.history().length) { setupDraft = null; goToPly(game.history().length - 1); }
});
$('line-first').addEventListener('click', () => goToPly(0));
$('line-prev').addEventListener('click', () => goToPly(game.history().length - 1));
$('line-next').addEventListener('click', () => goToPly(game.history().length + 1));
$('line-last').addEventListener('click', () => goToPly(game.history().length + future.length));
$('line-play').addEventListener('click', () => {
    if (replayTimer) { stopReplay(); return; }
    if (!future.length) goToPly(0);
    if (!future.length) return;
    $('line-play').textContent = 'Ⅱ';
    $('line-play').setAttribute('aria-label', 'Pause replay');
    replayTimer = setInterval(() => {
        if (!future.length) { stopReplay(); return; }
        goToPly(game.history().length + 1, true);
        if (!future.length) stopReplay();
    }, 1200);
});
$('flip-board').addEventListener('click', () => board.setOrientation(board.getOrientation() === 'white' ? 'black' : 'white'));
$('copy-fen').addEventListener('click', async () => {
    const fen = activeTab === 'setup' ? setupDraftFen(setupDraft) : game.fen();
    try { await navigator.clipboard.writeText(fen); $('copy-status').textContent = 'FEN copied to clipboard.'; }
    catch { $('fen-input').value = fen; $('fen-input').select(); $('copy-status').textContent = 'Clipboard unavailable. FEN selected in the field.'; }
});
$('reveal-answer').addEventListener('click', () => { revealed = !revealed; renderTraining(); });

for (const key of TABS) {
    $(`tab-${key}`).addEventListener('click', () => tab(key));
    $(`tab-${key}`).addEventListener('keydown', event => {
        const index = TABS.indexOf(key);
        const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
            : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
        if (next !== -1) { event.preventDefault(); tab(TABS[next]); $(`tab-${TABS[next]}`).focus(); }
    });
}

document.querySelectorAll('#setup-palette button').forEach(button => button.addEventListener('click', () => {
    setupTool = button.dataset.setupPiece || button.dataset.setupTool;
    setupSelectedSquare = null;
    board.clearSelection();
    renderSetupPalette();
}));
$('setup-turn').addEventListener('change', event => { setupDraft = { ...setupDraft, turn: event.target.value }; renderSetup(); });
$('setup-halfmove').addEventListener('input', event => { setupDraft = { ...setupDraft, halfmove: event.target.value }; });
$('setup-clear').addEventListener('click', () => updateSetup({ ...setupDraft, pieces: {} }));
$('setup-kings').addEventListener('click', () => updateSetup({ ...setupDraft, pieces: { e1: 'K', e8: 'k' } }));
$('setup-cancel').addEventListener('click', () => { setupDraft = null; tab('moves'); });
$('setup-load').addEventListener('click', () => {
    try {
        setupDraft = { ...setupDraft, halfmove: $('setup-halfmove').value, turn: $('setup-turn').value };
        const fen = validateCandidate(setupDraftFen(setupDraft));
        game.load(fen);
        origin = game.fen();
        future = [];
        setupDraft = null;
        feedback = '';
        revealed = false;
        $('setup-error').textContent = '';
        tab('moves');
        renderPosition();
        void lookup();
    } catch (error) { $('setup-error').textContent = error.message; }
});

document.querySelectorAll('[data-promotion]').forEach(button => button.addEventListener('click', () => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    const promotion = button.dataset.promotion;
    closePromotion();
    play(`${from}${to}${promotion}`);
}));
$('promotion-cancel').addEventListener('click', closePromotion);
$('promotion-dialog').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closePromotion(); } });

const linkedFen = new URLSearchParams(location.search).get('fen');
if (linkedFen) {
    $('fen-input').value = linkedFen;
    $('fen-form').requestSubmit();
} else { renderPosition(); void lookup(); }
