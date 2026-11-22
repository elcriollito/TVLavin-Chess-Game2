import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = (await readFile(new URL(
    '../../supabase/migrations/20261122000532_caissa_tournaments_ux_scheduler_hfx_003.sql', import.meta.url
), 'utf8')).toLowerCase();

test('lead-window repair clamps only future unmaterialized community occurrences to now', () => {
    assert.match(migration, /greatest\(v_now,v_due\)/u);
    assert.match(migration, /candidate\.starts_at>clock_timestamp\(\)/u);
    assert.match(migration, /not exists\(select 1 from public\.caissa_online_tournaments tournament/u);
    assert.match(migration, /series\.series_kind='user' and series\.enabled/u);
    assert.match(migration, /v_candidate\.starts_at<=p_now/u);
    assert.match(migration, /on conflict\(series_occurrence_key\)[\s\S]+do nothing/u);
});

test('identity is projected only from source and series_kind contracts', () => {
    assert.match(migration, /'source',tournament\.source/u);
    assert.match(migration, /'serieskind',series\.series_kind/u);
    assert.match(migration, /case when listed\.series_kind='official' then 'official' else 'community' end/u);
    assert.doesNotMatch(migration, /title\s+(?:like|ilike)|organizer.*official/u);
});

test('browser roles cannot read identity projection or recurrence internals', () => {
    assert.match(migration, /revoke all on function public\.caissa_online_tournament_identity_projection\(uuid\[\]\)[\s\S]+from public,anon,authenticated/u);
    assert.match(migration, /grant execute on function public\.caissa_online_tournament_identity_projection\(uuid\[\]\) to service_role/u);
    assert.doesNotMatch(migration, /disable row level security|truncate table|delete from/u);
});
