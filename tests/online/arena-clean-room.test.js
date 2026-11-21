import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const foundationUrl = new URL(
    '../../supabase/arena-s001-clean-room/supabase/migrations/20261120232156_caissa_arena_s001_beta_foundation.sql',
    import.meta.url
);
const manifestUrl = new URL('../../supabase/arena-s001-clean-room/README.md', import.meta.url);
const indexHardeningUrl = new URL(
    '../../supabase/arena-s001-clean-room/supabase/migrations/20261120232717_caissa_arena_s001_pairing_fk_indexes.sql',
    import.meta.url
);
const rematchHardeningUrl = new URL(
    '../../supabase/arena-s001-clean-room/supabase/migrations/20261120235311_caissa_arena_s001_rematch_hardening.sql',
    import.meta.url
);
const concurrentRematchHardeningUrl = new URL(
    '../../supabase/arena-s001-clean-room/supabase/migrations/20261121000412_caissa_arena_s001_concurrent_rematch_hardening.sql',
    import.meta.url
);
const foundation = await readFile(foundationUrl, 'utf8');
const manifest = await readFile(manifestUrl, 'utf8');
const indexHardening = await readFile(indexHardeningUrl, 'utf8');
const rematchHardening = await readFile(rematchHardeningUrl, 'utf8');
const concurrentRematchHardening = await readFile(concurrentRematchHardeningUrl, 'utf8');

test('clean-room foundation exposes only the minimal server-side account anchor', () => {
    assert.match(foundation, /create table public\.users/);
    assert.match(foundation, /alter table public\.users enable row level security/);
    assert.match(foundation, /revoke all on table public\.users from public, anon, authenticated, service_role/);
    assert.match(foundation, /grant select, insert, update on table public\.users to service_role/);
    assert.doesNotMatch(foundation, /create policy/i);
    assert.doesNotMatch(foundation, /grant .+ to (?:anon|authenticated)/i);
    assert.doesNotMatch(foundation, /credit_events|stripe|library_|mentor_|scanner_/i);
    assert.doesNotMatch(foundation, /if not exists/i);
});

test('clean-room manifest contains only the eight reviewed Arena migrations', () => {
    const migrationEntries = [...manifest.matchAll(/^\d+\. `([^`]+\.sql)`/gm)]
        .map(match => match[1]);
    assert.deepEqual(migrationEntries, [
        'supabase/migrations/20261120232156_caissa_arena_s001_beta_foundation.sql',
        '../../migrations/20261005204209_caissa_online_native_v1.sql',
        '../../migrations/20261011150814_caissa_online_hardening_only_v3.sql',
        '../../migrations/20261014035549_caissa_public_identity_v1.sql',
        '../../migrations/20261120033413_caissa_online_arena_s001.sql',
        'supabase/migrations/20261120232717_caissa_arena_s001_pairing_fk_indexes.sql',
        'supabase/migrations/20261120235311_caissa_arena_s001_rematch_hardening.sql',
        'supabase/migrations/20261121000412_caissa_arena_s001_concurrent_rematch_hardening.sql'
    ]);
    assert.match(manifest, /deliberately excludes `supabase-schema\.sql`/);
    assert.match(manifest, /Apply exactly these SQL artifacts, in this order/);
});

test('hosted concurrency hardening waits for active unseen opponents', () => {
    assert.match(concurrentRematchHardening, /create or replace function caissa_online_private\.arena_pair_waiters/);
    assert.match(concurrentRematchHardening, /alternative\.state in \('waiting', 'playing'\)/);
    assert.match(concurrentRematchHardening, /prior_alternative\.state = 'finished'/);
    assert.match(concurrentRematchHardening, /prior_alternative\.white_user_id = v_first\.user_id[\s\S]+prior_alternative\.black_user_id = alternative\.user_id/);
    assert.match(concurrentRematchHardening, /revoke all on function caissa_online_private\.arena_pair_waiters\(uuid\) from public, anon, authenticated/);
    assert.doesNotMatch(concurrentRematchHardening, /drop|delete|truncate/i);
});

test('hosted-certification hotfix exhausts unplayed opponents before rematches', () => {
    assert.match(rematchHardening, /create or replace function caissa_online_private\.arena_pair_waiters/);
    assert.match(rematchHardening, /exists[\s\S]+from public\.caissa_online_arena_pairings previous/);
    assert.match(rematchHardening, /previous\.state = 'finished'/);
    assert.match(rematchHardening, /previous\.white_user_id = v_first\.user_id[\s\S]+previous\.black_user_id = candidate\.user_id/);
    assert.match(rematchHardening, /revoke all on function caissa_online_private\.arena_pair_waiters\(uuid\) from public, anon, authenticated/);
    assert.doesNotMatch(rematchHardening, /drop|delete|truncate/i);
});

test('clean-room hardening covers both Arena pairing foreign keys', () => {
    assert.match(indexHardening, /create index caissa_online_arena_pairings_white_user_fk_idx[\s\S]+\(white_user_id\)/i);
    assert.match(indexHardening, /create index caissa_online_arena_pairings_black_user_fk_idx[\s\S]+\(black_user_id\)/i);
    assert.doesNotMatch(indexHardening, /drop|delete|truncate/i);
});
