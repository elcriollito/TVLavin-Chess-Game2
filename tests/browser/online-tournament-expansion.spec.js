import { test, expect } from '@playwright/test';

const dailyId = '66666666-6666-4666-8666-666666666666';
const gameId = '77777777-7777-4777-8777-777777777777';
const weeklyId = '88888888-8888-4888-8888-888888888888';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-23T17:00:00-05:00'));
    const harness = {
        commands: [],
        capabilities: {
            matchmaking: true, rated: false, tournaments: true, arenaS001: true,
            tournamentCreation: true, dailyTournamentCreation: true, publicTournamentDirectory: false,
            arena100: true, tournamentRated: false, dailyTournaments: true,
            dailyRated: false, weeklyArenas: true
        },
        state: {
            profile: { display_name: 'Daily Player' }, ticket: null, game: null,
            recentGames: [], players: [], challenges: [],
            permissions: { communityTournamentCreator: true, tournamentOrganizer: false },
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
                capabilities: harness.capabilities, realtime: null
            } });
        }
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            harness.commands.push(command);
            if (command.eventType === 'daily.join') {
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

test('organizer sees the official weekly calendar without public administration controls', async ({ page }, testInfo) => {
    harnesses.get(page).state.permissions.tournamentOrganizer = true;
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#directory-tab-schedule').click();
    await expect(page.locator('#weekly-featured')).toHaveCount(0);
    const saturdayCard = page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'Morning Arena' });
    await expect(saturdayCard).toContainText('Official series · Saturdays of Chess');
    const officialIdentity = page.locator('.tournament-identity--official');
    await expect(officialIdentity).toContainText('OFFICIAL CAISSA');
    await expect(officialIdentity).toHaveAttribute('aria-label', 'OFFICIAL CAISSA');
    await expect(page.locator('#weekly-admin-controls')).toHaveCount(0);
    await expect(page.locator('#arena-manage-series')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Enable series|Pause series|Refresh operations|Skip occurrence|Cancel selected occurrence/u })).toHaveCount(0);
    expect(harnesses.get(page).commands.some(command => command.eventType.startsWith('weekly.'))).toBe(false);
    if (process.env.CAISSA_CAPTURE_HFX_008 === '1') {
        await page.screenshot({ path: testInfo.outputPath('hfx-008-schedule-desktop.png') });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await saturdayCard.evaluate(element => ({
        card: element.scrollWidth - element.clientWidth,
        dialog: element.closest('dialog').scrollWidth - element.closest('dialog').clientWidth
    }));
    expect(overflow.card).toBeLessThanOrEqual(1);
    expect(overflow.dialog).toBeLessThanOrEqual(1);
    await expect(page.locator('#weekly-admin-controls')).toHaveCount(0);
    if (process.env.CAISSA_CAPTURE_HFX_008 === '1') {
        await page.screenshot({ path: testInfo.outputPath('hfx-008-schedule-mobile.png') });
    }
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
    await expect.poll(() => harness.commands.some(command => command.eventType === 'daily.create')).toBe(true);
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
    expect(widths.search).toBeGreaterThan(widths.organizer * 2);
    expect(widths.status).toBeGreaterThanOrEqual(145);
    expect(widths.type).toBeGreaterThanOrEqual(155);
    expect(widths.rating).toBeGreaterThanOrEqual(205);
    expect(widths.organizer).toBeGreaterThanOrEqual(225);
    const filterTextFits = await page.locator('#arena-filters select').evaluateAll(selects => selects.every(select => (
        select.clientWidth >= 140 && select.scrollWidth <= select.clientWidth + 1
    )));
    expect(filterTextFits).toBe(true);
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

test('creation CTA is independent of official organizer status and submission remains server-permitted', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.capabilities.tournamentCreation = false;
    harness.capabilities.dailyTournamentCreation = false;
    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('#tournament-directory-create')).toBeHidden();

    harness.capabilities.tournamentCreation = true;
    harness.state.permissions.communityTournamentCreator = false;
    await page.reload();
    await expect(page.locator('#tournament-directory-create')).toBeVisible();
    await page.locator('#tournament-directory-create').click();
    await expect(page.locator('#online-toast')).toContainText('not enabled');
    await expect(page.locator('#directory-panel-create')).toBeHidden();

    harness.state.permissions.communityTournamentCreator = true;
    await page.reload();
    await expect(page.locator('#tournament-directory-create')).toBeVisible();
    await page.locator('#tournament-directory-create').click();
    await expect(page.locator('#directory-panel-create')).toBeVisible();
    await expect(page.locator('#weekly-admin-controls')).toHaveCount(0);
});

test('directory filters reflow without truncation or horizontal overflow on tablet', async ({ page }) => {
    harnesses.get(page).state.permissions.tournamentOrganizer = true;
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/online/tournaments?directory=1');

    const layout = await page.locator('#arena-filters').evaluate(filters => {
        const controls = [...filters.querySelectorAll('input, select')].map(control => {
            const box = control.getBoundingClientRect();
            return { width: box.width, top: Math.round(box.top) };
        });
        const dialog = filters.closest('dialog');
        return {
            controls,
            overflow: dialog.scrollWidth - dialog.clientWidth
        };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(new Set(layout.controls.map(control => control.top)).size).toBe(2);
    expect(layout.controls[0].width).toBeGreaterThan(layout.controls[1].width * 1.8);
    expect(layout.controls[3].width).toBeGreaterThanOrEqual(300);
    expect(layout.controls[4].width).toBeGreaterThanOrEqual(300);
});

test('2+1 is selectable for New Game and tournament creation stays within a phone viewport', async ({ page }, testInfo) => {
    const harness = harnesses.get(page);
    harness.state.permissions.tournamentOrganizer = true;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');
    await page.locator('[data-control="bullet-2-1"]').click();
    await page.locator('#find-game').click();
    await expect.poll(() => harness.commands.some(command => command.eventType === 'queue.join')).toBe(true);
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
    await page.locator('#directory-tab-schedule').click();
    await expect(page.locator('.arena-card')).toHaveCount(2);
    await expect(page.locator('#weekly-featured')).toHaveCount(0);
    await expect(page.locator('#arena-schedule-list')).toContainText('Official series · Saturdays of Chess');
    await expect(page.locator('#tournament-directory-create')).toBeVisible();
    await expect(page.locator('#arena-create-repeat')).toHaveCount(0);
    await expect(page.locator('#weekly-admin-controls')).toHaveCount(0);

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
    await page.locator('#directory-tab-schedule').click();
    const persisted = page.locator('.arena-card').filter({ hasText: 'Daily Correspondence Test' });
    await expect(persisted.getByRole('button', { name: 'Registered' })).toBeDisabled();
});

function dailyTournament() {
    return {
        id: dailyId, name: 'Daily Correspondence Test', status: 'registration_open', rated: false,
        startsAt: '2026-11-24T23:00:00.000Z',
        registrationClosesAt: '2026-11-24T23:00:00.000Z',
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
        joined: false, myState: null, playCategory: 'live', source: 'official', seriesKind: 'official',
        seriesSlug: 'saturdays-of-chess-s001', featured: true
    };
}

function dailyGame() {
    return {
        id: gameId, tournament_id: dailyId, status: 'active', version: 1, rated: false,
        pool: 'daily', play_category: 'daily', days_per_move: 7,
        move_deadline_at: '2026-11-30T22:00:00.000Z',
        white_clerk_id: 'daily_player', black_clerk_id: 'daily_opponent',
        white_display_name: 'Daily Player', black_display_name: 'Opponent',
        white_rating_before: 1500, black_rating_before: 1500,
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [], ply: 0, turn: 'white', white_time_ms: 0, black_time_ms: 0,
        clock_started_at: null, draw_offer_by: null
    };
}
