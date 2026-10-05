import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { createOnlineApi, OnlineApiError } from './online-api.js';
import { formatClock, projectOnlineClock } from './online-clock.js';
import { createOnlineRealtime } from './online-realtime.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const $ = id => document.getElementById(id);
const api = createOnlineApi();
const ui = {
    connection: document.querySelector('.connection-pill'), connectionLabel: $('connection-label'),
    account: $('account-link'), status: $('room-status'), title: $('workspace-title'), badge: $('game-badge'),
    curtain: $('board-curtain'), curtainTitle: $('curtain-title'), curtainCopy: $('curtain-copy'),
    top: $('player-top'), bottom: $('player-bottom'), topClock: $('clock-top'), bottomClock: $('clock-bottom'),
    lobby: $('lobby-view'), queue: $('queue-view'), game: $('game-view'), result: $('result-view'),
    find: $('find-game'), cancel: $('cancel-search'), rated: $('rated-toggle'), ratedHelp: $('rated-help'),
    queueControl: $('queue-control'), queueElapsed: $('queue-elapsed'), turnCopy: $('turn-copy'),
    moveList: $('move-list'), resultTitle: $('result-title'), resultDetail: $('result-detail'),
    ratingChange: $('rating-change'), gamesList: $('games-list'), playersList: $('players-list'),
    tournamentCard: $('tournament-card'), toast: $('online-toast')
};

const model = {
    config: null, state: null, auth: null, game: null, selectedControl: 'blitz-3-2',
    pendingMove: null, queueStartedAt: null, realtime: null, realtimeGameId: null,
    polling: null, syncing: false, disposed: false, toastTimer: null
};

const board = new CaissaBoardAdapter($('online-board'), {
    position: START_FEN,
    orientation: 'white',
    interactive: false,
    readOnly: true,
    animation: true,
    coalesce: false,
    label: 'CAISSA Online game board',
    onMoveAttempt: intent => void submitMove(intent)
});

window.addEventListener('beforeunload', dispose, { once: true });
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && model.auth?.isSignedIn) void syncState('visibility');
});
bindControls();
if (location.pathname === '/online/tournaments') selectTab('games');
setInterval(renderClocks, 100);
void boot();

async function boot() {
    setConnection('reconnecting', 'Connecting');
    try {
        model.config = await api.config();
        $('protocol-label').textContent = `Protocol ${model.config.protocolVersion || '1.0.0'}`;
        if (!model.config.enabled) return renderUnavailable('Online play is currently behind a rollout flag.');
        ui.rated.disabled = !model.config.capabilities?.rated;
        if (ui.rated.disabled) {
            ui.rated.checked = false;
            ui.ratedHelp.textContent = 'Casual games are enabled in this rollout.';
        }
        ui.tournamentCard.hidden = !model.config.capabilities?.tournaments;
        const auth = await waitForAuth();
        model.auth = auth;
        if (!auth?.isSignedIn) return renderSignedOut();
        ui.account.textContent = auth.fullName || auth.email || 'Account';
        ui.account.href = '/profile';
        await api.command('presence.join');
        await syncState('boot');
        startPolling();
    } catch (error) {
        handleError(error, 'The playing room could not be reached.');
    }
}

async function waitForAuth() {
    if (window.CAISSA_AUTH?.whenReady) return window.CAISSA_AUTH.whenReady();
    return new Promise(resolve => {
        const deadline = setTimeout(() => resolve({ isLoaded: true, isSignedIn: false, status: 'unavailable' }), 8000);
        window.addEventListener('caissa-auth-change', event => {
            clearTimeout(deadline);
            resolve(event.detail);
        }, { once: true });
    });
}

function bindControls() {
    document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
    document.querySelectorAll('[data-control]').forEach(button => button.addEventListener('click', () => {
        if (model.game?.status === 'active' || model.state?.ticket) return;
        model.selectedControl = button.dataset.control;
        document.querySelectorAll('[data-control]').forEach(item => item.classList.toggle('selected', item === button));
        $('custom-clock').hidden = model.selectedControl !== 'custom';
    }));
    ui.find.addEventListener('click', findGame);
    ui.cancel.addEventListener('click', cancelSearch);
    $('new-opponent').addEventListener('click', () => { model.game = null; renderLobby(); });
    $('rematch-game').addEventListener('click', () => sendGameCommand('game.rematch'));
    $('play-friend').addEventListener('click', () => selectTab('players'));
    $('browse-tournaments').addEventListener('click', () => { selectTab('games'); $('tournament-card').scrollIntoView({ behavior: 'smooth' }); });
    $('resign-game').addEventListener('click', () => confirmAction('Resign this game?', 'This result is final and will be recorded.', 'Resign')
        .then(confirmed => confirmed && sendGameCommand('game.resign')));
    $('offer-draw').addEventListener('click', handleDrawAction);
    $('decline-draw').addEventListener('click', () => sendGameCommand('game.drawDecline'));
    $('download-pgn').addEventListener('click', downloadPgn);
    $('analyze-game').addEventListener('click', analyzeGame);
    $('open-tournaments').addEventListener('click', () => location.assign('/online/tournaments'));
}

function selectTab(name) {
    document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
}

async function findGame() {
    if (!model.auth?.isSignedIn) return renderSignedOut();
    setBusy(ui.find, true, 'Joining queue…');
    try {
        const envelope = await api.command('queue.join', selectedQueuePayload());
        applyState(envelope.data?.state);
    } catch (error) { handleError(error, 'Could not join matchmaking.'); }
    finally { setBusy(ui.find, false, 'Find an opponent'); }
}

async function cancelSearch() {
    setBusy(ui.cancel, true, 'Cancelling…');
    try {
        const envelope = await api.command('queue.leave');
        applyState(envelope.data?.state);
    } catch (error) { handleError(error, 'Could not cancel matchmaking.'); }
    finally { setBusy(ui.cancel, false, 'Cancel search'); }
}

async function syncState(reason = 'poll') {
    if (model.syncing || model.disposed) return;
    model.syncing = true;
    if (reason !== 'poll') setConnection('reconnecting', 'Syncing');
    try {
        const envelope = await api.state();
        applyState(envelope.data?.state);
        setConnection('online', 'Connected');
    } catch (error) {
        setConnection('offline', 'Offline');
        if (reason !== 'poll') handleError(error, 'Connection lost. Your board will resync automatically.');
    } finally { model.syncing = false; }
}

function applyState(state) {
    if (!state) return;
    const priorGame = model.game;
    const retainedCompleted = !state.game && !state.ticket && priorGame
        ? state.recentGames?.find?.(game => game.id === priorGame.id && game.status === 'completed') : null;
    const previousGameId = model.game?.id;
    const previousVersion = model.game?.version || 0;
    model.state = state;
    model.game = state.game || retainedCompleted || null;
    model.pendingMove = null;
    renderPlayers(state.players || [], state.challenges || []);
    renderGames(state.recentGames || []);
    if (model.game) {
        renderGame(model.game);
        if (model.game.id !== previousGameId) connectRealtime(model.game.id);
        if (model.game.version > previousVersion && previousGameId === model.game.id) announceOpponentMove(model.game);
    } else if (state.ticket) renderQueue(state.ticket);
    else renderLobby();
}

function renderLobby() {
    showView('lobby');
    ui.title.textContent = 'Find a game'; ui.badge.textContent = 'READY';
    ui.status.textContent = 'Choose a time control and enter matchmaking.';
    ui.curtain.hidden = false; ui.curtainTitle.textContent = 'CAISSA Online';
    ui.curtainCopy.textContent = 'Choose a time control to find an opponent.';
    board.setPosition(START_FEN, { animate: false }); board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips();
}

function renderQueue(ticket) {
    showView('queue');
    ui.title.textContent = 'Matchmaking'; ui.badge.textContent = 'SEARCHING';
    ui.status.textContent = 'Looking for a compatible opponent…';
    if (!model.queueStartedAt) model.queueStartedAt = Date.parse(ticket.created_at) || Date.now();
    ui.queueControl.textContent = `${formatTimeControl(ticket)} · ${titleCase(ticket.pool)}`;
    ui.curtain.hidden = false; ui.curtainTitle.textContent = 'Searching';
    ui.curtainCopy.textContent = 'Your place is reserved. You may safely reconnect.';
    board.setReadOnly(true);
    board.setInteractive(false);
}

function renderGame(game) {
    const completed = game.status === 'completed';
    showView(completed ? 'result' : 'game');
    model.queueStartedAt = null;
    const color = playerColor(game);
    board.setOrientation(color || 'white');
    board.setPosition(game.fen || START_FEN, { animate: true });
    board.setInteractive(!completed && !!color);
    board.setReadOnly(completed || game.turn !== color || !!model.pendingMove);
    ui.curtain.hidden = true;
    ui.title.textContent = completed ? 'Game complete' : `${formatTimeControl(game)} ${titleCase(game.pool)}`;
    ui.badge.textContent = completed ? 'FINAL' : game.rated ? 'RATED' : 'CASUAL';
    ui.status.textContent = completed ? 'The result and game record are final.' : 'Server-authoritative game in progress.';
    renderPlayerStrips(game, color);
    renderMoves(game.moves || []);
    const ours = game.turn === color;
    ui.turnCopy.textContent = completed ? 'Game over' : ours ? 'Your move' : `${opponentName(game, color)} is thinking`;
    $('turn-indicator').style.background = ours ? '#56bd88' : '#d5ae61';
    const incomingDraw = game.draw_offer_by && game.draw_offer_by !== model.auth?.userId;
    $('offer-draw').textContent = incomingDraw ? 'Accept draw' : game.draw_offer_by ? 'Draw offered' : 'Offer draw';
    $('offer-draw').disabled = !!game.draw_offer_by && !incomingDraw;
    $('decline-draw').hidden = !incomingDraw;
    if (completed) renderResult(game, color);
}

function renderPlayerStrips(game, color) {
    const topColor = color === 'black' ? 'white' : 'black';
    const bottomColor = color || 'white';
    fillStrip(ui.top, game, topColor, topColor !== color);
    fillStrip(ui.bottom, game, bottomColor, bottomColor !== color);
    ui.top.dataset.color = topColor; ui.bottom.dataset.color = bottomColor;
}

function fillStrip(strip, game, color, opponent) {
    const name = color === 'white' ? game.white_display_name : game.black_display_name;
    const rating = color === 'white' ? game.white_rating_before : game.black_rating_before;
    strip.querySelector('.player-name').textContent = name || (opponent ? 'Opponent' : 'You');
    strip.querySelector('.player-rating').textContent = Number.isFinite(Number(rating)) ? `${rating}${game.rated ? ' rated' : ''}` : (game.rated ? 'Rated' : 'Casual');
    strip.querySelector('.player-avatar').textContent = initials(name || (opponent ? 'Opponent' : 'You'));
}

function renderClocks() {
    if (model.state?.ticket && model.queueStartedAt) ui.queueElapsed.textContent = formatElapsed(Date.now() - model.queueStartedAt);
    const game = model.game;
    if (!game) return;
    const clock = projectOnlineClock(game);
    const topColor = ui.top.dataset.color;
    const topMs = topColor === 'white' ? clock.whiteMs : clock.blackMs;
    const bottomMs = topColor === 'white' ? clock.blackMs : clock.whiteMs;
    ui.topClock.textContent = formatClock(topMs); ui.bottomClock.textContent = formatClock(bottomMs);
    ui.top.dataset.running = String(clock.running === topColor);
    ui.bottom.dataset.running = String(clock.running && clock.running !== topColor);
    if ((clock.whiteMs <= 0 || clock.blackMs <= 0) && game.status === 'active') void syncState('clock-expired');
}

function renderMoves(moves) {
    ui.moveList.replaceChildren();
    for (let index = 0; index < moves.length; index += 2) {
        const item = document.createElement('li');
        const number = document.createElement('span'); number.className = 'move-no'; number.textContent = `${Math.floor(index / 2) + 1}.`;
        const white = moveButton(moves[index], index + 1, moves);
        const black = moveButton(moves[index + 1], index + 2, moves);
        item.append(number, white, black); ui.moveList.append(item);
    }
    ui.moveList.scrollTop = ui.moveList.scrollHeight;
}

function moveButton(move, ply, moves) {
    const button = document.createElement('button'); button.textContent = move?.san || '';
    button.disabled = !move;
    if (move && model.game?.status === 'completed') button.addEventListener('click', () => {
        const replay = new Chess(model.game.initial_fen || START_FEN);
        for (const item of moves.slice(0, ply)) replay.move({ from: item.from, to: item.to, promotion: item.promotion || 'q' });
        board.setPosition(replay.fen(), { animate: true });
        board.setReadOnly(true);
        ui.status.textContent = `Reviewing move ${ply} of ${moves.length}.`;
    });
    return button;
}

async function submitMove(intent) {
    const game = model.game;
    if (!game || game.status !== 'active' || model.pendingMove || game.turn !== playerColor(game)) return;
    let promotion = intent.promotion?.toLowerCase() || null;
    const probe = new Chess(game.fen);
    const piece = probe.get(intent.from);
    if (piece?.type === 'p' && (intent.to.endsWith('1') || intent.to.endsWith('8'))) promotion = await choosePromotion();
    if (piece?.type === 'p' && !promotion && (intent.to.endsWith('1') || intent.to.endsWith('8'))) return;
    let localMove;
    try { localMove = probe.move({ from: intent.from, to: intent.to, promotion: promotion || 'q' }); } catch (_) { localMove = null; }
    if (!localMove) return showBoardError(intent, 'That move is not legal.');
    model.pendingMove = { from: intent.from, to: intent.to, promotion };
    board.applyMove({ from: intent.from, to: intent.to, promotion: promotion?.toUpperCase() || null }, { fen: probe.fen(), animate: true });
    board.highlightSquares([{ square: intent.from, type: 'last' }, { square: intent.to, type: 'last' }]);
    board.setReadOnly(true);
    try {
        const envelope = await api.command('game.move', {
            from: intent.from, to: intent.to, promotion, expectedVersion: game.version
        }, { gameId: game.id });
        applyState(envelope.data?.state);
    } catch (error) {
        model.pendingMove = null;
        board.setPosition(game.fen, { animate: false });
        showBoardError(intent, messageForError(error));
        await syncState('move-rejected');
    }
}

async function handleDrawAction() {
    const game = model.game;
    if (!game) return;
    const incoming = game.draw_offer_by && game.draw_offer_by !== model.auth?.userId;
    if (incoming) {
        const accepted = await confirmAction('Accept the draw?', 'The game will end immediately as a draw.', 'Accept draw');
        if (!accepted) return;
    }
    await sendGameCommand(incoming ? 'game.drawAccept' : 'game.drawOffer');
}

async function sendGameCommand(eventType) {
    if (!model.game) return;
    try {
        const envelope = await api.command(eventType, {}, { gameId: model.game.id });
        applyState(envelope.data?.state);
    } catch (error) { handleError(error, messageForError(error)); }
}

function renderResult(game, color) {
    const won = (game.result === '1-0' && color === 'white') || (game.result === '0-1' && color === 'black');
    const drawn = game.result === '1/2-1/2';
    ui.resultTitle.textContent = drawn ? 'Draw' : won ? 'Victory' : 'Defeat';
    ui.resultDetail.textContent = `${resultLabel(game.termination)} · ${game.result}`;
    const delta = color === 'white' ? game.white_rating_delta : game.black_rating_delta;
    if (game.rated && Number.isFinite(Number(delta))) {
        const before = Number(color === 'white' ? game.white_rating_before : game.black_rating_before);
        ui.ratingChange.hidden = false;
        ui.ratingChange.textContent = `${before} ${Number(delta) >= 0 ? '+' : ''}${delta} → ${before + Number(delta)}`;
    } else ui.ratingChange.hidden = true;
}

function renderGames(games) {
    if (!games.length) return;
    ui.gamesList.className = 'games-list'; ui.gamesList.replaceChildren();
    games.forEach(game => {
        const row = document.createElement('button'); row.className = 'game-row';
        row.innerHTML = `<strong>${escapeHtml(game.white_display_name)} <span>${escapeHtml(game.result || 'vs')}</span> ${escapeHtml(game.black_display_name)}</strong><small>${escapeHtml(formatTimeControl(game))} · ${escapeHtml(titleCase(game.pool))}</small>`;
        row.addEventListener('click', () => { model.game = game; renderGame(game); selectTab('new'); });
        ui.gamesList.append(row);
    });
}

function renderPlayers(players, challenges) {
    const challengeList = $('challenges-list'); challengeList.replaceChildren();
    challenges.forEach(challenge => {
        const row = document.createElement('div'); row.className = 'challenge-row';
        const label = document.createElement('span');
        label.innerHTML = `<strong>${escapeHtml(challenge.otherDisplayName)}</strong><small>${Math.floor(challenge.baseMs / 60000)}+${Math.floor(challenge.incrementMs / 1000)} · ${escapeHtml(titleCase(challenge.pool))}</small>`;
        row.append(label);
        if (challenge.direction === 'incoming') {
            const accept = document.createElement('button'); accept.textContent = 'Accept';
            const decline = document.createElement('button'); decline.textContent = 'Decline';
            accept.addEventListener('click', () => respondChallenge(challenge.id, 'challenge.accept'));
            decline.addEventListener('click', () => respondChallenge(challenge.id, 'challenge.decline'));
            row.append(accept, decline);
        } else { const pending = document.createElement('small'); pending.textContent = 'Pending'; row.append(pending); }
        challengeList.append(row);
    });
    ui.playersList.replaceChildren();
    if (!players.length) {
        const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = '♞';
        const title = document.createElement('strong'); title.textContent = 'No players visible';
        const copy = document.createElement('p'); copy.textContent = 'Players will appear here while their presence is active.';
        ui.playersList.className = 'empty-state'; ui.playersList.append(icon, title, copy);
        return;
    }
    ui.playersList.className = 'players-list';
    players.forEach(player => {
        const row = document.createElement('div'); row.className = 'player-row';
        row.innerHTML = `<span class="presence presence--${escapeHtml(player.status)}"></span><strong>${escapeHtml(player.displayName)}</strong><small>${escapeHtml(String(player.rating))} · ${escapeHtml(titleCase(player.pool))}</small>`;
        const challenge = document.createElement('button'); challenge.textContent = 'Challenge'; challenge.disabled = player.status === 'playing';
        challenge.addEventListener('click', () => createChallenge(player.clerkId)); row.append(challenge);
        ui.playersList.append(row);
    });
}

async function createChallenge(targetClerkId) {
    try {
        const envelope = await api.command('challenge.create', { targetClerkId, ...selectedQueuePayload() });
        applyState(envelope.data?.state); showToast('Challenge sent.');
    } catch (error) { handleError(error, 'The challenge could not be sent.'); }
}

function selectedQueuePayload() {
    const payload = {
        timeControlId: model.selectedControl,
        rated: ui.rated.checked && model.config.capabilities?.rated === true
    };
    if (model.selectedControl === 'custom') {
        payload.baseMinutes = Number($('custom-minutes').value);
        payload.incrementSeconds = Number($('custom-increment').value);
    }
    return payload;
}

async function respondChallenge(challengeId, eventType) {
    try {
        const envelope = await api.command(eventType, { challengeId });
        applyState(envelope.data?.state); if (envelope.data?.state?.game) selectTab('new');
    } catch (error) { handleError(error, 'The challenge is no longer available.'); }
}

async function connectRealtime(gameId) {
    if (model.realtimeGameId === gameId) return;
    await model.realtime?.close?.(); model.realtime = null; model.realtimeGameId = gameId;
    model.realtime = await createOnlineRealtime(model.config.realtime, {
        gameId,
        getToken: () => window.CAISSA_AUTH?.getToken?.(),
        onChange: () => void syncState('realtime'),
        onStatus: status => {
            if (status === 'SUBSCRIBED') setConnection('online', 'Live');
            else if (status === 'FALLBACK') setConnection('online', 'Connected');
        }
    });
}

function startPolling() {
    clearInterval(model.polling);
    model.polling = setInterval(() => {
        if (!document.hidden) void syncState('poll');
    }, model.game?.status === 'active' ? 1200 : 2500);
    setInterval(() => {
        if (!document.hidden && model.auth?.isSignedIn) void api.command('presence.join').catch(() => {});
    }, 25_000);
}

function analyzeGame() {
    const game = model.game;
    if (!game?.pgn) return;
    try {
        const transport = window.CaissaAnalyzeHandoff?.createTransport?.();
        const created = transport?.create?.({
            intent: 'analyze-game', source: 'caissa-online',
            payload: {
                recordId: game.id, initialFen: game.initial_fen || START_FEN, finalFen: game.fen,
                pgn: game.pgn, selectedPly: game.ply, playerColor: playerColor(game),
                boardOrientation: playerColor(game), result: game.result, termination: game.termination,
                whiteLabel: game.white_display_name, blackLabel: game.black_display_name,
                recordStatus: 'completed', mode: 'human-online'
            },
            provenance: { sourceSection: 'online' }
        });
        if (!created?.ok) throw new Error(created?.reasonCode || 'HANDOFF_CREATE_FAILED');
        const stored = transport.store(created.value);
        if (!stored?.ok) throw new Error(stored?.reasonCode || 'HANDOFF_STORE_FAILED');
        location.assign(`/analyze?handoff=${encodeURIComponent(created.value.token)}`);
    } catch (_) { showToast('Analysis handoff is unavailable in this browser.'); }
}

function downloadPgn() {
    if (!model.game?.pgn) return;
    const blob = new Blob([model.game.pgn], { type: 'application/x-chess-pgn;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `caissa-online-${model.game.id}.pgn`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function choosePromotion() {
    const dialog = $('promotion-dialog'); dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(/^[qrbn]$/.test(dialog.returnValue) ? dialog.returnValue : null), { once: true }));
}

function confirmAction(title, copy, confirmLabel) {
    const dialog = $('confirm-dialog'); $('confirm-title').textContent = title; $('confirm-copy').textContent = copy;
    dialog.querySelector('[value=confirm]').textContent = confirmLabel; dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

function showView(name) {
    ui.lobby.hidden = name !== 'lobby'; ui.queue.hidden = name !== 'queue';
    ui.game.hidden = name !== 'game'; ui.result.hidden = name !== 'result';
}

function renderUnavailable(copy) {
    setConnection('offline', 'Unavailable'); ui.find.disabled = true; ui.rated.disabled = true;
    ui.status.textContent = copy; ui.curtainTitle.textContent = 'Online room closed'; ui.curtainCopy.textContent = copy;
}

function renderSignedOut() {
    setConnection('offline', 'Sign in required'); ui.find.textContent = 'Sign in to play';
    ui.find.onclick = () => location.assign('/signin?redirect_url=%2Fonline');
    ui.status.textContent = 'Sign in to enter matchmaking and resume games.';
    ui.curtainTitle.textContent = 'Your seat is waiting'; ui.curtainCopy.textContent = 'Sign in to play another person on CAISSA.';
}

function setConnection(state, label) { ui.connection.dataset.connection = state; ui.connectionLabel.textContent = label; }
function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }
function formatTimeControl(item) { return `${Math.floor(Number(item.base_ms || 0) / 60000)}+${Math.floor(Number(item.increment_ms || 0) / 1000)}`; }
function formatElapsed(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function titleCase(value) { const text = String(value || ''); return text ? text[0].toUpperCase() + text.slice(1) : ''; }
function initials(value) { return String(value || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function playerColor(game) { return model.auth?.userId === game.white_clerk_id ? 'white' : model.auth?.userId === game.black_clerk_id ? 'black' : null; }
function opponentName(game, color) { return color === 'white' ? game.black_display_name : game.white_display_name; }
function resultLabel(value) { return ({ checkmate: 'Checkmate', stalemate: 'Stalemate', repetition: 'Threefold repetition', 'insufficient-material': 'Insufficient material', draw: 'Draw', resignation: 'Resignation', agreement: 'Draw agreed', timeout: 'Time expired' })[value] || 'Game complete'; }
function announceOpponentMove(game) { if (game.moves?.at(-1)?.color !== playerColor(game)) ui.status.textContent = `${opponentName(game, playerColor(game))} moved ${game.moves.at(-1).san}.`; }
function resetPlayerStrips() { fillEmpty(ui.top, 'Waiting for opponent'); fillEmpty(ui.bottom, model.auth?.fullName || 'You'); ui.topClock.textContent = '—'; ui.bottomClock.textContent = '—'; }
function fillEmpty(strip, name) { strip.querySelector('.player-name').textContent = name; strip.querySelector('.player-rating').textContent = '—'; strip.querySelector('.player-avatar').textContent = initials(name); strip.dataset.running = 'false'; }
function showBoardError(intent, message) { board.highlightSquares([{ square: intent.from, type: 'error' }, { square: intent.to, type: 'error' }]); showToast(message); setTimeout(() => board.clearHighlights(), 900); }
function messageForError(error) { return ({ AUTH_REQUIRED: 'Sign in to continue.', STALE_VERSION: 'The board changed; it has been synchronized.', ILLEGAL_MOVE: 'That move is not legal.', NOT_YOUR_TURN: 'Wait for your turn.', RATE_LIMITED: 'Too many requests. Please wait a moment.', DRAW_OFFER_REQUIRED: 'There is no draw offer to accept.' })[error?.code] || 'The server could not confirm that action.'; }
function handleError(error, fallback) { console.warn('CAISSA Online:', error?.code || error?.message); showToast(error instanceof OnlineApiError ? messageForError(error) : fallback); }
function showToast(message) { clearTimeout(model.toastTimer); ui.toast.textContent = message; ui.toast.hidden = false; model.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4200); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function dispose() { model.disposed = true; clearInterval(model.polling); await model.realtime?.close?.(); board.destroy(); }
