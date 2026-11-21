import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.CAISSA_ARENA_BETA_ORIGIN
    || 'https://caissa-arena-s001-beta-isolated.vercel.app';
const OTP = String(process.env.CAISSA_CLERK_TEST_OTP || '424242');
const EXPECTED_ISSUER = 'https://cheerful-mantis-9523.clerk.accounts.dev';
const runId = String(process.env.CAISSA_CERT_RUN_ID || Date.now().toString(36)).toLowerCase();
const firstDate = easternDateOffset(1);
const secondDate = easternDateOffset(4);
const resumeSeriesName = String(process.env.CAISSA_RECURRING_CERT_RESUME_NAME || '').trim();
const seriesName = resumeSeriesName || `CAISSA Recurring S002 Hosted ${runId}`;
const existingIdentities = parseExistingIdentities(process.env.CAISSA_RECURRING_CERT_IDENTITIES);
const identities = existingIdentities || ['OWNER', 'OTHER'].map(label => ({
    label,
    email: `caissa-recurring-${runId}-${label.toLowerCase()}+clerk_test@example.com`,
    password: `Aa1!${crypto.randomBytes(18).toString('base64url')}`
}));
const browser = await chromium.launch({ headless: process.env.CAISSA_CERT_HEADED !== '1' });

try {
    await certify();
} finally {
    await Promise.allSettled(identities.map(identity => identity.context?.close()));
    await browser.close();
}

async function certify() {
    const publicConfig = await fetchJson(`${ORIGIN}/api/online?action=config`);
    assert.equal(publicConfig.rollout, 'preview');
    assert.equal(publicConfig.capabilities.recurringTournaments, true);
    assert.equal(publicConfig.capabilities.dailyTournaments, true);
    assert.equal(publicConfig.capabilities.tournamentRated, true);
    assert.equal(new URL(publicConfig.realtime.url).hostname, 'imtwlzicxaaqjyvrkdsv.supabase.co');
    console.log('RECURRING_HOSTED_CONFIG_PASS preview isolated backend feature enabled');

    for (const identity of identities) {
        if (existingIdentities) await establishSignIn(identity);
        else await register(identity);
    }
    assert.equal(new Set(identities.map(identity => identity.subject)).size, 2);
    console.log(`RECURRING_HOSTED_AUTH_PASS ${identities.map(identity => `${identity.label}:${identity.subject}`).join(' ')}`);

    const owner = identities[0];
    const other = identities[1];
    let ownerState;
    if (resumeSeriesName) {
        ownerState = await getState(owner);
        assert.ok(ownerState.data.state.recurring?.series?.some(series => series.title === seriesName),
            'requested certification series is unavailable');
    } else {
        await cleanPreviousCertificationSeries(owner);
        await createThroughBrowser(owner);
        ownerState = await poll(async () => {
            const state = await getState(owner);
            return state.data.state.recurring?.series?.find(series => series.title === seriesName)
                ? state : null;
        }, 30_000, 'series creation');
    }
    const series = ownerState.data.state.recurring.series.find(item => item.title === seriesName);
    assert.equal(series.frequencyUnit, 'daily');
    assert.equal(series.interval, 3);
    assert.equal(series.leadDays, 2);
    assert.equal(series.occurrenceCount, 2);
    assert.equal(series.template.rated, false);
    console.log(`RECURRING_HOSTED_CREATE_PASS series=${series.id}`);

    const participantState = await getState(other);
    assert.equal(participantState.data.state.recurring.series.length, 0);
    assert.ok(participantState.data.state.recurring.directory.some(item => item.id === series.id));
    const denied = await rawCommand(other, 'series.pause', { seriesId: series.id });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.body.code, 'RECURRING_NOT_OWNER');
    console.log('RECURRING_HOSTED_OWNERSHIP_PASS participant plan visible; cross-owner mutation denied');

    await command(owner, 'series.update', {
        seriesId: series.id,
        recurrence: recurrenceRule(true)
    });
    const generated = await poll(async () => {
        const state = await getState(owner);
        const current = state.data.state.recurring.series.find(item => item.id === series.id);
        const occurrence = current?.upcoming?.find(item => item.localDate === firstDate && item.tournamentId);
        return occurrence ? { state, current, occurrence } : null;
    }, 120_000, 'Cron occurrence generation', 2_000);
    assert.equal(generated.occurrence.state, 'registration_open');
    const tournamentId = generated.occurrence.tournamentId;
    console.log(`RECURRING_HOSTED_CRON_PASS tournament=${tournamentId} occurrence=${generated.occurrence.occurrenceKey}`);

    await joinThroughBrowser(owner, tournamentId);
    let tournament = currentTournament(await command(owner, 'tournament.sync', { tournamentId }));
    assert.equal(tournament.participantCount, 1);
    assert.notEqual(tournament.myState, 'withdrawn');
    await owner.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForSignedIn(owner);
    tournament = currentTournament(await command(owner, 'tournament.sync', { tournamentId }));
    assert.equal(tournament.participantCount, 1);
    assert.notEqual(tournament.myState, 'withdrawn');
    console.log('RECURRING_HOSTED_JOIN_PASS UI registration persisted after reload');

    await command(owner, 'series.skip', {
        seriesId: series.id,
        localDate: secondDate,
        reason: 'Hosted S002 certification skip'
    });
    await command(owner, 'series.pause', { seriesId: series.id });
    const paused = await getState(owner);
    const pausedSeries = paused.data.state.recurring.series.find(item => item.id === series.id);
    assert.equal(pausedSeries.enabled, false);
    assert.equal(pausedSeries.upcoming.find(item => item.localDate === secondDate)?.state, 'skipped');
    await command(owner, 'series.cancel', { seriesId: series.id, tournamentId });
    tournament = currentTournament(await command(owner, 'tournament.sync', { tournamentId }));
    assert.equal(tournament.status, 'cancelled');
    console.log('RECURRING_HOSTED_MANAGEMENT_PASS update, skip, pause and future cancellation');

    console.log(`CAISSA_RECURRING_S002_HOSTED_CERTIFICATION ${JSON.stringify({
        status: 'pass', origin: ORIGIN, seriesId: series.id, tournamentId,
        occurrenceKey: generated.occurrence.occurrenceKey,
        firstDate, skippedDate: secondDate,
        identities: identities.map(identity => ({ label: identity.label, subject: identity.subject }))
    })}`);
}

async function cleanPreviousCertificationSeries(identity) {
    const state = await getState(identity);
    const staleSeries = state.data.state.recurring?.series?.filter(series =>
        series.title?.startsWith('CAISSA Recurring S002 Hosted ') && series.title !== seriesName) || [];
    for (const series of staleSeries) {
        if (series.enabled) await command(identity, 'series.pause', { seriesId: series.id });
        for (const occurrence of series.upcoming || []) {
            if (occurrence.tournamentId && !['completed', 'cancelled'].includes(occurrence.state)) {
                await command(identity, 'series.cancel', {
                    seriesId: series.id, tournamentId: occurrence.tournamentId
                });
            }
        }
    }
    if (staleSeries.length) console.log(`RECURRING_HOSTED_CLEANUP_PASS series=${staleSeries.length}`);
}

async function createThroughBrowser(identity) {
    await identity.page.goto(`${ORIGIN}/online/tournaments?directory=1`, { waitUntil: 'domcontentloaded' });
    await waitForSignedIn(identity);
    const dialog = identity.page.locator('#tournament-directory-dialog');
    if (!await dialog.isVisible()) await identity.page.locator('#tournament-empty-browse').click();
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    await identity.page.locator('#directory-tab-create').click();
    await assertEventually(async () => identity.page.locator('#arena-create-repeat').isChecked(), 'repeat default');
    await identity.page.locator('#arena-create-name').fill(seriesName);
    await identity.page.locator('#recurrence-frequency').selectOption('daily');
    await identity.page.locator('#recurrence-interval').fill('3');
    await identity.page.locator('#recurrence-first-date').fill(firstDate);
    await identity.page.locator('#recurrence-local-time').fill('19:00');
    await identity.page.locator('#recurrence-timezone').fill('America/New_York');
    await identity.page.locator('#recurrence-end-mode').selectOption('after_count');
    await identity.page.locator('#recurrence-count').fill('2');
    await identity.page.locator('#recurrence-lead-days').selectOption('2');
    await identity.page.locator('#arena-create-submit').click();
    await identity.page.locator('#directory-panel-schedule[role="tabpanel"]')
        .waitFor({ state: 'visible', timeout: 20_000 });
}

async function joinThroughBrowser(identity, tournamentId) {
    await identity.page.goto(`${ORIGIN}/online/tournaments?directory=1`, { waitUntil: 'domcontentloaded' });
    await waitForSignedIn(identity);
    const dialog = identity.page.locator('#tournament-directory-dialog');
    if (!await dialog.isVisible()) await identity.page.locator('#tournament-empty-browse').click();
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    await identity.page.locator('#directory-tab-current').click();
    await identity.page.locator('#directory-panel-current[role="tabpanel"]')
        .waitFor({ state: 'visible', timeout: 15_000 });
    const card = identity.page.locator('#arena-current-list .arena-card').filter({ hasText: seriesName });
    if (process.env.CAISSA_CERT_DIAGNOSTICS === '1') {
        await identity.page.waitForTimeout(1_000);
        const diagnostics = await card.evaluateAll(elements => elements.map(element => ({
            panel: element.closest('[data-directory-panel]')?.id || null,
            panelHidden: element.closest('[data-directory-panel]')?.hidden,
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            rect: { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
            text: element.textContent
        })));
        console.log(`RECURRING_HOSTED_UI_DIAGNOSTICS ${JSON.stringify(diagnostics)}`);
    }
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    let persisted = currentTournament(await command(identity, 'tournament.sync', { tournamentId }));
    if (!persisted.myState || persisted.myState === 'withdrawn') {
        await card.getByRole('button', { name: 'Join', exact: true }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
        persisted = currentTournament(await command(identity, 'tournament.sync', { tournamentId }));
    }
    assert.notEqual(persisted.myState, 'withdrawn');
    await identity.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForSignedIn(identity);
    const reopened = identity.page.locator('#tournament-directory-dialog');
    if (!await reopened.isVisible()) await identity.page.locator('#tournament-empty-browse').click();
    await reopened.waitFor({ state: 'visible', timeout: 15_000 });
    await identity.page.locator('#directory-tab-current').click();
    const registeredCard = identity.page.locator('#arena-current-list .arena-card').filter({ hasText: seriesName });
    await registeredCard.getByRole('button', { name: 'Registered', exact: true })
        .waitFor({ state: 'visible', timeout: 20_000 });
}

async function register(identity) {
    identity.context = await browser.newContext();
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
    await waitForSignedIn(identity);
}

async function establishSignIn(identity) {
    identity.context = await browser.newContext();
    identity.page = await identity.context.newPage();
    const destination = '/online/tournaments?directory=1';
    await identity.page.goto(`${ORIGIN}/signin?redirect_url=${encodeURIComponent(destination)}`,
        { waitUntil: 'domcontentloaded' });
    await identity.page.waitForFunction(() => window.Clerk?.client?.signIn, null, { timeout: 30_000 });
    const auth = await identity.page.evaluate(async ({ email, otp }) => {
        const decode = token => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
            .padEnd(Math.ceil(token.split('.')[1].length / 4) * 4, '=')));
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
        const claims = decode(await clerk.session.getToken());
        return { subject: clerk.user?.id, issuer: claims.iss, role: claims.role, azp: claims.azp };
    }, { email: identity.email, otp: OTP });
    assert.equal(auth.subject, identity.subject);
    assert.equal(auth.issuer, EXPECTED_ISSUER);
    assert.equal(auth.role, 'authenticated');
    assert.equal(auth.azp, ORIGIN);
    await identity.page.goto(`${ORIGIN}/auth/complete?redirect_url=${encodeURIComponent(destination)}`,
        { waitUntil: 'domcontentloaded' });
    await identity.page.waitForURL(url => url.origin === ORIGIN
        && url.pathname === '/online/tournaments' && url.searchParams.get('directory') === '1', { timeout: 30_000 });
    await waitForSignedIn(identity);
}

async function getState(identity) {
    const token = await identity.page.evaluate(() => window.Clerk.session.getToken());
    const response = await fetch(`${ORIGIN}/api/online?action=state`, {
        headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN }, redirect: 'error'
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`state:${response.status}:${body.code || 'UNKNOWN'}`);
    return body;
}

async function rawCommand(identity, eventType, payload = {}) {
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

async function command(identity, eventType, payload = {}) {
    const result = await rawCommand(identity, eventType, payload);
    if (!result.response.ok) throw new Error(`${eventType}:${result.response.status}:${result.body.code || 'UNKNOWN'}`);
    return result.body;
}

function currentTournament(envelope) {
    const tournament = envelope?.data?.state?.arena?.current;
    assert.ok(tournament, 'Tournament snapshot is missing');
    return tournament;
}

function recurrenceRule(enabled) {
    return {
        frequencyUnit: 'daily', interval: 3, weekdays: [], firstDate,
        localTime: '19:00', timeZone: 'America/New_York', leadDays: 2,
        endMode: 'after_count', endDate: null, occurrenceCount: 2, enabled
    };
}

async function waitForSignedIn(identity) {
    await identity.page.waitForFunction(() => window.CAISSA_AUTH?.isSignedIn === true, null, { timeout: 30_000 });
}

async function fetchJson(url) {
    const response = await fetch(url, { redirect: 'error' });
    assert.equal(response.status, 200);
    return response.json();
}

async function poll(operation, timeoutMs, label, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await operation();
        if (result) return result;
        await delay(intervalMs);
    }
    throw new Error(`TIMEOUT:${label}`);
}

async function assertEventually(operation, label) {
    await poll(async () => await operation() ? true : null, 15_000, label);
}

function easternDateOffset(days) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days));
    return date.toISOString().slice(0, 10);
}

function parseExistingIdentities(raw) {
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed) && parsed.length === 2,
        'CAISSA_RECURRING_CERT_IDENTITIES must contain exactly two identities');
    return parsed.map((identity, index) => {
        assert.equal(typeof identity.email, 'string');
        assert.match(identity.subject, /^user_/);
        return { label: identity.label || (index === 0 ? 'OWNER' : 'OTHER'),
            email: identity.email, subject: identity.subject };
    });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
