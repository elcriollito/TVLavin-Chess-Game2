import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20261120033413_caissa_online_arena_s001.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const tournamentUxUrl = new URL('../../supabase/migrations/20261121034500_caissa_tournament_ux_s001.sql', import.meta.url);
const tournamentUxSql = await readFile(tournamentUxUrl, 'utf8');

test('Arena migration models every required lifecycle without weakening legacy scoring', () => {
    for (const state of ['draft', 'scheduled', 'registration_open', 'active', 'finishing', 'completed', 'cancelled']) {
        assert.match(sql, new RegExp(`'${state}'`));
    }
    for (const state of ['registered', 'waiting', 'playing', 'withdrawn', 'disconnected']) {
        assert.match(sql, new RegExp(`'${state}'`));
    }
    for (const state of ['assigned', 'ready', 'active', 'finished', 'expired']) {
        assert.match(sql, new RegExp(`'${state}'`));
    }
    assert.match(sql, /scoring_contract[^;]+arena-s001-2-1-0/s);
    assert.match(sql, /when '1-0' then 2 when '1\/2-1\/2' then 1 else 0/);
    assert.doesNotMatch(sql, /create or replace function caissa_online_private\.apply_rating/);
});

test('pairing is transactional, deterministic, color-aware, and excludes active games', () => {
    assert.match(sql, /pg_advisory_xact_lock[\s\S]+701101/);
    assert.match(sql, /pg_advisory_xact_lock[\s\S]+701201/);
    assert.match(sql, /pg_advisory_xact_lock[\s\S]+701001/);
    assert.match(sql, /for update skip locked/);
    assert.match(sql, /last_opponent_user_id/);
    assert.match(sql, /abs\(coalesce\(candidate\.rating_at_join, 1500\)/);
    assert.match(sql, /color_balance/);
    assert.match(sql, /game\.status = 'active'/);
    assert.match(sql, /v_tournament\.ends_at <= pg_catalog\.clock_timestamp\(\)/);
    assert.match(sql, /participant\.state = 'waiting'[\s\S]+presence\.expires_at > pg_catalog\.clock_timestamp\(\)/);
});

test('result scoring is guarded exactly once and finishing waits for active games', () => {
    assert.match(sql, /link\.scored_at is not null then return false/);
    assert.match(sql, /where[^;]+scored_at is null/s);
    assert.match(sql, /status = 'finishing'/);
    assert.match(sql, /game\.status = 'active'/);
    assert.match(sql, /status = 'completed', completed_at/);
});

test('no-op membership commands cannot amplify audit events or tournament versions', () => {
    assert.match(sql, /participant\.state <> 'withdrawn'[\s\S]+return public\.caissa_online_arena_sync\(p_clerk_id, p_tournament_id\)/);
    assert.match(sql, /v_participant_state is null then[\s\S]+CAISSA_ONLINE_ARENA_NOT_PARTICIPANT/);
    assert.match(sql, /v_participant_state = 'withdrawn' then[\s\S]+return public\.caissa_online_arena_sync\(p_clerk_id, p_tournament_id\)/);
});

test('Arena tables and RPCs stay server-only while Realtime is participant-private', () => {
    assert.match(sql, /alter table public\.caissa_online_arena_pairings enable row level security/);
    assert.match(sql, /revoke all on public\.caissa_online_arena_pairings from public, anon, authenticated/);
    assert.match(sql, /revoke all on function public\.caissa_online_arena_join\(text, uuid, text\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.caissa_online_arena_join\(text, uuid, text\) to service_role/);
    assert.doesNotMatch(sql, /grant all on public\.caissa_online_arena_(?:pairings|events)/i);
    assert.match(sql, /create policy caissa_online_tournament_broadcast_read/);
    assert.match(sql, /can_read_current_tournament_topic/);
    assert.doesNotMatch(sql, /alter table realtime\.messages enable row level security/i);
    assert.doesNotMatch(sql, /grant (?:all|insert|update|delete) on public\.caissa_online_[^;]+ to authenticated/i);
});

test('the protected Founders beta defaults are encoded in the creation contract', () => {
    assert.match(sql, /'betaSeason', 'S001'/);
    assert.match(sql, /'publicDirectory', false/);
    assert.match(sql, /'chat', false/);
    assert.match(sql, /false, 'private'/);
    assert.match(sql, /true, 4, 4/);
    assert.match(sql, /finish_active_games/);
});

test('Tournament UX keeps community creation bounded and server-only', () => {
    assert.match(tournamentUxSql, /capacity between 4 and 64/);
    assert.match(tournamentUxSql, /p_duration_minutes not between 5 and 180/);
    assert.match(tournamentUxSql, /p_starts_at > v_now \+ interval '31 days'/);
    assert.match(tournamentUxSql, /CAISSA_ONLINE_ARENA_CREATION_LIMIT/);
    assert.match(tournamentUxSql, /CAISSA_ONLINE_ARENA_CREATION_COOLDOWN/);
    assert.match(tournamentUxSql, /CAISSA_ONLINE_ARENA_CREATION_CONFLICT/);
    assert.match(tournamentUxSql, /prevent_overlapping_arena_participation/);
    assert.match(tournamentUxSql, /CAISSA_ONLINE_ARENA_PARTICIPATION_CONFLICT/);
    assert.match(tournamentUxSql, /hashtextextended\(p_tournament_id::text, 701101\)[\s\S]*hashtextextended\(v_user_id::text, 701202\)/);
    assert.match(tournamentUxSql, /v_tournament\.created_by_clerk_id is distinct from p_clerk_id/);
    assert.match(tournamentUxSql, /revoke all on function public\.caissa_online_arena_manage/);
    assert.match(tournamentUxSql, /grant execute on function public\.caissa_online_arena_manage[^;]+to service_role/);
    assert.doesNotMatch(tournamentUxSql, /drop function if exists public\.caissa_online_arena_create/i);
    assert.doesNotMatch(tournamentUxSql, /grant .+ to (?:anon|authenticated)/i);
    assert.doesNotMatch(tournamentUxSql, /\b(?:delete|truncate)\b/i);
});
