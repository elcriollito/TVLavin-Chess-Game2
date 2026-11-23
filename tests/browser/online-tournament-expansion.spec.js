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

test('creation form isolates Arena and Daily fields and submits only the selected contract', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.permissions.tournamentOrganizer = true;
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#tournament-directory-create').click();

    await expect(page.locator('#arena-create-control')).toBeVisible();
    await expect(page.locator('#arena-create-duration')).toBeVisible();
    await expect(page.locator('#arena-create-pairing')).toBeVisible();
    await expect(page.locator('#arena-create-late-join')).toBeVisible();
    await expect(page.locator('#daily-create-days')).toHaveCount(0);
    await expect(page.locator('#daily-create-group-size')).toHaveCount(0);
    await expect(page.locator('#daily-create-qualifiers')).toHaveCount(0);
    await expect(page.getByText('Registration deadline', { exact: true })).toHaveCount(0);
    await page.locator('#arena-create-control').selectOption('bullet-2-1');

    await page.locator('#arena-create-type').selectOption('daily');
    await expect(page.locator('#daily-create-description')).toBeVisible();
    await expect(page.locator('#daily-create-days')).toBeVisible();
    await expect(page.locator('#daily-create-group-size')).toBeVisible();
    await expect(page.locator('#daily-create-qualifiers')).toBeVisible();
    await expect(page.locator('#daily-create-game-type')).toHaveValue('Standard');
    await expect(page.locator('#daily-create-setup')).toHaveValue('Standard starting position');
    await expect(page.locator('#arena-create-control')).toHaveCount(0);
    await expect(page.locator('#arena-create-duration')).toHaveCount(0);
    await expect(page.locator('#arena-create-late-join')).toHaveCount(0);

    await page.locator('#daily-create-description').fill('A server-timed correspondence event.');
    await page.locator('#daily-create-days').selectOption('1');
    await page.locator('#daily-create-group-size').selectOption('4');
    await page.locator('#daily-create-qualifiers').selectOption('2');
    await page.locator('#arena-create-capacity').fill('4');
    await page.locator('#arena-create-type').selectOption('live');
    await expect(page.locator('#arena-create-control')).toHaveValue('bullet-2-1');
    await page.locator('#arena-create-type').selectOption('daily');
    await expect(page.locator('#daily-create-description')).toHaveValue('A server-timed correspondence event.');

    await page.locator('#arena-create-name').fill('Daily UX Contract');
    await page.locator('#arena-create-submit').click();
    const creation = harness.commands.find(command => command.eventType === 'daily.create');
    expect(creation.payload).toMatchObject({
        name: 'Daily UX Contract', description: 'A server-timed correspondence event.',
        daysPerMove: 1, groupSize: 4, qualifiersPerGroup: 2, capacity: 4
    });
    for (const forbidden of [
        'registrationClosesAt', 'timeControlId', 'durationMinutes', 'lateJoin', 'pool', 'baseMs', 'incrementMs'
    ]) expect(creation.payload).not.toHaveProperty(forbidden);
});

test('directory create CTA resets scroll, focuses the form, and gives filters readable widths', async ({ page }, testInfo) => {
    harnesses.get(page).state.permissions.tournamentOrganizer = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online/tournaments?directory=1');

    const create = page.locator('#tournament-directory-create');
    await expect(create).toBeVisible();
    const widths = await page.locator('#arena-filters').evaluate(filters => {
        const width = selector => filters.querySelector(selector).getBoundingClientRect().width;
        return {
            search: width('#arena-search'), status: width('#arena-status-filter'),
            type: width('#arena-control-filter'), rating: width('#arena-rating-filter'),
            organizer: width('#arena-identity-filter')
        };
    });
    expect(widths.search).toBeLessThan(widths.organizer);
    for (const key of ['status', 'type', 'rating', 'organizer']) expect(widths[key]).toBeGreaterThanOrEqual(160);
    expect(await page.locator('#tournament-directory-dialog').evaluate(element => element.clientWidth)).toBeGreaterThan(1320);
    if (process.env.CAISSA_CAPTURE_DIRECTORY_UX === '1') {
        await page.screenshot({ path: testInfo.outputPath('directory-filters-desktop.png') });
    }

    await page.locator('#directory-panel-current').evaluate(element => { element.style.minHeight = '1600px'; });
    await page.locator('#arena-directory').evaluate(element => { element.scrollTop = 900; });
    expect(await page.locator('#arena-directory').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await create.focus();
    await create.press('Enter');

    await expect(page.locator('#directory-panel-create')).toBeVisible();
    await expect(page.locator('#arena-create-title')).toBeFocused();
    expect(await page.locator('#arena-directory').evaluate(element => element.scrollTop)).toBeLessThanOrEqual(1);
    const geometry = await page.locator('#arena-create-title').evaluate(element => {
        const title = element.getBoundingClientRect();
        const scroller = element.closest('#arena-directory').getBoundingClientRect();
        return { titleTop: title.top, scrollerTop: scroller.top, scrollerBottom: scroller.bottom };
    });
    expect(geometry.titleTop).toBeGreaterThanOrEqual(geometry.scrollerTop);
    expect(geometry.titleTop).toBeLessThan(geometry.scrollerBottom);
    if (process.env.CAISSA_CAPTURE_DIRECTORY_UX === '1') {
        await page.screenshot({ path: testInfo.outputPath('directory-create-desktop.png') });
    }
    await page.locator('#arena-create-submit').scrollIntoViewIfNeeded();
    await expect(page.locator('#arena-create-submit')).toBeVisible();
});

test('2+1 is selectable for New Game and tournament creation stays within a phone viewport', async ({ page }, testInfo) => {
    const harness = harnesses.get(page);
    harness.state.permissions.tournamentOrganizer = true;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');
    await page.locator('[data-control="bullet-2-1"]').click();
    await page.locator('#find-game').click();
    const queued = harness.commands.find(command => command.eventType === 'queue.join');
    expect(queued.payload).toMatchObject({ timeControlId: 'bullet-2-1' });

    await page.locator('#browse-tournaments').click();
    const create = page.locator('#tournament-directory-create');
    await expect(create).toBeVisible();
    const createBox = await create.boundingBox();
    expect(createBox.x).toBeGreaterThanOrEqual(0);
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(390);
    await create.click();
    await expect(page.locator('#arena-create-title')).toBeFocused();
    const overflow = await page.locator('#arena-create-form').evaluate(element => ({
        form: element.scrollWidth - element.clientWidth,
        dialog: element.closest('dialog').scrollWidth - element.closest('dialog').clientWidth
    }));
    expect(overflow.form).toBeLessThanOrEqual(1);
    expect(overflow.dialog).toBeLessThanOrEqual(1);
    if (process.env.CAISSA_CAPTURE_DIRECTORY_UX === '1') {
        await page.screenshot({ path: testInfo.outputPath('directory-create-mobile.png') });
    }
});

test('ordinary member joins Daily, sees persistence, and opens the correspondence board', async ({ page }) => {
    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('.arena-card')).toHaveCount(2);
    await expect(page.locator('#weekly-featured')).toBeVisible();
    await expect(page.locator('#weekly-featured')).toContainText('SATURDAYS OF CHESS');
    await expect(page.locator('#tournament-directory-create')).toBeHidden();
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
