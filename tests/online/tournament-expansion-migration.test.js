import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20261121042618_caissa_tournaments_expansion_weekly_daily_s001.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

test('expansion raises only the S001 ceiling and locks the final capacity decision', () => {
    assert.match(sql, /betaSeason'\) is distinct from 'S001' or capacity between 4 and 100/);
    assert.match(sql, /hashtextextended\(p_tournament_id::text,701302\)/);
    assert.match(sql, /select \* into v_t from public\.caissa_online_tournaments where id=p_tournament_id for update/);
    assert.match(sql, /state<>'withdrawn'\)[^;]*>=v_t\.capacity/);
});

test('Daily is server-authoritative, idempotent and browser-inaccessible', () => {
    for (const table of ['daily_groups', 'daily_group_members', 'daily_events']) {
        assert.match(sql, new RegExp(`alter table public\\.caissa_online_${table} enable row level security`));
        assert.match(sql, new RegExp(`revoke all on public\\.caissa_online_${table} from public, anon, authenticated`));
    }
    assert.match(sql, /move_deadline_at<=clock_timestamp\(\)/);
    assert.match(sql, /for update skip locked/);
    assert.match(sql, /on conflict\(game_id,event_id\) do nothing/);
    assert.match(sql, /rating_processed_at is not null/);
    assert.match(sql, /order by user_id for update/);
    assert.match(sql, /qualifier_count=greatest\(1,least\([\s\S]+count\(\*\)-1/);
    assert.match(sql, /grant execute on function public\.caissa_online_daily_commit_move[^;]+to service_role/);
    assert.doesNotMatch(sql, /grant (?:all|insert|update|delete|execute)[^;]+to (?:anon|authenticated)/i);
});

test('weekly scheduler is idempotent, DST-local, auditable and disabled until launch approval', () => {
    assert.match(sql, /'America\/New_York',6,'2026-11-28',7/);
    assert.match(sql, /'blitz',300000,0,60,100,4,false,true,false/);
    assert.match(sql, /at time zone v_series\.timezone/);
    assert.match(sql, /on conflict\(series_occurrence_key\)[^;]+do nothing/);
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('caissa-tournament-scheduler-s001'/);
    assert.match(sql, /caissa_online_scheduler_ledger/);
    assert.match(sql, /p_action='update'/);
    assert.match(sql, /registration_lead_days=\(p_payload->>'registrationLeadDays'\)::integer/);
    assert.match(sql, /order by started_at desc limit 20/);
    assert.match(sql, /if v_t\.participants<v_t\.min_players then update[^;]+status='cancelled'/);
    assert.match(sql, /cron\.schedule\('caissa-tournament-scheduler-s001','\* \* \* \* \*'/);
});

test('migration is forward-only and does not grant a browser administration path', () => {
    assert.doesNotMatch(sql, /\b(?:truncate|delete from)\b/i);
    assert.doesNotMatch(sql, /drop table/i);
    assert.match(sql, /revoke all on function public\.caissa_online_weekly_admin[^;]+from public,anon,authenticated/);
    assert.match(sql, /grant execute on function public\.caissa_online_weekly_admin[^;]+to service_role/);
});
