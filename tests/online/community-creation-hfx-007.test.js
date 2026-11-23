import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateArenaCreation } from '../../api/_lib/online-arena.js';
import { validateDailyCreation } from '../../api/_lib/online-daily.js';

const api = readFileSync(new URL('../../api/online.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../js/online/online-page.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../online.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL(
    '../../supabase/migrations/20261123232049_caissa_community_creation_hfx_007.sql',
    import.meta.url
), 'utf8');

test('one-time community creation is member-scoped without granting official administration', () => {
    assert.match(api, /communityTournamentCreator:\s*authenticatedMember[\s\S]+CAISSA_ONLINE_ARENA_CREATE/);
    assert.match(api, /tournamentOrganizer:\s*authenticatedMember[\s\S]+CAISSA_ONLINE_TOURNAMENT_ADMINS/);
    assert.doesNotMatch(api, /event\.eventType === 'tournament\.create'[\s\S]{0,220}CAISSA_ONLINE_TOURNAMENT_ADMINS/);
    assert.doesNotMatch(api, /event\.eventType === 'daily\.create'[\s\S]{0,220}CAISSA_ONLINE_TOURNAMENT_ADMINS/);
    assert.match(api, /action !== 'sync'[\s\S]+RECURRING_OPERATOR_REQUIRED/);
});

test('the golden CTA is environment-visible and signed-out creation preserves return intent', () => {
    assert.match(html, /id="tournament-directory-create"[\s\S]{0,240}<span[^>]+>\+<\/span> Create Tournament/);
    assert.match(page, /creationAvailable[\s\S]+tournament-directory-create'\)\.hidden = !creationAvailable/);
    assert.match(page, /tournamentCreateIntent[\s\S]+directory=1&create=1/);
    assert.match(page, /Sign in with a CAISSA member account to create a community tournament/);
    assert.doesNotMatch(html, /id="arena-create-repeat"|id="arena-create-recurrence"|weekly-admin-controls/);
});

test('forged official and recurrence fields are rejected by both creation validators', () => {
    const common = {
        name: 'Community Tournament', startsAt: new Date(Date.now() + 172_800_000).toISOString(),
        capacity: 16, rated: false
    };
    for (const forbidden of [
        { source: 'official' }, { seriesKind: 'official' }, { recurrence: {} },
        { seriesId: '22222222-2222-4222-8222-222222222222' }, { enabled: true }
    ]) {
        assert.equal(validateArenaCreation({
            ...common, timeControlId: 'blitz-3-2', durationMinutes: 30, lateJoin: true, ...forbidden
        }).code, 'INVALID_ARENA_FIELDS');
        assert.equal(validateDailyCreation({
            ...common, description: '', daysPerMove: 7, groupSize: 4,
            qualifiersPerGroup: 2, ...forbidden
        }).code, 'INVALID_DAILY_FIELDS');
    }
});

test('Daily RPC enforces shared quota, cooldown, idempotency and community identity', () => {
    assert.match(migration, /hashtextextended\(p_event_id, 701301\)/);
    assert.match(migration, /hashtextextended\(v_user_id::text, 701202\)/);
    assert.match(migration, /status in \('scheduled', 'registration_open', 'active', 'finishing'\)[\s\S]+>= 3/);
    assert.match(migration, /created_at > v_now - interval '60 seconds'/);
    assert.match(migration, /'community', 'round-robin'/);
    assert.match(migration, /'userCreated', true/);
    assert.doesNotMatch(migration, /series_id|series_kind|source\s*:=/i);
    assert.match(migration, /revoke all on function public\.caissa_online_daily_create[\s\S]+from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.caissa_online_daily_create[\s\S]+to service_role/);
});

test('both one-time creation commands use the conservative shared rate bucket', () => {
    assert.match(api, /event\?\.eventType === 'tournament\.create' \|\| event\?\.eventType === 'daily\.create'[\s\S]+bucket: 'tournament-create', limit: 6, windowSeconds: 3600/);
});
