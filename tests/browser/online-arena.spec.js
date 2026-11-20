import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const tournamentId = '22222222-2222-4222-8222-222222222222';
const gameId = '33333333-3333-4333-8333-333333333333';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    const tournament = tournamentFixture();
    const harness = {
        commands: [],
        state: {
            profile: { display_name: 'Founder A' }, ticket: null, game: null,
            recentGames: [], players: [], challenges: [],
            arena: { tournaments: [directoryTournament(tournament)], current: null }
        }
    };
    harnesses.set(page, harness);
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'founder_a',fullName:'Founder A',email:'founder@example.test',getToken:async()=> 'arena-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: {
                protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
                capabilities: {
                    matchmaking: true, rated: false, tournaments: true, arenaS001: true,
                    tournamentCreation: false, publicTournamentDirectory: false
                }, realtime: null
            } });
        }
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            harness.commands.push(command);
            if (command.eventType === 'tournament.sync') {
                harness.state = {
                    ...harness.state,
                    arena: { tournaments: harness.state.arena.tournaments, current: tournamentFixture() }
                };
            } else if (command.eventType === 'tournament.join') {
                const current = { ...tournamentFixture(), myState: 'registered', standings: standingsFixture() };
                harness.state = {
                    ...harness.state,
                    arena: { tournaments: [{ ...directoryTournament(current), joined: true, myState: 'registered' }], current }
                };
            } else if (command.eventType === 'tournament.withdraw') {
                const current = { ...harness.state.arena.current, myState: 'withdrawn' };
                harness.state = {
                    ...harness.state,
                    arena: { tournaments: [{ ...directoryTournament(current), joined: false, myState: 'withdrawn' }], current }
                };
            }
        }
        return route.fulfill({ json: {
            protocolVersion: '1.0.0', eventType: 'tournament.snapshot',
            serverTimestamp: new Date().toISOString(), data: { state: harness.state }
        } });
    });
});

test('authorized player discovers, opens, and joins the Founders beta', async ({ page }) => {
    await page.goto('/online/tournaments');
    await expect(page.locator('#arena-directory')).toBeVisible();
    await expect(page.locator('#tournaments-coming-soon')).toBeHidden();
    await expect(page.locator('.arena-card')).toHaveCount(1);
    await expect(page.locator('.arena-card')).toContainText('CAISSA Arena S001 — Founders Beta');
    await expect(page.locator('.arena-card')).toContainText('3+2 · 15 min · 4/4 players');
    await page.getByRole('button', { name: 'Join / View' }).click();
    await expect(page.locator('#arena-detail')).toBeVisible();
    await expect(page.locator('#arena-detail-name')).toHaveText('CAISSA Arena S001 — Founders Beta');
    await expect(page.locator('.arena-rules')).toContainText('Win 2 · Draw 1 · Loss 0');
    await page.getByRole('button', { name: 'Join tournament' }).click();
    await expect(page.locator('#tab-tournament')).toBeVisible();
    await expect(page.locator('#panel-tournament')).toBeVisible();
    await expect(page.locator('#arena-standings-body tr')).toHaveCount(4);
    await expect(page.locator('#arena-standings-body .is-current-player')).toContainText('Founder A');
    expect(harnesses.get(page).commands.map(command => command.eventType)).toEqual([
        'presence.join', 'tournament.sync', 'tournament.join'
    ]);
});

test('two simultaneous games render in context and tab navigation preserves the board', async ({ page }) => {
    await page.goto('/online');
    const harness = harnesses.get(page);
    const tournament = {
        ...tournamentFixture(), status: 'active', myState: 'playing',
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 14 * 60_000).toISOString(),
        standings: standingsFixture().map((row, index) => ({ ...row, state: 'playing', points: index < 2 ? 2 : 0 })),
        nextPairing: { id: 'pair-a', gameId, state: 'active', color: 'white', opponentClerkId: 'founder_b', opponentDisplayName: 'Founder B', assignedAt: new Date().toISOString() },
        games: [
            tournamentGame(gameId, 'Founder A', 'Founder B', 1),
            tournamentGame('44444444-4444-4444-8444-444444444444', 'Founder C', 'Founder D', 2)
        ]
    };
    const game = activeGame();
    harness.state = {
        ...harness.state, game, recentGames: [game],
        arena: { tournaments: [{ ...directoryTournament(tournament), joined: true, myState: 'playing' }], current: tournament }
    };
    await expect.poll(() => page.locator('#tab-tournament').isVisible()).toBe(true);
    const board = await page.locator('#online-board .caissa-board').elementHandle();
    const before = await page.locator('#board-shell').boundingBox();
    await page.locator('#tab-tournament').click();
    await page.locator('#arena-context-tab-games').click();
    await expect(page.locator('#arena-games-list .arena-game-row')).toHaveCount(2);
    await expect(page.locator('#arena-pairing-state')).toContainText('Playing Founder B');
    await page.locator('#tab-games').click();
    await page.locator('#tab-lobby').click();
    await page.locator('#tab-tournament').click();
    expect(await board.evaluate(node => node === document.querySelector('#online-board .caissa-board'))).toBe(true);
    const after = await page.locator('#board-shell').boundingBox();
    expect(Math.abs(after.width - before.width)).toBeLessThan(1);
    expect(Math.abs(after.height - before.height)).toBeLessThan(1);
});

test('refresh recovers membership, active game, and countdown from canonical state', async ({ page }) => {
    const harness = harnesses.get(page);
    const tournament = {
        ...tournamentFixture(), status: 'active', myState: 'playing',
        endsAt: new Date(Date.now() + 12 * 60_000).toISOString(), standings: standingsFixture(),
        nextPairing: { id: 'pair-a', gameId, state: 'active', color: 'white', opponentClerkId: 'founder_b', opponentDisplayName: 'Founder B' },
        games: [tournamentGame(gameId, 'Founder A', 'Founder B', 1)]
    };
    harness.state = {
        ...harness.state, game: activeGame(), recentGames: [activeGame()],
        arena: { tournaments: [{ ...directoryTournament(tournament), joined: true, myState: 'playing' }], current: tournament }
    };
    await page.goto('/online');
    await expect(page.locator('#tab-tournament')).toBeVisible();
    await page.reload();
    await expect(page.locator('#workspace-title')).toContainText('Playing Founder B');
    await page.locator('#tab-tournament').click();
    await expect(page.locator('#arena-context-countdown strong')).not.toHaveText('—');
    await expect(page.locator('#arena-standings-body .is-current-player')).toContainText('Founder A');
});

test('mobile keeps the board before tournament context and has no serious accessibility findings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const harness = harnesses.get(page);
    const tournament = { ...tournamentFixture(), myState: 'waiting', standings: standingsFixture() };
    harness.state = {
        ...harness.state,
        arena: { tournaments: [{ ...directoryTournament(tournament), joined: true, myState: 'waiting' }], current: tournament }
    };
    await page.goto('/online');
    await page.locator('#tab-tournament').click();
    const boardBox = await page.locator('#board-shell').boundingBox();
    const panelBox = await page.locator('.play-workspace').boundingBox();
    expect(panelBox.y).toBeGreaterThan(boardBox.y + boardBox.height);
    await expect(page.locator('#arena-context-countdown')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#panel-tournament').analyze();
    expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
});

function tournamentFixture() {
    const startsAt = new Date(Date.now() + 5 * 60_000).toISOString();
    return {
        id: tournamentId, name: 'CAISSA Arena S001 — Founders Beta', format: 'arena',
        status: 'registration_open', pool: 'blitz', baseMs: 180_000, incrementMs: 2_000,
        rated: false, startsAt, endsAt: new Date(Date.parse(startsAt) + 15 * 60_000).toISOString(),
        registrationOpensAt: new Date(Date.now() - 60_000).toISOString(),
        registrationClosesAt: new Date(Date.parse(startsAt) + 15 * 60_000).toISOString(),
        durationMinutes: 15, lateJoin: true, capacity: 4, minPlayers: 4,
        participantCount: 4, version: 2, scoringContract: 'arena-s001-2-1-0',
        finishingPolicy: 'finish_active_games', myState: null, standings: standingsFixture(),
        games: [], nextPairing: null
    };
}

function directoryTournament(tournament) {
    const { standings, games, nextPairing, registrationOpensAt, registrationClosesAt, ...directory } = tournament;
    return { ...directory, joined: !!tournament.myState && tournament.myState !== 'withdrawn' };
}

function standingsFixture() {
    return ['Founder A', 'Founder B', 'Founder C', 'Founder D'].map((displayName, index) => ({
        rank: index + 1, userId: `u${index + 1}`, clerkId: `founder_${String.fromCharCode(97 + index)}`,
        displayName, rating: 1500 + (index * 20), gamesPlayed: 0, wins: 0, draws: 0,
        losses: 0, points: 0, state: 'registered', isCurrentPlayer: index === 0
    }));
}

function tournamentGame(id, whiteDisplayName, blackDisplayName, boardNumber) {
    return {
        gameId: id, status: 'active', result: null, whiteUserId: `white-${boardNumber}`,
        blackUserId: `black-${boardNumber}`, whiteClerkId: `founder_${boardNumber * 2 - 1}`,
        blackClerkId: `founder_${boardNumber * 2}`, whiteDisplayName, blackDisplayName,
        boardNumber, pairingState: 'active', createdAt: new Date().toISOString()
    };
}

function activeGame() {
    return {
        id: gameId, tournament_id: tournamentId, status: 'active', version: 1, rated: false,
        pool: 'blitz', base_ms: 180_000, increment_ms: 2_000,
        white_clerk_id: 'founder_a', black_clerk_id: 'founder_b',
        white_display_name: 'Founder A', black_display_name: 'Founder B',
        white_rating_before: 1500, black_rating_before: 1520,
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [], ply: 0, turn: 'white', white_time_ms: 180_000, black_time_ms: 180_000,
        clock_started_at: new Date(Date.now() + 3_000).toISOString(), draw_offer_by: null
    };
}
