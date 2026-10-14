import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { createOnlineApi, OnlineApiError } from './online-api.js';
import { formatClock, projectOnlineClock } from './online-clock.js';
import { createOnlineGuestSession } from './online-guest-session.js';
import { createOnlineRealtime, createOnlineResyncQueue } from './online-realtime.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const TOURNAMENT_DEMO = location.pathname === '/online/tournament-demo'
    || new URLSearchParams(location.search).get('demo') === 'tournament';
const $ = id => document.getElementById(id);
const ui = {
    connection: document.querySelector('.connection-pill'), connectionLabel: $('connection-label'),
    account: $('account-link'), status: $('room-status'), title: $('workspace-title'), badge: $('game-badge'),
    curtain: $('board-curtain'), curtainTitle: $('curtain-title'), curtainCopy: $('curtain-copy'),
    top: $('player-top'), bottom: $('player-bottom'), topClock: $('clock-top'), bottomClock: $('clock-bottom'),
    lobby: $('lobby-view'), queue: $('queue-view'), game: $('game-view'), result: $('result-view'),
    find: $('find-game'), cancel: $('cancel-search'), rated: $('rated-toggle'), ratedHelp: $('rated-help'),
    ratedControl: $('rated-control'), gameModeLabel: $('game-mode-label'), browseTournaments: $('browse-tournaments'),
    tournamentAvailability: $('tournament-availability'),
    guest: $('play-as-guest'), guestNote: $('guest-note'), lobbyAccess: $('lobby-access'),
    login: $('online-login'), signup: $('online-signup'),
    queueControl: $('queue-control'), queueElapsed: $('queue-elapsed'), turnCopy: $('turn-copy'),
    moveList: $('move-list'), resultTitle: $('result-title'), resultDetail: $('result-detail'),
    ratingChange: $('rating-change'), gamesList: $('games-list'), playersList: $('players-list'), playersCount: $('players-count'),
    tournamentCard: $('tournament-card'), tournamentTab: $('tab-tournament'), toast: $('online-toast'), rematch: $('rematch-game'),
    footContext: $('workspace-foot-context'),
    challengeNotice: $('challenge-notice'), challengeKicker: $('challenge-notice-kicker'),
    challengeTitle: $('challenge-notice-title'), challengeControl: $('challenge-notice-control'),
    challengeActions: $('challenge-notice-actions'), challengeAccept: $('challenge-notice-accept'),
    challengeDecline: $('challenge-notice-decline'), signInDialog: $('signin-dialog')
};

const model = {
    config: null, state: null, auth: null, game: null, selectedControl: 'blitz-3-2',
    pendingMove: null, queueStartedAt: null, realtime: null, realtimeGameId: null,
    realtimeUserId: null, realtimeTarget: null, realtimeEpoch: 0,
    polling: null, pollEpoch: 0, presencePolling: null, syncing: false, disposed: false,
    bootSettled: false, toastTimer: null, challengeExpiryTimer: null,
    challengeNoticeId: null, inactiveChallengeIds: new Set(), respondingChallengeIds: new Set(),
    challengeRequestTargets: new Set(), rematchRequestGameIds: new Set(),
    signInPromptOpener: null, signInRedirecting: false,
    guestSession: null, guestStarting: false, pendingGameCommand: null
};

const api = createOnlineApi({
    tokenProvider: onlineAccessToken,
    displayNameProvider: () => model.auth?.fullName || 'CAISSA Player'
});

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
const stateSyncQueue = createOnlineResyncQueue(fetchCanonicalState);

window.addEventListener('beforeunload', dispose, { once: true });
window.addEventListener('caissa-auth-change', onAuthEvent);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && model.auth?.isSignedIn) void resumeFromBackground();
});
bindControls();
restoreSelectedControlFromLocation();
selectTab('new');
selectGamesView('daily');
selectTournamentView('standings');
setInterval(renderClocks, 100);
if (TOURNAMENT_DEMO) renderTournamentDemo();
else {
    if (location.pathname === '/online/tournaments') selectTab('games');
    void boot();
}

async function boot() {
    setConnection('reconnecting', 'Connecting');
    try {
        model.config = await api.config();
        if (!model.config.enabled) return renderUnavailable('Online play is not available right now.');
        configureCapabilities(model.config.capabilities || {});
        if (model.config.capabilities?.guestPlay === true) {
            model.guestSession = await createOnlineGuestSession(model.config.realtime);
        }
        const memberAuth = await waitForAuth();
        if (memberAuth?.isSignedIn) return activateIdentity(memberAuth, 'boot');
        const guestAuth = await model.guestSession?.restore?.();
        if (guestAuth?.isSignedIn) return activateIdentity(guestAuth, 'guest-restore');
        model.auth = memberAuth;
        renderSignedOut();
    } catch (error) {
        handleError(error, 'The playing room could not be reached.');
    } finally {
        model.bootSettled = true;
    }
}

function configureCapabilities(capabilities) {
    const ratedEnabled = capabilities.rated === true && model.auth?.isGuest !== true;
    ui.rated.disabled = !ratedEnabled;
    ui.rated.hidden = !ratedEnabled;
    ui.ratedControl.hidden = !ratedEnabled;
    ui.gameModeLabel.textContent = ratedEnabled ? 'Game mode' : 'Casual';
    ui.ratedHelp.textContent = ratedEnabled
        ? 'Turn on Rated to play for rating points.'
        : 'Casual games do not change ratings.';
    if (!ratedEnabled) ui.rated.checked = false;

    const tournamentsEnabled = capabilities.tournaments === true;
    ui.tournamentCard.hidden = !tournamentsEnabled;
    ui.browseTournaments.dataset.availability = tournamentsEnabled ? 'preview' : 'coming-soon';
    ui.browseTournaments.setAttribute('aria-disabled', String(!tournamentsEnabled));
    ui.tournamentAvailability.textContent = tournamentsEnabled ? 'Internal Preview' : 'Coming Soon';

    const openGamesEnabled = capabilities.openGames === true;
    $('games-open-unavailable').hidden = openGamesEnabled;
    $('games-open-empty').hidden = !openGamesEnabled;
    $('games-open-status').textContent = openGamesEnabled ? 'Joinable now' : 'Coming soon';

    const spectatorsEnabled = capabilities.spectators === true;
    $('games-watch-unavailable').hidden = spectatorsEnabled;
    $('games-watch-empty').hidden = !spectatorsEnabled;
    $('games-watch-status').textContent = spectatorsEnabled ? 'Live games' : 'Coming soon';

    const guestEnabled = capabilities.guestPlay === true;
    ui.guest.hidden = !guestEnabled || model.auth?.isSignedIn === true;
    ui.guestNote.hidden = !guestEnabled || model.auth?.isSignedIn === true;
    ui.lobbyAccess.hidden = model.auth?.isSignedIn === true;
}

function onAuthEvent(event) {
    void handleAuthChange(event.detail);
}

async function handleAuthChange(nextAuth) {
    const previousAuth = model.auth;
    if (!model.bootSettled || model.disposed) return;

    if (!nextAuth?.isSignedIn && previousAuth?.isGuest) return;
    if (nextAuth?.isSignedIn && previousAuth?.isGuest) await model.guestSession?.end?.();
    model.auth = nextAuth;

    const previousUserId = previousAuth?.isSignedIn ? previousAuth.userId : null;
    const nextUserId = nextAuth?.isSignedIn ? nextAuth.userId : null;
    if (!nextUserId) {
        stopPolling();
        await disconnectRealtime();
        renderSignedOut();
        return;
    }

    if (previousUserId !== nextUserId) {
        stopPolling();
        await disconnectRealtime();
        try {
            await activateIdentity(nextAuth, 'auth-change');
        } catch (error) {
            handleError(error, 'The playing room could not be reached.');
        }
        return;
    }

    await model.realtime?.refreshAuth?.();
}

async function activateIdentity(auth, reason) {
    model.auth = auth;
    configureCapabilities(model.config?.capabilities || {});
    if (auth.isGuest) {
        ui.account.textContent = 'Guest · Sign in';
        ui.account.href = signInUrl();
        setConnection('reconnecting', 'Guest');
    } else {
        ui.account.textContent = auth.fullName || auth.email || 'Account';
        ui.account.href = '/profile';
    }
    await api.command('presence.join');
    await syncState(reason);
    startPolling();
}

async function resumeFromBackground() {
    await model.realtime?.refreshAuth?.();
    if (!model.disposed && model.auth?.isSignedIn) await syncState('visibility');
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
    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            selectTab(tab.dataset.tab);
            if (tab.dataset.tab === 'new' && model.bootSettled && !model.auth?.isSignedIn) showSignInDialog(tab);
        });
        tab.addEventListener('keydown', handleTabKeydown);
    });
    document.querySelectorAll('[data-control]').forEach(button => button.addEventListener('click', () => selectTimeControl(button)));
    document.querySelectorAll('[data-games-tab]').forEach(tab => {
        tab.addEventListener('click', () => selectGamesView(tab.dataset.gamesTab));
        tab.addEventListener('keydown', event => handleRovingTabs(event, '[data-games-tab]', 'gamesTab', selectGamesView));
    });
    [$('custom-minutes'), $('custom-increment')].forEach(input => input.addEventListener('input', updateSignInHref));
    ui.find.addEventListener('click', findGame);
    ui.guest.addEventListener('click', playAsGuest);
    ui.cancel.addEventListener('click', cancelSearch);
    $('new-opponent').addEventListener('click', () => { model.game = null; renderLobby(); });
    ui.rematch.addEventListener('click', requestRematch);
    $('play-friend').addEventListener('click', event => {
        if (!model.auth?.isSignedIn) return showSignInDialog(event.currentTarget);
        selectTab('players');
    });
    ui.browseTournaments.addEventListener('click', () => {
        if (TOURNAMENT_DEMO) return selectTab('tournament');
        if (model.config?.capabilities?.tournaments !== true) {
            showToast('CAISSA Tournament Season is coming soon.');
            return;
        }
        selectTab('games');
        ui.tournamentCard.scrollIntoView({ behavior: 'smooth' });
    });
    $('resign-game').addEventListener('click', () => confirmAction('Resign this game?', 'This result is final and will be recorded.', 'Resign')
        .then(confirmed => confirmed && sendGameCommand('game.resign')));
    $('offer-draw').addEventListener('click', handleDrawAction);
    $('decline-draw').addEventListener('click', () => sendGameCommand('game.drawDecline'));
    $('download-pgn').addEventListener('click', downloadPgn);
    $('analyze-game').addEventListener('click', analyzeGame);
    $('open-tournaments').addEventListener('click', () => location.assign('/online/tournaments'));
    $('demo-next-game').addEventListener('click', () => showToast('Demo only — a server-confirmed pairing would open the game.'));
    document.querySelectorAll('[data-tournament-view]').forEach(tab => {
        tab.addEventListener('click', () => selectTournamentView(tab.dataset.tournamentView));
        tab.addEventListener('keydown', event => handleRovingTabs(event, '[data-tournament-view]', 'tournamentView', selectTournamentView));
    });
    $('player-search').addEventListener('input', () => renderPlayers(model.state?.players || [], model.state?.challenges || []));
    ui.challengeAccept.addEventListener('click', () => respondVisibleChallenge('challenge.accept'));
    ui.challengeDecline.addEventListener('click', () => respondVisibleChallenge('challenge.decline'));
    ui.signInDialog.addEventListener('close', handleSignInDialogClose);
}

function selectTimeControl(button) {
    if (!button || model.game?.status === 'active' || model.state?.ticket) return;
    model.selectedControl = button.dataset.control;
    document.querySelectorAll('[data-control]').forEach(item => item.classList.toggle('selected', item === button));
    $('custom-clock').hidden = model.selectedControl !== 'custom';
    updateSignInHref();
}

function restoreSelectedControlFromLocation() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('control');
    const button = Array.from(document.querySelectorAll('[data-control]')).find(item => item.dataset.control === requested);
    if (!button) return;
    selectTimeControl(button);
    if (requested !== 'custom') return;
    restoreBoundedNumber($('custom-minutes'), params.get('minutes'));
    restoreBoundedNumber($('custom-increment'), params.get('increment'));
}

function restoreBoundedNumber(input, rawValue) {
    if (rawValue === null || rawValue === '') return;
    const value = Number(rawValue);
    const min = Number(input.min);
    const max = Number(input.max);
    if (Number.isFinite(value) && value >= min && value <= max) input.value = String(value);
}

function selectTab(name) {
    document.querySelectorAll('[data-tab]').forEach(tab => {
        const selected = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    ui.footContext.textContent = ({
        new: 'Private, server-verified games',
        games: 'Your game history',
        players: 'Private challenges',
        tournament: 'Tournament concept · demo data'
    })[name] || 'CAISSA Online';
}

function handleTabKeydown(event) {
    handleRovingTabs(event, '[data-tab]', 'tab', selectTab);
}

function selectGamesView(name) {
    document.querySelectorAll('[data-games-tab]').forEach(tab => {
        const selected = tab.dataset.gamesTab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-games-panel]').forEach(panel => {
        panel.hidden = panel.dataset.gamesPanel !== name;
    });
}

function handleRovingTabs(event, selector, datasetKey, select) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(document.querySelectorAll(selector)).filter(tab => !tab.hidden);
    const current = tabs.indexOf(event.currentTarget);
    const next = event.key === 'Home' ? 0
        : event.key === 'End' ? tabs.length - 1
            : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    select(tabs[next].dataset[datasetKey]);
    tabs[next].focus();
}

function renderTournamentDemo() {
    document.body.dataset.tournamentDemo = 'true';
    document.title = 'Tournament Panel Demo — CAISSA';
    ui.tournamentTab.hidden = false;
    ui.title.textContent = 'Tournament arena';
    ui.badge.textContent = 'DEMO';
    ui.footContext.textContent = 'Tournament concept · demo data';
    setConnection('online', 'Demo');
    ui.curtain.hidden = false;
    ui.curtainTitle.textContent = 'Tournament preview';
    ui.curtainCopy.textContent = 'The real game board remains unchanged until the server confirms a pairing.';
    board.setPosition(START_FEN, { animate: false });
    board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips();
    selectTab('tournament');
}

function selectTournamentView(name) {
    document.querySelectorAll('[data-tournament-view]').forEach(tab => {
        const selected = tab.dataset.tournamentView === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-tournament-panel]').forEach(panel => {
        panel.hidden = panel.dataset.tournamentPanel !== name;
    });
}

async function playAsGuest() {
    if (model.guestStarting || model.auth?.isSignedIn) return;
    if (!model.guestSession) return showToast('Guest play is not available right now.');
    model.guestStarting = true;
    setBusy(ui.guest, true, 'Creating guest seat…');
    try {
        const guestAuth = await model.guestSession.start();
        await activateIdentity(guestAuth, 'guest-start');
        await findGame();
    } catch (error) {
        model.auth = { isLoaded: true, isSignedIn: false, status: 'anonymous' };
        renderSignedOut();
        handleError(error, 'A temporary guest seat could not be created.');
    } finally {
        model.guestStarting = false;
        ui.guest.disabled = false;
        ui.guest.textContent = 'Play as Guest';
        configureCapabilities(model.config?.capabilities || {});
    }
}

async function findGame() {
    if (!model.auth?.isSignedIn) return showSignInDialog(ui.find);
    if (ui.find.disabled) return;
    setBusy(ui.find, true, 'Joining queue…');
    try {
        const envelope = await api.command('queue.join', selectedQueuePayload());
        applyState(envelope.data?.state);
    } catch (error) { handleError(error, 'Could not join matchmaking.'); }
    finally { setBusy(ui.find, false, 'Start Game'); }
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
    if (model.disposed) return false;
    return stateSyncQueue.request(reason);
}

async function fetchCanonicalState(reason) {
    if (reason !== 'poll') setConnection('reconnecting', 'Syncing');
    try {
        const envelope = await api.state();
        applyState(envelope.data?.state);
        setConnection('online', 'Connected');
        return true;
    } catch (error) {
        setConnection('offline', 'Offline');
        if (reason !== 'poll') handleError(error, 'Connection lost. Your board will resync automatically.');
        return false;
    }
}

function applyState(state, options = {}) {
    if (!state) return;
    const priorGame = model.game;
    const previousGameId = priorGame?.id;
    const previousVersion = gameVersion(priorGame);
    const recentPrior = priorGame ? state.recentGames?.find?.(game => game.id === priorGame.id) : null;
    const retainedCompleted = !state.game && !state.ticket && recentPrior?.status === 'completed' ? recentPrior : null;
    let nextGame = state.game || retainedCompleted || null;
    let preservePendingPresentation = false;
    let resolvedPendingMove = false;

    if (model.pendingMove && priorGame?.id === model.pendingMove.gameId) {
        const pendingCandidate = state.game?.id === model.pendingMove.gameId
            ? state.game
            : state.recentGames?.find?.(game => game.id === model.pendingMove.gameId) || null;
        if (!pendingCandidate || gameVersion(pendingCandidate) <= model.pendingMove.baseVersion) {
            nextGame = priorGame;
            preservePendingPresentation = true;
        } else {
            nextGame = pendingCandidate;
            model.pendingMove = null;
            resolvedPendingMove = true;
        }
    }

    const staleSameGame = nextGame && priorGame && nextGame.id === priorGame.id
        && gameVersion(nextGame) < previousVersion;
    if (staleSameGame) nextGame = priorGame;

    model.state = state;
    model.game = nextGame;
    renderPlayers(state.players || [], state.challenges || []);
    renderChallengeNotice(state.challenges || []);
    renderGames(state.recentGames || []);
    if (model.game) {
        if (!preservePendingPresentation) {
            renderGame(model.game, { animate: !resolvedPendingMove && !staleSameGame && options.animate !== false });
        } else {
            board.setReadOnly(true);
        }
        if (model.game.id !== previousGameId) connectRealtime(model.game.id);
        if (!resolvedPendingMove && gameVersion(model.game) > previousVersion && previousGameId === model.game.id) announceOpponentMove(model.game);
    } else if (state.ticket) renderQueue(state.ticket);
    else renderLobby();
}

function renderLobby() {
    showView('lobby');
    ui.title.textContent = 'Find a game'; ui.badge.textContent = 'READY';
    ui.status.textContent = 'Choose a time control and enter matchmaking.';
    ui.find.disabled = false; ui.find.textContent = 'Start Game';
    ui.curtain.hidden = true;
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

function renderGame(game, options = {}) {
    const completed = game.status === 'completed';
    showView(completed ? 'result' : 'game');
    model.queueStartedAt = null;
    const color = playerColor(game);
    board.setOrientation(color || 'white');
    board.setPosition(game.fen || START_FEN, { animate: options.animate !== false });
    board.setInteractive(!completed && !!color);
    board.setReadOnly(completed || game.turn !== color || !!model.pendingMove);
    ui.curtain.hidden = true;
    ui.title.textContent = completed ? 'Game complete' : `${formatTimeControl(game)} ${titleCase(game.pool)}`;
    ui.badge.textContent = completed ? 'FINAL' : game.rated ? 'RATED' : 'CASUAL';
    ui.status.textContent = completed ? 'Game over. Review the result or choose what to do next.' : 'Game in progress.';
    renderPlayerStrips(game, color);
    renderMoves(game.moves || []);
    const ours = game.turn === color;
    ui.turnCopy.textContent = completed ? 'Game over' : ours ? 'Your turn' : `${opponentName(game, color)} to move`;
    renderGameActions(game);
    if (completed) renderResult(game, color);
}

function renderGameActions(game) {
    const incomingDraw = game.draw_offer_by && game.draw_offer_by !== model.auth?.userId;
    const pending = !!model.pendingGameCommand;
    const actions = document.querySelector('.game-actions');
    actions.setAttribute('aria-busy', String(pending));
    $('offer-draw').textContent = incomingDraw ? 'Accept draw' : game.draw_offer_by ? 'Draw offered' : 'Offer draw';
    $('offer-draw').disabled = pending || (!!game.draw_offer_by && !incomingDraw);
    $('decline-draw').hidden = !incomingDraw;
    $('decline-draw').disabled = pending;
    $('resign-game').disabled = pending;
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
    strip.querySelector('.player-rating').textContent = hasNumericRating(rating) ? `${rating}${game.rated ? ' rated' : ''}` : (game.rated ? 'Rated' : 'Casual');
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
    const pendingMove = {
        gameId: game.id,
        baseVersion: gameVersion(game),
        from: intent.from,
        to: intent.to,
        promotion
    };
    model.pendingMove = pendingMove;
    board.applyMove({ from: intent.from, to: intent.to, promotion: promotion?.toUpperCase() || null }, { fen: probe.fen(), animate: false });
    board.highlightSquares([{ square: intent.from, type: 'last' }, { square: intent.to, type: 'last' }]);
    board.setReadOnly(true);
    try {
        const envelope = await api.command('game.move', {
            from: intent.from, to: intent.to, promotion, expectedVersion: game.version
        }, { gameId: game.id });
        applyState(envelope.data?.state, { animate: false });
    } catch (error) {
        if (model.pendingMove !== pendingMove) return;
        model.pendingMove = null;
        const rollbackGame = model.game?.id === game.id && gameVersion(model.game) > pendingMove.baseVersion
            ? model.game : game;
        board.setPosition(rollbackGame.fen, { animate: false });
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
    if (!model.game || model.pendingGameCommand) return;
    const pendingGame = model.game;
    model.pendingGameCommand = eventType;
    renderGameActions(pendingGame);
    try {
        const envelope = await api.command(eventType, {}, { gameId: pendingGame.id });
        applyState(envelope.data?.state);
    } catch (error) { handleError(error, messageForError(error)); }
    finally {
        if (model.pendingGameCommand !== eventType) return;
        model.pendingGameCommand = null;
        if (model.game?.id === pendingGame.id && model.game.status === 'active') renderGameActions(model.game);
    }
}

function renderResult(game, color) {
    const won = (game.result === '1-0' && color === 'white') || (game.result === '0-1' && color === 'black');
    const drawn = game.result === '1/2-1/2';
    ui.resultTitle.textContent = drawn ? 'Draw' : won ? 'Victory' : 'Defeat';
    ui.resultDetail.textContent = `${resultLabel(game.termination)} · ${game.result}`;
    const delta = color === 'white' ? game.white_rating_delta : game.black_rating_delta;
    if (game.rated && hasNumericRating(delta)) {
        const before = Number(color === 'white' ? game.white_rating_before : game.black_rating_before);
        ui.ratingChange.hidden = false;
        ui.ratingChange.textContent = `${before} ${Number(delta) >= 0 ? '+' : ''}${delta} → ${before + Number(delta)}`;
    } else ui.ratingChange.hidden = true;
    const waiting = existingOutgoingChallenge(opponentClerkId(game)) || model.rematchRequestGameIds.has(game.id);
    ui.rematch.disabled = !!waiting;
    ui.rematch.textContent = waiting ? 'Waiting for rematch' : 'Rematch';
}

function renderGames(games) {
    ui.gamesList.replaceChildren();
    if (!games.length) {
        const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = '♜';
        const title = document.createElement('strong'); title.textContent = 'No games yet';
        const copy = document.createElement('p'); copy.textContent = 'Your first online game will be saved automatically.';
        ui.gamesList.className = 'empty-state empty-state--compact'; ui.gamesList.append(icon, title, copy);
        return;
    }
    ui.gamesList.className = 'games-list';
    games.forEach(game => {
        const row = document.createElement('button'); row.className = 'game-row';
        row.innerHTML = `<strong>${escapeHtml(game.white_display_name)} <span>${escapeHtml(game.result || 'vs')}</span> ${escapeHtml(game.black_display_name)}</strong><small>${escapeHtml(formatTimeControl(game))} · ${escapeHtml(titleCase(game.pool))}</small>`;
        row.addEventListener('click', () => { model.game = game; renderGame(game); selectTab('new'); });
        ui.gamesList.append(row);
    });
}

function renderPlayers(players, challenges) {
    const challengeList = $('challenges-list'); challengeList.replaceChildren();
    activeChallenges(challenges).forEach(challenge => {
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
        } else { const pending = document.createElement('small'); pending.textContent = 'Waiting for response'; row.append(pending); }
        challengeList.append(row);
    });
    ui.playersCount.textContent = `${players.length} online`;
    const query = $('player-search').value.trim().toLocaleLowerCase();
    const visiblePlayers = query
        ? players.filter(player => String(player.displayName || '').toLocaleLowerCase().includes(query))
        : players;
    ui.playersList.replaceChildren();
    if (!visiblePlayers.length) {
        const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = '♞';
        const title = document.createElement('strong'); title.textContent = players.length ? 'No matching players' : 'No players online';
        const copy = document.createElement('p'); copy.textContent = players.length
            ? 'Try a different name or handle.'
            : 'Players will appear here while their presence is active.';
        ui.playersList.className = 'empty-state'; ui.playersList.append(icon, title, copy);
        return;
    }
    ui.playersList.className = 'players-list';
    visiblePlayers.forEach(player => {
        const row = document.createElement('div'); row.className = 'player-row';
        const playerMeta = formatPlayerMeta(player);
        row.innerHTML = `<span class="presence presence--${escapeHtml(player.status)}"></span><strong>${escapeHtml(player.displayName)}</strong><small>${escapeHtml(playerMeta)}</small>`;
        const waiting = existingOutgoingChallenge(player.clerkId) || model.challengeRequestTargets.has(player.clerkId);
        const challenge = document.createElement('button'); challenge.textContent = waiting ? 'Waiting' : 'Challenge';
        challenge.disabled = player.status === 'playing' || !!waiting;
        challenge.addEventListener('click', () => createChallenge(player.clerkId)); row.append(challenge);
        ui.playersList.append(row);
    });
}

async function createChallenge(targetClerkId) {
    if (!targetClerkId || existingOutgoingChallenge(targetClerkId) || model.challengeRequestTargets.has(targetClerkId)) {
        showToast('A challenge is already waiting for this player.');
        return;
    }
    model.challengeRequestTargets.add(targetClerkId);
    renderPlayers(model.state?.players || [], model.state?.challenges || []);
    try {
        const envelope = await api.command('challenge.create', { targetClerkId, ...selectedQueuePayload() });
        applyState(envelope.data?.state); showToast('Challenge sent.');
    } catch (error) { handleError(error, 'The challenge could not be sent.'); }
    finally {
        model.challengeRequestTargets.delete(targetClerkId);
        renderPlayers(model.state?.players || [], model.state?.challenges || []);
    }
}

function selectedQueuePayload() {
    const payload = {
        timeControlId: model.selectedControl,
        rated: model.auth?.isGuest !== true && ui.rated.checked && model.config.capabilities?.rated === true
    };
    if (model.selectedControl === 'custom') {
        payload.baseMinutes = Number($('custom-minutes').value);
        payload.incrementSeconds = Number($('custom-increment').value);
    }
    return payload;
}

async function respondChallenge(challengeId, eventType) {
    if (!challengeId || model.respondingChallengeIds.has(challengeId)) return;
    model.respondingChallengeIds.add(challengeId);
    model.inactiveChallengeIds.add(challengeId);
    renderChallengeNotice(model.state?.challenges || []);
    try {
        const envelope = await api.command(eventType, { challengeId });
        applyState(envelope.data?.state); if (envelope.data?.state?.game) selectTab('new');
    } catch (error) {
        handleError(error, 'The challenge is no longer available.');
        await syncState('challenge-response');
    } finally {
        model.respondingChallengeIds.delete(challengeId);
    }
}

function respondVisibleChallenge(eventType) {
    if (!model.challengeNoticeId) return;
    return respondChallenge(model.challengeNoticeId, eventType);
}

async function requestRematch() {
    const game = model.game;
    if (!game || game.status !== 'completed') return;
    const targetClerkId = opponentClerkId(game);
    if (!targetClerkId || existingOutgoingChallenge(targetClerkId) || model.rematchRequestGameIds.has(game.id)) {
        showToast('The rematch request is already waiting for a response.');
        return;
    }
    model.rematchRequestGameIds.add(game.id);
    model.challengeRequestTargets.add(targetClerkId);
    renderResult(game, playerColor(game));
    renderPlayers(model.state?.players || [], model.state?.challenges || []);
    try {
        const envelope = await api.command('game.rematch', {}, { gameId: game.id });
        applyState(envelope.data?.state);
        showToast('Rematch requested.');
    } catch (error) {
        handleError(error, 'The rematch request could not be sent.');
    } finally {
        model.rematchRequestGameIds.delete(game.id);
        model.challengeRequestTargets.delete(targetClerkId);
        if (model.game?.id === game.id && model.game.status === 'completed') renderResult(model.game, playerColor(model.game));
        renderPlayers(model.state?.players || [], model.state?.challenges || []);
    }
}

function renderChallengeNotice(challenges) {
    clearTimeout(model.challengeExpiryTimer);
    const active = activeChallenges(challenges);
    const previousId = model.challengeNoticeId;
    if (previousId && !active.some(challenge => challenge.id === previousId)) {
        model.inactiveChallengeIds.add(previousId);
    }
    const invitation = active.find(challenge => challenge.id === previousId)
        || active.find(challenge => challenge.direction === 'incoming')
        || active.find(challenge => challenge.direction === 'outgoing')
        || null;
    if (!invitation) {
        model.challengeNoticeId = null;
        ui.challengeNotice.hidden = true;
        return;
    }
    model.challengeNoticeId = invitation.id;
    ui.challengeNotice.dataset.challengeId = invitation.id;
    const incoming = invitation.direction === 'incoming';
    ui.challengeKicker.textContent = incoming ? 'GAME INVITATION' : 'INVITATION SENT';
    ui.challengeTitle.textContent = incoming
        ? `${invitation.otherDisplayName || 'Opponent'} challenges you`
        : `Waiting for ${invitation.otherDisplayName || 'opponent'}`;
    ui.challengeControl.textContent = `${challengeTimeControl(invitation)} · ${titleCase(invitation.pool)}${invitation.rated ? ' · Rated' : ' · Casual'}`;
    ui.challengeActions.hidden = !incoming;
    ui.challengeAccept.disabled = model.respondingChallengeIds.has(invitation.id);
    ui.challengeDecline.disabled = model.respondingChallengeIds.has(invitation.id);
    ui.challengeNotice.hidden = false;
    const expiresAt = Date.parse(invitation.expiresAt || '');
    if (Number.isFinite(expiresAt)) {
        model.challengeExpiryTimer = setTimeout(() => {
            model.inactiveChallengeIds.add(invitation.id);
            renderChallengeNotice(model.state?.challenges || []);
            renderPlayers(model.state?.players || [], model.state?.challenges || []);
        }, Math.max(0, expiresAt - Date.now()) + 25);
    }
}

function activeChallenges(challenges) {
    const now = Date.now();
    return challenges.filter(challenge => challenge?.id
        && challenge.state === 'pending'
        && !model.inactiveChallengeIds.has(challenge.id)
        && !model.respondingChallengeIds.has(challenge.id)
        && (!challenge.expiresAt || Date.parse(challenge.expiresAt) > now));
}

function existingOutgoingChallenge(targetClerkId) {
    if (!targetClerkId) return null;
    return activeChallenges(model.state?.challenges || [])
        .find(challenge => challenge.direction === 'outgoing' && challenge.otherClerkId === targetClerkId) || null;
}

function challengeTimeControl(challenge) {
    return `${Math.floor(Number(challenge.baseMs || 0) / 60000)}+${Math.floor(Number(challenge.incrementMs || 0) / 1000)}`;
}

async function connectRealtime(gameId) {
    const userId = model.auth?.isSignedIn ? model.auth.userId : null;
    if (!userId) return disconnectRealtime();
    const target = `${userId}:${gameId}`;
    if (model.realtimeTarget === target) return;

    const epoch = ++model.realtimeEpoch;
    const previous = model.realtime;
    model.realtime = null;
    model.realtimeGameId = gameId;
    model.realtimeUserId = userId;
    model.realtimeTarget = target;
    await previous?.close?.();
    if (epoch !== model.realtimeEpoch || model.disposed) return;

    const realtime = await createOnlineRealtime(model.config.realtime, {
        gameId,
        getToken: onlineAccessToken,
        isCurrent: () => !model.disposed
            && epoch === model.realtimeEpoch
            && model.auth?.isSignedIn
            && model.auth.userId === userId
            && model.realtimeTarget === target,
        onChange: () => syncState('realtime'),
        onStatus: status => {
            if (status === 'SUBSCRIBED') setConnection('online', 'Live');
            else if (status === 'FALLBACK') setConnection('online', 'Connected');
        }
    });
    if (epoch !== model.realtimeEpoch || model.disposed || model.auth?.userId !== userId) {
        await realtime?.close?.();
        return;
    }
    model.realtime = realtime;
    if (!realtime) {
        model.realtimeGameId = null;
        model.realtimeUserId = null;
        model.realtimeTarget = null;
    }
}

async function disconnectRealtime() {
    model.realtimeEpoch += 1;
    const realtime = model.realtime;
    model.realtime = null;
    model.realtimeGameId = null;
    model.realtimeUserId = null;
    model.realtimeTarget = null;
    await realtime?.close?.();
}

function startPolling() {
    stopPolling();
    schedulePoll(model.pollEpoch);
    model.presencePolling = setInterval(() => {
        if (!document.hidden && model.auth?.isSignedIn) void api.command('presence.join').catch(() => {});
    }, 25_000);
}

function schedulePoll(epoch) {
    if (model.disposed || !model.auth?.isSignedIn || epoch !== model.pollEpoch) return;
    const delay = model.game?.status === 'active' ? 1200 : 2500;
    model.polling = setTimeout(async () => {
        if (!document.hidden) await syncState('poll');
        schedulePoll(epoch);
    }, delay);
}

function stopPolling() {
    model.pollEpoch += 1;
    clearTimeout(model.polling);
    clearInterval(model.presencePolling);
    model.polling = null;
    model.presencePolling = null;
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
    clearTimeout(model.challengeExpiryTimer);
    model.state = null;
    model.game = null;
    model.pendingMove = null;
    model.signInRedirecting = false;
    model.challengeNoticeId = null;
    ui.challengeNotice.hidden = true;
    showView('lobby');
    ui.title.textContent = 'Find a game'; ui.badge.textContent = 'READY';
    setConnection('offline', 'Sign in required');
    ui.find.disabled = false; ui.find.textContent = 'Start Game';
    ui.account.textContent = 'Sign in';
    ui.status.textContent = 'Choose a time control. Sign in when you are ready to play.';
    ui.curtain.hidden = true;
    board.setPosition(START_FEN, { animate: false }); board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips();
    updateSignInHref();
    configureCapabilities(model.config?.capabilities || {});
}

function showSignInDialog(opener) {
    if (model.auth?.isSignedIn || model.signInRedirecting) return;
    model.signInPromptOpener = opener instanceof HTMLElement ? opener : document.activeElement;
    if (ui.signInDialog.open) return;
    ui.signInDialog.returnValue = '';
    ui.signInDialog.showModal();
}

function handleSignInDialogClose() {
    const opener = model.signInPromptOpener;
    model.signInPromptOpener = null;
    if (ui.signInDialog.returnValue === 'signin') {
        if (model.signInRedirecting) return;
        model.signInRedirecting = true;
        location.assign(signInUrl());
        return;
    }
    queueMicrotask(() => opener?.isConnected && opener.focus());
}

function selectedOnlineReturnPath() {
    const params = new URLSearchParams({ control: model.selectedControl });
    if (model.selectedControl === 'custom') {
        params.set('minutes', boundedInputValue($('custom-minutes')));
        params.set('increment', boundedInputValue($('custom-increment')));
    }
    return `/online?${params}`;
}

function boundedInputValue(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    return String(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)));
}

function signInUrl() { return `/signin?redirect_url=${encodeURIComponent(selectedOnlineReturnPath())}`; }
function signUpUrl() { return `/signup?redirect_url=${encodeURIComponent(selectedOnlineReturnPath())}`; }
function updateSignInHref() {
    const signedOutOrGuest = !model.auth?.isSignedIn || model.auth?.isGuest;
    if (signedOutOrGuest) ui.account.href = signInUrl();
    ui.login.href = signInUrl();
    ui.signup.href = signUpUrl();
}

async function onlineAccessToken() {
    if (model.auth?.isGuest) return model.guestSession?.getToken?.() || null;
    return window.CAISSA_AUTH?.getToken?.() || null;
}

function setConnection(state, label) { ui.connection.dataset.connection = state; ui.connectionLabel.textContent = label; }
function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }
function formatTimeControl(item) { return `${Math.floor(Number(item.base_ms || 0) / 60000)}+${Math.floor(Number(item.increment_ms || 0) / 1000)}`; }
function formatElapsed(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function titleCase(value) { const text = String(value || ''); return text ? text[0].toUpperCase() + text.slice(1) : ''; }
function initials(value) { return String(value || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function playerColor(game) { return model.auth?.userId === game.white_clerk_id ? 'white' : model.auth?.userId === game.black_clerk_id ? 'black' : null; }
function opponentName(game, color) { return color === 'white' ? game.black_display_name : game.white_display_name; }
function opponentClerkId(game) {
    const color = playerColor(game);
    return color === 'white' ? game.black_clerk_id : color === 'black' ? game.white_clerk_id : null;
}
function gameVersion(game) { const version = Number(game?.version); return Number.isSafeInteger(version) && version >= 0 ? version : 0; }
function hasNumericRating(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
function formatPlayerMeta(player) {
    if (isGuestSubject(player.clerkId)) return `Guest · ${titleCase(player.pool) || 'Casual'}`;
    const rating = hasNumericRating(player.rating) ? String(player.rating) : 'Casual';
    const pool = titleCase(player.pool);
    return [rating, pool].filter(Boolean).join(' · ');
}
function isGuestSubject(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function resultLabel(value) { return ({ checkmate: 'Checkmate', stalemate: 'Stalemate', repetition: 'Threefold repetition', 'insufficient-material': 'Insufficient material', draw: 'Draw', resignation: 'Resignation', agreement: 'Draw agreed', timeout: 'Time expired' })[value] || 'Game complete'; }
function announceOpponentMove(game) {
    const move = game.moves?.at(-1);
    if (move && move.color !== playerColor(game)) ui.status.textContent = `${opponentName(game, playerColor(game))} moved ${move.san}.`;
}
function resetPlayerStrips() { fillEmpty(ui.top, 'Waiting for opponent'); fillEmpty(ui.bottom, model.auth?.fullName || 'You'); ui.topClock.textContent = '—'; ui.bottomClock.textContent = '—'; }
function fillEmpty(strip, name) { strip.querySelector('.player-name').textContent = name; strip.querySelector('.player-rating').textContent = '—'; strip.querySelector('.player-avatar').textContent = initials(name); strip.dataset.running = 'false'; }
function showBoardError(intent, message) { board.highlightSquares([{ square: intent.from, type: 'error' }, { square: intent.to, type: 'error' }]); showToast(message); setTimeout(() => board.clearHighlights(), 900); }
function messageForError(error) { return ({ AUTH_REQUIRED: 'Sign in to continue.', STALE_VERSION: 'The board changed; it has been synchronized.', ILLEGAL_MOVE: 'That move is not legal.', NOT_YOUR_TURN: 'Wait for your turn.', RATE_LIMITED: 'Too many requests. Please wait a moment.', DRAW_OFFER_REQUIRED: 'There is no draw offer to accept.' })[error?.code] || 'The server could not confirm that action.'; }
function handleError(error, fallback) { console.warn('CAISSA Online:', error?.code || error?.message); showToast(error instanceof OnlineApiError ? messageForError(error) : fallback); }
function showToast(message) { clearTimeout(model.toastTimer); ui.toast.textContent = message; ui.toast.hidden = false; model.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4200); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function dispose() {
    model.disposed = true;
    clearTimeout(model.challengeExpiryTimer);
    stateSyncQueue.close();
    window.removeEventListener('caissa-auth-change', onAuthEvent);
    stopPolling();
    await disconnectRealtime();
    model.guestSession?.close?.();
    board.destroy();
}
