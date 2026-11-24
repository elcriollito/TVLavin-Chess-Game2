import { test, expect } from '@playwright/test';

const seriesId = '99999999-9999-4999-8999-999999999999';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-23T17:00:00-05:00'));
    const harness = {
        commands: [],
        state: {
            profile: { display_name: 'Recurring Member' }, ticket: null, game: null,
            recentGames: [], players: [], challenges: [],
            permissions: {
                communityTournamentCreator: true,
                tournamentOrganizer: false,
                recurringTournamentCreator: false
            },
            arena: { tournaments: [], current: null },
            daily: { tournaments: [], current: null, games: [], game: null, recentGames: [] },
            recurring: { series: [] }
        }
    };
    harnesses.set(page, harness);
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'recurring_member',fullName:'Recurring Member',email:'recurring@example.test',getToken:async()=> 'recurring-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: {
                protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
                capabilities: {
                    matchmaking: true, rated: false, tournaments: true, arenaS001: true,
                    tournamentCreation: true, dailyTournamentCreation: true, publicTournamentDirectory: false,
                    arena100: true, tournamentRated: false, dailyTournaments: true,
                    dailyRated: false, weeklyArenas: true, recurringTournaments: true
                }, realtime: null
            } });
        }
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            harness.commands.push(command);
        }
        return route.fulfill({ json: {
            protocolVersion: '1.0.0', eventType: 'tournament.snapshot',
            serverTimestamp: new Date().toISOString(), data: { state: harness.state }
        } });
    });
});

test('ordinary member cannot access recurring creation controls', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('#tournament-directory-create')).toBeVisible();
    await page.locator('#tournament-directory-create').click();
    await expect(page.locator('#directory-panel-create')).toBeVisible();
    await expect(page.locator('#arena-create-repeat')).toHaveCount(0);
    await expect(page.locator('#arena-create-recurrence')).toHaveCount(0);
    await expect(page.getByText('Repeat Tournament', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Calendar recurrence', { exact: true })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test('existing series are read-only and organizer one-time creation fits mobile', async ({ page }) => {
    harnesses.get(page).state.permissions.tournamentOrganizer = true;
    harnesses.get(page).state.recurring.series = [seriesFixture({
        name: 'Owned Arena', recurrence: {
            frequencyUnit: 'weekly', interval: 1, weekdays: [5], firstDate: '2026-12-04',
            localTime: '19:00', timeZone: 'America/New_York', leadDays: 2,
            endMode: 'never', endDate: null, occurrenceCount: null, enabled: true
        }, capacity: 16, durationMinutes: 30, lateJoin: true, pool: 'blitz', baseMs: 180000, incrementMs: 2000
    })];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#directory-tab-schedule').click();
    await expect(page.locator('#recurring-series-list')).toHaveCount(0);
    await expect(page.locator('#arena-schedule-list')).toContainText('Owned Arena');
    await expect(page.getByRole('button', { name: /Enable series|Pause series|Skip occurrence/u })).toHaveCount(0);
    await page.locator('#tournament-directory-create').click();
    await expect(page.locator('#arena-create-repeat')).toHaveCount(0);
    const geometry = await page.locator('#arena-create-form').evaluate(element => ({
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        right: element.getBoundingClientRect().right, viewport: innerWidth
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
});

test('participants see planned dates without receiving owner controls', async ({ page }) => {
    const planned = seriesFixture({
        name: 'Public Planned Arena', recurrence: {
            frequencyUnit: 'weekly', interval: 1, weekdays: [5], firstDate: '2026-12-04',
            localTime: '19:00', timeZone: 'America/New_York', leadDays: 2,
            endMode: 'never', endDate: null, occurrenceCount: null, enabled: true
        }, capacity: 16, durationMinutes: 30, lateJoin: true,
        pool: 'blitz', baseMs: 180000, incrementMs: 2000
    });
    harnesses.get(page).state.recurring = { series: [], directory: [planned] };
    harnesses.get(page).state.arena.tournaments = [{
        id: '77777777-7777-4777-8777-777777777777',
        seriesId, seriesOccurrenceKey: 'user-series:2026-12-11:primary',
        name: 'Public Planned Arena', source: 'community', status: 'registration_open',
        startsAt: '2026-12-12T00:00:00.000Z', endsAt: '2026-12-12T00:30:00.000Z',
        registrationClosesAt: '2026-12-12T00:00:00.000Z', pool: 'blitz', baseMs: 180000,
        incrementMs: 2000, durationMinutes: 30, capacity: 16, participantCount: 0,
        rated: false, joined: false, myState: null
    }];
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#directory-tab-schedule').click();
    await expect(page.locator('#arena-schedule-list')).toContainText('Public Planned Arena');
    await expect(page.locator('#arena-schedule-list')).toContainText('Planned');
    await expect(page.locator('#arena-schedule-list .arena-card')).toHaveCount(2);
    await expect(page.locator('#arena-schedule-list').getByRole('button', { name: 'Join', exact: true })).toHaveCount(1);
    await expect(page.locator('#recurring-series-list')).toHaveCount(0);
});

test('Current follows the local day while Schedule starts tomorrow and My preserves history', async ({ page }) => {
    const harness = harnesses.get(page);
    const base = {
        format: 'arena', pool: 'blitz', baseMs: 180000, incrementMs: 2000,
        durationMinutes: 30, capacity: 16, participantCount: 0, rated: false,
        source: 'community', standings: [], games: []
    };
    harness.state.arena.tournaments = [
        { ...base, id: '11111111-1111-4111-8111-111111111111', name: 'Today Scheduled',
            status: 'scheduled', startsAt: '2026-11-23T23:00:00.000Z', endsAt: '2026-11-23T23:30:00.000Z' },
        { ...base, id: '22222222-2222-4222-8222-222222222222', name: 'Today Active',
            status: 'active', startsAt: '2026-11-23T21:00:00.000Z', endsAt: '2026-11-23T23:30:00.000Z',
            registrationClosesAt: '2026-11-23T23:30:00.000Z' },
        { ...base, id: '33333333-3333-4333-8333-333333333333', name: 'Tomorrow Open',
            status: 'registration_open', startsAt: '2026-11-24T22:00:00.000Z', endsAt: '2026-11-24T22:30:00.000Z',
            registrationClosesAt: '2026-11-24T22:00:00.000Z' },
        { ...base, id: '44444444-4444-4444-8444-444444444444', name: 'Cancelled History',
            status: 'cancelled', startsAt: '2026-11-23T18:00:00.000Z', endsAt: '2026-11-23T18:30:00.000Z',
            joined: true, myState: 'registered' },
        { ...base, id: '55555555-5555-4555-8555-555555555555', name: 'Completed History',
            status: 'completed', startsAt: '2026-11-22T18:00:00.000Z', endsAt: '2026-11-22T18:30:00.000Z',
            organizedByMe: true }
    ];

    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('#directory-count-current')).toHaveText('2');
    await expect(page.locator('#arena-current-list')).toContainText('Today Scheduled');
    await expect(page.locator('#arena-current-list')).toContainText('Today Active');
    await expect(page.locator('#arena-current-list')).not.toContainText('Tomorrow Open');
    await expect(page.locator('#arena-current-list')).not.toContainText('Cancelled History');

    await page.locator('#directory-tab-schedule').click();
    await expect(page.locator('#directory-count-schedule')).toHaveText('1');
    await expect(page.locator('#arena-schedule-list')).toContainText('Tomorrow Open');
    await expect(page.locator('#arena-schedule-list').getByRole('button', { name: 'Join', exact: true })).toBeEnabled();

    await page.locator('#directory-tab-mine').click();
    await expect(page.locator('#directory-count-mine')).toHaveText('2');
    await expect(page.locator('#arena-my-list')).toContainText('Cancelled History');
    await expect(page.locator('#arena-my-list')).toContainText('Completed History');

    await page.clock.setFixedTime(new Date('2026-11-24T00:01:00-05:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#directory-count-current')).toHaveText('1');
    await expect(page.locator('#directory-count-schedule')).toHaveText('0');
    await page.locator('#directory-tab-current').click();
    await expect(page.locator('#arena-current-list')).toContainText('Tomorrow Open');
    await expect(page.locator('#arena-current-list')).not.toContainText('Today Active');
});

test('schedule is chronological and authoritative identity persists across views', async ({ page }) => {
    const officialId = '11111111-1111-4111-8111-111111111111';
    const earlyId = '22222222-2222-4222-8222-222222222222';
    const dailyId = '33333333-3333-4333-8333-333333333333';
    const official = {
        id: officialId, name: 'Morning Arena', source: 'official', seriesKind: 'official',
        seriesSlug: 'saturdays-of-chess-s001', status: 'scheduled', startsAt: '2026-11-28T16:00:00.000Z',
        endsAt: '2026-11-28T17:00:00.000Z', registrationClosesAt: '2026-11-28T16:00:00.000Z',
        pool: 'blitz', baseMs: 300000, incrementMs: 0, durationMinutes: 60,
        capacity: 100, participantCount: 1, joined: true, myState: 'registered', rated: false,
        standings: [], games: []
    };
    harnesses.get(page).state.arena = {
        current: official,
        tournaments: [official, {
            id: earlyId, name: 'OFFICIAL CAISSA LOOKALIKE', source: 'community', seriesKind: 'user',
            status: 'scheduled', startsAt: '2026-11-24T16:00:00.000Z', endsAt: '2026-11-24T16:30:00.000Z',
            registrationClosesAt: '2026-11-24T16:00:00.000Z', pool: 'bullet', baseMs: 120000,
            incrementMs: 1000, durationMinutes: 30, capacity: 16, participantCount: 0, rated: false
        }]
    };
    harnesses.get(page).state.daily.tournaments = [{
        id: dailyId, name: 'Community Daily', source: 'community', status: 'scheduled',
        startsAt: '2026-11-24T18:00:00.000Z', registrationClosesAt: '2026-11-24T18:00:00.000Z',
        daysPerMove: 7, groupSize: 4, capacity: 16, participantCount: 0, rated: false
    }];
    harnesses.get(page).state.recurring = { series: [], directory: [seriesFixture({
        name: 'Public Planned Arena', recurrence: {
            frequencyUnit: 'weekly', interval: 1, weekdays: [5], firstDate: '2026-12-04',
            localTime: '19:00', timeZone: 'America/New_York', leadDays: 2,
            endMode: 'never', endDate: null, occurrenceCount: null, enabled: true
        }, capacity: 16, durationMinutes: 30, lateJoin: true,
        pool: 'blitz', baseMs: 180000, incrementMs: 2000
    })] };

    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('#arena-context-identity')).toContainText('OFFICIAL CAISSA');
    await page.locator('#directory-tab-schedule').click();
    const cardTexts = await page.locator('#arena-schedule-list .arena-card').allTextContents();
    expect(cardTexts[0]).toContain('OFFICIAL CAISSA LOOKALIKE');
    expect(cardTexts[1]).toContain('Community Daily');
    expect(cardTexts[2]).toContain('Morning Arena');
    expect(cardTexts.at(-1)).toContain('Public Planned Arena');
    await expect(page.locator('#arena-schedule-list')).not.toContainText('Scheduled tournament records');
    await expect(page.locator('#arena-schedule-list')).not.toContainText('Planned from recurrence rules');
    await expect(page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'Morning Arena' }))
        .toHaveClass(/arena-card--official/u);
    await expect(page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'Morning Arena' }))
        .toContainText('Official series · Saturdays of Chess');
    await expect(page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'OFFICIAL CAISSA LOOKALIKE' }))
        .toContainText('COMMUNITY TOURNAMENT');

    await page.locator('#arena-identity-filter').selectOption('official');
    await expect(page.locator('#arena-schedule-list')).toContainText('Morning Arena');
    await expect(page.locator('#arena-schedule-list')).not.toContainText('OFFICIAL CAISSA LOOKALIKE');
    await page.locator('#arena-identity-filter').selectOption('all');
    await page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'Morning Arena' })
        .getByRole('button', { name: 'Details' }).click();
    await expect(page.locator('#arena-detail-identity')).toContainText('OFFICIAL CAISSA');
    await expect(page.locator('#arena-information-list')).toContainText('Official series · Saturdays of Chess');
    await page.locator('#arena-detail-back').click();
    await page.locator('#directory-tab-mine').click();
    await expect(page.locator('#arena-my-list')).toContainText('OFFICIAL CAISSA');
    await page.locator('#tournament-directory-close').click();
    await page.locator('#arena-context-tab-games').click();
    await expect(page.locator('#arena-context-games')).toBeVisible();
    await expect(page.locator('#arena-context-identity')).toContainText('OFFICIAL CAISSA');
});

function seriesFixture(payload) {
    const recurrence = payload.recurrence;
    return {
        id: seriesId, title: payload.name, enabled: recurrence.enabled !== false,
        seriesKind: 'user', source: 'community',
        frequencyUnit: recurrence.frequencyUnit, interval: recurrence.interval,
        weekdays: recurrence.weekdays, firstDate: recurrence.firstDate,
        localTime: recurrence.localTime, timeZone: recurrence.timeZone,
        leadDays: recurrence.leadDays, endMode: recurrence.endMode,
        endDate: recurrence.endDate, occurrenceCount: recurrence.occurrenceCount,
        generatedCount: 0, past: [],
        template: {
            pool: payload.pool || 'blitz', baseMs: payload.baseMs || 180000,
            incrementMs: payload.incrementMs || 2000,
            durationMinutes: payload.durationMinutes, capacity: payload.capacity,
            lateJoin: payload.lateJoin
        },
        upcoming: [
            { localDate: '2026-12-11', startsAt: '2026-12-12T00:00:00.000Z',
                occurrenceKey: 'user-series:2026-12-11:primary', ordinal: 1,
                state: 'planned', tournamentId: null, name: payload.name, participantCount: 0 },
            { localDate: '2026-12-25', startsAt: '2026-12-26T00:00:00.000Z',
                occurrenceKey: 'user-series:2026-12-25:primary', ordinal: 2,
                state: 'planned', tournamentId: null, name: payload.name, participantCount: 0 }
        ]
    };
}
