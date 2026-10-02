import { mountExplorer } from './mentor-explorer-view.js';
import { mountMemoryTraining } from './mentor-memory-view.js';
import { moveRows, createStudyAnalysis, evaluationLabel } from './mentor-moves.js';
import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { create } from '../board/caissa-board-adapter.js';
import { prepareLesson } from './mentor-lessons.js';
import { createMentorInsights } from './mentor-insights.js';
import { loadEcoCatalog, prepareEcoLesson } from './mentor-openings.js';
import { parseMentorPgn, moveLabel, gameReviewPrompt, PGN_LIMITS } from './mentor-pgn.js';

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
let openingTool = 'eco';
let openingCatalog = null;
let openingLoading = false;
let openingLimit = 24;
let importedGames = [];
let importedGameIndex = 0;
let importSource = 'online';
let pgnImporting = false;
let studyRevision = 0;
let analysisLesson = null;
let analysisDepth = null;
let evaluations = [];
let analysisRunning = false;
let analysisRequest = 0;
const studyAnalysis = createStudyAnalysis(() => {
    const config = window.EngineRegistry?.getArenaProvider('stockfish-19-lite');
    if (!config?.enabled || !window.EngineAdapter) throw new Error('Stockfish 19 is unavailable.');
    return new window.EngineAdapter({ ...config, autoStart: false, owner: 'mentor-study', requireRuntimeIdentity: true });
});
const board = create($('mentor-board'), {
    position: game.fen(), animation: false, label: 'CAISSA Mentor study board',
    onDragStart: square => !memoryTraining.isActive() && game.get(square)?.color === game.turn(),
    onMoveAttempt: move => attempt(move)
});

let memoryNotification = null;
const memoryTraining = mountMemoryTraining({ board, document,
    isTrainingVisible: () => selectedTab === 'learn',
    getOpeningPosition: () => (lesson.id.startsWith('eco-') || ['london','sicilian','development'].includes(lesson.id)) ? {id:lesson.id+'-'+cursor,fen:game.fen(),source:'opening-study'} : null,
    restoreStudy: () => sync(),
    onStart: () => {
        if (pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) {
            $('memory-state').textContent = 'Finish the promotion or Mentor reply before starting Memory Training.'; return false;
        }
        analysisRequest++; studyAnalysis.cancel(); analysisRunning = false; studyRevision++;
        $('study-engine').textContent = 'Engine';
        window.CaissaMentorFloatingShell?.clearContext();
        return true;
    },
    onNotification: notification => {
        if (!notification || memoryNotification?.id === notification.id) return;
        memoryNotification = notification;
        $('chat-idea-indicator').textContent = {idea:'💡',question:'❓',finding:'❗'}[notification.kind];
        $('chat-idea-indicator').hidden = false;
        $('chat-idea-indicator').title = `Memory Training ${notification.kind}`;
        $('tab-chat').setAttribute('aria-label', `Mentor — new Memory Training ${notification.kind}`);
        $('mentor-idea-status').textContent = `Mentor has a Memory Training ${notification.kind}. Open the recommendation to read it.`;
        $('memory-recommendation').hidden = false;
    }
});
$('memory-recommendation').addEventListener('click', () => {
    if (!memoryNotification) return;
    const notification = memoryNotification;
    memoryTraining.acknowledge(); memoryNotification = {...notification, unread:false};
    $('mentor-idea-status').textContent = 'Memory Training recommendation opened.';
    $('chat-idea-indicator').hidden = !insights.read().unread;
    selectTab($('tab-learn')); memoryTraining.startRecommendation(notification);
});

const explorer=mountExplorer({document,getFen:()=>memoryTraining.isActive()||memoryTraining.isLoading()?null:game.fen(),
    onMove:uci=>{if(pendingPromotion||memoryTraining.isActive()||memoryTraining.isLoading()||document.querySelector('.caissa-mentor-shell__form button').disabled)return;
        try{const move=game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});if(move){practicing=true;sync();}}catch{}},
    onReturn:()=>show(cursor)});
function selectOpeningTool(tool){openingTool=tool;
    for(const key of ['eco','explorer']){const selected=key===tool;$(`opening-${key}-tab`).setAttribute('aria-selected',String(selected));$(`opening-${key}-tab`).tabIndex=selected?0:-1;$(`opening-${key}-body`).hidden=!selected;}
    explorer.setVisible(selectedTab==='openings'&&tool==='explorer');if(tool==='eco'&&selectedTab==='openings')ensureOpenings();
}
for(const [index,key] of ['eco','explorer'].entries()){
    $(`opening-${key}-tab`).addEventListener('click',()=>selectOpeningTool(key));
    $(`opening-${key}-tab`).addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'eco':event.key==='End'?'explorer':index?'eco':'explorer';selectOpeningTool(next);$(`opening-${next}-tab`).focus();}});
}
$('moves-explorer').addEventListener('click',()=>{openingTool='explorer';selectTab($('tab-openings'));selectOpeningTool('explorer');});

function sync() {
    studyRevision++;
    if (analysisLesson !== lesson) {
        analysisRequest++; studyAnalysis.cancel(); analysisLesson = lesson; evaluations = []; analysisDepth = null; analysisRunning = false;
        $('study-engine').textContent = 'Engine';
        $('engine-status').textContent = 'Use Engine to analyse this line. No evaluation has been calculated.';
    }
    board.setPosition(game.fen(), { animate: false });
    board.clearSelection();
    $('mentor-board').dataset.fen = game.fen();
    $('mentor-board').dataset.lesson = lesson.id;
    window.CaissaMentorFloatingShell?.setContext({ source: 'mentor-study', fen: game.fen(),
        mode: practicing ? 'temporary' : 'source', san: game.history().at(-1) || null });
    $('lesson-title').textContent = lesson.title;
    $('lesson-category').textContent = lesson.category;
    $('lesson-instruction').textContent = practicing ? 'Explore legal moves. Repeat returns to the lesson.' : lesson.notes[cursor];
    $('practice').textContent = practicing ? 'Return to lesson' : 'Try it yourself';
    const notation = $('lesson-notation'); notation.replaceChildren();
    if (lesson.id.startsWith('pgn-')) {
        notation.textContent = `${lesson.result} · Position ${cursor}/${lesson.moves.length}${practicing ? ' · Exploring an alternative' : cursor ? ` · ${lesson.moves[cursor - 1].san}` : ' · Starting position'}`;
    } else if (practicing) {
        notation.textContent = game.history().join(' ') || 'Your practice line starts here.';
    } else {
        lesson.moves.forEach((move, index) => {
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = moveLabel(lesson, index);
            button.setAttribute('aria-label', `Show lesson after ${move.san}`);
            if (cursor === index + 1) button.setAttribute('aria-current', 'step');
            button.addEventListener('click', () => show(index + 1)); notation.append(button);
        });
    }
    renderLearnGame();
    explorer.refresh();
}
function show(index) {
    if (pendingPromotion) return;
    memoryTraining.stop();
    cursor = Math.max(0, Math.min(index, lesson.moves.length)); practicing = false;
    game.load(lesson.positions[0]);
    for (let step = 0; step < cursor; step++) game.move(lesson.moves[step].san);
    $('move-status').textContent = ''; sync();
}
function loadLesson(id, { prefill = true } = {}) {
    if (pendingPromotion) return false;
    lesson = prepareLesson(id); show(0);
    $('opening-followups').hidden = true;
    const input = document.querySelector('.caissa-mentor-shell__form textarea');
    if (input && prefill) input.value = lesson.prompt;
    return true;
}
function attempt({ from, to, promotion }) {
    if (memoryTraining.isActive()) return;
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
$('repeat').addEventListener('click', () => show(0));
$('flip').addEventListener('click', () => board.setOrientation(board.getOrientation() === 'white' ? 'black' : 'white'));
$('practice').addEventListener('click', () => { if(memoryTraining.isActive()||memoryTraining.isLoading()){memoryTraining.stop();return;} if (practicing) show(cursor); else { practicing = true; sync(); } });
document.querySelectorAll('[data-lesson]').forEach(button => button.addEventListener('click', () => loadLesson(button.dataset.lesson)));

const tabs = [...document.querySelectorAll('[role=tab][id^="tab-"]')];
function renderLearnGame() {
    const active = importedGames.length > 0 && lesson === importedGames[importedGameIndex];
    $('learn-game').hidden = !importedGames.length;
    // Training sub-tab owns visibility of the lesson selection body.
    const select = $('learn-game-select'); select.replaceChildren();
    importedGames.forEach((item, index) => {
        const option = document.createElement('option'); option.value = String(index);
        option.textContent = `${index + 1}. ${item.title} · ${item.result}`; select.append(option);
    });
    select.value = String(importedGameIndex);
    const knownDate = lesson.date && lesson.date !== '????.??.??' ? lesson.date : null;
    $('learn-game-meta').textContent = active ? `${lesson.title} · ${lesson.result}${knownDate ? ` · ${knownDate}` : ''}` : 'Choose an imported game to return to its main line.';
    $('learn-game-position').textContent = practicing ? 'Exploring an alternative. Repeat returns to the main line.' : `Position ${cursor} of ${lesson.moves.length} half-moves`;
    $('game-first').disabled = $('game-previous').disabled = practicing || cursor === 0;
    $('game-next').disabled = $('game-last').disabled = practicing || cursor === lesson.moves.length;
    $('game-review').disabled = !active;
    const list = $('learn-game-moves'); list.replaceChildren();
    for (const row of moveRows(lesson)) {
        const line = document.createElement('div'); line.className = 'move-row';
        const number = document.createElement('span'); number.textContent = `${row.number}.`; line.append(number);
        for (const index of [row.white, row.black]) {
            if (index === null) { const empty = document.createElement('span'); line.append(empty); continue; }
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = lesson.moves[index].san;
            button.setAttribute('aria-label', `Show position after ${moveLabel(lesson, index)}`);
            if (!practicing && cursor === index + 1) button.setAttribute('aria-current', 'step');
            button.addEventListener('click', () => show(index + 1)); line.append(button);
        }
        list.append(line);
    }
    renderEvaluation();
}

function renderEvaluation() {
    $('position-evaluation').textContent = practicing ? 'Position evaluation · Alternative not analysed' : `Position evaluation · ${evaluations[cursor] ? evaluationLabel(evaluations[cursor]) : 'Not analysed'}`;
    const chart = $('evaluation-chart'); chart.replaceChildren();
    if (!evaluations.some(Boolean)) { chart.textContent = 'Evaluation timeline · Not analysed'; return; }
    evaluations.forEach((evaluation, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'evaluation-point';
        button.disabled = !evaluation;
        const label = evaluation ? evaluationLabel(evaluation) : 'Pending';
        button.setAttribute('aria-label', `Position ${index}: ${label}`); button.title = `Position ${index}: ${label}`;
        if (index === cursor && !practicing) button.setAttribute('aria-current', 'step');
        if (evaluation) {
            const value = evaluation.mate !== null ? (evaluation.mate < 0 || Object.is(evaluation.mate, -0) ? -8 : 8) : Math.max(-8, Math.min(8, evaluation.score));
            button.style.setProperty('--evaluation-height', `${Math.abs(value) / 8 * 44}%`);
            button.dataset.side = value === 0 ? 'neutral' : value < 0 ? 'black' : 'white';
        }
        button.addEventListener('click', () => show(index)); chart.append(button);
    });
}

$('study-engine').addEventListener('click', async () => {
    if (memoryTraining.isActive()) return;
    if (analysisRunning) {
        analysisRequest++; studyAnalysis.cancel(); analysisRunning = false; $('study-engine').textContent = 'Engine';
        $('engine-status').textContent = 'Analysis stopped. Completed evaluations remain available.'; return;
    }
    if (pendingPromotion || practicing) {
        selectTab($('tab-moves')); $('engine-status').textContent = 'Return to the main line and finish promotion before analysing.'; return;
    }
    const request = ++analysisRequest;
    const target = lesson, depth = Number($('engine-depth').value) || 12;
    if (analysisDepth !== depth) evaluations = [];
    evaluations = Array.from({ length: target.positions.length }, (_, index) => evaluations[index] || null);
    analysisDepth = depth; analysisRunning = true; $('study-engine').textContent = 'Stop engine'; selectTab($('tab-moves'));
    try {
        await studyAnalysis.run(target.positions, depth, (evaluation, index) => {
            if (lesson !== target || request !== analysisRequest) return;
            evaluations[index] = evaluation; renderEvaluation();
            $('engine-status').textContent = `Stockfish 19 · Depth ${depth} · ${index + 1}/${target.positions.length} positions · White perspective`;
        });
        if (lesson === target && request === analysisRequest && analysisRunning) $('engine-status').textContent = `Stockfish 19 · Depth ${depth} · Analysis complete · White perspective`;
    } catch (error) {
        if (lesson === target && request === analysisRequest && analysisRunning) $('engine-status').textContent = `Analysis unavailable: ${error.message}`;
    } finally {
        if (lesson === target && request === analysisRequest && studyAnalysis.isIdle()) { analysisRunning = false; $('study-engine').textContent = 'Engine'; }
    }
});
$('study-settings').addEventListener('click', () => $('study-settings-dialog').showModal());
$('settings-close').addEventListener('click', () => { $('study-settings-dialog').close(); $('study-settings').focus(); });
for(const kind of ['fen','pgn'])$('settings-copy-'+kind).addEventListener('click',async()=>{
    if(memoryTraining.isActive()||memoryTraining.isLoading()){ $('settings-status').textContent='Return to the lesson before exporting.';return;}
    let text=game.fen();if(kind==='pgn'){const copy=new Chess(lesson.positions[0]);for(const move of lesson.moves)copy.move(move.san);for(const [key,value]of [['White',lesson.white],['Black',lesson.black],['Event',lesson.event],['Date',lesson.date],['Result',lesson.result]])if(value)copy.setHeader(key,value);text=copy.pgn();}
    $('settings-export').value=text;$('settings-export').hidden=false;
    try{if(!window.navigator?.clipboard?.writeText)throw new Error();await window.navigator.clipboard.writeText(text);$('settings-status').textContent=`${kind.toUpperCase()} copied.`;}catch{$('settings-status').textContent='Select the text above to copy it.';}
});
$('settings-flip').addEventListener('click', () => board.setOrientation(board.getOrientation() === 'white' ? 'black' : 'white'));
window.addEventListener('pagehide', () => { explorer.reset(); analysisRequest++; studyAnalysis.cancel(); analysisRunning = false; $('study-engine').textContent = 'Engine'; });
function selectImportedGame(index) {
    if (!Number.isInteger(index) || !importedGames[index] || pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) return false;
    importedGameIndex = index; lesson = importedGames[index];
    $('opening-followups').hidden = true; show(0); return true;
}
$('learn-game-select').addEventListener('change', () => {
    if (!selectImportedGame(Number($('learn-game-select').value))) {
        $('learn-game-select').value = String(importedGameIndex);
        $('learn-game-position').textContent = 'Finish the current promotion or Mentor reply before changing games.';
    }
});
$('game-first').addEventListener('click', () => show(0));
$('game-previous').addEventListener('click', () => show(cursor - 1));
$('game-next').addEventListener('click', () => show(cursor + 1));
$('game-last').addEventListener('click', () => show(lesson.moves.length));
$('game-review').addEventListener('click', () => {
    if (lesson !== importedGames[importedGameIndex] || pendingPromotion) return;
    const input = document.querySelector('.caissa-mentor-shell__form textarea');
    if (document.querySelector('.caissa-mentor-shell__form button').disabled) { $('learn-game-position').textContent = 'Wait for the current Mentor reply.'; return; }
    if (input.value.trim()) { $('learn-game-position').textContent = 'Send or clear your Chat draft before preparing a game review.'; return; }
    const evidence = practicing ? null : evaluations[cursor];
    input.value = gameReviewPrompt(lesson, cursor, game.fen());
    if (evidence) input.value = input.value.replace('We have not run engine analysis:', `Local Stockfish 19 evaluated the selected position at ${evaluationLabel(evidence)}, from White’s perspective. Other positions may still be unanalysed:`);
    selectTab($('tab-chat'));
    $('chat-suggestions').hidden = true;
    window.CaissaMentorFloatingShell?.appendStudyMessage(`Your game ${lesson.title} is ready to discuss. I’ve prepared its moves and the selected position in your review question. Send it when you’re ready. ${evidence ? 'The selected position’s local Stockfish evaluation is included.' : 'No engine evaluation is available for the selected position.'}`);
    input.focus({ preventScroll: true });
});
function renderOpenings() {
    const query = $('opening-search').value.trim().toLowerCase();
    const featured = ['C60', 'C50', 'B20', 'C00', 'B10', 'B07', 'B01', 'D06', 'D02', 'D00', 'E60', 'D70', 'E20', 'A04', 'A10'];
    const rank = entry => { const index = featured.indexOf(entry.code); return index < 0 ? 100 : index; };
    const matches = (openingCatalog || []).filter(entry => `${entry.code} ${entry.name} ${entry.notation}`.toLowerCase().includes(query)).sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
    const visible = matches.slice(0, openingLimit), list = $('opening-list'); list.replaceChildren();
    for (const [group, title] of [['e4', '1. e4 · White'], ['d4', '1. d4 · White'], ['other', 'Other first moves']]) {
        const entries = visible.filter(entry => entry.group === group);
        if (!entries.length) continue;
        const heading = document.createElement('h3'); heading.textContent = title; list.append(heading);
        entries.forEach(entry => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'opening-card';
            const name = document.createElement('strong'); name.textContent = `${entry.name} · ${entry.code}`;
            const moves = document.createElement('span'); moves.textContent = entry.notation;
            button.append(name, moves); button.disabled = !entry.playable;
            if (!entry.playable) { const unavailable = document.createElement('small'); unavailable.textContent = 'Line unavailable'; button.append(unavailable); }
            button.addEventListener('click', () => chooseOpening(entry)); list.append(button);
        });
    }
    $('opening-more').hidden = matches.length <= openingLimit;
    $('opening-status').textContent = `${visible.length} of ${matches.length} openings${query ? ' matching your search' : ''}.`;
}
async function ensureOpenings() {
    if (openingCatalog || openingLoading) return;
    openingLoading = true; $('opening-status').textContent = 'Loading the ECO catalog…';
    try { openingCatalog = await loadEcoCatalog(); renderOpenings(); }
    catch { $('opening-status').textContent = 'The ECO catalog could not load. Reopen Opening to retry.'; }
    finally { openingLoading = false; }
}
function chooseOpening(entry) {
    if (pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) {
        $('opening-status').textContent = 'Finish the current promotion or Mentor reply before changing the board.'; return;
    }
    let candidate;
    try { candidate = prepareEcoLesson(entry); }
    catch { $('opening-status').textContent = 'This opening line cannot be loaded.'; return; }
    lesson = candidate; show(lesson.moves.length);
    $('chat-suggestions').hidden = true; $('opening-followups').hidden = false;
    selectTab($('tab-chat'));
    window.CaissaMentorFloatingShell?.appendStudyExchange(`Let’s explore ${entry.name} (${entry.code}).`,
        `I’ve loaded ${entry.name}, ECO ${entry.code}, after ${lesson.moves.length} half-moves on the board. ${game.turn() === 'w' ? 'White' : 'Black'} is to move. We can explore the plans for each side or try your next move. Use the move list to revisit the opening, and Repeat to start from the beginning.`);
    $('tab-chat').focus({ preventScroll: true });
}
$('opening-search').addEventListener('input', () => { openingLimit = 24; if (openingCatalog) renderOpenings(); });
$('opening-more').addEventListener('click', () => { openingLimit += 24; renderOpenings(); });
$('opening-discuss').addEventListener('click', () => {
    const input = document.querySelector('.caissa-mentor-shell__form textarea');
    if (!lesson.id.startsWith('eco-') || document.querySelector('.caissa-mentor-shell__form button').disabled) return;
    if (input.value.trim()) { $('move-status').textContent = 'Send or clear your current draft before preparing this question.'; return; }
    input.value = lesson.prompt; input.focus({ preventScroll: true });
});
$('opening-practice').addEventListener('click', () => {
    if (!lesson.id.startsWith('eco-') || pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) return;
    practicing = true; sync(); $('move-status').textContent = 'Your turn to explore. Try a legal move in this opening position.';
});
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
    $('idea-plan').hidden = !state.idea;
    $('chat-idea-indicator').hidden = !state.unread && !memoryNotification?.unread;
    if (memoryNotification?.unread) {
        $('chat-idea-indicator').textContent = {idea:'💡',question:'❓',finding:'❗'}[memoryNotification.kind];
        $('tab-chat').setAttribute('aria-label', `Mentor — new Memory Training ${memoryNotification.kind}`);
        return;
    }
    $('chat-idea-indicator').textContent = '💡';
    $('tab-chat').setAttribute('aria-label', state.unread ? 'Mentor — new training idea' : 'Mentor');
    $('mentor-idea-status').textContent = state.unread ? 'Mentor has a new training idea. Open Mentor to discuss it.' : '';
}
function presentIdea() {
    if (selectedTab === 'chat' && memoryNotification?.unread) {
        if (window.CaissaMentorFloatingShell?.appendStudyMessage(memoryNotification.message)) {
            memoryTraining.acknowledge(); memoryNotification = {...memoryNotification, unread:false};
        }
        renderIdea();
    }
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
    if (tab.id !== 'tab-learn') memoryTraining.stop();
    selectedTab = tab.id.replace('tab-', '');
    tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; $(item.getAttribute('aria-controls')).hidden = !selected; });
    $('chat-footer').hidden = selectedTab !== 'chat';
    $('learn-footer').hidden = selectedTab !== 'learn'||memoryTraining.context()!=='lesson';
    $('memory-footer').hidden = selectedTab !== 'learn';
    $('memory-start').hidden = selectedTab !== 'learn'||memoryTraining.context()==='lesson';
    if (selectedTab === 'openings') selectOpeningTool(openingTool); else explorer.setVisible(false);
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
    memoryTraining.newSession();
    window.CaissaMentorFloatingShell.close(); window.CaissaMentorFloatingShell.open();
    importedGames = []; importedGameIndex = 0;
    loadLesson('development'); selectTab(tabs[0]);
    document.querySelector('.caissa-mentor-shell__form textarea').value = '';
    renderSuggestions();
});
$('fen-form').addEventListener('submit', event => {
    event.preventDefault();
    if (pendingPromotion) return;
    try { const fen = $('study-fen').value.trim(); if (fen.split(/\s+/).length !== 6) throw new Error('Full FEN required.'); game.load(fen);
        lesson = { id: 'custom', title: 'Your study position', category: 'Independent study', positions: [game.fen()], moves: [], notes: ['Explore this position with legal moves.'] };
        cursor = 0; practicing = true; $('opening-followups').hidden = true; sync(); $('move-status').textContent = 'Study position loaded. No engine verdict has been calculated.';
        $('fen-status').textContent = 'Position loaded on the study board. Open Mentor to discuss it.';
    } catch { $('move-status').textContent = 'Invalid FEN. Include a legal position and all six FEN fields.';
        $('fen-status').textContent = 'Invalid FEN. Include a legal position and all six FEN fields.'; }
});
document.querySelectorAll('[data-promotion]').forEach(button => button.addEventListener('click', () => {
    const request = pendingPromotion; pendingPromotion = null; $('promotion-dialog').close();
    if (request) attempt({ ...request, promotion: button.dataset.promotion });
}));
$('promotion-cancel').addEventListener('click', () => { pendingPromotion = null; $('promotion-dialog').close(); });
$('promotion-dialog').addEventListener('cancel', () => { pendingPromotion = null; });
// Account is a raw-game intake surface. Analysis results belong in Chat.
function selectImportSource(source) {
    importSource = source;
    const online = source === 'online';
    $('account-online').hidden = !online; $('account-local').hidden = online;
    $('account-source-online').setAttribute('aria-pressed', String(online));
    $('account-source-pgn').setAttribute('aria-pressed', String(!online));
    $('account-import-submit').textContent = online ? 'Fetch & Analyze Games' : 'Load PGN Games';
    $('account-import-submit').disabled = online || pgnImporting;
    $('account-status').textContent = online ? 'Online import is not connected yet. Use Local PGN to study a completed game.' : 'Load a completed PGN into Moves. Loading and move navigation use no AI credits.';
}
$('account-source-online').addEventListener('click', () => selectImportSource('online'));
$('account-source-pgn').addEventListener('click', () => selectImportSource('pgn'));
$('account-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (importSource !== 'pgn') { $('account-status').textContent = 'Online import is not connected yet. Use Local PGN to study a completed game.'; return; }
    if (pgnImporting || pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) { $('account-status').textContent = 'Finish the current import, promotion or Mentor reply first.'; return; }
    const importRevision = studyRevision;
    pgnImporting = true; $('account-import-submit').disabled = true;
    try {
        const file = $('account-pgn-file').files?.[0], pasted = $('account-pgn-text').value.trim();
        if (file && pasted) throw new Error('Choose either a PGN file or pasted PGN, not both.');
        if (file && file.size > PGN_LIMITS.fileBytes) throw new Error('PGN file is too large. Use a file under 1 MB.');
        const text = file ? await file.text() : pasted;
        const candidate = parseMentorPgn(text);
        // Recheck after asynchronous file reads. Do not replace a board during another action.
        if (importRevision !== studyRevision || pendingPromotion || document.querySelector('.caissa-mentor-shell__form button').disabled) throw new Error('The study position changed or a reply started. Load the PGN again when ready.');
        importedGames = candidate; importedGameIndex = 0; selectImportedGame(0);
        selectTab($('tab-moves')); $('tab-moves').focus({ preventScroll: true });
        $('account-status').textContent = `${candidate.length} completed game${candidate.length === 1 ? '' : 's'} loaded into Moves. No engine analysis or AI request has run.`;
    } catch (error) { $('account-status').textContent = error.message; }
    finally { pgnImporting = false; $('account-import-submit').disabled = importSource === 'online'; }
});
sync();
// Read-only diagnostic seam; never grants chess, engine, account or economic authority.
window.CaissaMentorPage = Object.freeze({ inspect: () => Object.freeze({ fen: game.fen(), lesson: lesson.id, cursor, practicing, tab: selectedTab, unreadIdea: insights.read().unread, memory: memoryTraining.read(), importedGames: importedGames.length, board: board.getMetrics() }) });

const accountLink = document.querySelector('.sign-in');
function renderAccountAuth(state) {
    const signedIn = state?.isLoaded === true && state?.isSignedIn === true;
    const nextOwner = signedIn && typeof state.userId === 'string' ? state.userId : null;
    if (nextOwner !== insightOwner) {
        insightOwner = nextOwner; insights.reset(nextOwner);
        memoryTraining.reset(nextOwner); explorer.reset(); memoryNotification = null;
        $('memory-recommendation').hidden = true;
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
