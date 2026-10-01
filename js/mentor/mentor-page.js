import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { create } from '../board/caissa-board-adapter.js';
import { prepareLesson } from './mentor-lessons.js';
import { createMentorInsights } from './mentor-insights.js';

const $ = id => document.getElementById(id);
const game = new Chess();
let lesson = prepareLesson('development');
let cursor = 0;
let practicing = false;
let selectedTab = 'chat';
let insightOwner = null;
let preparedIdeaPrompt = null;
const insights = createMentorInsights();
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
function loadLesson(id, { prefill = true } = {}) {
    if (pendingPromotion) return false;
    lesson = prepareLesson(id); show(0);
    const input = document.querySelector('.caissa-mentor-shell__form textarea');
    if (input && prefill) input.value = lesson.prompt;
    return true;
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
const starterIdeas = [
    { lesson: 'development', question: 'How do I develop my pieces with a plan?', answer: 'Start by taking space in the center, then bring your knights and bishops into play. I’ve loaded an Italian Game example. Use Next to follow each move, then Try it yourself to explore a legal alternative.' },
    { lesson: 'fork', question: 'Show me how to spot a knight fork.', answer: 'A knight fork attacks two targets at once. In this example, Nc7+ checks the king and also attacks the rook on a8. The king must answer the check, leaving the rook attacked. Try the move on the board, or use Next to see it.' },
    { lesson: 'opposition', question: 'Help me understand king activity in an endgame.', answer: 'In this king-and-pawn example, look at how the kings restrict each other. White can explore Kd5 without moving next to the opposing king. Step through the line and try alternatives. This example illustrates king activity; it does not establish a forced win or draw.' }
];
const themeLessons = { tactics: 'fork', hangingPieces: 'fork', development: 'development', endgame: 'opposition' };
function renderSuggestions() {
    const idea = insights.read().idea;
    const related = idea?.themes.map(theme => themeLessons[theme.theme]).filter(Boolean) || [];
    const choices = related.length ? starterIdeas.filter(item => related.includes(item.lesson)) : starterIdeas;
    $('suggestions-title').textContent = idea ? 'Ideas from your game review' : 'Where shall we start?';
    $('suggestions-context').textContent = idea
        ? `Based on your completed review of ${idea.completedGames} games. Board examples are separate lessons.`
        : 'Choose an idea to explore on the board. These starting ideas are available to everyone.';
    const actions = $('suggestion-actions'); actions.replaceChildren();
    choices.forEach(item => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = item.question;
        button.addEventListener('click', () => {
            if (pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) {
                $('move-status').textContent = 'Finish the current promotion or Mentor reply before changing the board.'; return;
            }
            if (!loadLesson(item.lesson, { prefill: false })) return;
            window.CaissaMentorFloatingShell?.appendStudyExchange(item.question, item.answer);
            $('chat-suggestions').hidden = true;
            $('move-status').textContent = 'Lesson example loaded. Use Next or try its moves on the board.';
        });
        actions.append(button);
    });
    if (idea && !related.length) $('suggestions-context').textContent = `Your ${idea.completedGames}-game review is ready to discuss using Prepare a training plan. These are general board examples.`;
    $('chat-suggestions').hidden = false;
}
function renderIdea() {
    const state = insights.read();
    $('chat-idea-indicator').hidden = !state.unread;
    $('tab-chat').setAttribute('aria-label', state.unread ? 'Chat — new training idea' : 'Chat');
    $('idea-plan').hidden = !state.idea;
    $('mentor-idea-status').textContent = state.unread ? 'Mentor has a new training idea. Open Chat to discuss it.' : '';
}
function presentIdea() {
    const state = insights.read();
    if (selectedTab !== 'chat' || !state.unread) return;
    if (window.CaissaMentorFloatingShell?.appendStudyMessage(state.idea.localMessage)) insights.acknowledge();
    renderIdea();
}
window.addEventListener('caissa:account-analysis-completed', event => {
    if (insights.receive(event.detail).accepted) { renderSuggestions(); renderIdea(); presentIdea(); }
});
$('idea-plan').addEventListener('click', () => {
    const idea = insights.read().idea;
    const input = document.querySelector('.caissa-mentor-shell__form textarea');
    if (!idea || !input || document.querySelector('.caissa-mentor-shell__form button').disabled) return;
    if (input.value.trim()) { $('mentor-idea-status').textContent = 'Send or clear your current draft before preparing the training plan.'; return; }
    input.value = idea.planPrompt; preparedIdeaPrompt = idea.planPrompt;
    input.focus({ preventScroll: true });
});
function selectTab(tab) {
    selectedTab = tab.id.replace('tab-', '');
    tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; $(item.getAttribute('aria-controls')).hidden = !selected; });
    $('chat-footer').hidden = selectedTab !== 'chat';
    presentIdea();
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
    renderSuggestions();
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
window.CaissaMentorPage = Object.freeze({ inspect: () => Object.freeze({ fen: game.fen(), lesson: lesson.id, cursor, practicing, tab: selectedTab, unreadIdea: insights.read().unread, board: board.getMetrics() }) });

const accountLink = document.querySelector('.sign-in');
function renderAccountAuth(state) {
    const signedIn = state?.isLoaded === true && state?.isSignedIn === true;
    const nextOwner = signedIn && typeof state.userId === 'string' ? state.userId : null;
    if (nextOwner !== insightOwner) {
        insightOwner = nextOwner; insights.reset(nextOwner);
        const input = document.querySelector('.caissa-mentor-shell__form textarea');
        if (preparedIdeaPrompt && input?.value === preparedIdeaPrompt) input.value = '';
        preparedIdeaPrompt = null;
        window.CaissaMentorFloatingShell?.clearStudyMessages(); renderSuggestions(); renderIdea();
    }
    accountLink.textContent = signedIn ? 'My Account' : 'Sign in';
    accountLink.href = signedIn ? '#tab-account' : '/signin?redirect_url=%2Fmentor.html';
}
renderAccountAuth(window.CAISSA_AUTH);
renderSuggestions();
window.CAISSA_AUTH?.onAuthStateChange?.(renderAccountAuth);
window.addEventListener('caissa-auth-change', event => renderAccountAuth(event.detail));
accountLink.addEventListener('click', event => {
    if (accountLink.hash === '#tab-account') { event.preventDefault(); selectTab($('tab-account')); $('tab-account').focus(); }
});
