import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20261121220000_caissa_recurring_tournaments_s002.sql', import.meta.url);
const sql = (await readFile(migrationUrl, 'utf8')).toLowerCase();
const engineHotfixUrl = new URL('../../supabase/migrations/20261121232000_caissa_recurring_tournaments_s002_arena_engine_hfx.sql', import.meta.url);
const engineHotfixSql = (await readFile(engineHotfixUrl, 'utf8')).toLowerCase();

test('S002 extends the one existing series table without replacing official data', () => {
    assert.match(sql, /alter table public\.caissa_online_tournament_series[\s\S]+add column if not exists owner_clerk_id/);
    assert.doesNotMatch(sql, /drop table|truncate table|delete from public\.caissa_online_tournament/);
    assert.match(sql, /where slug = 'saturdays-of-chess-s001'[\s\S]+owner_clerk_id is null/);
    assert.match(sql, /where enabled and series_kind='official'/);
});

test('stable occurrence keys, one shared scheduler lock and bounded generation prevent duplicates', () => {
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_clerk_id,701402\)\)/u);
    assert.match(sql, /s\.slug\|\|':'\|\|d\.local_date::text\|\|':primary'/);
    assert.match(sql, /on conflict\(series_occurrence_key\)[\s\S]+do nothing/);
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('caissa-tournament-scheduler-s001',701401\)\)/);
    assert.match(sql, /recurring_generate\(p_now,100\)/);
    assert.match(sql, /v_candidate\.starts_at<=p_now/);
    assert.match(sql, /never creates past backlogs/);
    assert.equal((sql.match(/cron\.schedule\(/g) || []).length, 0, 'S002 must reuse the existing Cron job');
});

test('calendar rules remain server authoritative and timezone aware', () => {
    assert.match(sql, /at time zone s\.timezone/);
    assert.match(sql, /'directory',coalesce/);
    assert.match(sql, /where candidate\.starts_at>p_now/);
    assert.match(sql, /limit 100\) listed/);
    assert.match(sql, /frequency_unit in \('daily','weekly'\)/);
    assert.match(sql, /extract\(dow from day\)::smallint=any\(s\.weekdays\)/);
    assert.match(sql, /end_after_occurrences between 1 and 100/);
    assert.match(sql, /generation_lead_days in \(1,2\)/);
});

test('browser roles cannot execute scheduler or ownership RPCs', () => {
    for (const signature of [
        'caissa_online_private.recurring_generate',
        'public.caissa_online_recurring_series_create',
        'public.caissa_online_recurring_series_manage',
        'public.caissa_online_recurring_series_sync'
    ]) {
        assert.match(sql, new RegExp(`revoke all on function ${signature.replaceAll('.', '\\.')}`));
    }
    assert.match(sql, /from public,anon,authenticated/);
    assert.match(sql, /series_kind='user' and owner_clerk_id=p_clerk_id/);
    assert.match(sql, /where id=\(p_payload->>'seriesid'\)::uuid and series_kind='user' and owner_clerk_id=p_clerk_id/);
});

test('S002 retains RLS and adds selective owner/due indexes', () => {
    assert.doesNotMatch(sql, /disable row level security/);
    assert.match(sql, /caissa_online_tournament_series_owner_active_idx/);
    assert.match(sql, /caissa_online_tournament_series_due_idx/);
    assert.match(sql, /caissa_online_tournament_series_creation_event_uq/);
});

test('generated recurrences reuse the certified Arena S001 engine', () => {
    assert.match(engineHotfixSql, /'betaseason','s001'/);
    assert.match(engineHotfixSql, /'recurrenceseason','s002'/);
    assert.match(engineHotfixSql, /where tournament\.configuration->>'betaseason' = 's002'[\s\S]+series\.series_kind = 'user'/);
    assert.doesNotMatch(engineHotfixSql, /delete from|truncate table|drop table/);
    assert.match(engineHotfixSql, /revoke all on function caissa_online_private\.recurring_generate[\s\S]+from public,anon,authenticated/);
});
