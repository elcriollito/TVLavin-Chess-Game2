\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'SEC005_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

-- Synthetic UUID-owned state that must survive both directions of the cutover.
update public.caissa_public_identities
set public_nickname = 'Alpha Knight',
    nickname_key = 'alpha knight'
where user_id = '00000000-0000-4000-8000-00000000000a';

insert into public.caissa_online_profiles(user_id, clerk_id, display_name)
values
  ('00000000-0000-4000-8000-00000000000a', 'legacy_subject_A', 'Alpha Knight'),
  ('00000000-0000-4000-8000-00000000000b', 'legacy_subject_B', 'Beta Knight');

insert into public.caissa_online_ratings(user_id, pool, rating, games, wins, draws, losses)
values
  ('00000000-0000-4000-8000-00000000000a', 'blitz', 1612, 24, 10, 6, 8),
  ('00000000-0000-4000-8000-00000000000b', 'blitz', 1588, 31, 12, 7, 12);

insert into public.caissa_online_games(
  id, pool, rated, base_ms, increment_ms,
  white_user_id, black_user_id, white_clerk_id, black_clerk_id,
  white_display_name, black_display_name,
  white_time_ms, black_time_ms, draw_offer_by
) values (
  '40000000-0000-4000-8000-00000000000a', 'blitz', false, 180000, 2000,
  '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b',
  'legacy_subject_A', 'legacy_subject_B', 'ignored-a', 'ignored-b',
  180000, 180000, 'legacy_subject_A'
);

insert into public.caissa_online_presence(
  user_id, clerk_id, display_name, status, active_game_id
) values (
  '00000000-0000-4000-8000-00000000000a', 'legacy_subject_A',
  'Alpha Knight', 'playing', '40000000-0000-4000-8000-00000000000a'
);

insert into public.caissa_online_matchmaking_tickets(
  id, user_id, clerk_id, pool, base_ms, increment_ms, rated, rating, state,
  matched_game_id
) values (
  '50000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000a', 'legacy_subject_A',
  'blitz', 180000, 2000, false, 1612, 'matched',
  '40000000-0000-4000-8000-00000000000a'
);

insert into public.caissa_online_rate_limits(
  clerk_id, bucket, request_count
) values ('legacy_subject_A', 'move', 4);

insert into public.caissa_online_game_events(
  game_id, sequence, event_id, event_type, actor_user_id, payload
) values (
  '40000000-0000-4000-8000-00000000000a', 1,
  'synthetic-event-0001', 'game.created',
  '00000000-0000-4000-8000-00000000000a', '{}'::jsonb
);

select * from public.create_clerk_migration_challenge(
  '00000000-0000-4000-8000-00000000000a',
  'legacy_subject_A', 'prod_subject_A', 'token_hash_A1',
  pg_catalog.clock_timestamp() + interval '10 minutes', 'DUAL_AUTH'
);
select * from public.create_clerk_migration_challenge(
  '00000000-0000-4000-8000-00000000000a',
  'legacy_subject_A', 'prod_subject_A2', 'token_hash_A2',
  pg_catalog.clock_timestamp() + interval '10 minutes', 'DUAL_AUTH'
);

select pg_temp.assert_true(
  (select success from public.activate_clerk_identity_binding('token_hash_A1', 'prod_subject_A')),
  'primary challenge did not activate'
);

select pg_temp.assert_true(
  (select clerk_id = 'prod_subject_A' from public.users
   where id = '00000000-0000-4000-8000-00000000000a'),
  'canonical user subject did not remap'
);
select pg_temp.assert_true(
  (select clerk_id = 'prod_subject_A' from public.caissa_online_profiles
   where user_id = '00000000-0000-4000-8000-00000000000a'),
  'Online profile subject did not remap'
);
select pg_temp.assert_true(
  (select clerk_id = 'prod_subject_A' from public.caissa_online_presence
   where user_id = '00000000-0000-4000-8000-00000000000a'),
  'presence subject did not remap'
);
select pg_temp.assert_true(
  (select clerk_id = 'prod_subject_A' from public.caissa_online_matchmaking_tickets
   where user_id = '00000000-0000-4000-8000-00000000000a'),
  'matchmaking subject did not remap'
);
select pg_temp.assert_true(
  (select white_clerk_id = 'prod_subject_A'
       and draw_offer_by = 'prod_subject_A'
       and version = 2
   from public.caissa_online_games
   where id = '40000000-0000-4000-8000-00000000000a'),
  'game authorization snapshot/version did not remap'
);
select pg_temp.assert_true(
  exists(select 1 from public.caissa_online_rate_limits
         where clerk_id = 'prod_subject_A' and bucket = 'move' and request_count = 4)
  and not exists(select 1 from public.caissa_online_rate_limits
                 where clerk_id = 'legacy_subject_A'),
  'rate-limit state did not remap conservatively'
);
select pg_temp.assert_true(
  (select status = 'REVOKED' from public.identity_migration_challenges
   where token_hash = 'token_hash_A2'),
  'sibling challenge remained replayable after activation'
);

-- The normal Production resolver must not recognize the retired legacy namespace.
select pg_temp.assert_true(
  (select resolution = 'UNRESOLVED'
   from public.resolve_clerk_identity_for_sync('legacy_subject_A')),
  'Production sync accepted a legacy-only subject'
);
select pg_temp.assert_true(
  (select resolution = 'BOUND'
       and user_id = '00000000-0000-4000-8000-00000000000a'
   from public.resolve_clerk_identity_for_sync('prod_subject_A')),
  'Production sync did not resolve the Production binding'
);

-- Realtime authorization follows the same active subject immediately.
select pg_catalog.set_config(
  'realtime.topic', 'online-game:40000000-0000-4000-8000-00000000000a', true
);
select pg_catalog.set_config(
  'request.jwt.claims', '{"sub":"prod_subject_A"}', true
);
select pg_temp.assert_true(
  caissa_online_private.can_read_current_game_topic(),
  'new Production subject cannot authorize its private Realtime topic'
);
select pg_catalog.set_config(
  'request.jwt.claims', '{"sub":"legacy_subject_A"}', true
);
select pg_temp.assert_true(
  not caissa_online_private.can_read_current_game_topic(),
  'retired legacy subject still authorizes the private Realtime topic'
);

-- UUID-owned history, economics, nickname, ratings and entitlements are unchanged.
select pg_temp.assert_true(
  (select credits = 7 and is_premium is false and email = 'owner-a@example.invalid'
   from public.users where id = '00000000-0000-4000-8000-00000000000a'),
  'private/economic user fields changed'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.credit_events
   where user_id = '00000000-0000-4000-8000-00000000000a'
     and action = 'synthetic_baseline' and balance_after = 7),
  'credit event history changed'
);
select pg_temp.assert_true(
  exists(select 1 from public.stripe_events where event_id = 'evt_synthetic_baseline'),
  'Stripe event history changed'
);
select pg_temp.assert_true(
  exists(select 1 from public.player_album_entitlements
         where user_id = '00000000-0000-4000-8000-00000000000a'
           and album_id = 'synthetic-album'),
  'entitlement changed'
);
select pg_temp.assert_true(
  (select public_nickname = 'Alpha Knight'
       and nickname_key = 'alpha knight' and version = 1
   from public.caissa_public_identities
   where user_id = '00000000-0000-4000-8000-00000000000a'),
  'Public Identity changed during subject remap'
);
select pg_temp.assert_true(
  (select rating = 1612 and games = 24 and wins = 10 and draws = 6 and losses = 8
   from public.caissa_online_ratings
   where user_id = '00000000-0000-4000-8000-00000000000a' and pool = 'blitz'),
  'Online rating changed during subject remap'
);
select pg_temp.assert_true(
  exists(select 1 from public.caissa_online_game_events
         where game_id = '40000000-0000-4000-8000-00000000000a'
           and event_id = 'synthetic-event-0001'
           and actor_user_id = '00000000-0000-4000-8000-00000000000a'),
  'Online event history changed'
);

-- Operator approval is short-lived, audited and inaccessible to browser roles.
do $$
begin
  set local role authenticated;
  begin
    perform * from public.approve_clerk_identity_enrollment(
      'new_subject_denied', 'This call must be rejected for browser roles',
      pg_catalog.clock_timestamp() + interval '10 minutes'
    );
    raise exception 'SEC005_ASSERTION_FAILED: authenticated role executed enrollment approval';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end;
$$;

select pg_temp.assert_true(
  (select success from public.approve_clerk_identity_enrollment(
    'new_subject_approved',
    'Owner-reviewed synthetic new account approval',
    pg_catalog.clock_timestamp() + interval '10 minutes'
  )),
  'service operator could not approve a new enrollment'
);
select pg_temp.assert_true(
  (select resolution = 'APPROVED_NEW'
   from public.resolve_clerk_identity_for_sync('new_subject_approved')),
  'approved new subject was not classified explicitly'
);
select pg_temp.assert_true(
  (select success from public.provision_approved_clerk_identity(
    'new_subject_approved', 'new-account@example.invalid'
  )),
  'approved new identity could not be provisioned once'
);
select pg_temp.assert_true(
  not (select success from public.provision_approved_clerk_identity(
    'new_subject_approved', 'new-account@example.invalid'
  )),
  'consumed enrollment decision was replayable'
);

-- Emergency rollback restores the exact predecessor and all subject snapshots.
select pg_temp.assert_true(
  (select success from public.rollback_clerk_identity_binding(
    '00000000-0000-4000-8000-00000000000a',
    'Synthetic incident rollback verification'
  )),
  'exact-provenance rollback failed'
);
select pg_temp.assert_true(
  (select clerk_id = 'legacy_subject_A' from public.users
   where id = '00000000-0000-4000-8000-00000000000a'),
  'canonical subject did not roll back'
);
select pg_temp.assert_true(
  (select clerk_id = 'legacy_subject_A' from public.caissa_online_profiles
   where user_id = '00000000-0000-4000-8000-00000000000a')
  and (select clerk_id = 'legacy_subject_A' from public.caissa_online_presence
       where user_id = '00000000-0000-4000-8000-00000000000a')
  and (select clerk_id = 'legacy_subject_A' from public.caissa_online_matchmaking_tickets
       where user_id = '00000000-0000-4000-8000-00000000000a'),
  'Online subject caches did not roll back symmetrically'
);
select pg_temp.assert_true(
  (select white_clerk_id = 'legacy_subject_A'
       and draw_offer_by = 'legacy_subject_A'
       and version = 3
   from public.caissa_online_games
   where id = '40000000-0000-4000-8000-00000000000a'),
  'game snapshot/version did not roll back symmetrically'
);
select pg_temp.assert_true(
  (select code = 'CHALLENGE_INVALID_OR_USED'
   from public.activate_clerk_identity_binding('token_hash_A2', 'prod_subject_A2')),
  'revoked sibling challenge replay was not denied'
);

-- Reuse of any subject ever bound in either authority is rejected.
select * from public.create_clerk_migration_challenge(
  '00000000-0000-4000-8000-00000000000b',
  'legacy_subject_B', 'prod_subject_A', 'token_hash_B1',
  pg_catalog.clock_timestamp() + interval '10 minutes', 'DUAL_AUTH'
);
select pg_temp.assert_true(
  (select code = 'TARGET_SUBJECT_ALREADY_BOUND'
   from public.activate_clerk_identity_binding('token_hash_B1', 'prod_subject_A')),
  'cross-authority subject reuse was accepted'
);

-- A forged predecessor in metadata cannot roll back another immutable user.
insert into public.identity_bindings(
  user_id, provider, environment, external_subject, status,
  proof_method, activated_at, metadata
) values (
  '00000000-0000-4000-8000-00000000000b', 'clerk', 'production',
  'prod_subject_B_forged', 'ACTIVE', 'MANUAL_RECOVERY',
  pg_catalog.clock_timestamp(),
  pg_catalog.jsonb_build_object(
    'previous_binding_id', (
      select id from public.identity_bindings
      where user_id = '00000000-0000-4000-8000-00000000000a'
        and environment = 'legacy_development'
    ),
    'preview_id', '60000000-0000-4000-8000-00000000000a'
  )
);
select pg_temp.assert_true(
  (select code = 'ROLLBACK_PROVENANCE_MISMATCH'
   from public.rollback_clerk_identity_binding(
     '00000000-0000-4000-8000-00000000000b',
     'Synthetic forged provenance must be rejected'
   )),
  'forged rollback provenance was accepted'
);

-- Combined schema keeps sensitive migration data and RPCs out of browser roles.
select pg_temp.assert_true(
  not pg_catalog.has_table_privilege('authenticated', 'public.identity_bindings', 'SELECT')
  and not pg_catalog.has_table_privilege('anon', 'public.identity_migration_audit', 'SELECT')
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.approve_clerk_identity_enrollment(text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'combined-schema grants expose SEC-005 controls to browser roles'
);

\echo SEC005_POSTGRES_REHEARSAL_PASS
rollback;

