import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.CAISSA_ARENA_BETA_ORIGIN
    || 'https://caissa-arena-s001-beta-isolated.vercel.app';
const OTP = String(process.env.CAISSA_CLERK_TEST_OTP || '424242');
const EXPECTED_ISSUER = 'https://cheerful-mantis-9523.clerk.accounts.dev';
const CERT_TOURNAMENT_ID = String(process.env.CAISSA_CERT_TOURNAMENT_ID || '');
const HUMAN_TOURNAMENT_ID = String(process.env.CAISSA_HUMAN_TOURNAMENT_ID || '');
const EXPECTED_SOURCE_HEAD = String(process.env.CAISSA_EXPECTED_SOURCE_HEAD || 'verified externally');
const OWNER = {
    label: 'OWNER',
    email: 'chess2u@gmail.com',
    subject: 'user_3LI0jbMHgYevJkNfY8dK6tUnoYu'
};
const runId = String(process.env.CAISSA_CERT_RUN_ID || Date.now().toString(36)).toLowerCase();
const players = ['A', 'B', 'C', 'D'].map(label => ({
    label,
    email: `caissa-public-${runId}-${label.toLowerCase()}+clerk_test@example.com`
}));

const browser = await chromium.launch({ headless: true });
let heartbeatTimer = null;

try {
    await certifyPublicBeta();
} finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    for (const identity of [OWNER, ...players]) await identity.context?.close().catch(() => {});
    await browser.close();
}

async function certifyPublicBeta() {
    const unauthenticated = await fetch(`${ORIGIN}/api/online?action=state`, {
        headers: { Origin: ORIGIN }, redirect: 'error'
    });
    assert.equal(unauthenticated.status, 401);

    const publicConfigResponse = await fetch(`${ORIGIN}/api/online?action=config`, { redirect: 'error' });
    assert.equal(publicConfigResponse.status, 200);
    const publicConfig = await publicConfigResponse.json();
    assert.equal(publicConfig.rollout, 'preview');
    assert.equal(publicConfig.capabilities.arenaS001, true);
    assert.equal(publicConfig.capabilities.tournamentCreation, true);
    assert.equal(publicConfig.capabilities.rated, false);
    assert.equal(publicConfig.capabilities.publicTournamentDirectory, false);
    assert.equal(new URL(publicConfig.realtime.url).hostname, 'imtwlzicxaaqjyvrkdsv.supabase.co');
    console.log('PUBLIC_BETA_CONFIG_PASS preview, member-only directory, isolated backend');

    await Promise.all(players.map(registerNewIdentity));
    assert.equal(new Set(players.map(player => player.subject)).size, 4);
    assert.ok(players.every(player => player.subject && player.subject !== OWNER.subject));
    console.log(`PUBLIC_SIGNUP_PASS ${players.map(player => `${player.label}:${player.subject}`).join(' ')}`);

    if (!CERT_TOURNAMENT_ID || !HUMAN_TOURNAMENT_ID) await establishSignIn(OWNER);
    const activeIdentities = OWNER.page ? [OWNER, ...players] : players;
    await Promise.all(activeIdentities.map(identity => command(identity, 'presence.join')));
    heartbeatTimer = setInterval(() => {
        void Promise.allSettled(activeIdentities.map(identity => command(identity, 'presence.join')));
    }, 20_000);

    const denied = await rawCommand(players[0], 'tournament.create', {
        name: 'Unauthorized public beta creation',
        timeControlId: 'blitz-3-2', durationMinutes: 5,
        startsAt: new Date(Date.now() + 60_000).toISOString()
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.body.code, 'ARENA_ORGANIZER_REQUIRED');
    console.log('PUBLIC_ADMIN_DENIAL_PASS non-owner tournament creation rejected');

    let certificationName;
    let startsAt;
    let tournamentId;
    if (CERT_TOURNAMENT_ID) {
        const existing = currentTournament(await syncTournament(players[0], CERT_TOURNAMENT_ID));
        certificationName = existing.name;
        startsAt = existing.startsAt;
        tournamentId = existing.id;
    } else {
        startsAt = new Date(Date.now() + 30_000).toISOString();
        certificationName = `CAISSA Public Access Certification ${runId}`;
        const created = await command(OWNER, 'tournament.create', {
            name: certificationName,
            timeControlId: 'blitz-3-2',
            durationMinutes: 5,
            startsAt
        });
        tournamentId = currentTournament(created).id;
    }

    await Promise.all(players.map(player => joinThroughBrowser(player, certificationName)));
    let states = await Promise.all(players.map(player => getState(player, tournamentId)));
    assert.ok(states.every(envelope => currentTournament(envelope).participantCount === 4));
    console.log(`PUBLIC_JOIN_BUTTON_PASS tournament=${tournamentId} participantCount=4`);

    await command(players[0], 'tournament.withdraw', { tournamentId });
    const afterWithdraw = await getState(players[1], tournamentId);
    assert.equal(currentTournament(afterWithdraw).participantCount, 3);
    await players[0].page.reload({ waitUntil: 'domcontentloaded' });
    await waitForSignedIn(players[0]);
    await joinThroughBrowser(players[0], certificationName);
    await players[0].page.reload({ waitUntil: 'domcontentloaded' });
    await waitForSignedIn(players[0]);
    const persisted = await getState(players[0], tournamentId);
    assert.equal(currentTournament(persisted).participantCount, 4);
    assert.notEqual(currentTournament(persisted).myState, 'withdrawn');
    console.log('PUBLIC_MEMBERSHIP_PERSISTENCE_PASS withdraw, rejoin, refresh');

    await waitUntil(Date.parse(startsAt) + 1_500, 'certification Arena start');
    states = await pollRound(players, tournamentId, new Set(), 2);
    const roundOneGames = uniqueCurrentGames(states);
    assert.equal(roundOneGames.size, 2);
    assert.equal(new Set([...roundOneGames.values()]
        .flatMap(game => [game.white_clerk_id, game.black_clerk_id])).size, 4);
    console.log('PUBLIC_PAIRING_PASS two simultaneous 3+2 games');

    const realtimeHandles = [];
    for (const player of players) {
        const game = gameForSubject(roundOneGames, player.subject);
        realtimeHandles.push(await subscribeRealtime(player, publicConfig.realtime, game.id));
    }
    const otherGame = [...roundOneGames.values()].find(game =>
        ![game.white_clerk_id, game.black_clerk_id].includes(players[0].subject));
    const deniedRealtime = await rejectedRealtimeSubscription(players[0], publicConfig.realtime, otherGame.id);
    assert.notEqual(deniedRealtime, 'SUBSCRIBED');
    console.log('PUBLIC_REALTIME_RLS_PASS own game subscribed; other game denied');

    await exerciseMovesClocksAndBroadcasts(roundOneGames, realtimeHandles);

    const reconnectPlayer = players[0];
    const reconnectGame = gameForSubject(roundOneGames, reconnectPlayer.subject);
    await reconnectPlayer.context.close();
    reconnectPlayer.context = null;
    reconnectPlayer.page = null;
    await establishSignIn(reconnectPlayer);
    const recovered = await getState(reconnectPlayer, tournamentId);
    assert.equal(currentGame(recovered).id, reconnectGame.id);
    assert.equal(currentTournament(recovered).id, tournamentId);
    console.log('PUBLIC_RECONNECT_PASS fresh browser context recovered game and Arena');

    for (const game of roundOneGames.values()) {
        await command(identityForSubject(game.black_clerk_id), 'game.resign', {}, game.id);
    }
    const roundTwoStates = await pollRound(players, tournamentId, new Set(roundOneGames.keys()), 2);
    const allRoundGames = uniqueCurrentGames(roundTwoStates);
    const roundTwoGames = new Map([...allRoundGames].filter(([id]) => !roundOneGames.has(id)));
    assert.equal(roundTwoGames.size, 2);
    const standings = currentTournament(roundTwoStates[0]).standings;
    assert.equal(standings.reduce((sum, row) => sum + row.gamesPlayed, 0), 4);
    assert.equal(standings.reduce((sum, row) => sum + row.points, 0), 4);
    console.log('PUBLIC_SCORING_REPAIR_PASS 2-1-0 scoring and re-pairing');

    for (const game of roundTwoGames.values()) {
        await command(identityForSubject(game.black_clerk_id), 'game.resign', {}, game.id);
    }

    const endsAt = Date.parse(currentTournament(roundTwoStates[0]).endsAt);
    await waitUntil(endsAt + 1_500, 'certification Arena end');
    const finishing = await Promise.all(players.map(player => syncTournament(player, tournamentId)));
    const active = new Map();
    for (const envelope of finishing) {
        const game = envelope?.data?.state?.game;
        if (game?.status === 'active') active.set(game.id, game);
    }
    for (const game of active.values()) {
        await command(identityForSubject(game.black_clerk_id), 'game.resign', {}, game.id);
    }
    const completed = await pollTournamentStatus(players, tournamentId, 'completed');
    assert.equal(currentTournament(completed[0]).standings.length, 4);
    console.log('PUBLIC_CERTIFICATION_COMPLETION_PASS standings locked');

    let human;
    if (HUMAN_TOURNAMENT_ID) {
        human = currentTournament(await syncTournament(players[0], HUMAN_TOURNAMENT_ID));
    } else {
        const humanStartsAt = process.env.CAISSA_HUMAN_QA_STARTS_AT || defaultHumanQaStart();
        const humanName = `CAISSA Arena S001 - Human QA ${humanStartsAt.slice(0, 10)}`;
        human = currentTournament(await command(OWNER, 'tournament.create', {
            name: humanName,
            timeControlId: 'blitz-3-2',
            durationMinutes: 180,
            startsAt: humanStartsAt
        }));
    }
    assert.equal(human.rated, false);
    assert.equal(human.baseMs, 180_000);
    assert.equal(human.incrementMs, 2_000);
    assert.equal(human.participantCount, 0);
    assert.ok(['registration_open', 'scheduled'].includes(human.status));

    const discoverable = await getState(players[0]);
    const listed = discoverable.data.state.arena.tournaments.find(item => item.id === human.id);
    assert.ok(listed);
    assert.equal(listed.participantCount, 0);
    console.log(`HUMAN_QA_TOURNAMENT_READY id=${human.id} startsAt=${human.startsAt} endsAt=${human.endsAt}`);
    console.log(`PUBLIC_BETA_CERTIFICATION ${JSON.stringify({
        status: 'pass', origin: ORIGIN, sourceHead: EXPECTED_SOURCE_HEAD,
        certificationTournamentId: tournamentId,
        humanQaTournament: { id: human.id, name: human.name, startsAt: human.startsAt, endsAt: human.endsAt },
        owner: OWNER.subject,
        players: players.map(player => ({ label: player.label, subject: player.subject, email: player.email }))
    })}`);
}

async function registerNewIdentity(identity) {
    identity.password = `Aa1!${crypto.randomBytes(18).toString('base64url')}`;
    identity.context = await browser.newContext();
    identity.page = await identity.context.newPage();
    await identity.page.goto(`${ORIGIN}/signup?redirect_url=%2Fonline`, { waitUntil: 'domcontentloaded' });
    await identity.page.waitForFunction(() => window.Clerk?.client?.signUp, null, { timeout: 30_000 });
    const auth = await identity.page.evaluate(async ({ email, password, otp }) => {
        const clerk = window.Clerk;
        if (clerk.user) await clerk.signOut();
        let attempt = await clerk.client.signUp.create({ emailAddress: email, password, legalAccepted: true });
        if (attempt.status !== 'complete') {
            await attempt.prepareEmailAddressVerification({ strategy: 'email_code' });
            attempt = await attempt.attemptEmailAddressVerification({ code: otp });
        }
        if (attempt.status !== 'complete' || !attempt.createdSessionId) {
            throw new Error(`CLERK_SIGN_UP_INCOMPLETE:${attempt.status}`);
        }
        await clerk.setActive({ session: attempt.createdSessionId });
        const token = await clerk.session.getToken();
        const payload = decodeJwtPayload(token);
        return { subject: clerk.user?.id, issuer: payload.iss, role: payload.role, azp: payload.azp };
    }, { email: identity.email, password: identity.password, otp: OTP });
    identity.subject = auth.subject;
    assert.equal(auth.issuer, EXPECTED_ISSUER);
    assert.equal(auth.role, 'authenticated');
    assert.equal(auth.azp, ORIGIN);
    await completeLocalAccount(identity);
}

async function establishSignIn(identity) {
    identity.context = await browser.newContext();
    identity.page = await identity.context.newPage();
    await identity.page.goto(`${ORIGIN}/signin?redirect_url=%2Fonline`, { waitUntil: 'domcontentloaded' });
    await identity.page.waitForFunction(() => window.Clerk?.client?.signIn, null, { timeout: 30_000 });
    const auth = await identity.page.evaluate(async ({ email, otp }) => {
        const clerk = window.Clerk;
        if (clerk.user) await clerk.signOut();
        let attempt = await clerk.client.signIn.create({ identifier: email });
        if (attempt.status === 'needs_first_factor') {
            const factor = attempt.supportedFirstFactors.find(item => item.strategy === 'email_code');
            if (!factor) throw new Error('EMAIL_CODE_FACTOR_UNAVAILABLE');
            await attempt.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
            attempt = await attempt.attemptFirstFactor({ strategy: 'email_code', code: otp });
        }
        if (attempt.status !== 'complete' || !attempt.createdSessionId) {
            throw new Error(`CLERK_SIGN_IN_INCOMPLETE:${attempt.status}`);
        }
        await clerk.setActive({ session: attempt.createdSessionId });
        const token = await clerk.session.getToken();
        const payload = decodeJwtPayload(token);
        return { subject: clerk.user?.id, issuer: payload.iss, role: payload.role, azp: payload.azp };
    }, { email: identity.email, otp: OTP });
    assert.equal(auth.subject, identity.subject);
    assert.equal(auth.issuer, EXPECTED_ISSUER);
    assert.equal(auth.role, 'authenticated');
    assert.equal(auth.azp, ORIGIN);
    await completeLocalAccount(identity);
}

async function completeLocalAccount(identity) {
    await identity.page.goto(`${ORIGIN}/auth/complete?redirect_url=%2Fonline`, { waitUntil: 'domcontentloaded' });
    await identity.page.waitForURL(url => url.origin === ORIGIN && url.pathname === '/online', { timeout: 30_000 });
    await waitForSignedIn(identity);
}

async function waitForSignedIn(identity) {
    await identity.page.waitForFunction(() => window.CAISSA_AUTH?.isSignedIn === true, null, { timeout: 30_000 });
}

async function joinThroughBrowser(identity, tournamentName) {
    if (new URL(identity.page.url()).pathname !== '/online') {
        await identity.page.goto(`${ORIGIN}/online`, { waitUntil: 'domcontentloaded' });
        await waitForSignedIn(identity);
    }
    await identity.page.locator('#lobby-tab-tournaments').click();
    const card = identity.page.locator('.arena-card').filter({ hasText: tournamentName });
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    await card.getByRole('button', { name: /Join \/ View|View/ }).click();
    await identity.page.locator('#arena-detail-name').filter({ hasText: tournamentName })
        .waitFor({ state: 'visible', timeout: 15_000 });
    const join = identity.page.locator('#arena-join');
    await join.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await join.isDisabled(), false);
    await join.click();
    await identity.page.waitForFunction(() => {
        const button = document.getElementById('arena-withdraw');
        return button && !button.hidden;
    }, null, { timeout: 15_000 });
}

async function rawCommand(identity, eventType, payload = {}, gameId = null) {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const response = await fetch(`${ORIGIN}/api/online`, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            protocolVersion: '1.0.0', eventType,
            eventId: `${eventType.replaceAll('.', '-')}:${crypto.randomUUID()}`,
            gameId, clientSentAt: Date.now(), payload
        })
    });
    return { response, body: await response.json() };
}

async function command(identity, eventType, payload = {}, gameId = null) {
    const result = await rawCommand(identity, eventType, payload, gameId);
    if (!result.response.ok) {
        throw new Error(`${eventType}:${result.response.status}:${result.body.code || result.body.eventType || 'UNKNOWN'}`);
    }
    return result.body;
}

async function getState(identity, tournamentId = null) {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const query = new URLSearchParams({ action: 'state' });
    if (tournamentId) query.set('tournamentId', tournamentId);
    const response = await fetch(`${ORIGIN}/api/online?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN }, redirect: 'error'
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`state:${response.status}:${body.code || 'UNKNOWN'}`);
    return body;
}

function syncTournament(identity, tournamentId) {
    return command(identity, 'tournament.sync', { tournamentId });
}

function currentTournament(envelope) {
    const tournament = envelope?.data?.state?.arena?.current;
    assert.ok(tournament, 'Tournament snapshot is missing');
    return tournament;
}

function currentGame(envelope) {
    const game = envelope?.data?.state?.game;
    assert.ok(game, 'Game snapshot is missing');
    return game;
}

function uniqueCurrentGames(states) {
    const games = new Map();
    for (const envelope of states) {
        const game = currentGame(envelope);
        games.set(game.id, game);
    }
    return games;
}

function gameForSubject(games, subject) {
    const game = [...games.values()].find(candidate =>
        [candidate.white_clerk_id, candidate.black_clerk_id].includes(subject));
    assert.ok(game, `No active game found for ${subject}`);
    return game;
}

function identityForSubject(subject) {
    const identity = players.find(candidate => candidate.subject === subject);
    assert.ok(identity, `Unknown hosted identity ${subject}`);
    return identity;
}

async function pollRound(identities, tournamentId, excludedGameIds, expectedGames) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const states = await Promise.all(identities.map(identity => syncTournament(identity, tournamentId)));
        const games = uniqueCurrentGames(states);
        const fresh = [...games.keys()].filter(id => !excludedGameIds.has(id));
        if (fresh.length === expectedGames) return states;
        await delay(500);
    }
    throw new Error(`PAIRING_TIMEOUT:${expectedGames}`);
}

async function pollTournamentStatus(identities, tournamentId, expectedStatus) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const states = await Promise.all(identities.map(identity => syncTournament(identity, tournamentId)));
        if (states.every(envelope => currentTournament(envelope).status === expectedStatus)) return states;
        await delay(500);
    }
    throw new Error(`TOURNAMENT_STATUS_TIMEOUT:${expectedStatus}`);
}

async function subscribeRealtime(identity, realtime, gameId) {
    await identity.page.evaluate(async ({ realtimeConfig, targetGameId }) => {
        window.__CAISSA_PUBLIC_CERT_EVENTS__ = [];
        window.__CAISSA_PUBLIC_CERT_STATUSES__ = [];
        const module = await import(`/js/online/online-realtime.js?public-cert=${Date.now()}`);
        window.__CAISSA_PUBLIC_CERT_REALTIME__ = await module.createOnlineRealtime(realtimeConfig, {
            gameId: targetGameId,
            getToken: () => window.Clerk.session.getToken(),
            onChange: event => window.__CAISSA_PUBLIC_CERT_EVENTS__.push(event),
            onStatus: status => window.__CAISSA_PUBLIC_CERT_STATUSES__.push(status)
        });
    }, { realtimeConfig: realtime, targetGameId: gameId });
    await identity.page.waitForFunction(
        () => window.__CAISSA_PUBLIC_CERT_STATUSES__?.includes('SUBSCRIBED'),
        null, { timeout: 15_000 }
    );
    return { identity, gameId };
}

async function rejectedRealtimeSubscription(identity, realtime, gameId) {
    await identity.page.evaluate(async ({ realtimeConfig, targetGameId }) => {
        window.__CAISSA_PUBLIC_CERT_DENIED__ = [];
        const module = await import(`/js/online/online-realtime.js?public-denied=${Date.now()}`);
        window.__CAISSA_PUBLIC_CERT_DENIED_REALTIME__ = await module.createOnlineRealtime(realtimeConfig, {
            gameId: targetGameId,
            getToken: () => window.Clerk.session.getToken(),
            onStatus: status => window.__CAISSA_PUBLIC_CERT_DENIED__.push(status)
        });
    }, { realtimeConfig: realtime, targetGameId: gameId });
    await identity.page.waitForFunction(() => {
        const statuses = window.__CAISSA_PUBLIC_CERT_DENIED__ || [];
        return statuses.some(status => ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status));
    }, null, { timeout: 15_000 });
    return identity.page.evaluate(() => window.__CAISSA_PUBLIC_CERT_DENIED__.at(-1));
}

async function exerciseMovesClocksAndBroadcasts(games, handles) {
    for (const game of games.values()) {
        const white = identityForSubject(game.white_clerk_id);
        const black = identityForSubject(game.black_clerk_id);
        await delay(1_250);
        const whiteMove = await command(white, 'game.move', {
            from: 'e2', to: 'e4', expectedVersion: game.version
        }, game.id);
        const afterWhite = currentGame(whiteMove);
        assert.ok(afterWhite.white_time_ms < game.white_time_ms);
        await delay(1_250);
        const blackMove = await command(black, 'game.move', {
            from: 'e7', to: 'e5', expectedVersion: afterWhite.version
        }, game.id);
        assert.ok(currentGame(blackMove).black_time_ms < game.black_time_ms);
    }
    await delay(1_000);
    for (const handle of handles) {
        const count = await handle.identity.page.evaluate(() => window.__CAISSA_PUBLIC_CERT_EVENTS__?.length || 0);
        assert.ok(count >= 1, `${handle.identity.label} did not receive a private invalidation`);
    }
    console.log('PUBLIC_MOVES_CLOCKS_PASS legal moves, clocks, versions, broadcasts');
}

async function waitUntil(epochMs, label) {
    while (Date.now() < epochMs) {
        const remaining = Math.max(0, epochMs - Date.now());
        console.log(`PUBLIC_WAIT ${label} ${Math.ceil(remaining / 1000)}s`);
        await delay(Math.min(30_000, remaining));
    }
}

function defaultHumanQaStart() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0, 0));
    if (start.getTime() < now.getTime() + (2 * 60 * 60 * 1000)) start.setUTCDate(start.getUTCDate() + 1);
    return start.toISOString();
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
