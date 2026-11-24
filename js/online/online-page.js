import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { createOnlineApi, OnlineApiError } from './online-api.js';
import { formatClock, projectOnlineClock } from './online-clock.js';
import { createOnlineGuestSession } from './online-guest-session.js';
import { createOnlineLobbyPreferenceStore } from './online-lobby-preferences.js';
import {
    createOnlineRealtime,
    createOnlineResyncQueue,
    createOnlineTournamentRealtime
} from './online-realtime.js';
import {
    classifyTournamentDirectoryRows,
    compareTournamentStarts,
    dedupeTournamentDirectoryRows,
    localCalendarDayKey
} from './tournament-directory.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PAGE_PARAMS = new URLSearchParams(location.search);
const TOURNAMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUESTED_TOURNAMENT_ID = PAGE_PARAMS.get('tournament');
const TOURNAMENT_DEMO = location.pathname === '/online/tournament-demo' || PAGE_PARAMS.get('demo') === 'tournament';
const LOCAL_LOBBY_FIXTURES = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && PAGE_PARAMS.get('fixtures') === 'lobby';
const $ = id => document.getElementById(id);
const ui = {
    connection: document.querySelector('.connection-pill'), connectionLabel: $('connection-label'),
    account: $('account-link'), status: $('room-status'), title: $('workspace-title'), badge: $('game-badge'),
    curtain: $('board-curtain'), curtainTitle: $('curtain-title'), curtainCopy: $('curtain-copy'),
    top: $('player-top'), bottom: $('player-bottom'), topClock: $('clock-top'), bottomClock: $('clock-bottom'),
    lobby: $('lobby-view'), queue: $('queue-view'), game: $('game-view'), result: $('result-view'),
    find: $('find-game'), cancel: $('cancel-search'), rated: $('rated-toggle'), ratedHelp: $('rated-help'),
    ratedControl: $('rated-control'), gameModeLabel: $('game-mode-label'),
    guest: $('play-as-guest'), guestNote: $('guest-note'), lobbyAccess: $('lobby-access'),
    login: $('online-login'), signup: $('online-signup'),
    queueControl: $('queue-control'), queueElapsed: $('queue-elapsed'), turnCopy: $('turn-copy'),
    moveList: $('move-list'), resultTitle: $('result-title'), resultDetail: $('result-detail'),
    ratingChange: $('rating-change'), gamesList: $('games-list'), playersList: $('players-list'), playersCount: $('players-count'),
    playersFixtureBadge: $('players-fixture-badge'),
    toast: $('online-toast'), rematch: $('rematch-game'), returnToGame: $('return-to-game'),
    footContext: $('workspace-foot-context'),
    challengeNotice: $('challenge-notice'), challengeKicker: $('challenge-notice-kicker'),
    challengeTitle: $('challenge-notice-title'), challengeControl: $('challenge-notice-control'),
    challengeActions: $('challenge-notice-actions'), challengeAccept: $('challenge-notice-accept'),
    challengeDecline: $('challenge-notice-decline'), signInDialog: $('signin-dialog'),
    setupOpen: $('setup-open'), setupDialog: $('setup-dialog'), muteInvitationPopups: $('mute-invitation-popups'),
    offersState: $('offers-state'), offersStatus: $('offers-status'), offersTableWrap: $('offers-table-wrap'),
    offersTableBody: $('offers-table-body'), offersFixtureBanner: $('offers-fixture-banner'),
    accessDenied: $('online-access-denied'),
    arenaDirectory: $('arena-directory'), arenaDetail: $('arena-detail'),
    arenaCurrentList: $('arena-current-list'), arenaScheduleList: $('arena-schedule-list'), arenaMyList: $('arena-my-list'),
    arenaSearch: $('arena-search'), arenaStatusFilter: $('arena-status-filter'),
    arenaControlFilter: $('arena-control-filter'), arenaRatingFilter: null, arenaIdentityFilter: null,
    arenaJoin: $('arena-join'), arenaWithdraw: $('arena-withdraw'), arenaTab: $('tab-tournaments'),
    arenaViewResults: $('arena-view-results'), arenaContext: $('arena-context'), arenaContextEmpty: $('tournament-context-empty'),
    directoryDialog: $('tournament-directory-dialog'), directoryClose: $('tournament-directory-close'),
    directoryMessage: $('arena-directory-message'), directoryRetry: $('arena-directory-retry'),
    createForm: $('arena-create-form'), createFeedback: $('arena-create-feedback'),
    arenaStandingsBody: $('arena-standings-body'), arenaGamesList: $('arena-games-list'),
    arenaPairingState: $('arena-pairing-state')
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
    guestSession: null, guestStarting: false, pendingGameCommand: null,
    selectedTab: 'new', selectedLobbyView: 'players', muteInvitationPopups: false, preferenceEpoch: 0,
    setupOpener: null, arena: null, daily: null, recurring: null, selectedTournamentId: null, directoryOpener: null,
    tournamentRealtime: null, tournamentRealtimeId: null, tournamentRealtimeEpoch: 0,
    selectedArenaContext: 'standings', selectedDirectoryView: 'current', arenaBusy: false,
    tournamentIntent: location.pathname === '/online/tournaments' && PAGE_PARAMS.get('directory') === '1',
    tournamentCreateIntent: location.pathname === '/online/tournaments' && PAGE_PARAMS.get('create') === '1',
    deepLinkTournamentId: TOURNAMENT_UUID.test(String(REQUESTED_TOURNAMENT_ID || ''))
        ? REQUESTED_TOURNAMENT_ID : null,
    invalidTournamentLink: REQUESTED_TOURNAMENT_ID !== null
        && !TOURNAMENT_UUID.test(String(REQUESTED_TOURNAMENT_ID || '')),
    accessDeniedCode: null,
    tournamentCreateMode: null, communityTournamentCreator: false,
    tournamentOrganizer: false, recurringTournamentCreator: false,
    editingRecurringSeriesId: null,
    directoryDayKey: null, directoryTimeZone: null,
    directoryDateTimer: null, directoryDateMonitor: null,
    tournamentCreateDrafts: createDefaultTournamentDrafts()
};
const api = createOnlineApi({
    tokenProvider: onlineAccessToken
});
const lobbyPreferences = createOnlineLobbyPreferenceStore();

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
    if (!document.hidden) {
        refreshDirectoryDateClassification();
        if (model.auth?.isSignedIn) void resumeFromBackground();
    }
});
bindControls();
initializeDirectoryDateRefresh();
restoreSelectedControlFromLocation();
selectTab('new');
selectGamesView('daily');
selectLobbyView('players');
selectArenaContext('standings');
selectDirectoryView('current');
configureTournamentCreateType();
renderOffersDirectory();
setInterval(() => { renderClocks(); renderArenaCountdowns(); }, 100);
if (TOURNAMENT_DEMO) renderTournamentDemo();
else {
    if (location.pathname === '/online/tournaments') selectTab('tournaments');
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
        if (memberAuth?.isSignedIn) {
            await activateIdentity(memberAuth, 'boot');
            return;
        }
        const guestAuth = await model.guestSession?.restore?.();
        if (guestAuth?.isSignedIn) {
            await activateIdentity(guestAuth, 'guest-restore');
            return;
        }
        model.auth = memberAuth;
        await loadLobbyPreferences(memberAuth);
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

    const arenaEnabled = capabilities.arenaS001 === true;
    ui.arenaDirectory.hidden = !arenaEnabled;
    const dailyEnabled = capabilities.dailyTournaments === true;
    $('games-daily-status').textContent = dailyEnabled ? 'Available' : 'Disabled';
    $('games-daily-unavailable').hidden = dailyEnabled;
    $('games-daily-list').hidden = !dailyEnabled;
    const dailyOption = $('arena-create-type').querySelector('option[value="daily"]');
    dailyOption.disabled = !dailyEnabled;
    const ratedOption = $('arena-create-rating').querySelector('option[value="rated"]');
    ratedOption.disabled = capabilities.tournamentRated !== true;
    if (ratedOption.disabled) $('arena-create-rating').value = 'unrated';
    $('arena-create-capacity').max = capabilities.arena100 === true ? '100' : '64';
    syncTournamentCreationAccess();
    configureTournamentCreateType();
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
        await disconnectTournamentRealtime();
        await loadLobbyPreferences(nextAuth);
        renderSignedOut();
        return;
    }

    if (previousUserId !== nextUserId) {
        stopPolling();
        await disconnectRealtime();
        await disconnectTournamentRealtime();
        try {
            await activateIdentity(nextAuth, 'auth-change');
        } catch (error) {
            handleError(error, 'The playing room could not be reached.');
        }
        return;
    }

    await model.realtime?.refreshAuth?.();
    await model.tournamentRealtime?.refreshAuth?.();
}

async function activateIdentity(auth, reason) {
    model.auth = auth;
    clearAccessDenied();
    await loadLobbyPreferences(auth);
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
    await model.tournamentRealtime?.refreshAuth?.();
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
    document.querySelectorAll('[data-lobby-tab]').forEach(tab => {
        tab.addEventListener('click', () => selectLobbyView(tab.dataset.lobbyTab));
        tab.addEventListener('keydown', event => handleRovingTabs(event, '[data-lobby-tab]', 'lobbyTab', selectLobbyView));
    });
    [$('custom-minutes'), $('custom-increment')].forEach(input => input.addEventListener('input', updateSignInHref));
    ui.find.addEventListener('click', findGame);
    ui.guest.addEventListener('click', playAsGuest);
    ui.cancel.addEventListener('click', cancelSearch);
    $('new-opponent').addEventListener('click', () => {
        model.game = null;
        if (model.arena?.current?.myState && model.arena.current.myState !== 'withdrawn') {
            selectTab('tournaments');
            renderArenaContext(model.arena.current);
        } else renderLobby();
    });
    ui.rematch.addEventListener('click', requestRematch);
    $('play-friend').addEventListener('click', event => {
        if (!model.auth?.isSignedIn) return showSignInDialog(event.currentTarget);
        selectLobbyView('players');
        selectTab('lobby');
    });
    $('browse-tournaments').addEventListener('click', event => openTournamentDirectory('current', event.currentTarget));
    $('tournament-empty-browse').addEventListener('click', event => openTournamentDirectory('current', event.currentTarget));
    $('tournament-empty-create').addEventListener('click', event => openTournamentDirectory('create', event.currentTarget));
    $('tournament-directory-create').addEventListener('click', event => requestTournamentCreation(event.currentTarget));
    $('arena-context-directory').addEventListener('click', event => openTournamentDirectory('current', event.currentTarget));
    $('resign-game').addEventListener('click', () => confirmAction('Resign this game?', 'This result is final and will be recorded.', 'Resign')
        .then(confirmed => confirmed && sendGameCommand('game.resign')));
    $('offer-draw').addEventListener('click', handleDrawAction);
    $('decline-draw').addEventListener('click', () => sendGameCommand('game.drawDecline'));
    $('download-pgn').addEventListener('click', downloadPgn);
    $('analyze-game').addEventListener('click', analyzeGame);
    document.querySelectorAll('[data-directory-tab]').forEach(tab => {
        tab.addEventListener('click', () => selectDirectoryView(tab.dataset.directoryTab));
        tab.addEventListener('keydown', event => handleRovingTabs(event, '[data-directory-tab]', 'directoryTab', selectDirectoryView));
    });
    document.querySelectorAll('[data-arena-context]').forEach(tab => {
        tab.addEventListener('click', () => selectArenaContext(tab.dataset.arenaContext));
        tab.addEventListener('keydown', event => handleRovingTabs(event, '[data-arena-context]', 'arenaContext', selectArenaContext));
    });
    ui.arenaSearch.addEventListener('input', renderArenaDirectory);
    ui.arenaStatusFilter.addEventListener('change', renderArenaDirectory);
    ui.arenaControlFilter.addEventListener('change', renderArenaDirectory);
    ui.arenaJoin.addEventListener('click', () => changeArenaMembership(ui.arenaJoin.dataset.eventType || 'tournament.join'));
    ui.arenaWithdraw.addEventListener('click', () => changeArenaMembership(ui.arenaWithdraw.dataset.eventType || 'tournament.withdraw'));
    $('arena-context-withdraw').addEventListener('click', () => changeArenaMembership('tournament.withdraw'));
    ui.arenaViewResults.addEventListener('click', viewSelectedTournament);
    ui.directoryClose.addEventListener('click', closeTournamentDirectory);
    ui.directoryDialog.addEventListener('close', restoreTournamentDirectoryFocus);
    ui.directoryRetry.addEventListener('click', () => void syncState('tournament-directory-retry'));
    $('arena-create-start-mode').addEventListener('change', event => {
        if (!$('arena-create-repeat')?.checked) $('arena-create-start-wrap').hidden = event.target.value !== 'scheduled';
    });
    $('arena-create-type').addEventListener('change', configureTournamentCreateType);
    ui.createForm.addEventListener('change', event => {
        if (event.target.id === 'daily-create-days') updateTournamentCreateRules();
        if (event.target.id === 'arena-create-repeat'
            || event.target.id === 'recurrence-frequency'
            || event.target.id === 'recurrence-end-mode'
            || event.target.closest?.('#arena-create-recurrence')) {
            configureRecurrenceControls();
        }
    });
    ui.createForm.addEventListener('submit', createArenaTournament);
    $('arena-cancel').addEventListener('click', () => manageArenaTournament('cancel'));
    $('arena-close').addEventListener('click', () => manageArenaTournament('close'));
    $('player-search').addEventListener('input', () => renderPlayers(model.state?.players || [], model.state?.challenges || []));
    ui.challengeAccept.addEventListener('click', () => respondVisibleChallenge('challenge.accept'));
    ui.challengeDecline.addEventListener('click', () => respondVisibleChallenge('challenge.decline'));
    ui.signInDialog.addEventListener('close', handleSignInDialogClose);
    ui.returnToGame.addEventListener('click', () => selectTab('new'));
    ui.setupOpen.addEventListener('click', event => openSetup(event.currentTarget));
    ui.setupDialog.addEventListener('close', closeSetup);
    ui.muteInvitationPopups.addEventListener('change', () => void updateInvitationPreference());
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
    model.selectedTab = name;
    document.querySelectorAll('[data-tab]').forEach(tab => {
        const selected = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    ui.footContext.textContent = ({
        new: 'Private, server-verified games',
        games: 'Your game history',
        lobby: model.selectedLobbyView === 'players' ? 'Private challenges' : 'CAISSA Online lobby',
        tournaments: 'Private Arena · server-authoritative'
    })[name] || 'CAISSA Online';
    renderWorkspaceHeader();
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

function selectLobbyView(name) {
    model.selectedLobbyView = name;
    document.querySelectorAll('[data-lobby-tab]').forEach(tab => {
        const selected = tab.dataset.lobbyTab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-lobby-panel]').forEach(panel => {
        panel.hidden = panel.dataset.lobbyPanel !== name;
    });
    if (document.querySelector('[data-tab="lobby"]')?.getAttribute('aria-selected') === 'true') {
        ui.footContext.textContent = name === 'players' ? 'Private challenges' : 'CAISSA Online lobby';
    }
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
    selectTab('tournaments');
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
}

function renderArena(arena) {
    const enabled = model.config?.capabilities?.arenaS001 === true;
    ui.arenaDirectory.hidden = !enabled;
    if (!enabled || !arena) { void disconnectTournamentRealtime(); return; }
    renderArenaDirectory();
    const current = arena.current;
    const hasContext = !!current;
    ui.arenaContext.hidden = !hasContext;
    ui.arenaContextEmpty.hidden = hasContext;
    if (hasContext) {
        renderArenaContext(current);
        if (!['completed', 'cancelled'].includes(current.status)) void connectTournamentRealtime(current.id);
        else void disconnectTournamentRealtime();
    } else {
        void disconnectTournamentRealtime();
    }
    if (model.selectedTournamentId && current?.id === model.selectedTournamentId) renderArenaDetail(current);
    if (model.tournamentIntent && model.auth?.isSignedIn && !model.auth?.isGuest) {
        const requestedView = model.tournamentCreateIntent ? 'create' : 'current';
        model.tournamentIntent = false;
        model.tournamentCreateIntent = false;
        queueMicrotask(async () => {
            openTournamentDirectory(requestedView, ui.arenaTab);
            if (model.invalidTournamentLink) {
                showDirectoryMessage('Invalid tournament link', 'The tournament ID in this link is not valid.', true);
                return;
            }
            if (!model.deepLinkTournamentId) return;
            const live = (model.arena?.tournaments || []).find(item => item.id === model.deepLinkTournamentId);
            const daily = (model.daily?.tournaments || []).find(item => item.id === model.deepLinkTournamentId);
            if (!live && !daily) {
                showDirectoryMessage('Tournament unavailable', 'This event does not exist or is not visible to your account.', true);
                return;
            }
            await openArenaDetails(model.deepLinkTournamentId, {
                focusAction: true,
                playCategory: daily ? 'daily' : 'live'
            });
        });
    }
}

function renderArenaDirectory() {
    if (!model.arena || ui.arenaDirectory.hidden) return;
    const query = ui.arenaSearch.value.trim().toLocaleLowerCase();
    const statusFilter = ui.arenaStatusFilter.value;
    const controlFilter = ui.arenaControlFilter.value;
    const ratingFilter = ui.arenaRatingFilter?.value || 'all';
    const identityFilter = ui.arenaIdentityFilter?.value || 'all';
    const recurringSeries = recurringDirectorySeries();
    const seriesIndex = createRecurringSeriesIndex(recurringSeries);
    const liveRows = (model.arena.tournaments || []).map(tournament => decorateTournamentSeries({
        ...tournament,
        playCategory: 'live'
    }, seriesIndex));
    const dailyRows = (model.daily?.tournaments || []).map(tournament => ({
        ...tournament,
        playCategory: 'daily',
        format: 'round-robin',
        pool: 'daily',
        joined: !!tournament.myState && tournament.myState !== 'withdrawn',
        lateJoin: false
    })).map(tournament => decorateTournamentSeries(tournament, seriesIndex));
    const plannedRows = recurringSeries.flatMap(series => (series.upcoming || [])
        .map(occurrence => ({
            id: occurrence.occurrenceKey,
            occurrenceKey: occurrence.occurrenceKey,
            tournamentId: occurrence.tournamentId || null,
            name: occurrence.name || series.title,
            status: occurrence.state || 'planned',
            startsAt: occurrence.startsAt,
            playCategory: 'live',
            pool: series.template?.pool,
            baseMs: series.template?.baseMs,
            incrementMs: series.template?.incrementMs,
            durationMinutes: series.template?.durationMinutes,
            capacity: series.template?.capacity,
            participantCount: 0,
            planned: true,
            seriesId: series.id,
            seriesKind: series.seriesKind,
            seriesSlug: series.slug || null,
            seriesTitle: series.title || null,
            source: occurrence.source || series.source
        })));
    const tournaments = dedupeTournamentDirectoryRows([...liveRows, ...dailyRows], plannedRows).filter(tournament => {
        const category = arenaStatusCategory(tournament.status);
        const identity = tournamentIdentity(tournament.source)?.kind;
        return (!query || String(tournament.name || '').toLocaleLowerCase().includes(query))
            && (statusFilter === 'all' || statusFilter === category)
            && (controlFilter === 'all' || tournament.pool === controlFilter
                || tournament.playCategory === controlFilter)
            && (ratingFilter === 'all' || (ratingFilter === 'rated') === (tournament.rated === true))
            && (identityFilter === 'all' || identityFilter === identity);
    }).sort(compareTournamentStarts);
    const { current, schedule, mine } = classifyTournamentDirectoryRows(tournaments);
    renderArenaList(ui.arenaCurrentList, current, 'No tournaments today', 'Today\'s scheduled and live tournaments will appear here.');
    renderArenaSchedule(ui.arenaScheduleList, schedule);
    renderArenaList(ui.arenaMyList, mine, 'No tournaments yet', 'Join or create an Arena to keep it here.');
    $('directory-count-current').textContent = String(current.length);
    $('directory-count-schedule').textContent = String(schedule.length);
    $('directory-count-mine').textContent = String(mine.length);
}

function renderArenaList(list, tournaments, title, copy) {
    list.replaceChildren();
    if (!tournaments.length) {
        appendArenaEmpty(list, title, copy);
        return;
    }
    renderArenaCards(list, tournaments);
}

function renderArenaSchedule(list, tournaments) {
    list.replaceChildren();
    if (!tournaments.length) {
        appendArenaEmpty(list, 'No scheduled tournaments', 'Upcoming events and recurrence plans will appear here in your local time.');
        return;
    }
    renderArenaCards(list, tournaments, { groupByDate: true });
}

function appendArenaEmpty(list, title, copy) {
    const empty = document.createElement('div');
    empty.className = 'arena-empty';
    const heading = document.createElement('strong'); heading.textContent = title;
    const detail = document.createElement('p'); detail.textContent = copy;
    empty.append(heading, detail);
    list.append(empty);
}

function renderArenaCards(list, tournaments, options = {}) {
    let lastDate = null;
    tournaments.forEach(tournament => {
        if (options.groupByDate) {
            const starts = new Date(tournament.startsAt);
            const dateKey = localCalendarDayKey(starts) || 'unknown';
            if (dateKey !== lastDate) {
                const dateHeading = document.createElement('h5');
                dateHeading.className = 'arena-date-group';
                dateHeading.textContent = Number.isNaN(starts.valueOf()) ? 'Date unavailable'
                    : starts.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                list.append(dateHeading);
                lastDate = dateKey;
            }
        }
        const card = document.createElement('article');
        const identity = tournamentIdentity(tournament.source);
        card.className = `arena-card${identity ? ` arena-card--${identity.kind}` : ''}`;
        const main = document.createElement('div');
        const identityBadge = createTournamentIdentityBadge(tournament.source);
        const status = document.createElement('span');
        status.className = `arena-status arena-status--${arenaStatusCategory(tournament.status)}`;
        status.textContent = arenaStatusLabel(tournament.status);
        const name = document.createElement('h4'); name.textContent = tournament.name;
        const seriesDescription = tournamentSeriesDescription(tournament);
        const series = document.createElement('p');
        series.className = 'arena-card__series';
        series.textContent = seriesDescription || '';
        series.hidden = !seriesDescription;
        const facts = document.createElement('p');
        const starts = new Date(tournament.startsAt);
        const localStart = Number.isNaN(starts.valueOf()) ? '' : ` · ${starts.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
        const duration = tournament.playCategory === 'daily'
            ? `Groups of ${tournament.groupSize || 4}` : `${tournament.durationMinutes} min`;
        facts.textContent = tournament.planned
            ? `${arenaControl(tournament)} · ${duration} · Tournament record not created yet${localStart}`
            : `${arenaControl(tournament)} · ${duration} · ${tournament.participantCount}/${tournament.capacity || '∞'} players${localStart}`;
        if (identityBadge) main.append(identityBadge);
        main.append(status, name, series, facts);
        const actions = document.createElement('div'); actions.className = 'arena-card__actions';
        if (tournament.planned) {
            const marker = document.createElement('button'); marker.type = 'button'; marker.disabled = true;
            marker.textContent = tournament.status === 'skipped' ? 'Skipped' : 'Planned';
            actions.append(marker);
            card.append(main, actions);
            list.append(card);
            return;
        }
        const completed = ['completed', 'cancelled'].includes(tournament.status);
        const joined = tournament.joined || (!!tournament.myState && tournament.myState !== 'withdrawn');
        const full = Number(tournament.participantCount) >= Number(tournament.capacity || Number.POSITIVE_INFINITY);
        const registrationOpen = ['registration_open', 'active'].includes(tournament.status)
            && Date.parse(tournament.registrationClosesAt || tournament.endsAt) > Date.now();
        if (!completed) {
            const join = document.createElement('button'); join.type = 'button';
            join.className = joined ? 'arena-card__registered' : 'arena-card__join';
            join.textContent = joined ? 'Registered' : full ? 'Full' : registrationOpen ? 'Join' : 'Not open';
            join.disabled = joined || full || !registrationOpen || model.arenaBusy;
            if (!join.disabled) join.addEventListener('click', () => joinTournamentFromCard(tournament, join));
            actions.append(join);
        }
        const details = document.createElement('button'); details.type = 'button';
        details.textContent = completed ? 'View Results' : 'Details';
        details.addEventListener('click', () => openArenaDetails(tournament.id, {
            focusAction: true,
            playCategory: tournament.playCategory
        }));
        const share = document.createElement('button'); share.type = 'button';
        share.className = 'arena-card__share';
        share.setAttribute('aria-label', `Share ${tournament.name}`);
        share.title = 'Share tournament';
        share.textContent = 'Share';
        share.addEventListener('click', () => openTournamentShare(tournament));
        actions.append(share, details);
        card.append(main, actions);
        list.append(card);
    });
}

function recurringDirectorySeries() {
    const directory = model.recurring?.directory || [];
    const series = model.recurring?.series || [];
    const seen = new Set();
    return [...directory, ...series].filter(item => {
        const key = String(item?.id || item?.slug || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function createRecurringSeriesIndex(seriesRows) {
    const byId = new Map();
    const bySlug = new Map();
    for (const series of seriesRows) {
        if (series?.id) byId.set(String(series.id), series);
        if (series?.slug) bySlug.set(String(series.slug), series);
    }
    return { byId, bySlug };
}

function decorateTournamentSeries(tournament, index = createRecurringSeriesIndex(recurringDirectorySeries())) {
    if (!tournament || typeof tournament !== 'object') return tournament;
    const series = index.byId.get(String(tournament.seriesId || ''))
        || index.bySlug.get(String(tournament.seriesSlug || ''));
    if (!series) return tournament.seriesSlug === 'saturdays-of-chess-s001'
        ? { ...tournament, seriesTitle: 'Saturdays of Chess' }
        : tournament;
    return {
        ...tournament,
        seriesId: tournament.seriesId || series.id || null,
        seriesSlug: tournament.seriesSlug || series.slug || null,
        seriesTitle: series.title || tournament.seriesTitle || null
    };
}

function tournamentSeriesDescription(tournament) {
    if (tournament?.source !== 'official') return null;
    if (tournament.seriesTitle) return `Official series · ${tournament.seriesTitle}`;
    if (tournament.seriesId || tournament.seriesSlug) return 'Official series';
    return null;
}

function viewerTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    } catch {
        return 'local';
    }
}

function initializeDirectoryDateRefresh() {
    model.directoryDayKey = localCalendarDayKey();
    model.directoryTimeZone = viewerTimeZone();
    scheduleNextDirectoryMidnight();
    model.directoryDateMonitor = setInterval(refreshDirectoryDateClassification, 60_000);
}

function refreshDirectoryDateClassification(force = false) {
    if (model.disposed) return;
    const dayKey = localCalendarDayKey();
    const timeZone = viewerTimeZone();
    const changed = force || dayKey !== model.directoryDayKey || timeZone !== model.directoryTimeZone;
    model.directoryDayKey = dayKey;
    model.directoryTimeZone = timeZone;
    if (changed) {
        scheduleNextDirectoryMidnight();
        renderArenaDirectory();
    }
}

function scheduleNextDirectoryMidnight() {
    clearTimeout(model.directoryDateTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
    model.directoryDateTimer = setTimeout(() => {
        model.directoryDateTimer = null;
        refreshDirectoryDateClassification(true);
    }, Math.max(1_000, next.valueOf() - now.valueOf()));
}

function tournamentIdentity(source) {
    if (source === 'official') return Object.freeze({ kind: 'official', label: 'OFFICIAL CAISSA', icon: '🛡' });
    if (source === 'community') return Object.freeze({ kind: 'community', label: 'COMMUNITY TOURNAMENT', icon: null });
    return null;
}

function createTournamentIdentityBadge(source) {
    const identity = tournamentIdentity(source);
    if (!identity) return null;
    const badge = document.createElement('span');
    badge.className = `tournament-identity tournament-identity--${identity.kind}`;
    badge.setAttribute('aria-label', identity.label);
    if (identity.icon) {
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = identity.icon;
        badge.append(icon);
    }
    badge.append(document.createTextNode(identity.label));
    return badge;
}

function renderTournamentIdentity(id, source) {
    let element = $(id);
    const identity = tournamentIdentity(source);
    if (!element && identity) {
        element = document.createElement('div');
        element.id = id;
        const anchor = id === 'arena-detail-identity' ? $('arena-detail-kicker')
            : document.querySelector('.arena-context-head p');
        anchor?.before(element);
    }
    if (!element) return;
    const badge = createTournamentIdentityBadge(source);
    element.replaceChildren(...(badge ? [...badge.childNodes] : []));
    element.className = badge?.className || 'tournament-identity';
    element.hidden = !badge;
    if (badge) element.setAttribute('aria-label', badge.getAttribute('aria-label'));
    else element.removeAttribute('aria-label');
}

function ensureTournamentDirectoryFilters() {
    if (ui.arenaRatingFilter && ui.arenaIdentityFilter) return;
    const filters = $('arena-filters');
    const addSelect = (id, labelText, options) => {
        const label = document.createElement('label');
        label.append(document.createTextNode(labelText));
        const select = document.createElement('select');
        select.id = id;
        for (const [value, text] of options) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            select.append(option);
        }
        select.addEventListener('change', renderArenaDirectory);
        label.append(select);
        filters.append(label);
        return select;
    };
    ui.arenaRatingFilter = addSelect('arena-rating-filter', 'Rating', [
        ['all', 'Rated and unrated'], ['rated', 'Rated'], ['unrated', 'Unrated']
    ]);
    ui.arenaIdentityFilter = addSelect('arena-identity-filter', 'Organizer', [
        ['all', 'Official and community'], ['official', 'Official CAISSA'], ['community', 'Community']
    ]);
}

async function joinTournamentFromCard(tournament, button) {
    if (!tournament?.id || model.arenaBusy) return;
    model.selectedTournamentId = tournament.id;
    button.disabled = true;
    button.textContent = 'Joining…';
    await changeArenaMembership(tournament.playCategory === 'daily' ? 'daily.join' : 'tournament.join');
    if (button.isConnected && model.arenaBusy) button.textContent = 'Joining…';
}

async function openArenaDetails(tournamentId, options = {}) {
    if (!TOURNAMENT_UUID.test(String(tournamentId || '')) || model.arenaBusy) {
        showDirectoryMessage('Tournament unavailable', 'The tournament link is not valid.', true);
        return;
    }
    model.selectedTournamentId = tournamentId;
    if (options.updateHistory !== false) updateTournamentUrl(tournamentId);
    model.arenaBusy = true;
    try {
        const eventType = options.playCategory === 'daily' ? 'daily.sync' : 'tournament.sync';
        const envelope = await api.command(eventType, { tournamentId });
        applyState(envelope.data?.state);
    } catch (error) {
        handleError(error, 'The tournament could not be opened.');
    } finally {
        model.arenaBusy = false;
        const current = options.playCategory === 'daily' ? model.daily?.current : model.arena?.current;
        if (current?.id === tournamentId) {
            renderArenaDetail({ ...current, playCategory: options.playCategory || 'live' });
            if (options.focusAction) {
                ui.arenaDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
                queueMicrotask(() => {
                    const target = !ui.arenaJoin.hidden && !ui.arenaJoin.disabled ? ui.arenaJoin
                        : !ui.arenaViewResults.hidden ? ui.arenaViewResults : $('arena-detail-back');
                    target.focus({ preventScroll: true });
                });
            }
        }
    }
}

function renderArenaDetail(tournament) {
    if (!tournament) return;
    tournament = decorateTournamentSeries(tournament);
    ensureTournamentDetailTools();
    model.selectedTournamentId = tournament.id;
    document.querySelectorAll('[data-directory-panel]').forEach(panel => { panel.hidden = true; });
    $('arena-filters').hidden = true;
    document.querySelector('.tournament-directory-nav').hidden = true;
    ui.arenaDetail.hidden = false;
    renderTournamentIdentity('arena-detail-identity', tournament.source);
    $('arena-detail-name').textContent = tournament.name;
    const daily = tournament.playCategory === 'daily' || Number(tournament.daysPerMove) > 0;
    $('arena-detail-kicker').textContent = `${daily ? 'DAILY · ROUND ROBIN' : String(tournament.format || 'arena').toUpperCase()} · ${tournament.rated ? 'RATED' : 'UNRATED'}`;
    $('arena-detail-control').textContent = arenaControl(tournament);
    $('arena-detail-duration').textContent = daily ? `Groups of ${tournament.groupSize || 4}` : `${tournament.durationMinutes} min`;
    $('arena-detail-players').textContent = `${tournament.participantCount} / ${tournament.capacity || '∞'}`;
    const joined = tournament.joined || (!!tournament.myState && tournament.myState !== 'withdrawn');
    const registrationOpen = ['registration_open', 'active'].includes(tournament.status)
        && Date.parse(tournament.registrationClosesAt || tournament.endsAt) > Date.now();
    const full = Number(tournament.participantCount) >= Number(tournament.capacity || Number.POSITIVE_INFINITY);
    const completed = ['completed', 'cancelled'].includes(tournament.status);
    $('arena-detail-status').textContent = arenaStatusLabel(tournament.status);
    $('arena-detail-registration').textContent = completed ? arenaStatusLabel(tournament.status)
        : registrationOpen ? (tournament.lateJoin ? 'Open · late join allowed' : 'Open until start')
            : arenaStatusLabel(tournament.status);
    ui.arenaJoin.dataset.eventType = daily ? 'daily.join' : 'tournament.join';
    ui.arenaWithdraw.dataset.eventType = daily ? 'daily.withdraw' : 'tournament.withdraw';
    ui.arenaJoin.hidden = joined || completed;
    ui.arenaJoin.disabled = !registrationOpen || full || model.arenaBusy;
    ui.arenaJoin.textContent = full ? 'Tournament full' : registrationOpen ? 'Join tournament' : 'Registration not open';
    ui.arenaWithdraw.hidden = !joined || completed;
    ui.arenaWithdraw.disabled = model.arenaBusy;
    ui.arenaViewResults.hidden = !completed;
    $('arena-information').hidden = false;
    $('arena-detail-info-toggle').setAttribute('aria-expanded', 'true');
    $('arena-manage').hidden = true;
    $('arena-detail-manage-toggle').setAttribute('aria-expanded', 'false');
    renderTournamentInformation(tournament, daily);
    configureTournamentManage(tournament, daily);
    const strictDeadline = tournament.finishingPolicy === 'abort_at_deadline';
    const rules = Array.isArray(tournament.rules) && tournament.rules.length ? tournament.rules
        : daily ? ['One White and one Black game against each group opponent.',
            'The deadline resets after every legal move.',
            'Top players advance using points, Sonneborn-Berger, wins, then seed.']
            : ['Win 2 · Draw 1 · Loss 0', 'New pairings stop when Arena time expires.',
                strictDeadline
                    ? 'Unfinished games are aborted at the scheduled ending time with no points or rating change.'
                    : 'Games already in progress finish normally.',
                'Immediate rematches are avoided when alternatives exist.'];
    $('arena-detail-rules').replaceChildren(...rules.map(rule => {
        const item = document.createElement('li'); item.textContent = rule; return item;
    }));
    configureArenaCountdown($('arena-detail-countdown'), tournament);
}

function ensureTournamentDetailTools() {
    const mount = $('tournament-detail-tools-mount');
    if (mount.children.length) return;
    mount.append($('tournament-detail-tools-template').content.cloneNode(true));
    $('arena-detail-back').addEventListener('click', showArenaDirectory);
    $('arena-detail-info-toggle').addEventListener('click', toggleTournamentInformation);
    $('arena-detail-share').addEventListener('click', () => openTournamentShare(selectedTournament()));
    $('arena-detail-manage-toggle').addEventListener('click', toggleTournamentManage);
    $('arena-manage-cancel').addEventListener('click', () => manageArenaTournament('cancel'));
    $('arena-manage-close').addEventListener('click', () => manageArenaTournament('close'));
}

function renderTournamentInformation(tournament, daily) {
    const rows = [];
    const add = (label, value) => {
        if (value === null || value === undefined || value === '') return;
        rows.push([label, String(value)]);
    };
    add('Organizer', tournament.organizerDisplayName);
    add('Identity', tournament.source === 'official' ? 'OFFICIAL CAISSA'
        : tournament.source === 'community' ? 'Community tournament' : null);
    add('Series', tournamentSeriesDescription(tournament));
    add('Rating', tournament.rated ? 'Rated' : 'Unrated');
    add('Format', daily ? 'Daily correspondence · Round robin' : 'Live Arena · Standard chess');
    if (daily) {
        add('Days per move', tournament.daysPerMove ? `${tournament.daysPerMove} ${tournament.daysPerMove === 1 ? 'day' : 'days'} per move` : null);
        add('Group configuration', tournament.groupSize ? `${tournament.groupSize} players per group` : null);
        add('Advancement', tournament.qualifiersPerGroup ? `${tournament.qualifiersPerGroup} advance per group` : null);
    } else {
        add('Time control', arenaControl(tournament));
        add('Duration', tournament.durationMinutes ? `${tournament.durationMinutes} minutes` : null);
        add('Pairing', 'Continuous Arena pairings; immediate rematches are avoided when alternatives exist');
        add('Scoring', tournament.scoringContract === 'arena-s001-2-1-0'
            ? 'Win 2 · Draw 1 · Loss 0' : null);
        add('Deadline policy', tournament.finishingPolicy === 'abort_at_deadline'
            ? 'Unfinished games are aborted at the scheduled ending time; no points or rating changes.'
            : 'Games already in progress may finish after pairing closes.');
    }
    const starts = new Date(tournament.startsAt);
    add('Start time', Number.isNaN(starts.valueOf()) ? null
        : starts.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }));
    add('Timezone', tournament.timeZone);
    add('Minimum players', tournament.minPlayers);
    add('Maximum players', tournament.capacity);
    add('Current registrations', tournament.participantCount);
    add('Status', arenaStatusLabel(tournament.status));
    $('arena-information-list').replaceChildren(...rows.map(([label, value]) => {
        const row = document.createElement('div');
        const term = document.createElement('dt'); term.textContent = label;
        const detail = document.createElement('dd'); detail.textContent = value;
        row.append(term, detail);
        return row;
    }));
}

function configureTournamentManage(tournament, daily) {
    const canCancel = !daily && tournament.organizedByMe
        && ['scheduled', 'registration_open'].includes(tournament.status);
    const canClose = !daily && tournament.organizedByMe
        && ['active', 'finishing'].includes(tournament.status);
    const manage = $('arena-detail-manage-toggle');
    manage.hidden = !(canCancel || canClose);
    $('arena-manage-cancel').hidden = !canCancel;
    $('arena-manage-close').hidden = !canClose;
    if (manage.hidden) {
        $('arena-manage').hidden = true;
        manage.setAttribute('aria-expanded', 'false');
    }
    $('arena-manage-copy').textContent = daily
        ? 'Daily cancellation is unavailable until its active-game lifecycle is certified.'
        : 'Only actions authorized by tournament ownership and current state are shown.';
}

function toggleTournamentInformation() {
    const panel = $('arena-information');
    panel.hidden = !panel.hidden;
    $('arena-detail-info-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) queueMicrotask(() => panel.querySelector('h4')?.focus?.({ preventScroll: true }));
}

function toggleTournamentManage() {
    const panel = $('arena-manage');
    panel.hidden = !panel.hidden;
    $('arena-detail-manage-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) queueMicrotask(() => panel.querySelector('button:not([hidden])')?.focus());
}

function selectedTournament() {
    if (model.daily?.current?.id === model.selectedTournamentId) {
        return { ...model.daily.current, playCategory: 'daily' };
    }
    if (model.arena?.current?.id === model.selectedTournamentId) {
        return { ...model.arena.current, playCategory: 'live' };
    }
    return [...(model.arena?.tournaments || []), ...(model.daily?.tournaments || [])]
        .find(item => item.id === model.selectedTournamentId) || null;
}

function canonicalTournamentUrl(tournamentId) {
    if (!TOURNAMENT_UUID.test(String(tournamentId || ''))) return null;
    const url = new URL('/online/tournaments', location.origin);
    url.searchParams.set('directory', '1');
    url.searchParams.set('tournament', tournamentId);
    return url.toString();
}

function openTournamentShare(tournament) {
    const url = canonicalTournamentUrl(tournament?.id);
    if (!url) return showToast('This tournament does not have a shareable event link.');
    const dialog = ensureTournamentShareDialog();
    $('tournament-share-title').textContent = tournament.name || 'CAISSA Tournament';
    const starts = new Date(tournament.startsAt);
    $('tournament-share-start').textContent = Number.isNaN(starts.valueOf()) ? ''
        : starts.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
    $('tournament-share-url').value = url;
    $('tournament-share-feedback').textContent = '';
    $('tournament-native-share').hidden = typeof navigator.share !== 'function';
    $('tournament-share-protection').hidden = !(/(^|\.)s002-cert\.caissa-chess\.org$/iu.test(location.hostname)
        || /certification/iu.test(location.hostname));
    $('tournament-share-facebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    $('tournament-share-x').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tournament.name || 'CAISSA Tournament')}&url=${encodeURIComponent(url)}`;
    dialog.dataset.tournamentName = tournament.name || 'CAISSA Tournament';
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => $('tournament-copy-link').focus());
}

function ensureTournamentShareDialog() {
    const dialog = $('tournament-share-dialog');
    if (!dialog.children.length) {
        dialog.append($('tournament-share-template').content.cloneNode(true));
        $('tournament-copy-link').addEventListener('click', copyTournamentLink);
        $('tournament-native-share').addEventListener('click', shareTournamentNatively);
    }
    return dialog;
}

async function copyTournamentLink() {
    const input = $('tournament-share-url');
    try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
        else {
            input.select();
            if (!document.execCommand('copy')) throw new Error('COPY_UNAVAILABLE');
        }
        $('tournament-share-feedback').textContent = 'Link copied.';
    } catch (_) {
        input.focus(); input.select();
        $('tournament-share-feedback').textContent = 'Copy is unavailable. The link is selected for manual copy.';
    }
}

async function shareTournamentNatively() {
    if (typeof navigator.share !== 'function') return;
    try {
        await navigator.share({
            title: $('tournament-share-dialog').dataset.tournamentName,
            text: `Join ${$('tournament-share-dialog').dataset.tournamentName} on CAISSA.`,
            url: $('tournament-share-url').value
        });
        $('tournament-share-feedback').textContent = 'Share sheet opened.';
    } catch (error) {
        if (error?.name !== 'AbortError') $('tournament-share-feedback').textContent = 'Sharing is unavailable in this browser.';
    }
}

function showArenaDirectory() {
    model.selectedTournamentId = null;
    updateTournamentUrl(null);
    ui.arenaDetail.hidden = true;
    $('arena-filters').hidden = false;
    document.querySelector('.tournament-directory-nav').hidden = false;
    selectDirectoryView(model.selectedDirectoryView);
    renderArenaDirectory();
}

function updateTournamentUrl(tournamentId) {
    if (location.pathname !== '/online/tournaments') return;
    const url = new URL(location.href);
    url.searchParams.set('directory', '1');
    if (tournamentId && TOURNAMENT_UUID.test(String(tournamentId))) url.searchParams.set('tournament', tournamentId);
    else url.searchParams.delete('tournament');
    history.replaceState({ tournamentId: tournamentId || null }, '', `${url.pathname}${url.search}${url.hash}`);
}

function showDirectoryMessage(title, copy, isError = false) {
    $('arena-directory-message-title').textContent = title;
    $('arena-directory-message-copy').textContent = copy;
    ui.directoryMessage.classList.toggle('directory-message--error', isError);
    ui.directoryRetry.hidden = isError;
    ui.directoryMessage.hidden = false;
}

async function changeArenaMembership(eventType) {
    const tournamentId = model.selectedTournamentId
        || (eventType.startsWith('daily.') ? model.daily?.current?.id : model.arena?.current?.id);
    if (!tournamentId || model.arenaBusy) return;
    model.arenaBusy = true;
    ui.arenaJoin.disabled = true;
    ui.arenaWithdraw.disabled = true;
    try {
        const envelope = await api.command(eventType, { tournamentId });
        applyState(envelope.data?.state);
        if (eventType === 'tournament.join' || eventType === 'daily.join') {
            showToast(eventType === 'daily.join'
                ? 'Registered for the Daily tournament.' : 'You joined the Arena. Pairing is automatic.');
            closeTournamentDirectory();
            selectTab('tournaments');
        } else {
            showToast('You withdrew. Active game results still count.');
            renderArenaDirectory();
        }
    } catch (error) {
        handleError(error, 'The tournament membership could not be updated.');
    } finally {
        model.arenaBusy = false;
        const current = eventType.startsWith('daily.') ? model.daily?.current : model.arena?.current;
        if (current?.id === model.selectedTournamentId && ui.directoryDialog.open) {
            renderArenaDetail({ ...current, playCategory: eventType.startsWith('daily.') ? 'daily' : 'live' });
        }
        renderArenaDirectory();
    }
}

function openTournamentDirectory(view = 'current', opener = document.activeElement) {
    if (!model.auth?.isSignedIn || model.auth?.isGuest) {
        model.tournamentIntent = true;
        model.tournamentCreateIntent = view === 'create';
        $('signin-dialog-title').textContent = 'Sign in for CAISSA Tournaments';
        $('signin-dialog-copy').textContent = view === 'create'
            ? 'Sign in with a CAISSA member account to create a community tournament.'
            : 'Sign in to browse, join, or organize an Arena tournament.';
        showSignInDialog(opener);
        return;
    }
    if (model.config?.capabilities?.arenaS001 !== true) {
        showToast('Tournament Season 001 is not enabled in this environment.');
        return;
    }
    model.directoryOpener = opener instanceof HTMLElement ? opener : document.activeElement;
    ensureTournamentDirectoryFilters();
    showArenaDirectory();
    if (!ui.directoryDialog.open) ui.directoryDialog.showModal();
    selectDirectoryView(view, { focusPanel: view === 'create' });
}

function requestTournamentCreation(opener = document.activeElement) {
    if (!model.auth?.isSignedIn || model.auth?.isGuest) {
        openTournamentDirectory('create', opener);
        return;
    }
    if (!model.communityTournamentCreator) {
        showToast('Community tournament creation is not enabled in this environment.');
        return;
    }
    selectDirectoryView('create', { focusPanel: true });
}

function closeTournamentDirectory() {
    if (ui.directoryDialog.open) ui.directoryDialog.close();
}

function restoreTournamentDirectoryFocus() {
    const opener = model.directoryOpener;
    model.directoryOpener = null;
    queueMicrotask(() => opener?.isConnected && opener.focus());
}

function viewSelectedTournament() {
    closeTournamentDirectory();
    selectTab('tournaments');
    if (model.arena?.current) renderArenaContext(model.arena.current);
}

async function createArenaTournament(event) {
    event.preventDefault();
    if (model.arenaBusy) return;
    const type = $('arena-create-type').value;
    const controls = {
        'bullet-1-0': { pool: 'bullet', baseMs: 60000, incrementMs: 0 },
        'bullet-1-1': { pool: 'bullet', baseMs: 60000, incrementMs: 1000 },
        'bullet-2-1': { pool: 'bullet', baseMs: 120000, incrementMs: 1000 },
        'blitz-3-0': { pool: 'blitz', baseMs: 180000, incrementMs: 0 },
        'blitz-3-2': { pool: 'blitz', baseMs: 180000, incrementMs: 2000 },
        'blitz-5-0': { pool: 'blitz', baseMs: 300000, incrementMs: 0 },
        'blitz-5-5': { pool: 'blitz', baseMs: 300000, incrementMs: 5000 },
        'rapid-10-0': { pool: 'rapid', baseMs: 600000, incrementMs: 0 },
        'rapid-10-5': { pool: 'rapid', baseMs: 600000, incrementMs: 5000 }
    };
    const control = type === 'live' ? controls[$('arena-create-control').value] : null;
    const recurring = false;
    if (!model.auth?.isSignedIn || model.auth?.isGuest) {
        ui.createFeedback.textContent = 'Sign in with a CAISSA member account to create a tournament.';
        showSignInDialog($('arena-create-submit'));
        return;
    }
    if (!model.communityTournamentCreator) {
        ui.createFeedback.textContent = 'Community tournament creation is not enabled in this environment.';
        return;
    }
    const creationCapability = type === 'daily'
        ? model.config?.capabilities?.dailyTournamentCreation === true
        : model.config?.capabilities?.tournamentCreation === true;
    if (!creationCapability) {
        ui.createFeedback.textContent = `${type === 'daily' ? 'Daily' : 'Arena'} tournament creation is not enabled.`;
        return;
    }
    const scheduled = !recurring && $('arena-create-start-mode').value === 'scheduled';
    const startInput = $('arena-create-start').value;
    const startsAt = recurring ? null : scheduled ? new Date(startInput) : new Date(Date.now() + 5 * 60_000);
    if ((type === 'live' && !control) || (!recurring
        && (Number.isNaN(startsAt.valueOf()) || startsAt.valueOf() < Date.now() - 30_000))) {
        ui.createFeedback.textContent = 'Choose a valid future start time and approved time control.';
        return;
    }
    const recurrence = recurring ? collectRecurrenceRule() : null;
    if (recurring && !recurrence) return;
    const groupSize = type === 'daily' ? Number($('daily-create-group-size').value) : null;
    const capacity = Number($('arena-create-capacity').value);
    const qualifiersPerGroup = type === 'daily' ? Number($('daily-create-qualifiers').value) : null;
    if (type === 'daily' && groupSize > capacity) {
        ui.createFeedback.textContent = 'Daily group size cannot exceed maximum players.';
        return;
    }
    if (type === 'daily' && (![1, 2].includes(qualifiersPerGroup) || qualifiersPerGroup >= groupSize)) {
        ui.createFeedback.textContent = 'Advance per group must be one or two players and fewer than the group size.';
        return;
    }
    const payload = {
        name: $('arena-create-name').value.trim(),
        ...(!recurring ? { startsAt: startsAt.toISOString() } : {}),
        capacity,
        rated: $('arena-create-rating').value === 'rated',
        ...(type === 'daily' ? {
            description: $('daily-create-description').value.trim(),
            daysPerMove: Number($('daily-create-days').value),
            groupSize,
            qualifiersPerGroup
        } : {
            timeControlId: $('arena-create-control').value,
            durationMinutes: Number($('arena-create-duration').value),
            lateJoin: $('arena-create-late-join').checked,
            ...(recurring ? { recurrence } : {}),
            ...control
        })
    };
    model.arenaBusy = true;
    setBusy($('arena-create-submit'), true, 'Creating…');
    ui.createFeedback.textContent = 'Creating with server time and tournament safeguards…';
    try {
        const eventType = type === 'daily' ? 'daily.create' : 'tournament.create';
        const commandPayload = payload;
        const envelope = await api.command(eventType, commandPayload);
        applyState(envelope.data?.state);
        ui.createForm.reset();
        model.editingRecurringSeriesId = null;
        model.tournamentCreateMode = null;
        model.tournamentCreateDrafts = createDefaultTournamentDrafts();
        configureTournamentCreateType();
        $('arena-create-start-wrap').hidden = true;
        ui.createFeedback.textContent = '';
        closeTournamentDirectory();
        selectTab('tournaments');
        showToast('Tournament created. You are its organizer.');
    } catch (error) {
        ui.createFeedback.textContent = messageForError(error);
        handleError(error, 'The tournament could not be created.');
    } finally {
        model.arenaBusy = false;
        setBusy($('arena-create-submit'), false, 'Create Tournament');
    }
}

function configureTournamentCreateType() {
    const capabilities = model.config?.capabilities || {};
    const dailyOption = $('arena-create-type').querySelector('option[value="daily"]');
    dailyOption.disabled = capabilities.dailyTournaments !== true
        || capabilities.dailyTournamentCreation !== true;
    if (dailyOption.disabled && $('arena-create-type').value === 'daily') $('arena-create-type').value = 'live';
    const mode = $('arena-create-type').value === 'daily' ? 'daily' : 'live';
    const daily = mode === 'daily';
    $('arena-create-capacity').max = daily || capabilities.arena100 === true ? '100' : '64';
    if (model.tournamentCreateMode !== mode || !$('arena-create-type-fields').children.length) {
        saveTournamentCreateDraft(model.tournamentCreateMode);
        $('arena-create-type-fields').replaceChildren(
            $(`arena-create-${mode}-fields-template`).content.cloneNode(true)
        );
        model.tournamentCreateMode = mode;
        restoreTournamentCreateDraft(mode);
    }
    if (!daily && $('arena-create-repeat-wrap')) {
        $('arena-create-repeat-wrap').hidden = capabilities.recurringTournaments !== true;
        if (!model.tournamentOrganizer && capabilities.recurringTournaments === true) {
            $('arena-create-repeat').checked = true;
            $('arena-create-repeat').disabled = true;
        }
    }
    configureRecurrenceControls();
    $('arena-create-start-wrap').hidden = $('arena-create-repeat')?.checked === true
        || $('arena-create-start-mode').value !== 'scheduled';
    const ratedOption = $('arena-create-rating').querySelector('option[value="rated"]');
    const ratedEnabled = daily ? capabilities.dailyRated === true : capabilities.tournamentRated === true;
    ratedOption.disabled = !ratedEnabled;
    if (!ratedEnabled) $('arena-create-rating').value = 'unrated';
    $('arena-create-rating-help').textContent = ratedEnabled
        ? `${daily ? 'Daily' : 'Arena'} Rated is certified in this beta.`
        : `${daily ? 'Daily' : 'Arena'} Rated remains disabled until its certification flag is enabled.`;
    updateTournamentCreateRules();
}

function createDefaultTournamentDrafts() {
    return {
        live: { control: 'blitz-3-2', duration: '30', lateJoin: true, repeat: false, recurrence: null },
        daily: { description: '', daysPerMove: '7', groupSize: '4', qualifiersPerGroup: '2' }
    };
}

function saveTournamentCreateDraft(mode) {
    if (mode === 'live' && $('arena-create-control')) {
        model.tournamentCreateDrafts.live = {
            control: $('arena-create-control').value,
            duration: $('arena-create-duration').value,
            lateJoin: $('arena-create-late-join').checked,
            repeat: $('arena-create-repeat')?.checked === true,
            recurrence: readRecurrenceDraft()
        };
    }
    if (mode === 'daily' && $('daily-create-days')) {
        model.tournamentCreateDrafts.daily = {
            description: $('daily-create-description').value,
            daysPerMove: $('daily-create-days').value,
            groupSize: $('daily-create-group-size').value,
            qualifiersPerGroup: $('daily-create-qualifiers').value
        };
    }
}

function restoreTournamentCreateDraft(mode) {
    const draft = model.tournamentCreateDrafts[mode];
    if (mode === 'live') {
        $('arena-create-control').value = draft.control;
        $('arena-create-duration').value = draft.duration;
        $('arena-create-late-join').checked = draft.lateJoin;
        if ($('arena-create-repeat')) $('arena-create-repeat').checked = draft.repeat === true;
        restoreRecurrenceDraft(draft.recurrence);
        configureRecurrenceControls();
        return;
    }
    $('daily-create-description').value = draft.description;
    $('daily-create-days').value = draft.daysPerMove;
    $('daily-create-group-size').value = draft.groupSize;
    $('daily-create-qualifiers').value = draft.qualifiersPerGroup;
}

function readRecurrenceDraft() {
    if (!$('recurrence-frequency')) return null;
    return {
        frequencyUnit: $('recurrence-frequency').value,
        interval: $('recurrence-interval').value,
        weekdays: Array.from($('recurrence-weekdays').querySelectorAll('input:checked')).map(input => input.value),
        firstDate: $('recurrence-first-date').value,
        localTime: $('recurrence-local-time').value,
        timeZone: $('recurrence-timezone').value,
        leadDays: $('recurrence-lead-days').value,
        endMode: $('recurrence-end-mode').value,
        endDate: $('recurrence-end-date').value,
        occurrenceCount: $('recurrence-count').value,
        enabled: $('recurrence-enabled').checked
    };
}

function restoreRecurrenceDraft(draft) {
    if (!$('recurrence-frequency')) return;
    const nextDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const value = draft || {
        frequencyUnit: 'weekly', interval: '1', weekdays: ['5'], firstDate: nextDate,
        localTime: '19:00', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        leadDays: '2', endMode: 'never', endDate: '', occurrenceCount: '10', enabled: true
    };
    $('recurrence-frequency').value = value.frequencyUnit || 'weekly';
    $('recurrence-interval').value = String(value.interval || 1);
    $('recurrence-first-date').value = value.firstDate || nextDate;
    $('recurrence-first-date').min = new Date().toISOString().slice(0, 10);
    $('recurrence-local-time').value = value.localTime || '19:00';
    $('recurrence-timezone').value = String(value.timeZone || 'America/New_York');
    $('recurrence-lead-days').value = String(value.leadDays || 2);
    $('recurrence-end-mode').value = value.endMode || 'never';
    $('recurrence-end-date').value = value.endDate || '';
    $('recurrence-count').value = String(value.occurrenceCount || 10);
    $('recurrence-enabled').checked = value.enabled !== false;
    const selected = new Set((value.weekdays || ['5']).map(String));
    $('recurrence-weekdays').querySelectorAll('input').forEach(input => { input.checked = selected.has(input.value); });
}

function configureRecurrenceControls() {
    const repeat = $('arena-create-repeat');
    let section = $('arena-create-recurrence');
    if (!repeat) return;
    const enabled = repeat.checked && !repeat.closest('[hidden]');
    const startMode = $('arena-create-start-mode');
    startMode.disabled = enabled;
    startMode.closest('label').hidden = enabled;
    $('arena-create-start-wrap').hidden = enabled || startMode.value !== 'scheduled';
    if (!enabled) {
        if (section) {
            model.tournamentCreateDrafts.live.recurrence = readRecurrenceDraft();
            section.remove();
        }
        const rated = $('arena-create-rating').querySelector('option[value="rated"]');
        const ratedEnabled = model.config?.capabilities?.tournamentRated === true;
        rated.disabled = !ratedEnabled;
        $('arena-create-rating-help').textContent = ratedEnabled
            ? 'Arena Rated is certified in this beta.'
            : 'Arena Rated remains disabled until its certification flag is enabled.';
        if ($('arena-create-submit').textContent !== 'Create Tournament') {
            $('arena-create-submit').textContent = 'Create Tournament';
        }
        return;
    }
    if (!section) {
        const template = $('arena-create-recurrence-template');
        $('arena-create-type-fields').append(template.content.cloneNode(true));
        section = $('arena-create-recurrence');
        restoreRecurrenceDraft(model.tournamentCreateDrafts.live.recurrence);
    }
    section.hidden = false;
    section.querySelectorAll('input,select').forEach(control => { control.disabled = false; });
    const daily = $('recurrence-frequency').value === 'daily';
    $('recurrence-interval').max = daily ? '30' : '52';
    $('recurrence-weekdays').hidden = daily;
    $('recurrence-weekdays').querySelectorAll('input').forEach(input => { input.disabled = daily; });
    const endMode = $('recurrence-end-mode').value;
    $('recurrence-end-date-wrap').hidden = endMode !== 'on_date';
    $('recurrence-end-date').disabled = endMode !== 'on_date';
    $('recurrence-count-wrap').hidden = endMode !== 'after_count';
    $('recurrence-count').disabled = endMode !== 'after_count';
    const rated = $('arena-create-rating').querySelector('option[value="rated"]');
    rated.disabled = true;
    $('arena-create-rating').value = 'unrated';
    $('arena-create-rating-help').textContent = 'Recurring Arena remains Unrated until its separate certification flag is approved.';
    $('recurrence-summary').textContent = recurrenceFormSummary();
    const submitLabel = model.editingRecurringSeriesId ? 'Update future schedule' : 'Save recurring series';
    if ($('arena-create-submit').textContent !== submitLabel) $('arena-create-submit').textContent = submitLabel;
}

function collectRecurrenceRule() {
    const draft = readRecurrenceDraft();
    const interval = Number(draft.interval);
    const weekdays = draft.frequencyUnit === 'weekly' ? draft.weekdays.map(Number) : [];
    const leadDays = Number(draft.leadDays);
    const occurrenceCount = draft.endMode === 'after_count' ? Number(draft.occurrenceCount) : null;
    let timeZoneValid = false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: draft.timeZone }).format(); timeZoneValid = draft.timeZone.includes('/'); }
    catch (_) { timeZoneValid = false; }
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > (draft.frequencyUnit === 'daily' ? 30 : 52)
        || (draft.frequencyUnit === 'weekly' && !weekdays.length)
        || !/^\d{4}-\d{2}-\d{2}$/u.test(draft.firstDate)
        || !/^\d{2}:\d{2}$/u.test(draft.localTime) || !timeZoneValid || ![1, 2].includes(leadDays)
        || (draft.endMode === 'on_date' && (!draft.endDate || draft.endDate < draft.firstDate))
        || (draft.endMode === 'after_count' && (!Number.isSafeInteger(occurrenceCount)
            || occurrenceCount < 1 || occurrenceCount > 100))) {
        ui.createFeedback.textContent = 'Review the recurrence interval, weekdays, timezone, dates and ending condition.';
        return null;
    }
    return {
        frequencyUnit: draft.frequencyUnit,
        interval,
        weekdays,
        firstDate: draft.firstDate,
        localTime: draft.localTime,
        timeZone: draft.timeZone,
        leadDays,
        endMode: draft.endMode,
        endDate: draft.endMode === 'on_date' ? draft.endDate : null,
        occurrenceCount,
        enabled: draft.enabled
    };
}

function recurrenceFormSummary() {
    const draft = readRecurrenceDraft();
    if (!draft) return '';
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const days = draft.frequencyUnit === 'weekly'
        ? ` on ${draft.weekdays.map(day => names[Number(day)]).join(', ') || 'a selected weekday'}` : '';
    const end = draft.endMode === 'on_date' ? ` through ${draft.endDate || 'the chosen date'}`
        : draft.endMode === 'after_count' ? ` for ${draft.occurrenceCount || 'N'} occurrences` : ' until paused';
    return `Every ${draft.interval || 1} ${draft.frequencyUnit === 'daily' ? 'day(s)' : 'week(s)'}${days} at ${draft.localTime || '—'} (${draft.timeZone || 'timezone'}). Create each tournament ${draft.leadDays} day(s) before. Repeats${end}.`;
}

function editRecurringSeries(series) {
    model.editingRecurringSeriesId = series.id;
    selectDirectoryView('create');
    $('arena-create-type').value = 'live';
    configureTournamentCreateType();
    $('arena-create-name').value = series.title;
    $('arena-create-capacity').value = String(series.template?.capacity || 16);
    $('arena-create-duration').value = String(series.template?.durationMinutes || 30);
    $('arena-create-late-join').checked = series.template?.lateJoin === true;
    const option = Array.from($('arena-create-control').options).find(item => {
        const [pool, base, increment] = item.value.split('-');
        return pool === series.template?.pool
            && Number(base) * 60_000 === Number(series.template?.baseMs)
            && Number(increment) * 1000 === Number(series.template?.incrementMs);
    });
    if (option) $('arena-create-control').value = option.value;
    $('arena-create-repeat').disabled = true;
    $('arena-create-repeat').checked = true;
    configureRecurrenceControls();
    restoreRecurrenceDraft(series);
    configureRecurrenceControls();
    $('arena-create-name').focus();
}

function updateTournamentCreateRules() {
    const daily = $('arena-create-type').value === 'daily';
    const days = daily ? Number($('daily-create-days')?.value || 7) : 7;
    $('arena-create-rules').querySelector('ul').replaceChildren(...(daily
        ? ['One White and one Black game per group opponent', `${days} ${days === 1 ? 'day' : 'days'} for every move`,
            'Persistent server deadlines and deterministic advancement']
        : ['Win 2 · Draw 1 · Loss 0', 'Server-authoritative moves and clocks',
            'Active games finish after Arena time expires']).map(text => {
        const item = document.createElement('li'); item.textContent = text; return item;
    }));
}

async function manageRecurringSeries(action, payload) {
    if (model.arenaBusy) return;
    model.arenaBusy = true;
    try {
        const envelope = await api.command(`series.${action}`, payload);
        applyState(envelope.data?.state);
        showToast(({ pause: 'Recurring series paused.', resume: 'Recurring series resumed.',
            skip: 'The planned date was skipped.', unskip: 'The skipped date was restored.',
            cancel: 'The generated occurrence was cancelled.',
            update: 'Future recurrence settings updated.' })[action] || 'Recurring series updated.');
    } catch (error) {
        handleError(error, 'The recurring series could not be updated.');
    } finally {
        model.arenaBusy = false;
        renderArenaDirectory();
    }
}

async function manageArenaTournament(action) {
    const tournament = model.arena?.current;
    if (!tournament?.id || !tournament.organizedByMe || model.arenaBusy) return;
    const confirmed = await confirmAction(
        action === 'cancel' ? 'Cancel this tournament?' : 'Close this tournament?',
        action === 'cancel' ? 'Registration will close and the event will be marked cancelled.' : 'No new pairings will start. Active games may finish.',
        action === 'cancel' ? 'Cancel Tournament' : 'Close Tournament'
    );
    if (!confirmed) return;
    model.arenaBusy = true;
    try {
        const envelope = await api.command(`tournament.${action}`, { tournamentId: tournament.id });
        applyState(envelope.data?.state);
        showToast(action === 'cancel' ? 'Tournament cancelled.' : 'Tournament is finishing.');
    } catch (error) {
        handleError(error, 'The organizer action could not be completed.');
    } finally {
        model.arenaBusy = false;
    }
}

function renderArenaContext(tournament) {
    renderTournamentIdentity('arena-context-identity', tournament.source);
    $('arena-context-name').textContent = tournament.name;
    $('arena-context-meta').textContent = `${arenaControl(tournament)} · ${tournament.rated ? 'Rated' : 'Unrated'} · ${arenaStatusLabel(tournament.status)}`;
    $('arena-context-enrollment').textContent = `${tournament.participantCount}/${tournament.capacity || '∞'} players · ${tournament.myState ? arenaParticipantStatus(tournament.myState) : tournament.organizedByMe ? 'Organizer' : 'Not joined'}`;
    $('arena-context-withdraw').hidden = !tournament.myState || tournament.myState === 'withdrawn' || ['completed', 'cancelled'].includes(tournament.status);
    $('arena-cancel').hidden = !tournament.organizedByMe || !['scheduled', 'registration_open'].includes(tournament.status);
    $('arena-close').hidden = !tournament.organizedByMe || !['active', 'finishing'].includes(tournament.status);
    configureArenaCountdown($('arena-context-countdown'), tournament);
    ui.arenaStandingsBody.replaceChildren();
    (tournament.standings || []).forEach(standing => {
        const row = document.createElement('tr');
        if (standing.isCurrentPlayer) row.className = 'is-current-player';
        const rank = document.createElement('td'); rank.textContent = String(standing.rank);
        const player = document.createElement('td');
        const playerName = document.createElement('strong'); playerName.textContent = standing.displayName;
        const playerMeta = document.createElement('span');
        playerMeta.textContent = `${standing.rating ?? '—'} · ${arenaParticipantStatus(standing.state)}`;
        player.append(playerName, playerMeta);
        const record = document.createElement('td'); record.textContent = `${standing.wins}-${standing.draws}-${standing.losses}`;
        const points = document.createElement('td'); points.textContent = String(standing.points);
        row.append(rank, player, record, points);
        ui.arenaStandingsBody.append(row);
    });
    renderArenaGames(tournament);
}

function renderArenaGames(tournament) {
    ui.arenaPairingState.replaceChildren();
    ui.arenaPairingState.classList.remove('arena-pairing-state--resting');
    const mark = document.createElement('span'); mark.setAttribute('aria-hidden', 'true'); mark.textContent = '♞';
    const title = document.createElement('strong');
    const copy = document.createElement('p');
    const pairing = tournament.nextPairing;
    if (pairing?.state === 'active') {
        title.textContent = `Playing ${pairing.opponentDisplayName}`;
        copy.textContent = `${titleCase(pairing.color)} · ${arenaControl(tournament)} · You will take a break after this game.`;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Return to game';
        button.addEventListener('click', () => selectTab('new'));
        ui.arenaPairingState.append(mark, title, copy, button);
    } else if (tournament.status === 'active' && tournament.myState === 'resting') {
        ui.arenaPairingState.classList.add('arena-pairing-state--resting');
        mark.textContent = '☕';
        title.textContent = 'Break time';
        copy.textContent = 'You will not receive another pairing until you choose to continue.';
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = 'Next Arena Game';
        button.disabled = model.arenaBusy;
        button.addEventListener('click', requestNextArenaGame);
        ui.arenaPairingState.append(mark, title, copy, button);
    } else if (tournament.status === 'active' && tournament.myState === 'waiting') {
        title.textContent = 'Waiting for pairing';
        copy.textContent = 'Your next game was requested. CAISSA will assign an eligible opponent.';
        ui.arenaPairingState.append(mark, title, copy);
    } else if (tournament.status === 'finishing') {
        title.textContent = 'Arena is finishing';
        copy.textContent = tournament.finishingPolicy === 'abort_at_deadline'
            ? 'Arena time expired. No new games can start.'
            : 'No new games will start. Active games are resolving.';
        ui.arenaPairingState.append(mark, title, copy);
    } else {
        title.textContent = arenaStatusLabel(tournament.status);
        copy.textContent = tournament.status === 'completed' ? 'Final standings are locked.' : 'Pairing begins when the Arena starts.';
        ui.arenaPairingState.append(mark, title, copy);
    }

    ui.arenaGamesList.replaceChildren();
    (tournament.games || []).forEach(game => {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'arena-game-row';
        const names = document.createElement('strong');
        names.textContent = `${game.whiteDisplayName} — ${game.blackDisplayName}`;
        const meta = document.createElement('span');
        const gameStatus = game.status === 'active' ? 'Playing'
            : game.status === 'aborted' && game.termination === 'tournament_deadline'
                ? 'Arena time expired · No points' : game.result || 'Finished';
        meta.textContent = `Board ${game.boardNumber || '—'} · ${gameStatus}`;
        row.append(names, meta);
        row.addEventListener('click', () => {
            const fullGame = (model.state?.recentGames || []).find(item => item.id === game.gameId);
            if (fullGame) { model.game = fullGame; renderGame(fullGame); selectTab('new'); }
        });
        ui.arenaGamesList.append(row);
    });
}

async function requestNextArenaGame() {
    const tournamentId = model.arena?.current?.id;
    if (!tournamentId || model.arena?.current?.myState !== 'resting' || model.arenaBusy) return;
    model.arenaBusy = true;
    renderArenaGames(model.arena.current);
    try {
        const envelope = await api.command('tournament.next', { tournamentId });
        applyState(envelope.data?.state);
        showToast('You are ready for the next Arena game.');
    } catch (error) {
        handleError(error, 'The next pairing could not be requested.');
    } finally {
        model.arenaBusy = false;
        if (model.arena?.current) renderArenaGames(model.arena.current);
    }
}

function configureArenaCountdown(element, tournament) {
    if (!element || !tournament) return;
    let label = 'Starts in';
    let target = tournament.startsAt;
    if (tournament.status === 'active') { label = 'Time remaining'; target = tournament.endsAt; }
    else if (tournament.status === 'finishing') { label = 'Status'; target = null; }
    else if (tournament.status === 'completed') { label = 'Status'; target = null; }
    else if (tournament.status === 'cancelled') { label = 'Status'; target = null; }
    element.dataset.target = target || '';
    element.dataset.final = tournament.status;
    element.querySelector('span').textContent = label;
    updateArenaCountdownElement(element);
}

function renderArenaCountdowns() {
    updateArenaCountdownElement($('arena-detail-countdown'));
    updateArenaCountdownElement($('arena-context-countdown'));
}

function updateArenaCountdownElement(element) {
    if (!element || element.hidden) return;
    const target = Date.parse(element.dataset.target || '');
    const strong = element.querySelector('strong');
    if (!Number.isFinite(target)) {
        strong.textContent = ({ finishing: 'Finishing', completed: 'Final', cancelled: 'Cancelled' })[element.dataset.final] || '—';
        return;
    }
    const seconds = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    strong.textContent = hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
        : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function arenaControl(tournament) {
    if (Number(tournament?.daysPerMove) > 0 || tournament?.playCategory === 'daily') {
        const days = Number(tournament.daysPerMove || 7);
        return `${days} day${days === 1 ? '' : 's'} / move`;
    }
    return `${Math.floor(Number(tournament.baseMs || 0) / 60000)}+${Math.floor(Number(tournament.incrementMs || 0) / 1000)}`;
}

function arenaStatusCategory(status) {
    if (['active', 'finishing'].includes(status)) return 'active';
    if (['draft', 'scheduled', 'registration_open', 'planned', 'skipped'].includes(status)) return 'upcoming';
    return 'completed';
}

function arenaStatusLabel(status) {
    return ({ draft: 'Draft', planned: 'Planned', skipped: 'Skipped', scheduled: 'Scheduled', registration_open: 'Registration open', active: 'Live', finishing: 'Finishing', completed: 'Completed', cancelled: 'Cancelled' })[status] || 'Arena';
}

function arenaParticipantStatus(state) {
    return ({ registered: 'Registered', waiting: 'Waiting', playing: 'Playing', resting: 'Taking a break', withdrawn: 'Withdrawn', disconnected: 'Reconnecting' })[state] || 'Registered';
}

function selectDirectoryView(name, { focusPanel = false } = {}) {
    model.selectedDirectoryView = name;
    ui.arenaDetail.hidden = true;
    $('arena-filters').hidden = name === 'create';
    document.querySelector('.tournament-directory-nav').hidden = false;
    document.querySelectorAll('[data-directory-tab]').forEach(tab => {
        const selected = tab.dataset.directoryTab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    $('tournament-directory-create').dataset.active = String(name === 'create');
    document.querySelectorAll('[data-directory-panel]').forEach(panel => {
        panel.hidden = panel.dataset.directoryPanel !== name;
    });
    const directory = $('arena-directory');
    directory.scrollTop = 0;
    if (name === 'create' && focusPanel) {
        requestAnimationFrame(() => {
            directory.scrollTop = 0;
            $('arena-create-title').focus({ preventScroll: true });
        });
    }
    renderArenaDirectory();
}

function selectArenaContext(name) {
    model.selectedArenaContext = name;
    document.querySelectorAll('[data-arena-context]').forEach(tab => {
        const selected = tab.dataset.arenaContext === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-arena-context-panel]').forEach(panel => {
        panel.hidden = panel.dataset.arenaContextPanel !== name;
    });
}

function renderOffersDirectory() {
    ui.offersTableBody.replaceChildren();
    ui.playersFixtureBadge.hidden = !LOCAL_LOBBY_FIXTURES;
    ui.offersFixtureBanner.dataset.mode = LOCAL_LOBBY_FIXTURES ? 'fixture' : 'unavailable';
    ui.offersStatus.textContent = LOCAL_LOBBY_FIXTURES ? 'Local fixture' : 'Unavailable';
    ui.offersState.textContent = LOCAL_LOBBY_FIXTURES
        ? 'Synthetic visual data · no Join.'
        : 'Public offers are off · no Join yet.';
    if (!LOCAL_LOBBY_FIXTURES) return;

    const fixtures = [
        ['FixtureKnight', '1800', '3+2', 'Casual Blitz'],
        ['FixtureRook', '1500', '10+0', 'Casual Rapid'],
        ['FixtureGuest', '—', '5+0', 'Guest Blitz']
    ];
    fixtures.forEach(values => {
        const row = document.createElement('tr');
        row.dataset.fixture = 'true';
        values.forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
        });
        ui.offersTableBody.append(row);
    });
}

async function loadLobbyPreferences(auth) {
    const epoch = ++model.preferenceEpoch;
    const preferences = await lobbyPreferences.load(auth);
    if (epoch !== model.preferenceEpoch || model.disposed) return;
    model.muteInvitationPopups = preferences.muteInvitationPopups === true;
    ui.muteInvitationPopups.checked = model.muteInvitationPopups;
    renderChallengeNotice(model.state?.challenges || []);
}

async function updateInvitationPreference() {
    model.muteInvitationPopups = ui.muteInvitationPopups.checked;
    renderChallengeNotice(model.state?.challenges || []);
    const saved = await lobbyPreferences.save(model.auth, {
        muteInvitationPopups: model.muteInvitationPopups
    });
    if (!saved) showToast('This preference could not be saved in this browser.');
}

function openSetup(opener) {
    model.setupOpener = opener instanceof HTMLElement ? opener : document.activeElement;
    ui.muteInvitationPopups.checked = model.muteInvitationPopups;
    if (!ui.setupDialog.open) ui.setupDialog.showModal();
}

function closeSetup() {
    const opener = model.setupOpener;
    model.setupOpener = null;
    queueMicrotask(() => opener?.isConnected && opener.focus());
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
    if (!Object.hasOwn(state, 'arena') && model.arena) state = { ...state, arena: model.arena };
    if (!Object.hasOwn(state, 'daily') && model.daily) state = { ...state, daily: model.daily };
    if (!Object.hasOwn(state, 'recurring') && model.recurring) state = { ...state, recurring: model.recurring };
    const priorGame = model.game;
    const previousGameId = priorGame?.id;
    const previousVersion = gameVersion(priorGame);
    const dailyGames = [...(state.daily?.games || []), ...(state.daily?.recentGames || [])];
    const recentPrior = priorGame
        ? state.recentGames?.find?.(game => game.id === priorGame.id)
            || dailyGames.find(game => game.id === priorGame.id)
        : null;
    const retainedCompleted = !state.game && !state.ticket
        && ['completed', 'aborted'].includes(recentPrior?.status) ? recentPrior : null;
    const retainedDaily = priorGame?.pool === 'daily'
        ? dailyGames.find(game => game.id === priorGame.id && game.status === 'active') || null
        : null;
    let nextGame = state.game || state.daily?.game || retainedDaily || retainedCompleted || null;
    let preservePendingPresentation = false;
    let resolvedPendingMove = false;

    if (model.pendingMove && priorGame?.id === model.pendingMove.gameId) {
        const pendingCandidate = state.game?.id === model.pendingMove.gameId
            ? state.game
            : state.daily?.game?.id === model.pendingMove.gameId
                ? state.daily.game
                : state.recentGames?.find?.(game => game.id === model.pendingMove.gameId)
                    || dailyGames.find(game => game.id === model.pendingMove.gameId) || null;
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
    model.arena = state.arena || null;
    model.daily = state.daily || null;
    model.recurring = state.recurring || null;
    configureTournamentPermissions(state.permissions);
    renderArena(model.arena);
    renderDailyGames(model.daily);
    updateReturnToGameControl();
    renderPlayers(state.players || [], state.challenges || []);
    renderChallengeNotice(state.challenges || []);
    renderGames(state.recentGames || []);
    if (model.game) {
        if (!preservePendingPresentation) {
            renderGame(model.game, { animate: !resolvedPendingMove && !staleSameGame && options.animate !== false });
        } else {
            board.setReadOnly(true);
        }
        if (model.game.id !== previousGameId) {
            connectRealtime(model.game.id);
            if (model.game.tournament_id) selectTab('new');
        }
        if (!resolvedPendingMove && gameVersion(model.game) > previousVersion && previousGameId === model.game.id) announceOpponentMove(model.game);
        if (model.game.status === 'aborted' && model.game.termination === 'tournament_deadline'
            && (priorGame?.status !== 'aborted' || priorGame?.termination !== 'tournament_deadline')) {
            showToast('Arena time expired — Game aborted. No points awarded.');
        }
    } else if (state.ticket) renderQueue(state.ticket);
    else renderLobby();
}

function configureTournamentPermissions(permissions) {
    const communityCreator = permissions?.communityTournamentCreator === true;
    const organizer = permissions?.tournamentOrganizer === true;
    const recurringCreator = permissions?.recurringTournamentCreator === true;
    model.communityTournamentCreator = communityCreator;
    model.tournamentOrganizer = organizer;
    model.recurringTournamentCreator = recurringCreator;
    syncTournamentCreationAccess();
    configureTournamentCreateType();
}

function syncTournamentCreationAccess() {
    const creationAvailable = model.config?.capabilities?.tournamentCreation === true
        || model.config?.capabilities?.dailyTournamentCreation === true;
    $('tournament-directory-create').hidden = !creationAvailable;
    if (!creationAvailable && model.selectedDirectoryView === 'create') selectDirectoryView('current');
}

function renderLobby() {
    showView('lobby');
    updateReturnToGameControl();
    renderWorkspaceHeader();
    ui.status.textContent = 'Choose a time control and enter matchmaking.';
    ui.find.disabled = false; ui.find.textContent = 'Start Game';
    ui.curtain.hidden = true;
    board.setPosition(START_FEN, { animate: false }); board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips('idle');
}

function renderQueue(ticket) {
    showView('queue');
    renderWorkspaceHeader();
    ui.status.textContent = 'Looking for a compatible opponent…';
    if (!model.queueStartedAt) model.queueStartedAt = Date.parse(ticket.created_at) || Date.now();
    ui.queueControl.textContent = `${formatTimeControl(ticket)} · ${titleCase(ticket.pool)}`;
    ui.curtain.hidden = false; ui.curtainTitle.textContent = 'Searching';
    ui.curtainCopy.textContent = 'Your place is reserved. You may safely reconnect.';
    board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips('searching');
}

function renderGame(game, options = {}) {
    const completed = ['completed', 'aborted'].includes(game.status);
    showView(completed ? 'result' : 'game');
    model.queueStartedAt = null;
    const color = playerColor(game);
    board.setOrientation(color || 'white');
    board.setPosition(game.fen || START_FEN, { animate: options.animate !== false });
    board.setInteractive(!completed && !!color);
    board.setReadOnly(completed || game.turn !== color || !!model.pendingMove);
    ui.curtain.hidden = true;
    renderWorkspaceHeader();
    ui.status.textContent = game.status === 'aborted' && game.termination === 'tournament_deadline'
        ? 'Arena time expired — Game aborted. No points awarded.'
        : completed ? 'Game over. Review the result or choose what to do next.'
        : game.pool === 'daily' ? `Daily game · ${formatDailyDeadline(game.move_deadline_at)}` : 'Game in progress.';
    renderPlayerStrips(game, color);
    renderMoves(game.moves || []);
    const ours = game.turn === color;
    ui.turnCopy.textContent = completed ? 'Game over' : ours ? 'Your turn' : `${opponentName(game, color)} to move`;
    renderGameActions(game);
    updateReturnToGameControl();
    if (completed) renderResult(game, color);
}

function updateReturnToGameControl() {
    ui.returnToGame.hidden = model.game?.status !== 'active';
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
    if (game.pool === 'daily') {
        ui.topClock.textContent = 'Daily';
        ui.bottomClock.textContent = formatDailyRemaining(game.move_deadline_at);
        ui.top.dataset.running = 'false';
        ui.bottom.dataset.running = 'false';
        return;
    }
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
    if (move && ['completed', 'aborted'].includes(model.game?.status)) button.addEventListener('click', () => {
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
    if (game.status === 'aborted' && game.termination === 'tournament_deadline') {
        ui.resultTitle.textContent = 'Arena time expired';
        ui.resultDetail.textContent = 'Game aborted · No points awarded';
        ui.ratingChange.hidden = true;
        ui.rematch.disabled = true;
        ui.rematch.textContent = 'Arena ended';
        return;
    }
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

function renderDailyGames(daily) {
    const list = $('games-daily-list');
    if (!list || list.hidden) return;
    const games = [...(daily?.games || []), ...(daily?.recentGames || [])];
    list.replaceChildren();
    if (!games.length) {
        const empty = document.createElement('div'); empty.className = 'games-state';
        const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = '▷';
        const kicker = document.createElement('p'); kicker.textContent = 'NO DAILY GAMES';
        const title = document.createElement('h3'); title.textContent = 'Your correspondence board is clear';
        const copy = document.createElement('small'); copy.textContent = 'Join a Daily tournament to receive group pairings.';
        empty.append(icon, kicker, title, copy); list.append(empty); return;
    }
    games.forEach(game => {
        const color = playerColor(game);
        const opponent = color === 'white' ? game.black_display_name : game.white_display_name;
        const active = game.status === 'active';
        const ours = active && game.turn === color;
        const row = document.createElement('button'); row.type = 'button'; row.className = 'daily-game-row';
        const status = document.createElement('span'); status.className = 'daily-game-row__status';
        status.textContent = active ? (ours ? 'YOUR MOVE' : 'OPPONENT MOVE') : (game.result || 'FINISHED');
        const name = document.createElement('strong'); name.textContent = opponent || 'CAISSA player';
        const meta = document.createElement('small');
        const lastMove = game.moves?.at?.(-1)?.san;
        meta.textContent = active
            ? `${formatDailyDeadline(game.move_deadline_at)}${lastMove ? ` · Last move ${lastMove}` : ''}`
            : `${resultLabel(game.termination)} · ${game.result || 'Complete'}`;
        row.append(status, name, meta);
        row.addEventListener('click', () => void openDailyGame(game));
        list.append(row);
    });
}

async function openDailyGame(game) {
    if (!game?.id || model.arenaBusy) return;
    model.arenaBusy = true;
    try {
        const envelope = await api.command('daily.sync', {
            tournamentId: game.tournament_id,
            gameId: game.id
        });
        applyState(envelope.data?.state);
        selectTab('new');
    } catch (error) {
        handleError(error, 'The Daily game could not be opened.');
    } finally {
        model.arenaBusy = false;
    }
}

function formatDailyDeadline(value) {
    const deadline = Date.parse(value || '');
    return Number.isFinite(deadline)
        ? `Due ${new Date(deadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
        : 'Deadline unavailable';
}

function formatDailyRemaining(value) {
    const deadline = Date.parse(value || '');
    if (!Number.isFinite(deadline)) return '—';
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
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
    if (model.muteInvitationPopups) {
        model.challengeNoticeId = null;
        ui.challengeNotice.hidden = true;
        return;
    }
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

async function connectTournamentRealtime(tournamentId) {
    const userId = model.auth?.isSignedIn ? model.auth.userId : null;
    if (!userId || !tournamentId) return disconnectTournamentRealtime();
    const target = `${userId}:${tournamentId}`;
    if (model.tournamentRealtimeId === target) return;
    const epoch = ++model.tournamentRealtimeEpoch;
    const previous = model.tournamentRealtime;
    model.tournamentRealtime = null;
    model.tournamentRealtimeId = target;
    await previous?.close?.();
    if (epoch !== model.tournamentRealtimeEpoch || model.disposed) return;
    const realtime = await createOnlineTournamentRealtime(model.config.realtime, {
        tournamentId,
        getToken: onlineAccessToken,
        isCurrent: () => !model.disposed
            && epoch === model.tournamentRealtimeEpoch
            && model.auth?.userId === userId
            && model.tournamentRealtimeId === target,
        onChange: () => syncState('tournament-realtime'),
        onStatus: status => {
            if (status === 'SUBSCRIBED') setConnection('online', 'Arena live');
            else if (status === 'FALLBACK') setConnection('online', 'Connected');
        }
    });
    if (epoch !== model.tournamentRealtimeEpoch || model.disposed || model.auth?.userId !== userId) {
        await realtime?.close?.();
        return;
    }
    model.tournamentRealtime = realtime;
    if (!realtime) model.tournamentRealtimeId = null;
}

async function disconnectTournamentRealtime() {
    model.tournamentRealtimeEpoch += 1;
    const realtime = model.tournamentRealtime;
    model.tournamentRealtime = null;
    model.tournamentRealtimeId = null;
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

function renderWorkspaceHeader() {
    if (model.accessDeniedCode) {
        ui.title.textContent = 'Access required';
        ui.badge.textContent = 'ACCESS DENIED';
        return;
    }
    const game = model.game;
    const searching = !!model.state?.ticket && !game;
    const runtimeBadge = game?.status === 'completed' ? 'FINAL'
        : game?.status === 'active' ? (game.rated ? 'RATED' : 'CASUAL')
            : searching ? 'SEARCHING' : 'READY';
    let title = 'Find a game';
    if (model.selectedTab === 'games') title = 'Games';
    else if (model.selectedTab === 'lobby') title = 'Lobby';
    else if (model.selectedTab === 'tournaments') title = model.arena?.current?.name || 'Tournaments';
    else if (game?.status === 'completed') title = 'Game complete';
    else if (game?.status === 'active') {
        const color = playerColor(game);
        const rival = color ? opponentName(game, color) : '';
        title = rival ? `Playing ${rival}` : 'Game in progress';
    } else if (searching) title = 'Finding an opponent';
    ui.title.textContent = title;
    ui.badge.textContent = runtimeBadge;
}

function renderUnavailable(copy) {
    setConnection('offline', 'Unavailable'); ui.find.disabled = true; ui.rated.disabled = true;
    renderWorkspaceHeader();
    ui.status.textContent = copy; ui.curtainTitle.textContent = 'Online room closed'; ui.curtainCopy.textContent = copy;
}

function renderSignedOut() {
    clearAccessDenied();
    clearTimeout(model.challengeExpiryTimer);
    model.state = null;
    model.game = null;
    model.pendingMove = null;
    model.signInRedirecting = false;
    model.challengeNoticeId = null;
    updateReturnToGameControl();
    ui.challengeNotice.hidden = true;
    showView('lobby');
    renderWorkspaceHeader();
    setConnection('offline', 'Sign in required');
    ui.find.disabled = false; ui.find.textContent = 'Start Game';
    ui.account.textContent = 'Sign in';
    ui.status.textContent = 'Choose a time control. Sign in when you are ready to play.';
    ui.curtain.hidden = true;
    board.setPosition(START_FEN, { animate: false }); board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips('signed-out');
    updateSignInHref();
    configureCapabilities(model.config?.capabilities || {});
}

function showSignInDialog(opener) {
    if ((model.auth?.isSignedIn && !model.auth?.isGuest) || model.signInRedirecting) return;
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
    if (model.tournamentIntent || model.selectedTab === 'tournaments') {
        return model.tournamentCreateIntent
            ? '/online/tournaments?directory=1&create=1'
            : '/online/tournaments?directory=1';
    }
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
function resultLabel(value) { return ({ checkmate: 'Checkmate', stalemate: 'Stalemate', repetition: 'Threefold repetition', 'insufficient-material': 'Insufficient material', draw: 'Draw', resignation: 'Resignation', agreement: 'Draw agreed', timeout: 'Time expired', tournament_deadline: 'Arena time expired' })[value] || 'Game complete'; }
function announceOpponentMove(game) {
    const move = game.moves?.at(-1);
    if (move && move.color !== playerColor(game)) ui.status.textContent = `${opponentName(game, playerColor(game))} moved ${move.san}.`;
}
function resetPlayerStrips(state = 'idle') {
    const topLabel = state === 'searching' ? 'Waiting for opponent'
        : state === 'signed-out' ? 'Sign in to play'
            : state === 'access-denied' ? 'Private beta access required' : 'Ready to play';
    const selfLabel = model.state?.profile?.display_name || model.auth?.fullName || (model.auth?.isGuest ? 'Guest' : 'You');
    fillEmpty(ui.top, topLabel);
    fillEmpty(ui.bottom, selfLabel);
    ui.topClock.textContent = '—';
    ui.bottomClock.textContent = '—';
}
function fillEmpty(strip, name) { strip.querySelector('.player-name').textContent = name; strip.querySelector('.player-rating').textContent = '—'; strip.querySelector('.player-avatar').textContent = initials(name); strip.dataset.running = 'false'; }
function showBoardError(intent, message) { board.highlightSquares([{ square: intent.from, type: 'error' }, { square: intent.to, type: 'error' }]); showToast(message); setTimeout(() => board.clearHighlights(), 900); }
function messageForError(error) {
    return ({
        AUTH_REQUIRED: 'Sign in to continue.',
        ONLINE_INTERNAL_ONLY: 'Access denied. This account cannot use the isolated beta.',
        ARENA_BETA_NOT_AUTHORIZED: 'Access denied. This account cannot access Arena Season 001.',
        ARENA_MEMBER_ACCOUNT_REQUIRED: 'Sign in with a member account to use tournaments.',
        ARENA_REGISTRATION_NOT_OPEN: 'Registration is not open yet.',
        ARENA_REGISTRATION_CLOSED: 'Registration has closed.',
        ARENA_LATE_JOIN_DISABLED: 'This Arena does not allow joining after it starts.',
        ARENA_COMPLETED: 'This tournament is complete. Results are available.',
        ARENA_FULL: 'This tournament is full.',
        ARENA_100_NOT_ENABLED: 'Events above 64 players are not enabled in this environment.',
        RATED_NOT_ENABLED: 'Rated tournaments are not enabled in this environment.',
        DAILY_FULL: 'This Daily tournament is full.',
        DAILY_REGISTRATION_CLOSED: 'Daily registration has closed.',
        DAILY_NOT_FOUND: 'That Daily tournament is no longer available.',
        DAILY_INVALID: 'Review the Daily start, deadline, capacity and days-per-move settings.',
        INVALID_REGISTRATION_DEADLINE: 'Choose a registration deadline before the tournament starts.',
        ARENA_PARTICIPATION_CONFLICT: 'You are already enrolled in an overlapping tournament.',
        ARENA_CREATION_LIMIT: 'You already have the maximum number of open tournaments.',
        ARENA_CREATION_COOLDOWN: 'Please wait a minute before creating another tournament.',
        ARENA_CREATION_CONFLICT: 'You already organize a tournament during this time.',
        TOURNAMENT_CREATION_DISABLED: 'Community tournament creation is not enabled in this environment.',
        ARENA_ORGANIZER_REQUIRED: 'Only this tournament’s organizer may perform that action.',
        ARENA_NEXT_INVALID_STATE: 'You can request another Arena game only while taking a break.',
        ARENA_MANAGE_INVALID_STATE: 'That organizer action is not available in the current tournament state.',
        ARENA_INVALID: 'Review the tournament name, time, duration, capacity, and time control.',
        RECURRING_NOT_OWNER: 'Only the owner may change this recurring series.',
        RECURRING_SERIES_LIMIT: 'You already have the maximum of five recurring series.',
        RECURRING_CREATION_COOLDOWN: 'Please wait a minute before creating another recurring series.',
        RECURRING_OCCURRENCE_NOT_CANCELLABLE: 'That generated occurrence can no longer be cancelled.',
        RECURRING_INVALID_CONFIGURATION: 'Review the recurrence dates, timezone, frequency and ending condition.',
        RECURRING_RATED_NOT_CERTIFIED: 'Recurring Rated Arena is not certified in this beta.',
        RECURRING_OPERATOR_REQUIRED: 'Recurring tournaments are administered only through the audited CAISSA operator workflow.',
        STALE_VERSION: 'The board changed; it has been synchronized.',
        ILLEGAL_MOVE: 'That move is not legal.',
        NOT_YOUR_TURN: 'Wait for your turn.',
        TIME_EXPIRED: 'The move deadline has expired.',
        RATE_LIMITED: 'Too many requests. Please wait a moment.',
        DRAW_OFFER_REQUIRED: 'There is no draw offer to accept.'
    })[error?.code] || 'The server could not confirm that action.';
}
function isAccessDeniedError(error) { return error instanceof OnlineApiError && ['ONLINE_INTERNAL_ONLY', 'ARENA_BETA_NOT_AUTHORIZED'].includes(error.code); }
function clearAccessDenied() {
    model.accessDeniedCode = null;
    ui.accessDenied.hidden = true;
}
function renderAccessDenied(error) {
    model.accessDeniedCode = error.code;
    model.state = null;
    model.game = null;
    model.arena = null;
    model.pendingMove = null;
    stopPolling();
    void disconnectRealtime();
    void disconnectTournamentRealtime();
    showView('lobby');
    setConnection('offline', 'Access denied');
    renderWorkspaceHeader();
    ui.status.textContent = messageForError(error);
    ui.find.disabled = true;
    ui.find.textContent = 'Access required';
    ui.arenaJoin.disabled = true;
    ui.arenaWithdraw.disabled = true;
    ui.arenaDirectory.hidden = true;
    ui.accessDenied.hidden = false;
    ui.curtain.hidden = false;
    ui.curtainTitle.textContent = 'Private beta access denied';
    ui.curtainCopy.textContent = 'This signed-in Clerk account is not authorized for the isolated Arena beta. Contact the organizer to add its Clerk user ID.';
    board.setPosition(START_FEN, { animate: false });
    board.setReadOnly(true);
    board.setInteractive(false);
    resetPlayerStrips('access-denied');
    showToast(messageForError(error));
}
function handleError(error, fallback) {
    console.warn('CAISSA Online:', error?.code || error?.message);
    if (isAccessDeniedError(error)) return renderAccessDenied(error);
    showToast(error instanceof OnlineApiError ? messageForError(error) : fallback);
}
function showToast(message) { clearTimeout(model.toastTimer); ui.toast.textContent = message; ui.toast.hidden = false; model.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4200); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function dispose() {
    model.disposed = true;
    clearTimeout(model.challengeExpiryTimer);
    clearTimeout(model.directoryDateTimer);
    clearInterval(model.directoryDateMonitor);
    stateSyncQueue.close();
    window.removeEventListener('caissa-auth-change', onAuthEvent);
    stopPolling();
    await disconnectRealtime();
    await disconnectTournamentRealtime();
    model.guestSession?.close?.();
    board.destroy();
}
