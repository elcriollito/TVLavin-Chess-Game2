import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { create } from '../board/caissa-board-adapter.js';
import { prepareLesson } from './mentor-lessons.js';

const $ = id => document.getElementById(id);
const game = new Chess();
let lesson = prepareLesson('development');
let cursor = 0;
let practicing = false;
let selectedTab = 'learn';
let pendingPromotion = null;
const board = create($('mentor-board'), {
    position: game.fen(), animation: false, label: 'CAISSA Mentor study board',
    onDragStart: square => game.get(square)?.color === game.turn(),
    onMoveAttempt: move => attempt(move)
});

function sync() {
    board.setPosition(game.fen(), { animate: false });
    board.clearSelection();
    $('mentor-board').dataset.fen = game.fen();
    $('mentor-board').dataset.lesson = lesson.id;
    window.CaissaMentorFloatingShell?.setContext({ source: 'mentor-study', fen: game.fen(),
        mode: practicing ? 'temporary' : 'source', san: game.history().at(-1) || null });
    $('lesson-title').textContent = lesson.title;
    $('lesson-category').textContent = lesson.category;
    $('lesson-instruction').textContent = practicing ? 'Explore legal moves. Repeat returns to the lesson.' : lesson.notes[cursor];
    $('previous').disabled = practicing || cursor === 0;
    $('next').disabled = practicing || cursor === lesson.moves.length;
    $('practice').textContent = practicing ? 'Return to lesson' : 'Try it yourself';
    const notation = $('lesson-notation'); notation.replaceChildren();
    if (practicing) {
        notation.textContent = game.history().join(' ') || 'Your practice line starts here.';
    } else {
        lesson.moves.forEach((move, index) => {
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${move.san}`;
            button.setAttribute('aria-label', `Show lesson after ${move.san}`);
            if (cursor === index + 1) button.setAttribute('aria-current', 'step');
            button.addEventListener('click', () => show(index + 1)); notation.append(button);
        });
    }
}
function show(index) {
    if (pendingPromotion) return;
    cursor = Math.max(0, Math.min(index, lesson.moves.length)); practicing = false;
    game.load(lesson.positions[0]);
    for (let step = 0; step < cursor; step++) game.move(lesson.moves[step].san);
    $('move-status').textContent = ''; sync();
}
function loadLesson(id) {
    if (pendingPromotion) return;
    lesson = prepareLesson(id); show(0);
    const input = document.querySelector('.caissa-mentor-shell__form textarea');
    if (input) input.value = lesson.prompt;
}
function attempt({ from, to, promotion }) {
    if (pendingPromotion) return;
    const legal = game.moves({ verbose: true }).filter(move => move.from === from && move.to === to);
    if (!legal.length) { $('move-status').textContent = 'That move is not legal in this position. Try another square.'; return; }
    if (legal.some(move => move.promotion) && !promotion) {
        pendingPromotion = { from, to }; $('promotion-dialog').showModal(); return;
    }
    if (!practicing) {
        const expected = lesson.moves[cursor];
        if (!expected || expected.from !== from || expected.to !== to || (expected.promotion && expected.promotion !== promotion?.toLowerCase())) {
            $('move-status').textContent = expected ? 'A legal alternative. Choose “Try it yourself” to explore it, or follow the lesson.' : 'Lesson complete. Choose “Try it yourself” to continue.';
            return;
        }
        const move = game.move({ from, to, promotion: promotion?.toLowerCase() }); cursor++; sync();
        $('move-status').textContent = `${move.san} — ${lesson.notes[cursor]}`;
    } else {
        const move = game.move({ from, to, promotion: promotion?.toLowerCase() }); sync();
        $('move-status').textContent = `${move.san} · ${game.isCheckmate() ? 'Checkmate.' : game.isStalemate() ? 'Stalemate.' : game.isCheck() ? 'Check.' : `${game.turn() === 'w' ? 'White' : 'Black'} to move.`}`;
    }
}
$('previous').addEventListener('click', () => show(cursor - 1));
$('next').addEventListener('click', () => show(cursor + 1));
$('repeat').addEventListener('click', () => show(0));
$('flip').addEventListener('click', () => board.setOrientation(board.getOrientation() === 'white' ? 'black' : 'white'));
$('practice').addEventListener('click', () => { if (practicing) show(cursor); else { practicing = true; sync(); } });
document.querySelectorAll('[data-lesson]').forEach(button => button.addEventListener('click', () => loadLesson(button.dataset.lesson)));
const tabs = [...document.querySelectorAll('[role=tab]')];
function selectTab(tab) {
    selectedTab = tab.id.replace('tab-', '');
    tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; $(item.getAttribute('aria-controls')).hidden = !selected; });
}
tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : null;
        if (target) { event.preventDefault(); selectTab(target); target.focus(); }
    });
});
$('new-session').addEventListener('click', () => {
    if (pendingPromotion) return;
    if (document.querySelector('.caissa-mentor-shell__form button').disabled) { $('move-status').textContent = 'Wait for the current Mentor reply before starting a new session.'; return; }
    window.CaissaMentorFloatingShell.close(); window.CaissaMentorFloatingShell.open();
    loadLesson('development'); selectTab(tabs[0]);
    document.querySelector('.caissa-mentor-shell__form textarea').value = '';
});
$('fen-form').addEventListener('submit', event => {
    event.preventDefault();
    if (pendingPromotion) return;
    try { const fen = $('study-fen').value.trim(); if (fen.split(/\s+/).length !== 6) throw new Error('Full FEN required.'); game.load(fen);
        lesson = { id: 'custom', title: 'Your study position', category: 'Independent study', positions: [game.fen()], moves: [], notes: ['Explore this position with legal moves.'] };
        cursor = 0; practicing = true; sync(); $('move-status').textContent = 'Study position loaded. No engine verdict has been calculated.';
    } catch { $('move-status').textContent = 'Invalid FEN. Include a legal position and all six FEN fields.'; }
});
document.querySelectorAll('[data-promotion]').forEach(button => button.addEventListener('click', () => {
    const request = pendingPromotion; pendingPromotion = null; $('promotion-dialog').close();
    if (request) attempt({ ...request, promotion: button.dataset.promotion });
}));
$('promotion-cancel').addEventListener('click', () => { pendingPromotion = null; $('promotion-dialog').close(); });
$('promotion-dialog').addEventListener('cancel', () => { pendingPromotion = null; });
const usernameKey = 'caissa-mentor-preview-usernames-v1';
try { const saved = JSON.parse(localStorage.getItem(usernameKey) || '{}');
    $('chesscom-user').value = typeof saved.chesscom === 'string' ? saved.chesscom : '';
    $('lichess-user').value = typeof saved.lichess === 'string' ? saved.lichess : '';
} catch { /* A denied or corrupt local store does not block study. */ }
$('account-form').addEventListener('submit', event => {
    event.preventDefault();
    const chesscom = $('chesscom-user').value.trim(), lichess = $('lichess-user').value.trim();
    if ([chesscom, lichess].some(value => value && !/^[a-zA-Z0-9_-]{2,50}$/.test(value))) { $('account-status').textContent = 'Use a username with letters, numbers, underscores or hyphens.'; return; }
    try { localStorage.setItem(usernameKey, JSON.stringify({ chesscom, lichess })); $('account-status').textContent = 'Saved on this device only. No accounts verified, games imported, or ratings combined.'; }
    catch { $('account-status').textContent = 'This browser could not save usernames. You can still use the lessons.'; }
});
sync();
// Read-only diagnostic seam; never grants chess, engine, account or economic authority.
window.CaissaMentorPage = Object.freeze({ inspect: () => Object.freeze({ fen: game.fen(), lesson: lesson.id, cursor, practicing, tab: selectedTab, board: board.getMetrics() }) });

const accountLink = document.querySelector('.sign-in');
function renderAccountAuth(state) {
    const signedIn = state?.isLoaded === true && state?.isSignedIn === true;
    accountLink.textContent = signedIn ? 'My Account' : 'Sign in';
    accountLink.href = signedIn ? '#tab-account' : '/signin?redirect_url=%2Fmentor.html';
}
renderAccountAuth(window.CAISSA_AUTH);
window.CAISSA_AUTH?.onAuthStateChange?.(renderAccountAuth);
window.addEventListener('caissa-auth-change', event => renderAccountAuth(event.detail));
accountLink.addEventListener('click', event => {
    if (accountLink.hash === '#tab-account') { event.preventDefault(); selectTab(tabs[2]); tabs[2].focus(); }
});
