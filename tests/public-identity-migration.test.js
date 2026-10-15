import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL(
    '../supabase/migrations/20261014035549_caissa_public_identity_v1.sql', import.meta.url
), 'utf8');
const rollback = readFileSync(new URL(
    '../supabase/rollback/20261014035549_caissa_public_identity_v1.rollback.sql', import.meta.url
), 'utf8');

test('migration is fail-closed for browser roles and keeps table writes behind versioned RPCs', () => {
    assert.match(migration, /alter table public\.caissa_public_identities enable row level security/i);
    assert.match(migration, /revoke all on table public\.caissa_public_identities from public, anon, authenticated, service_role/i);
    assert.match(migration, /grant select on table public\.caissa_public_identities to service_role/i);
    assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)[^;]*caissa_public_identities\s+to\s+service_role/i);
    for (const signature of [
        'caissa_public_identity_get_or_create\\(text\\)',
        'caissa_public_identity_check_nickname\\(text, text, text, integer\\)',
        'caissa_public_identity_update\\(text, text, text, integer, integer\\)',
        'caissa_public_identity_resolve_many\\(text\\[\\]\\)'
    ]) {
        assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`, 'i'));
        assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`, 'i'));
    }
    const definers = migration.match(/security\s+definer/gi) || [];
    assert.equal(definers.length, 7);
    assert.equal((migration.match(/set search_path = ''/gi) || []).length >= 9, true);
});

test('migration versions the canonical payload and marks historical versus verified game snapshots', () => {
    assert.match(migration, /nickname_policy_version smallint not null default 1/i);
    assert.match(migration, /assert_policy_payload\([\s\S]*p_policy_version integer/i);
    assert.match(migration, /p_key is distinct from pg_catalog\.lower\(normalize\(v_display, NFKC\)\)/i);
    assert.match(migration, /add column identity_policy_version smallint not null default 0/i);
    assert.match(migration, /new\.identity_policy_version := 1/i);
    assert.match(migration, /create unique index caissa_public_identities_nickname_key_uq/i);
    assert.match(migration, /p_nickname_key text[\s\S]*p_policy_version integer/i);
    assert.match(migration, /contains_default_ignorable\(p_value\)[\s\S]*v_display\s*:=\s*normalize/i);
    assert.match(migration, /\\034F[\s\S]*\\FE00-\\FE0F[\s\S]*\\\+0E0000-\\\+0E0FFF/i);
});

test('migration closes direct game-row reads and broadcasts only a compact invalidation payload', () => {
    assert.match(migration, /revoke select on table public\.caissa_online_games from authenticated/i);
    assert.match(migration, /drop policy if exists caissa_online_participant_game_read on public\.caissa_online_games/i);
    assert.match(migration, /create or replace function caissa_online_private\.can_read_current_game_topic\(\)[\s\S]*security definer/i);
    assert.match(migration, /grant execute on function caissa_online_private\.can_read_current_game_topic\(\)\s+to authenticated/i);
    assert.match(migration, /caissa_online_game_broadcast_read[\s\S]*caissa_online_private\.can_read_current_game_topic\(\)/i);
    assert.match(migration, /perform realtime\.send\([\s\S]*'gameId'[\s\S]*'version'[\s\S]*'eventType'[\s\S]*true/i);
    assert.doesNotMatch(
        migration.slice(migration.lastIndexOf('create or replace function caissa_online_private.broadcast_game_change()')),
        /realtime\.broadcast_changes|\bnew\s*,\s*old\b/i
    );
});

test('migration separates public identity from private and economic account data', () => {
    assert.match(migration, /user_id uuid primary key references public\.users\(id\) on delete cascade/i);
    assert.match(migration, /fallback_alias ~ '\^Player-\[0-9A-F\]\{16\}\$'/i);
    assert.match(migration, /create trigger caissa_online_games_public_identity_snapshot[\s\S]*before insert on public\.caissa_online_games/i);
    assert.match(migration, /select u\.clerk_id from public\.users u where u\.role <> 'online_guest'/i);
    assert.doesNotMatch(migration, /insert[^;]+(email|full_name|display_name)[^;]+caissa_public_identities/i);
    assert.doesNotMatch(migration, /alter\s+table\s+public\.users/i);
    assert.doesNotMatch(migration, /credit_events|stripe_events|stripe_customer_id|credits\s*=|rating\s*=/i);
    assert.doesNotMatch(migration, /(update|delete|truncate)\s+public\.caissa_online_games/i);
});

test('rollback matches Identity v1 and preserves Online history', () => {
    assert.match(rollback, /drop function if exists public\.caissa_public_identity_resolve_many\(text\[\]\)/i);
    assert.match(rollback, /drop table if exists public\.caissa_public_identities/i);
    assert.match(rollback, /drop trigger if exists caissa_online_games_public_identity_snapshot on public\.caissa_online_games/i);
    assert.match(rollback, /drop column if exists identity_policy_version/i);
    assert.match(rollback, /drop schema if exists caissa_identity_private/i);
    assert.match(rollback, /grant select on table public\.caissa_online_games to authenticated/i);
    assert.match(rollback, /create policy caissa_online_participant_game_read/i);
    assert.match(rollback, /realtime\.broadcast_changes/i);
    assert.match(rollback, /drop function if exists caissa_online_private\.can_read_current_game_topic\(\)/i);
    assert.doesNotMatch(rollback, /drop table if exists public\.users/i);
    assert.doesNotMatch(rollback, /drop\s+(table|function)\s+if exists public\.caissa_online_|credit_events|stripe_events/i);
    assert.doesNotMatch(rollback, /(delete\s+from|update|truncate)\s+public\.caissa_online_/i);
});
