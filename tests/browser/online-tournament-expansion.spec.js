import { test, expect } from '@playwright/test';

const dailyId = '66666666-6666-4666-8666-666666666666';
const gameId = '77777777-7777-4777-8777-777777777777';
const weeklyId = '88888888-8888-4888-8888-888888888888';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    const harness = {
        commands: [],
        state: {
            profile: { display_name: 'Daily Player' }, ticket: null, game: null,
            recentGames: [], players: [], challenges: [],
            permissions: { tournamentOrganizer: false },
            arena: { tournaments: [weeklyTournament()], current: null },
            daily: { tournaments: [dailyTournament()], current: null, games: [], game: null, recentGames: [] }
        }
    };
    harnesses.set(page, harness);
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'daily_player',fullName:'Daily Player',email:'daily@example.test',getToken:async()=> 'daily-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: {
                protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
                capabilities: {
                    matchmaking: true, rated: false, tournaments: true, arenaS001: true,
                    tournamentCreation: true, publicTournamentDirectory: false,
                    arena100: true, tournamentRated: false, dailyTournaments: true,
                    dailyRated: false, weeklyArenas: true
                }, realtime: null
            } });
        }
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            harness.commands.push(command);
            if (command.eventType.startsWith('weekly.')) {
                return route.fulfill({ json: {
                    protocolVersion: '1.0.0', eventType: 'tournament.snapshot',
                    serverTimestamp: new Date().toISOString(), data: { series: weeklySeriesSnapshot() }
                } });
            } else if (command.eventType === 'daily.join') {
                const tournament = { ...dailyTournament(), participantCount: 1, myState: 'registered' };
                harness.state = {
                    ...harness.state,
                    daily: {
                        tournaments: [tournament], current: tournament,
                        games: [dailyGame()], game: null, recentGames: []
                    }
                };
            } else if (command.eventType === 'daily.sync' && command.payload.gameId) {
                harness.state = {
                    ...harness.state,
                    daily: { ...harness.state.daily, game: dailyGame() }
                };
            }
        }
        return route.fulfill({ json: {
            protocolVersion: '1.0.0', eventType: 'tournament.snapshot',
            serverTimestamp: new Date().toISOString(), data: { state: harness.state }
        } });
    });
});

test('weekly operations stay organizer-only and send bounded management commands', async ({ page }) => {
    harnesses.get(page).state.permissions.tournamentOrganizer = true;
    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('#weekly-admin-controls')).toBeVisible();
    await page.locator('#weekly-inspect').click();
    await expect(page.locator('#weekly-operations-status')).toContainText('completed');
    await page.locator('#weekly-capacity').fill('100');
    await page.locator('#weekly-minimum').fill('4');
    await page.locator('#weekly-lead-days').fill('7');
    await page.locator('#weekly-config-form').getByRole('button').click();
    await page.locator('#weekly-skip-date').fill('2026-12-05');
    await page.locator('#weekly-skip-slot').selectOption('evening');
    await page.locator('#weekly-skip-form').getByRole('button').click();
    await page.locator('#weekly-cancel').click();
    const commands = harnesses.get(page).commands;
    expect(commands.some(command => command.eventType === 'weekly.update'
        && command.payload.capacity === 100)).toBe(true);
    expect(commands.some(command => command.eventType === 'weekly.skip'
        && command.payload.slotId === 'evening')).toBe(true);
    expect(commands.some(command => command.eventType === 'weekly.cancel'
        && command.payload.tournamentId === weeklyId)).toBe(true);
});

test('ordinary member joins Daily, sees persistence, and opens the correspondence board', async ({ page }) => {
    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('.arena-card')).toHaveCount(2);
    await expect(page.locator('#weekly-featured')).toBeVisible();
    await expect(page.locator('#weekly-featured')).toContainText('SATURDAYS OF CHESS');
    await expect(page.locator('#directory-tab-create')).toBeHidden();
    await expect(page.locator('#weekly-admin-controls')).toBeHidden();

    const dailyCard = page.locator('.arena-card').filter({ hasText: 'Daily Correspondence Test' });
    await expect(dailyCard).toContainText('7 days / move');
    await dailyCard.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.locator('#online-toast')).toContainText('Registered for the Daily tournament.');
    expect(harnesses.get(page).commands.filter(command => command.eventType === 'daily.join')).toHaveLength(1);

    await page.locator('#tab-games').click();
    await expect(page.locator('.daily-game-row')).toHaveCount(1);
    await expect(page.locator('.daily-game-row')).toContainText('YOUR MOVE');
    await page.locator('.daily-game-row').click();
    await expect(page.locator('#workspace-title')).toContainText('Playing Opponent');
    await expect(page.locator('#clock-bottom')).toContainText(/d|h|m/);
    expect(harnesses.get(page).commands.some(command => command.eventType === 'daily.sync'
        && command.payload.gameId === gameId)).toBe(true);

    await page.reload();
    await page.locator('#arena-directory').click();
    const persisted = page.locator('.arena-card').filter({ hasText: 'Daily Correspondence Test' });
    await expect(persisted.getByRole('button', { name: 'Registered' })).toBeDisabled();
});

function dailyTournament() {
    return {
        id: dailyId, name: 'Daily Correspondence Test', status: 'registration_open', rated: false,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        registrationClosesAt: new Date(Date.now() + 43_200_000).toISOString(),
        daysPerMove: 7, groupSize: 4, capacity: 16, participantCount: 0,
        myState: null, playCategory: 'daily'
    };
}

function weeklyTournament() {
    return {
        id: weeklyId, name: 'Morning Arena · 2026-11-28', format: 'arena', status: 'scheduled',
        pool: 'blitz', baseMs: 300_000, incrementMs: 0, rated: false,
        startsAt: '2026-11-28T16:00:00.000Z', endsAt: '2026-11-28T17:00:00.000Z',
        durationMinutes: 60, lateJoin: true, capacity: 100, participantCount: 0,
        joined: false, myState: null, playCategory: 'live',
        seriesSlug: 'saturdays-of-chess-s001', featured: true
    };
}

function weeklySeriesSnapshot() {
    return {
        series: { enabled: false, capacity: 100, min_players: 4, registration_lead_days: 7 },
        occurrences: [weeklyTournament()],
        ledger: [{ status: 'completed', startedAt: '2026-11-20T12:00:00.000Z' }]
    };
}

function dailyGame() {
    return {
        id: gameId, tournament_id: dailyId, status: 'active', version: 1, rated: false,
        pool: 'daily', play_category: 'daily', days_per_move: 7,
        move_deadline_at: new Date(Date.now() + (7 * 86_400_000)).toISOString(),
        white_clerk_id: 'daily_player', black_clerk_id: 'daily_opponent',
        white_display_name: 'Daily Player', black_display_name: 'Opponent',
        white_rating_before: 1500, black_rating_before: 1500,
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [], ply: 0, turn: 'white', white_time_ms: 0, black_time_ms: 0,
        clock_started_at: null, draw_offer_by: null
    };
}
