import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOnlineService } from '../../api/_lib/online-service.js';

const sql = (await readFile(new URL(
    '../../supabase/migrations/20261122002401_caissa_recurring_unskip_audit_hfx_003.sql', import.meta.url
), 'utf8')).toLowerCase();

test('unskip archives the original skip before deleting the active marker', () => {
    const archive = sql.indexOf('insert into public.caissa_online_tournament_series_skip_recoveries');
    const removal = sql.indexOf('delete from public.caissa_online_tournament_series_skips');
    assert.ok(archive >= 0 && removal > archive);
    assert.match(sql, /series_kind='user' and owner_clerk_id=p_clerk_id/u);
    assert.match(sql, /recovery_event_id text not null unique/u);
    assert.match(sql, /greatest\(v_now,v_next\)/u);
});

test('unskip ledger and RPC remain service-only with RLS enabled', () => {
    assert.match(sql, /alter table public\.caissa_online_tournament_series_skip_recoveries enable row level security/u);
    assert.match(sql, /revoke all on table public\.caissa_online_tournament_series_skip_recoveries from public,anon,authenticated/u);
    assert.match(sql, /revoke all on function public\.caissa_online_recurring_series_unskip[\s\S]+from public,anon,authenticated/u);
    assert.doesNotMatch(sql, /disable row level security|truncate table/u);
});

test('service routes only explicit unskip actions to the audited RPC', async () => {
    const calls = [];
    const db = { async rpc(name, args) {
        calls.push({ name, args });
        return { data: { series: [] }, error: null };
    } };
    await createOnlineService({ db }).manageRecurringSeries({
        clerkId: 'user_owner', eventId: 'series-unskip:test-event', action: 'unskip',
        payload: {
            seriesId: '88888888-8888-4888-8888-888888888888',
            localDate: '2026-11-22', reason: 'Restore owner event'
        }
    });
    assert.deepEqual(calls, [{
        name: 'caissa_online_recurring_series_unskip',
        args: {
            p_clerk_id: 'user_owner', p_event_id: 'series-unskip:test-event',
            p_series_id: '88888888-8888-4888-8888-888888888888',
            p_local_date: '2026-11-22', p_reason: 'Restore owner event'
        }
    }]);
});
