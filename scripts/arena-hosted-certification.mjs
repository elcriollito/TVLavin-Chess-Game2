import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.CAISSA_ARENA_BETA_ORIGIN
    || 'https://caissa-arena-s001-beta-isolated.vercel.app';
const BYPASS_SECRET = String(process.env.CAISSA_VERCEL_BYPASS_SECRET || '');
const OTP = String(process.env.CAISSA_CLERK_TEST_OTP || '424242');
const RESUME_TOURNAMENT_ID = String(process.env.CAISSA_ARENA_TOURNAMENT_ID || '');
const SKIP_ROUND_ONE_MOVES = process.env.CAISSA_SKIP_ROUND_ONE_MOVES === '1';
const FINISH_EXISTING_ONLY = process.env.CAISSA_FINISH_EXISTING_ONLY === '1';
const EXPECTED_ISSUER = 'https://cheerful-mantis-9523.clerk.accounts.dev';

if (!BYPASS_SECRET) throw new Error('CAISSA_VERCEL_BYPASS_SECRET is required');

const identities = [
    { label: 'A', email: 'caissa-arena-a+clerk_test@example.com', subject: 'user_3MOMsluQwfjRCC4Y1adevrtqMf2' },
    { label: 'B', email: 'caissa-arena-b+clerk_test@example.com', subject: 'user_3MOMsuoaxWdHmFpf1eUUvWC5uz2' },
    { label: 'C', email: 'caissa-arena-c+clerk_test@example.com', subject: 'user_3MOMt6eYmIbL4XQKIB2zxFnDfQu' },
    { label: 'D', email: 'caissa-arena-d+clerk_test@example.com', subject: 'user_3MOMt5bMNUCL08s83ANtee5cqNr' }
];

const browser = await chromium.launch({ headless: true });
let heartbeatTimer = null;

try {
    await runCertification();
} finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    for (const identity of identities) await identity.context?.close().catch(() => {});
    await browser.close();
}

async function runCertification() {
    await Promise.all(identities.map(identity => establishBrowserIdentity(identity)));
    console.log('HOSTED_AUTH_PASS four distinct AUTH-004D sessions');

    const publicConfig = await publicOnlineConfig();
    assert.equal(publicConfig.rollout, 'internal');
    assert.equal(publicConfig.capabilities.arenaS001, true);
    assert.equal(publicConfig.capabilities.tournamentCreation, true);
    assert.equal(publicConfig.capabilities.rated, false);
    assert.equal(publicConfig.capabilities.guestPlay, false);
    assert.equal(new URL(publicConfig.realtime.url).hostname, 'imtwlzicxaaqjyvrkdsv.supabase.co');
    console.log('HOSTED_CONFIG_PASS isolated backend and beta flags');

    await Promise.all(identities.map(identity => command(identity, 'presence.join')));
    heartbeatTimer = setInterval(() => {
        void Promise.allSettled(identities.map(identity => command(identity, 'presence.join')));
    }, 20_000);

    const requestedStartsAt = new Date(Date.now() + 15_000).toISOString();
    const created = RESUME_TOURNAMENT_ID ? null : await command(identities[0], 'tournament.create', {
        name: `CAISSA Arena S001 Hosted ${new Date().toISOString().slice(11, 19)}`,
        timeControlId: 'bullet-1-0',
        durationMinutes: 5,
        startsAt: requestedStartsAt
    });
    const tournamentId = RESUME_TOURNAMENT_ID || currentTournament(created).id;
    assert.match(tournamentId, /^[0-9a-f-]{36}$/i);

    await Promise.all(identities.map(identity => command(identity, 'tournament.join', { tournamentId })));
    const registered = await Promise.all(identities.map(identity => syncTournament(identity, tournamentId)));
    for (const envelope of registered) {
        assert.equal(currentTournament(envelope).participantCount, 4);
        assert.ok(currentTournament(envelope).myState);
    }
    console.log(`HOSTED_REGISTRATION_PASS tournament=${tournamentId}`);

    if (FINISH_EXISTING_ONLY) {
        if (currentTournament(registered[0]).status === 'completed') {
            console.log(`HOSTED_DEFECT_TOURNAMENT_RECOVERED tournament=${tournamentId} already-completed=true`);
            return;
        }
        const activeGames = new Map();
        for (const envelope of registered) {
            const game = envelope?.data?.state?.game;
            if (game) activeGames.set(game.id, game);
        }
        for (const game of activeGames.values()) {
            if (game.status === 'active') {
                await command(identityForSubject(game.black_clerk_id), 'game.resign', {}, game.id);
            }
        }
        const recoveredStates = await pollTournamentStatus(identities, tournamentId, 'completed');
        const recoveredTournament = currentTournament(recoveredStates[0]);
        console.log(`HOSTED_DEFECT_TOURNAMENT_RECOVERED tournament=${tournamentId} games=${recoveredTournament.standings.reduce((sum, row) => sum + row.gamesPlayed, 0) / 2}`);
        return;
    }

    const startsAt = currentTournament(registered[0]).startsAt;
    await waitUntil(Date.parse(startsAt) + 1_500, 'Arena start');
    const roundOneStates = await pollRound(identities, tournamentId, new Set(), 2);
    const roundOneGames = uniqueCurrentGames(roundOneStates);
    assert.equal(roundOneGames.size, 2);
    assert.equal([...roundOneGames.values()].every(game => game.status === 'active'), true);
    assert.equal(new Set([...roundOneGames.values()].flatMap(game => [game.white_clerk_id, game.black_clerk_id])).size, 4);
    console.log('HOSTED_PAIRING_PASS two simultaneous games and four players');

    const realtimeHandles = [];
    for (const identity of identities) {
        const game = gameForSubject(roundOneGames, identity.subject);
        realtimeHandles.push(await subscribeRealtime(identity, publicConfig.realtime, game.id));
    }
    const unauthorizedIdentity = identities[0];
    const unauthorizedGame = [...roundOneGames.values()].find(game =>
        ![game.white_clerk_id, game.black_clerk_id].includes(unauthorizedIdentity.subject));
    const unauthorizedStatus = await rejectedRealtimeSubscription(
        unauthorizedIdentity,
        publicConfig.realtime,
        unauthorizedGame.id
    );
    assert.notEqual(unauthorizedStatus, 'SUBSCRIBED');
    console.log('HOSTED_REALTIME_RLS_PASS participant topics allowed; cross-game topic denied');

    if (!SKIP_ROUND_ONE_MOVES) {
        await exerciseMovesClocksAndBroadcasts(roundOneGames, realtimeHandles);
    }

    for (const game of roundOneGames.values()) {
        await command(identityForSubject(game.black_clerk_id), 'game.resign', {}, game.id);
    }

    const roundTwoStates = await pollRound(identities, tournamentId, new Set(roundOneGames.keys()), 2);
    const allGamesAfterRepair = uniqueCurrentGames(roundTwoStates);
    const roundTwoGames = new Map([...allGamesAfterRepair].filter(([id]) => !roundOneGames.has(id)));
    assert.equal(roundTwoGames.size, 2);
    for (const game of roundTwoGames.values()) {
        assert.equal(game.status, 'active');
        const firstRound = gameForSubject(roundOneGames, game.white_clerk_id);
        const firstOpponent = firstRound.white_clerk_id === game.white_clerk_id
            ? firstRound.black_clerk_id : firstRound.white_clerk_id;
        const secondOpponent = game.black_clerk_id;
        assert.notEqual(secondOpponent, firstOpponent, 'Immediate Arena rematch was not avoided');
    }
    const standingsAfterOne = currentTournament(roundTwoStates[0]).standings;
    assert.equal(standingsAfterOne.reduce((sum, row) => sum + row.gamesPlayed, 0), 4);
    assert.equal(standingsAfterOne.reduce((sum, row) => sum + row.points, 0), 4);
    console.log('HOSTED_SCORING_REPAIR_PASS 2-1-0 scoring and non-rematch re-pairing');

    if (SKIP_ROUND_ONE_MOVES) {
        const roundTwoRealtimeHandles = [];
        for (const identity of identities) {
            const game = gameForSubject(roundTwoGames, identity.subject);
            roundTwoRealtimeHandles.push(await subscribeRealtime(identity, publicConfig.realtime, game.id));
        }
        await exerciseMovesClocksAndBroadcasts(roundTwoGames, roundTwoRealtimeHandles);
    }

    const reconnectIdentity = identities[0];
    const reconnectGame = gameForSubject(roundTwoGames, reconnectIdentity.subject);
    await reconnectIdentity.context.close();
    reconnectIdentity.context = null;
    reconnectIdentity.page = null;
    await establishBrowserIdentity(reconnectIdentity);
    const recovered = await getState(reconnectIdentity, tournamentId);
    assert.equal(currentTournament(recovered).id, tournamentId);
    assert.equal(currentGame(recovered).id, reconnectGame.id);
    console.log('HOSTED_RECONNECT_PASS new browser context recovered the active pairing');

    if (!SKIP_ROUND_ONE_MOVES) {
        for (const game of roundTwoGames.values()) {
            const white = identityForSubject(game.white_clerk_id);
            const moved = await command(white, 'game.move', {
                from: 'd2', to: 'd4', expectedVersion: game.version
            }, game.id);
            assert.equal(moved.eventType, 'game.moveAccepted');
        }
    }

    const endsAt = Date.parse(currentTournament(roundTwoStates[0]).endsAt);
    await waitUntil(endsAt + 1_500, 'Arena end');
    const finishingStates = await Promise.all(identities.map(identity => syncTournament(identity, tournamentId)));
    assert.equal(currentTournament(finishingStates[0]).status, 'finishing');

    const finalActiveGames = new Map();
    for (const envelope of finishingStates) {
        const game = envelope?.data?.state?.game;
        if (game?.status === 'active') finalActiveGames.set(game.id, game);
    }
    for (const game of finalActiveGames.values()) {
        await command(identityForSubject(game.black_clerk_id), 'game.resign', {}, game.id);
    }

    const completedStates = await pollTournamentStatus(identities, tournamentId, 'completed');
    const final = currentTournament(completedStates[0]);
    assert.equal(final.standings.length, 4);
    assert.deepEqual(final.standings.map(row => row.rank), [1, 2, 3, 4]);
    assert.ok(final.standings.every(row => row.gamesPlayed >= 2));
    assert.equal(final.standings.reduce((sum, row) => sum + row.gamesPlayed, 0) % 2, 0);
    assert.equal(final.games.every(game => game.status === 'completed'), true);
    console.log(`HOSTED_COMPLETION_PASS final standings locked after ${final.standings.reduce((sum, row) => sum + row.gamesPlayed, 0) / 2} completed games`);

    const evidence = {
        status: 'pass',
        origin: ORIGIN,
        tournamentId,
        identities: identities.map(identity => ({ label: identity.label, subject: identity.subject })),
        roundOneGameIds: [...roundOneGames.keys()],
        roundTwoGameIds: [...roundTwoGames.keys()],
        finalStandings: final.standings.map(row => ({
            rank: row.rank,
            subject: row.clerkId,
            gamesPlayed: row.gamesPlayed,
            points: row.points
        }))
    };
    console.log(`CAISSA_ARENA_HOSTED_CERTIFICATION ${JSON.stringify(evidence)}`);
}

async function establishBrowserIdentity(identity) {
    identity.context = await browser.newContext();
    identity.page = await identity.context.newPage();
    const bypassUrl = `${ORIGIN}/?x-vercel-protection-bypass=${encodeURIComponent(BYPASS_SECRET)}`
        + '&x-vercel-set-bypass-cookie=true';
    await identity.page.goto(bypassUrl, { waitUntil: 'domcontentloaded' });
    await identity.page.goto(`${ORIGIN}/signin?redirect_url=%2Fonline`, { waitUntil: 'domcontentloaded' });
    await identity.page.waitForFunction(() => window.Clerk?.client?.signIn, null, { timeout: 30_000 });

    const auth = await identity.page.evaluate(async ({ email, otp }) => {
        const clerk = window.Clerk;
        if (clerk.user) await clerk.signOut();
        let attempt = await clerk.client.signIn.create({ identifier: email });
        if (attempt.status === 'needs_first_factor') {
            const factor = attempt.supportedFirstFactors.find(item => item.strategy === 'email_code');
            if (!factor) throw new Error('EMAIL_CODE_FACTOR_UNAVAILABLE');
            await attempt.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: factor.emailAddressId
            });
            attempt = await attempt.attemptFirstFactor({ strategy: 'email_code', code: otp });
        }
        if (attempt.status !== 'complete' || !attempt.createdSessionId) {
            throw new Error(`CLERK_SIGN_IN_INCOMPLETE:${attempt.status}`);
        }
        await clerk.setActive({ session: attempt.createdSessionId });
        const token = await clerk.session.getToken();
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return { subject: clerk.user?.id, issuer: payload.iss, role: payload.role, azp: payload.azp };
    }, { email: identity.email, otp: OTP });

    assert.equal(auth.subject, identity.subject);
    assert.equal(auth.issuer, EXPECTED_ISSUER);
    assert.equal(auth.role, 'authenticated');
    assert.equal(auth.azp, ORIGIN);

    await identity.page.goto(`${ORIGIN}/auth/complete?redirect_url=%2Fonline`, { waitUntil: 'domcontentloaded' });
    await identity.page.waitForURL(url => url.origin === ORIGIN && url.pathname === '/online', { timeout: 30_000 });
    await identity.page.waitForFunction(() => window.CAISSA_AUTH?.isSignedIn === true, null, { timeout: 30_000 });
}

async function publicOnlineConfig() {
    const response = await protectedFetch('/api/online?action=config');
    assert.equal(response.status, 200);
    return response.json();
}

async function command(identity, eventType, payload = {}, gameId = null) {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const eventId = `${eventType.replaceAll('.', '-')}:${crypto.randomUUID()}`;
    const response = await protectedFetch('/api/online', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Origin: ORIGIN,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            protocolVersion: '1.0.0', eventType, eventId, gameId,
            clientSentAt: Date.now(), payload
        })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${eventType}:${response.status}:${body.code || body.eventType || 'UNKNOWN'}`);
    return body;
}

async function getState(identity, tournamentId = null) {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const query = new URLSearchParams({ action: 'state' });
    if (tournamentId) query.set('tournamentId', tournamentId);
    const response = await protectedFetch(`/api/online?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`state:${response.status}:${body.code || 'UNKNOWN'}`);
    return body;
}

async function protectedFetch(pathname, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('x-vercel-protection-bypass', BYPASS_SECRET);
    return fetch(new URL(pathname, ORIGIN), { ...options, headers, redirect: 'error' });
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
    const identity = identities.find(candidate => candidate.subject === subject);
    assert.ok(identity, `Unknown hosted identity ${subject}`);
    return identity;
}

async function pollRound(players, tournamentId, excludedGameIds, expectedGames) {
    const deadline = Date.now() + 30_000;
    let states = [];
    while (Date.now() < deadline) {
        states = await Promise.all(players.map(identity => syncTournament(identity, tournamentId)));
        const games = uniqueCurrentGames(states);
        const fresh = [...games.keys()].filter(id => !excludedGameIds.has(id));
        if (fresh.length === expectedGames) return states;
        await delay(500);
    }
    throw new Error(`PAIRING_TIMEOUT:${expectedGames}`);
}

async function pollTournamentStatus(players, tournamentId, expectedStatus) {
    const deadline = Date.now() + 30_000;
    let states = [];
    while (Date.now() < deadline) {
        states = await Promise.all(players.map(identity => syncTournament(identity, tournamentId)));
        if (states.every(envelope => currentTournament(envelope).status === expectedStatus)) return states;
        await delay(500);
    }
    throw new Error(`TOURNAMENT_STATUS_TIMEOUT:${expectedStatus}`);
}

async function subscribeRealtime(identity, realtime, gameId) {
    await identity.page.evaluate(async ({ realtimeConfig, targetGameId }) => {
        window.__CAISSA_CERT_REALTIME_EVENTS__ = [];
        window.__CAISSA_CERT_REALTIME_STATUSES__ = [];
        const module = await import(`/js/online/online-realtime.js?cert=${Date.now()}`);
        window.__CAISSA_CERT_REALTIME__ = await module.createOnlineRealtime(realtimeConfig, {
            gameId: targetGameId,
            getToken: () => window.Clerk.session.getToken(),
            onChange: message => window.__CAISSA_CERT_REALTIME_EVENTS__.push(message),
            onStatus: status => window.__CAISSA_CERT_REALTIME_STATUSES__.push(status)
        });
    }, { realtimeConfig: realtime, targetGameId: gameId });
    await identity.page.waitForFunction(
        () => window.__CAISSA_CERT_REALTIME_STATUSES__?.includes('SUBSCRIBED'),
        null,
        { timeout: 15_000 }
    );
    return { identity, gameId };
}

async function rejectedRealtimeSubscription(identity, realtime, gameId) {
    await identity.page.evaluate(async ({ realtimeConfig, targetGameId }) => {
        window.__CAISSA_CERT_DENIED_STATUSES__ = [];
        const module = await import(`/js/online/online-realtime.js?denied=${Date.now()}`);
        window.__CAISSA_CERT_DENIED_REALTIME__ = await module.createOnlineRealtime(realtimeConfig, {
            gameId: targetGameId,
            getToken: () => window.Clerk.session.getToken(),
            onStatus: status => window.__CAISSA_CERT_DENIED_STATUSES__.push(status)
        });
    }, { realtimeConfig: realtime, targetGameId: gameId });
    await identity.page.waitForFunction(() => {
        const statuses = window.__CAISSA_CERT_DENIED_STATUSES__ || [];
        return statuses.includes('SUBSCRIBED') || statuses.includes('CHANNEL_ERROR') || statuses.includes('TIMED_OUT');
    }, null, { timeout: 15_000 });
    return identity.page.evaluate(() => window.__CAISSA_CERT_DENIED_STATUSES__.at(-1));
}

async function exerciseMovesClocksAndBroadcasts(games, realtimeHandles) {
    for (const game of games.values()) {
        const white = identityForSubject(game.white_clerk_id);
        const black = identityForSubject(game.black_clerk_id);
        await delay(1_250);
        const whiteMove = await command(white, 'game.move', {
            from: 'e2', to: 'e4', expectedVersion: game.version
        }, game.id);
        const afterWhite = currentGame(whiteMove);
        assert.equal(whiteMove.eventType, 'game.moveAccepted');
        assert.equal(afterWhite.version, game.version + 1);
        assert.ok(afterWhite.white_time_ms < game.white_time_ms, 'White clock did not decrease');

        await delay(1_250);
        const blackMove = await command(black, 'game.move', {
            from: 'e7', to: 'e5', expectedVersion: afterWhite.version
        }, game.id);
        const afterBlack = currentGame(blackMove);
        assert.equal(blackMove.eventType, 'game.moveAccepted');
        assert.equal(afterBlack.version, afterWhite.version + 1);
        assert.ok(afterBlack.black_time_ms < game.black_time_ms, 'Black clock did not decrease');
    }

    await delay(1_000);
    for (const handle of realtimeHandles) {
        const eventCount = await handle.identity.page.evaluate(() => window.__CAISSA_CERT_REALTIME_EVENTS__?.length || 0);
        assert.ok(eventCount >= 1, `${handle.identity.label} did not receive a private game invalidation`);
    }
    console.log('HOSTED_MOVES_CLOCKS_PASS legal moves, versioning, clocks, and broadcasts');
}

async function waitUntil(epochMs, label) {
    while (Date.now() < epochMs) {
        const remaining = Math.max(0, epochMs - Date.now());
        console.log(`HOSTED_WAIT ${label} ${Math.ceil(remaining / 1000)}s`);
        await delay(Math.min(30_000, remaining));
    }
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
