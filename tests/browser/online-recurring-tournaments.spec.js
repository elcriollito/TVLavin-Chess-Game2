import { test, expect } from '@playwright/test';

const seriesId = '99999999-9999-4999-8999-999999999999';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    const harness = {
        commands: [],
        state: {
            profile: { display_name: 'Recurring Member' }, ticket: null, game: null,
            recentGames: [], players: [], challenges: [],
            permissions: { tournamentOrganizer: false, recurringTournamentCreator: true },
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
                    tournamentCreation: true, publicTournamentDirectory: false,
                    arena100: true, tournamentRated: false, dailyTournaments: true,
                    dailyRated: false, weeklyArenas: true, recurringTournaments: true
                }, realtime: null
            } });
        }
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            harness.commands.push(command);
            if (command.eventType === 'series.create') {
                harness.state = { ...harness.state, recurring: { series: [seriesFixture(command.payload)] } };
            }
            if (command.eventType === 'series.pause') {
                harness.state.recurring.series[0].enabled = false;
            }
            if (command.eventType === 'series.unskip') {
                const restored = harness.state.recurring.series[0]?.upcoming
                    ?.find(item => item.localDate === command.payload.localDate);
                if (restored) restored.state = 'planned';
            }
        }
        return route.fulfill({ json: {
            protocolVersion: '1.0.0', eventType: 'tournament.snapshot',
            serverTimestamp: new Date().toISOString(), data: { state: harness.state }
        } });
    });
});

test('ordinary member creates a calendar series and sees server-planned dates', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#directory-tab-create').click();
    await expect(page.locator('#arena-create-repeat')).toBeChecked();
    await expect(page.locator('#arena-create-repeat')).toBeDisabled();
    await expect(page.locator('#arena-create-recurrence')).toBeVisible();
    await expect(page.locator('#arena-create-start-mode').locator('..')).toBeHidden();
    await expect(page.locator('#arena-create-type option[value="daily"]')).toHaveAttribute('disabled', '');

    await page.locator('#arena-create-name').fill('Community Multi-day Arena');
    await page.locator('#recurrence-interval').fill('2');
    await page.locator('#recurrence-frequency').selectOption('weekly');
    await page.locator('#recurrence-weekdays input[value="1"]').check();
    await page.locator('#recurrence-first-date').fill('2026-12-01');
    await page.locator('#recurrence-local-time').fill('19:00');
    await page.locator('#recurrence-timezone').fill('America/New_York');
    await page.locator('#recurrence-end-mode').selectOption('after_count');
    await page.locator('#recurrence-count').fill('8');
    await expect(page.locator('#recurrence-summary')).toContainText('Every 2 week(s) on Monday, Friday');
    const invalid = await page.locator('#arena-create-form').evaluate(form => Array.from(form.elements)
        .filter(control => control.willValidate && !control.checkValidity())
        .map(control => ({ id: control.id, value: control.value, message: control.validationMessage })));
    expect(invalid).toEqual([]);
    await page.locator('#arena-create-submit').click();
    await page.waitForTimeout(50);
    expect(pageErrors).toEqual([]);
    await expect.poll(() => harnesses.get(page).commands.some(command => command.eventType === 'series.create')).toBe(true);
    const creation = harnesses.get(page).commands.find(command => command.eventType === 'series.create');
    expect(creation.payload.recurrence.weekdays).toEqual([1, 5]);
    expect(creation.payload.recurrence.leadDays).toBe(2);
    expect(creation.payload.recurrence.occurrenceCount).toBe(8);
    expect(creation.payload.timeControlId).toBe('blitz-3-2');
    expect(creation.payload).not.toHaveProperty('startsAt');
    expect(creation.payload).not.toHaveProperty('daysPerMove');
    await expect(page.locator('#directory-tab-schedule')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#arena-schedule-list')).toContainText('Planned');
    await expect(page.locator('#arena-schedule-list')).toContainText('Tournament record not created yet');
    await expect(page.locator('#recurring-series-list')).toContainText('Community Multi-day Arena');
});

test('series ownership controls pause safely and mobile form does not overflow', async ({ page }) => {
    harnesses.get(page).state.recurring.series = [seriesFixture({
        name: 'Owned Arena', recurrence: {
            frequencyUnit: 'weekly', interval: 1, weekdays: [5], firstDate: '2026-12-04',
            localTime: '19:00', timeZone: 'America/New_York', leadDays: 2,
            endMode: 'never', endDate: null, occurrenceCount: null, enabled: true
        }, capacity: 16, durationMinutes: 30, lateJoin: true, pool: 'blitz', baseMs: 180000, incrementMs: 2000
    })];
    harnesses.get(page).state.recurring.series[0].upcoming[0].state = 'skipped';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#directory-tab-schedule').click();
    await page.getByRole('button', { name: 'Restore skipped' }).click();
    expect(harnesses.get(page).commands.some(command => command.eventType === 'series.unskip'
        && command.payload.localDate === '2026-12-11')).toBe(true);
    await page.getByRole('button', { name: 'Pause' }).click();
    expect(harnesses.get(page).commands.some(command => command.eventType === 'series.pause'
        && command.payload.seriesId === seriesId)).toBe(true);
    await expect(page.locator('#recurring-series-list')).toContainText('Paused');
    await page.getByRole('button', { name: 'Edit schedule' }).click();
    await expect(page.locator('#recurrence-first-date')).toHaveValue('2026-12-04');
    await expect(page.locator('#recurrence-summary')).toContainText('Friday');
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
    await page.goto('/online/tournaments?directory=1');
    await page.locator('#directory-tab-schedule').click();
    await expect(page.locator('#arena-schedule-list')).toContainText('Public Planned Arena');
    await expect(page.locator('#arena-schedule-list')).toContainText('Planned');
    await expect(page.locator('#recurring-series-list')).toBeEmpty();
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
            status: 'scheduled', startsAt: '2026-11-22T16:00:00.000Z', endsAt: '2026-11-22T16:30:00.000Z',
            registrationClosesAt: '2026-11-22T16:00:00.000Z', pool: 'bullet', baseMs: 120000,
            incrementMs: 1000, durationMinutes: 30, capacity: 16, participantCount: 0, rated: false
        }]
    };
    harnesses.get(page).state.daily.tournaments = [{
        id: dailyId, name: 'Community Daily', source: 'community', status: 'scheduled',
        startsAt: '2026-11-22T18:00:00.000Z', registrationClosesAt: '2026-11-22T18:00:00.000Z',
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
    await expect(page.locator('#arena-schedule-list')).toContainText('Scheduled tournament records');
    await expect(page.locator('#arena-schedule-list')).toContainText('Planned from recurrence rules');
    await expect(page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'Morning Arena' }))
        .toHaveClass(/arena-card--official/u);
    await expect(page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'OFFICIAL CAISSA LOOKALIKE' }))
        .toContainText('COMMUNITY TOURNAMENT');

    await page.locator('#arena-identity-filter').selectOption('official');
    await expect(page.locator('#arena-schedule-list')).toContainText('Morning Arena');
    await expect(page.locator('#arena-schedule-list')).not.toContainText('OFFICIAL CAISSA LOOKALIKE');
    await page.locator('#arena-identity-filter').selectOption('all');
    await page.locator('#arena-schedule-list .arena-card').filter({ hasText: 'Morning Arena' })
        .getByRole('button', { name: 'Details' }).click();
    await expect(page.locator('#arena-detail-identity')).toContainText('OFFICIAL CAISSA');
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
