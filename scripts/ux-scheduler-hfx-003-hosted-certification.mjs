import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.CAISSA_ARENA_BETA_ORIGIN
    || 'https://caissa-arena-s001-beta-isolated.vercel.app';
const OTP = String(process.env.CAISSA_CLERK_TEST_OTP || '424242');
const EXPECTED_ISSUER = 'https://cheerful-mantis-9523.clerk.accounts.dev';
const TARGET_SERIES_ID = '739947f6-0552-45a5-ba24-ba5c1e3aeaa8';
const TARGET_TOURNAMENT_ID = 'f49e9939-71c2-4705-840a-35309946fff5';
const OFFICIAL_SERIES_ID = '50111e7e-ce57-47ef-af76-b7d0c4eeb685';
const runId = Date.now().toString(36).toLowerCase();
const identity = {
    email: `caissa-hfx003-${runId}+clerk_test@example.com`,
    password: `Aa1!${crypto.randomBytes(18).toString('base64url')}`
};
const outputDirectory = new URL('../docs/visual-evidence/', import.meta.url);
const browser = await chromium.launch({ headless: process.env.CAISSA_CERT_HEADED !== '1' });

try {
    await certify();
} finally {
    await identity.context?.close();
    await browser.close();
}

async function certify() {
    const config = await fetchJson(`${ORIGIN}/api/online?action=config`);
    assert.equal(config.rollout, 'preview');
    assert.equal(config.capabilities.recurringTournaments, true);
    assert.equal(new URL(config.realtime.url).hostname, 'imtwlzicxaaqjyvrkdsv.supabase.co');

    await register();
    const initial = await getState();
    const state = initial.data.state;
    const targetSeries = state.recurring.directory.find(series => series.id === TARGET_SERIES_ID);
    const officialSeries = state.recurring.directory.find(series => series.id === OFFICIAL_SERIES_ID);
    const targetTournament = state.arena.tournaments.find(item => item.id === TARGET_TOURNAMENT_ID);
    assert.equal(targetSeries.seriesKind, 'user');
    assert.equal(targetSeries.source, 'community');
    assert.equal(officialSeries.seriesKind, 'official');
    assert.equal(officialSeries.source, 'official');
    assert.equal(targetTournament.source, 'community');
    assert.equal(targetTournament.baseMs, 120_000);
    assert.equal(targetTournament.incrementMs, 1_000);
    console.log('HFX003_HOSTED_IDENTITY_PASS authoritative series_kind/source projected');

    const attemptedSpoof = await rawCommand('series.create', recurringPayload({ source: 'official' }));
    assert.equal(attemptedSpoof.response.status, 400);
    assert.match(attemptedSpoof.body.code, /^RECURRING_INVALID_/);

    const spoofName = `OFFICIAL CAISSA Spoof Probe ${runId}`;
    const created = await command('series.create', recurringPayload({ name: spoofName }));
    const communitySeries = created.data.state.recurring.series.find(series => series.title === spoofName);
    assert.ok(communitySeries?.id);
    assert.equal(communitySeries.seriesKind, 'user');
    assert.equal(communitySeries.source, 'community');
    await command('series.pause', { seriesId: communitySeries.id });
    console.log('HFX003_HOSTED_ANTI_SPOOF_PASS reserved fields rejected; title-only probe remained community');

    const deniedRestore = await rawCommand('series.unskip', {
        seriesId: TARGET_SERIES_ID,
        localDate: '2026-11-29',
        reason: 'Non-owner hosted authorization probe'
    });
    assert.equal(deniedRestore.response.status, 403);
    assert.equal(deniedRestore.body.code, 'RECURRING_NOT_OWNER');
    console.log('HFX003_HOSTED_OWNER_BOUNDARY_PASS cross-owner recovery denied');

    await identity.page.goto(`${ORIGIN}/online/tournaments?directory=1`, { waitUntil: 'domcontentloaded' });
    await waitForSignedIn();
    const dialog = identity.page.locator('#tournament-directory-dialog');
    await dialog.waitFor({ state: 'visible', timeout: 20_000 });

    await identity.page.locator('#directory-tab-current').click();
    const targetCard = identity.page.locator('#arena-current-list .arena-card')
        .filter({ hasText: 'Caissa Testing Tournament' });
    await targetCard.waitFor({ state: 'visible', timeout: 20_000 });
    await assertCardIdentity(targetCard, 'COMMUNITY TOURNAMENT', 'community');
    assert.equal(await targetCard.getByRole('button', { name: 'Join', exact: true }).count(), 1);

    const officialCard = identity.page.locator('#arena-current-list .arena-card')
        .filter({ hasText: 'Morning Arena' }).first();
    await officialCard.waitFor({ state: 'visible', timeout: 20_000 });
    await assertCardIdentity(officialCard, 'OFFICIAL CAISSA', 'official');
    await assertCurrentChronology();

    await mkdir(outputDirectory, { recursive: true });
    await identity.page.setViewportSize({ width: 1440, height: 1100 });
    await dialog.screenshot({ path: evidencePath('ux-scheduler-hfx-003-current.png'), animations: 'disabled' });

    await identity.page.locator('#directory-tab-schedule').click();
    const schedule = identity.page.locator('#arena-schedule-list');
    await schedule.getByRole('heading', { name: 'Scheduled tournament records' })
        .waitFor({ state: 'visible', timeout: 20_000 });
    await schedule.getByRole('heading', { name: 'Planned from recurrence rules' })
        .waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await schedule.locator('.arena-card button', { hasText: 'Join' }).count(), 0);
    const plannedButtons = await schedule.locator('.arena-card button', { hasText: 'Planned' }).count();
    assert.ok(plannedButtons > 0, 'planned recurrence rows must remain non-enrollable');
    await assertScheduleChronology();
    await dialog.screenshot({ path: evidencePath('ux-scheduler-hfx-003-schedule.png'), animations: 'disabled' });

    await identity.page.setViewportSize({ width: 390, height: 844 });
    await dialog.screenshot({ path: evidencePath('ux-scheduler-hfx-003-schedule-mobile.png'), animations: 'disabled' });

    console.log(`CAISSA_UX_SCHEDULER_HFX_003_HOSTED_CERTIFICATION ${JSON.stringify({
        status: 'pass', origin: ORIGIN, subject: identity.subject,
        targetSeriesId: TARGET_SERIES_ID, targetTournamentId: TARGET_TOURNAMENT_ID,
        antiSpoofSeriesId: communitySeries.id,
        screenshots: ['ux-scheduler-hfx-003-current.png', 'ux-scheduler-hfx-003-schedule.png',
            'ux-scheduler-hfx-003-schedule-mobile.png']
    })}`);
}

async function assertCardIdentity(card, label, kind) {
    const badge = card.locator(`.tournament-identity--${kind}`);
    await badge.waitFor({ state: 'visible' });
    assert.equal(await badge.getAttribute('aria-label'), label);
    assert.match(await badge.textContent(), new RegExp(label));
}

async function assertCurrentChronology() {
    const names = await identity.page.locator('#arena-current-list .arena-card h4').allTextContents();
    const expected = ['Caissa Testing Tournament', 'Morning Arena', 'Evening Arena'];
    let cursor = -1;
    for (const name of expected) {
        const next = names.findIndex((candidate, index) => index > cursor && candidate.includes(name));
        assert.ok(next > cursor, `${name} is not in starts_at order: ${names.join(' | ')}`);
        cursor = next;
    }
}

async function assertScheduleChronology() {
    const cards = identity.page.locator('#arena-schedule-list .arena-card');
    const names = await cards.locator('h4').allTextContents();
    const timestamps = await getState().then(result => {
        const tournaments = result.data.state.arena.tournaments;
        return new Map(tournaments.map(item => [item.name, Date.parse(item.startsAt)]));
    });
    const materializedNames = names.filter(name => timestamps.has(name));
    const values = materializedNames.map(name => timestamps.get(name));
    assert.deepEqual(values, [...values].sort((left, right) => left - right));
}

async function register() {
    identity.context = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York' });
    identity.page = await identity.context.newPage();
    await identity.page.goto(`${ORIGIN}/signup?redirect_url=${encodeURIComponent('/online/tournaments?directory=1')}`,
        { waitUntil: 'domcontentloaded' });
    await identity.page.waitForFunction(() => window.Clerk?.client?.signUp, null, { timeout: 30_000 });
    const auth = await identity.page.evaluate(async ({ email, password, otp }) => {
        const decode = token => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
            .padEnd(Math.ceil(token.split('.')[1].length / 4) * 4, '=')));
        let attempt = await window.Clerk.client.signUp.create({ emailAddress: email, password, legalAccepted: true });
        if (attempt.status !== 'complete') {
            await attempt.prepareEmailAddressVerification({ strategy: 'email_code' });
            attempt = await attempt.attemptEmailAddressVerification({ code: otp });
        }
        if (attempt.status !== 'complete' || !attempt.createdSessionId) {
            throw new Error(`CLERK_SIGN_UP_INCOMPLETE:${attempt.status}`);
        }
        await window.Clerk.setActive({ session: attempt.createdSessionId });
        const claims = decode(await window.Clerk.session.getToken());
        return { subject: window.Clerk.user?.id, issuer: claims.iss, role: claims.role, azp: claims.azp };
    }, { email: identity.email, password: identity.password, otp: OTP });
    identity.subject = auth.subject;
    assert.equal(auth.issuer, EXPECTED_ISSUER);
    assert.equal(auth.role, 'authenticated');
    assert.equal(auth.azp, ORIGIN);
    await identity.page.goto(`${ORIGIN}/auth/complete?redirect_url=${encodeURIComponent('/online/tournaments?directory=1')}`,
        { waitUntil: 'domcontentloaded' });
    await identity.page.waitForURL(url => url.origin === ORIGIN
        && url.pathname === '/online/tournaments' && url.searchParams.get('directory') === '1', { timeout: 30_000 });
    await waitForSignedIn();
}

async function getState() {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const response = await fetch(`${ORIGIN}/api/online?action=state`, {
        headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN }, redirect: 'error'
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`state:${response.status}:${body.code || 'UNKNOWN'}`);
    return body;
}

async function rawCommand(eventType, payload = {}) {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const response = await fetch(`${ORIGIN}/api/online`, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            protocolVersion: '1.0.0', eventType,
            eventId: `${eventType.replaceAll('.', '-')}:${crypto.randomUUID()}`,
            gameId: null, clientSentAt: Date.now(), payload
        })
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { code: 'NON_JSON', detail: text.slice(0, 160) }; }
    return { response, body };
}

async function command(eventType, payload = {}) {
    const result = await rawCommand(eventType, payload);
    if (!result.response.ok) throw new Error(`${eventType}:${result.response.status}:${result.body.code || 'UNKNOWN'}`);
    return result.body;
}

function recurringPayload(overrides = {}) {
    return {
        name: `Community HFX003 Probe ${runId}`,
        timeControlId: 'bullet-2-1', durationMinutes: 30, capacity: 16,
        lateJoin: true, rated: false,
        recurrence: {
            frequencyUnit: 'weekly', interval: 1, weekdays: [weekday(futureDate(30))],
            firstDate: futureDate(30), localTime: '19:00', timeZone: 'America/New_York',
            leadDays: 2, endMode: 'after_count', endDate: null, occurrenceCount: 1, enabled: true
        },
        ...overrides
    };
}

async function waitForSignedIn() {
    await identity.page.waitForFunction(() => window.CAISSA_AUTH?.isSignedIn === true, null, { timeout: 30_000 });
}

async function fetchJson(url) {
    const response = await fetch(url, { redirect: 'error' });
    assert.equal(response.status, 200);
    return response.json();
}

function futureDate(days) {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + days);
    return now.toISOString().slice(0, 10);
}

function weekday(date) {
    return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function evidencePath(name) {
    return fileURLToPath(new URL(name, outputDirectory));
}
