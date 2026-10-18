-- CAISSA Account Control v1.0.
-- Server-only, ownership-bound export, selective progress reset, and staged
-- account erasure. Economic records and shared game history are retained.

begin;

create table public.caissa_account_states (
  user_id uuid primary key references public.users(id) on delete restrict,
  state text not null check (state in ('ACTIVE', 'DELETION_PENDING', 'DELETED', 'REVIEW_REQUIRED')),
  operation_id uuid,
  reason_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((state = 'ACTIVE' and operation_id is null) or state <> 'ACTIVE')
);

create table public.caissa_account_control_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  binding_id uuid not null references public.identity_bindings(id) on delete restrict,
  kind text not null check (kind in ('PROGRESS_RESET', 'ACCOUNT_DELETION')),
  status text not null check (status in (
    'PREPARED', 'LOCKED', 'AUTH_DELETION_PENDING', 'COMPLETED',
    'EXPIRED', 'REVIEW_REQUIRED', 'FAILED_REVIEW'
  )),
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  confirmation_hash text not null check (confirmation_hash ~ '^[0-9a-f]{64}$'),
  reverification_hash text not null check (reverification_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  unique (user_id, kind, idempotency_key_hash),
  check (expires_at > created_at),
  check (pg_catalog.jsonb_typeof(result) = 'object')
);

alter table public.caissa_account_states
  add constraint caissa_account_states_operation_fk
  foreign key (operation_id) references public.caissa_account_control_operations(id) on delete restrict;

create table public.caissa_account_control_audit (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.caissa_account_control_operations(id) on delete restrict,
  event_type text not null check (event_type in (
    'PREPARED', 'RESET_COMPLETED', 'DELETION_LOCKED', 'AUTH_DELETION_FAILED',
    'DATA_ERASURE_COMPLETED', 'DATA_ERASURE_FAILED', 'DELETION_COMPLETED',
    'REVIEW_REQUIRED', 'EXPIRED'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (pg_catalog.jsonb_typeof(detail) = 'object')
);

create index caissa_account_control_operations_user_status_idx
  on public.caissa_account_control_operations(user_id, status, created_at desc);
create index caissa_account_control_operations_binding_idx
  on public.caissa_account_control_operations(binding_id);
create index caissa_account_control_operations_pending_idx
  on public.caissa_account_control_operations(expires_at)
  where status in ('PREPARED', 'LOCKED', 'AUTH_DELETION_PENDING');
create unique index caissa_account_control_one_pending_kind_idx
  on public.caissa_account_control_operations(user_id,kind)
  where status in ('PREPARED','LOCKED','AUTH_DELETION_PENDING');
create index caissa_account_control_audit_operation_idx
  on public.caissa_account_control_audit(operation_id, created_at);
create index caissa_account_states_operation_idx
  on public.caissa_account_states(operation_id)
  where operation_id is not null;

create table public.caissa_account_control_rate_limits (
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_]{1,39}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (scope_hash,bucket)
);

alter table public.caissa_account_states enable row level security;
alter table public.caissa_account_states force row level security;
alter table public.caissa_account_control_operations enable row level security;
alter table public.caissa_account_control_operations force row level security;
alter table public.caissa_account_control_audit enable row level security;
alter table public.caissa_account_control_audit force row level security;
alter table public.caissa_account_control_rate_limits enable row level security;
alter table public.caissa_account_control_rate_limits force row level security;

revoke all on table public.caissa_account_states from public, anon, authenticated;
revoke all on table public.caissa_account_control_operations from public, anon, authenticated;
revoke all on table public.caissa_account_control_audit from public, anon, authenticated;
revoke all on table public.caissa_account_control_rate_limits from public, anon, authenticated;
revoke all on sequence public.caissa_account_control_audit_id_seq from public, anon, authenticated;
grant select, insert, update on table public.caissa_account_states to service_role;
grant select, insert, update on table public.caissa_account_control_operations to service_role;
grant select, insert on table public.caissa_account_control_audit to service_role;
grant select, insert, update on table public.caissa_account_control_rate_limits to service_role;
grant usage, select on sequence public.caissa_account_control_audit_id_seq to service_role;

create or replace function public.consume_caissa_account_control_rate_limit(
  p_scope_hash text,
  p_bucket text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.caissa_account_control_rate_limits%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$' or p_bucket !~ '^[a-z][a-z0-9_]{1,39}$'
     or p_max_attempts not between 1 and 100 or p_window_seconds not between 10 and 86400 then
    return false;
  end if;
  -- Rate-limit identifiers are keyed HMACs, never raw Clerk subjects. Bound
  -- their lifetime as well so a deleted account leaves no indefinite throttle
  -- identifier behind.
  delete from public.caissa_account_control_rate_limits
  where updated_at < v_now - interval '2 days';
  insert into public.caissa_account_control_rate_limits(
    scope_hash,bucket,window_started_at,attempts
  ) values (p_scope_hash,p_bucket,v_now,1)
  on conflict(scope_hash,bucket) do update set
    window_started_at=case
      when public.caissa_account_control_rate_limits.window_started_at
        + pg_catalog.make_interval(secs=>p_window_seconds)<=v_now then v_now
      else public.caissa_account_control_rate_limits.window_started_at end,
    attempts=case
      when public.caissa_account_control_rate_limits.window_started_at
        + pg_catalog.make_interval(secs=>p_window_seconds)<=v_now then 1
      else public.caissa_account_control_rate_limits.attempts+1 end,
    updated_at=v_now
  returning * into v_row;
  return v_row.attempts<=p_max_attempts;
end;
$$;

create or replace function public.caissa_account_active_entitlement_count(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_total integer:=0; v_count integer:=0;
begin
  if pg_catalog.to_regclass('public.product_entitlements') is not null then
    execute 'select count(*)::integer from public.product_entitlements where user_id=$1 and status=''active'''
      into v_count using p_user_id;
    v_total:=v_total+v_count;
  end if;
  if pg_catalog.to_regclass('public.user_entitlements') is not null then
    execute 'select count(*)::integer from public.user_entitlements where user_id=$1 and revoked_at is null and (expires_at is null or expires_at>clock_timestamp())'
      into v_count using p_user_id;
    v_total:=v_total+v_count;
  end if;
  return v_total;
end;
$$;

create or replace function public.caissa_account_has_blocking_state(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_found boolean:=false;
begin
  if pg_catalog.to_regclass('public.identity_incident_holds') is not null then
    execute 'select exists(select 1 from public.identity_incident_holds where user_id=$1 and status=''ACTIVE'')'
      into v_found using p_user_id;
    if v_found then return true; end if;
  end if;
  if exists(select 1 from public.identity_migration_challenges c where c.user_id=p_user_id
      and c.status='PENDING' and c.expires_at>pg_catalog.clock_timestamp()) then return true; end if;
  if exists(select 1 from public.identity_manual_recovery_previews p where p.user_id=p_user_id
      and p.status='PENDING' and p.expires_at>pg_catalog.clock_timestamp()) then return true; end if;
  return false;
end;
$$;

create or replace function public.caissa_account_storage_reference_count(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_count integer:=0;
begin
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'select count(*)::integer from public.scanner_beta_scans where user_id=$1 and nullif(btrim(image_storage_reference),'''') is not null'
      into v_count using p_user_id;
  end if;
  return v_count;
end;
$$;

create or replace function public.caissa_account_has_active_economic_work(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_found boolean:=false;
begin
  if pg_catalog.to_regclass('public.credit_reservations') is not null then
    execute 'select exists(select 1 from public.credit_reservations where user_id=$1 and state=''RESERVED'')'
      into v_found using p_user_id;
  end if;
  return v_found;
end;
$$;

create or replace function public.caissa_account_control_summary(
  p_user_id uuid,
  p_binding_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_binding public.identity_bindings%rowtype;
  v_state text;
  v_conflict boolean;
  v_active_entitlements integer;
  v_puzzle_progress integer := 0;
  v_puzzle_attempts integer := 0;
  v_library_positions integer := 0;
  v_library_collections integer := 0;
  v_scanner_records integer := 0;
  v_mentor_results integer := 0;
  v_beta_activity integer := 0;
  v_storage_references integer := 0;
  v_active_economic_work boolean := false;
begin
  select b.* into v_binding
  from public.identity_bindings b
  where b.id = p_binding_id and b.user_id = p_user_id
    and b.provider = 'clerk' and b.status = 'ACTIVE';
  if v_binding.id is null then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;

  select s.state into v_state from public.caissa_account_states s where s.user_id = p_user_id;
  select public.caissa_account_has_blocking_state(p_user_id) or exists (
    select 1 from public.caissa_identity_ownership_reviews r
    where r.user_id = p_user_id and r.status in ('REVIEW_REQUIRED', 'QUARANTINED', 'REVOKED')
  ) into v_conflict;

  v_active_entitlements := public.caissa_account_active_entitlement_count(p_user_id);
  v_storage_references := public.caissa_account_storage_reference_count(p_user_id);
  v_active_economic_work := public.caissa_account_has_active_economic_work(p_user_id);

  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    execute 'select count(*)::integer from public.puzzle_training_progress where user_id = $1'
      into v_puzzle_progress using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    execute 'select count(*)::integer from public.puzzle_training_attempts where user_id = $1'
      into v_puzzle_attempts using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_positions') is not null then
    execute 'select count(*)::integer from public.library_positions where user_id=$1'
      into v_library_positions using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_collections') is not null then
    execute 'select count(*)::integer from public.library_collections where user_id=$1'
      into v_library_collections using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'select count(*)::integer from public.scanner_beta_scans where user_id=$1'
      into v_scanner_records using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
    execute 'select count(*)::integer from public.mentor_operation_results where user_id=$1'
      into v_mentor_results using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.beta_audit_events') is not null then
    execute 'select count(*)::integer from public.beta_audit_events where user_id=$1'
      into v_beta_activity using p_user_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'ownership', case when v_conflict then 'REVIEW_REQUIRED' else 'VERIFIED' end,
    'accountState', coalesce(v_state, 'ACTIVE'),
    'counts', pg_catalog.jsonb_build_object(
      'puzzleProgress', v_puzzle_progress,
      'puzzleAttempts', v_puzzle_attempts,
      'libraryPositions', v_library_positions,
      'libraryCollections', v_library_collections,
      'scannerRecords', v_scanner_records,
      'mentorResults', v_mentor_results,
      'betaActivity', v_beta_activity,
      'storageReferences', v_storage_references,
      'insightDatasets', (select count(*) from public.insight_datasets d where d.user_id = p_user_id),
      'insightReports', (select count(*) from public.insight_reports r where r.user_id = p_user_id),
      'onlineGames', (select count(*) from public.caissa_online_games g where g.white_user_id = p_user_id or g.black_user_id = p_user_id),
      'creditEvents', (select count(*) from public.credit_events c where c.user_id = p_user_id),
      'activeEntitlements', v_active_entitlements,
      'billingRecords', (select count(*) from public.stripe_events s where s.user_id = p_user_id)
    ),
    'capabilities', pg_catalog.jsonb_build_object(
      'export', not v_conflict and coalesce(v_state, 'ACTIVE') = 'ACTIVE',
      'progressReset', not v_conflict and coalesce(v_state, 'ACTIVE') = 'ACTIVE',
      'accountDeletion', not v_conflict and coalesce(v_state, 'ACTIVE') = 'ACTIVE'
        and v_active_entitlements = 0 and v_storage_references = 0 and not v_active_economic_work
    ),
    'economicRetentionRequired', v_active_entitlements > 0 or exists (
      select 1 from public.credit_events c where c.user_id = p_user_id
    ) or exists (
      select 1 from public.stripe_events s where s.user_id = p_user_id
    ),
    'manualReviewRequired', v_conflict or v_active_entitlements > 0
      or v_storage_references > 0 or v_active_economic_work
  );
end;
$$;

create or replace function public.export_caissa_account_data(
  p_user_id uuid,
  p_binding_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
  v_progress jsonb := null;
  v_attempts jsonb := '[]'::jsonb;
  v_library_positions jsonb := '[]'::jsonb;
  v_library_collections jsonb := '[]'::jsonb;
  v_scanner_records jsonb := '[]'::jsonb;
  v_mentor_results jsonb := '[]'::jsonb;
  v_product_entitlements jsonb := '[]'::jsonb;
  v_user_entitlements jsonb := '[]'::jsonb;
  v_credit_reservations jsonb := '[]'::jsonb;
  v_economic_usage jsonb := '[]'::jsonb;
  v_beta_activity jsonb := '[]'::jsonb;
begin
  v_summary := public.caissa_account_control_summary(p_user_id, p_binding_id);
  if v_summary->>'ownership' <> 'VERIFIED' or v_summary->>'accountState' <> 'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;

  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    execute $q$select to_jsonb(p) - 'user_id' from public.puzzle_training_progress p where user_id = $1$q$
      into v_progress using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at), '[]'::jsonb)
      from public.puzzle_training_attempts a where user_id = $1$q$
      into v_attempts using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_positions') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(p)-'user_id' order by p.synced_at,p.id),'[]'::jsonb)
      from public.library_positions p where user_id=$1$q$ into v_library_positions using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_collections') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(c)-'user_id' order by c.synced_at,c.id),'[]'::jsonb)
      from public.library_collections c where user_id=$1$q$ into v_library_collections using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(s)-'user_id' order by s.created_at,s.scan_id),'[]'::jsonb)
      from public.scanner_beta_scans s where user_id=$1$q$ into v_scanner_records using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
    execute $q$select coalesce(jsonb_agg(jsonb_build_object(
      'operationId',m.operation_id,'contentType',m.content_type,'plaintextBytes',m.plaintext_bytes,
      'expiresAt',m.expires_at,'deliveredAt',m.delivered_at,'createdAt',m.created_at
    ) order by m.created_at),'[]'::jsonb) from public.mentor_operation_results m where user_id=$1$q$
      into v_mentor_results using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.product_entitlements') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(e)-'user_id'-'source_reference'-'source_event_id' order by e.granted_at),'[]'::jsonb)
      from public.product_entitlements e where user_id=$1$q$ into v_product_entitlements using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.user_entitlements') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(e)-'user_id'-'granted_by'-'revoked_by'-'note' order by e.granted_at),'[]'::jsonb)
      from public.user_entitlements e where user_id=$1$q$ into v_user_entitlements using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.credit_reservations') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(r)-'user_id' order by r.created_at),'[]'::jsonb)
      from public.credit_reservations r where user_id=$1$q$ into v_credit_reservations using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.economic_usage_events') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(e)-'user_id' order by e.created_at),'[]'::jsonb)
      from public.economic_usage_events e where user_id=$1$q$ into v_economic_usage using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.beta_audit_events') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(e)-'user_id' order by e.created_at,e.id),'[]'::jsonb)
      from public.beta_audit_events e where user_id=$1$q$ into v_beta_activity using p_user_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 'caissa.account-export.v1',
    'generatedAt', pg_catalog.clock_timestamp(),
    'account', (select pg_catalog.jsonb_build_object(
      'id',u.id,'email',u.email,'createdAt', u.created_at, 'role', u.role, 'credits', u.credits,
      'isPremium', u.is_premium
    ) from public.users u where u.id = p_user_id),
    'publicIdentity', (select to_jsonb(i) - 'user_id' - 'nickname_key'
      from public.caissa_public_identities i where i.user_id = p_user_id),
    'puzzleTraining', pg_catalog.jsonb_build_object('progress', v_progress, 'attempts', v_attempts),
    'library',pg_catalog.jsonb_build_object(
      'positions',v_library_positions,'collections',v_library_collections
    ),
    'scanner',pg_catalog.jsonb_build_object('scans',v_scanner_records),
    'mentor',pg_catalog.jsonb_build_object('results',v_mentor_results),
    'betaActivity',v_beta_activity,
    'online', pg_catalog.jsonb_build_object(
      'profile', (select to_jsonb(p) - 'user_id' - 'clerk_id' from public.caissa_online_profiles p where p.user_id = p_user_id),
      'ratings', (select coalesce(jsonb_agg(to_jsonb(r) - 'user_id' order by r.pool), '[]'::jsonb) from public.caissa_online_ratings r where r.user_id = p_user_id),
      'gameCount', (select count(*) from public.caissa_online_games g where g.white_user_id = p_user_id or g.black_user_id = p_user_id)
    ),
    'insights', pg_catalog.jsonb_build_object(
      'datasets', (select coalesce(jsonb_agg(pg_catalog.jsonb_build_object(
        'id', d.id, 'schemaVersion', d.schema_version, 'gameCount', d.game_count, 'createdAt', d.created_at
      ) order by d.created_at), '[]'::jsonb) from public.insight_datasets d where d.user_id = p_user_id),
      'reports', (select coalesce(jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'datasetId', r.dataset_id, 'schemaVersion', r.schema_version,
        'analysisStatus', r.analysis_status, 'verificationStatus', r.verification_status,
        'createdAt', r.created_at
      ) order by r.created_at), '[]'::jsonb) from public.insight_reports r where r.user_id = p_user_id)
    ),
    'economy', pg_catalog.jsonb_build_object(
      'creditEvents', (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at), '[]'::jsonb) from public.credit_events c where c.user_id = p_user_id),
      'productEntitlements',v_product_entitlements,
      'userEntitlements',v_user_entitlements,
      'creditReservations',v_credit_reservations,
      'usageEvents',v_economic_usage,
      'billingRecordCount', (select count(*) from public.stripe_events s where s.user_id = p_user_id)
    ),
    'localDataNotice', 'Browser-local libraries remain on the device and are not transferred to the server export.',
    'sharedHistoryNotice', 'Shared games are counted but third-party player data is not included.'
  );
end;
$$;

create or replace function public.prepare_caissa_account_control(
  p_user_id uuid,
  p_binding_id uuid,
  p_kind text,
  p_idempotency_key_hash text,
  p_confirmation_hash text,
  p_reverification_hash text,
  p_expires_at timestamptz
)
returns table(operation_id uuid, operation_status text, operation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.caissa_account_control_operations%rowtype;
  v_summary jsonb;
begin
  if p_kind not in ('PROGRESS_RESET', 'ACCOUNT_DELETION')
     or p_idempotency_key_hash !~ '^[0-9a-f]{64}$'
     or p_confirmation_hash !~ '^[0-9a-f]{64}$'
     or p_reverification_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= pg_catalog.clock_timestamp()
     or p_expires_at > pg_catalog.clock_timestamp() + interval '10 minutes' then
    raise exception 'CAISSA_ACCOUNT_INVALID_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  v_summary := public.caissa_account_control_summary(p_user_id, p_binding_id);
  if v_summary->>'ownership' <> 'VERIFIED' or v_summary->>'accountState' <> 'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;
  if p_kind = 'ACCOUNT_DELETION' and not (v_summary->'capabilities'->>'accountDeletion')::boolean then
    raise exception 'CAISSA_ACCOUNT_REVIEW_REQUIRED';
  end if;

  with expired as (
    update public.caissa_account_control_operations
    set status='EXPIRED',updated_at=pg_catalog.clock_timestamp()
    where user_id=p_user_id and kind=p_kind and status='PREPARED'
      and expires_at<=pg_catalog.clock_timestamp()
    returning id
  )
  insert into public.caissa_account_control_audit(operation_id,event_type)
  select id,'EXPIRED' from expired;

  select o.* into v_existing from public.caissa_account_control_operations o
  where o.user_id = p_user_id and o.kind = p_kind
    and o.idempotency_key_hash = p_idempotency_key_hash;
  if v_existing.id is not null then
    return query select v_existing.id, v_existing.status, v_existing.expires_at;
    return;
  end if;
  if exists(select 1 from public.caissa_account_control_operations o
    where o.user_id=p_user_id and o.kind=p_kind
      and o.status in ('PREPARED','LOCKED','AUTH_DELETION_PENDING')) then
    raise exception 'CAISSA_ACCOUNT_OPERATION_IN_PROGRESS';
  end if;

  insert into public.caissa_account_control_operations(
    user_id, binding_id, kind, status, idempotency_key_hash,
    confirmation_hash, reverification_hash, expires_at
  ) values (
    p_user_id, p_binding_id, p_kind, 'PREPARED', p_idempotency_key_hash,
    p_confirmation_hash, p_reverification_hash, p_expires_at
  ) returning id, status, expires_at into operation_id, operation_status, operation_expires_at;

  insert into public.caissa_account_control_audit(operation_id, event_type)
  values (operation_id, 'PREPARED');
  return next;
exception when unique_violation then
  raise exception 'CAISSA_ACCOUNT_OPERATION_IN_PROGRESS';
end;
$$;

create or replace function public.confirm_caissa_progress_reset(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding_id uuid,
  p_confirmation_hash text,
  p_reverification_hash text,
  p_idempotency_key_hash text,
  p_external_subject_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.caissa_account_control_operations%rowtype;
  v_attempts integer := 0;
  v_progress integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select o.* into v_operation from public.caissa_account_control_operations o
  where o.id = p_operation_id and o.user_id = p_user_id and o.binding_id = p_binding_id
    and o.kind = 'PROGRESS_RESET' for update;
  if v_operation.id is null then raise exception 'CAISSA_ACCOUNT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status = 'COMPLETED' then return v_operation.result || '{"duplicate":true}'::jsonb; end if;
  if v_operation.status <> 'PREPARED' then raise exception 'CAISSA_ACCOUNT_OPERATION_INVALID_STATE'; end if;
  if v_operation.expires_at <= pg_catalog.clock_timestamp() then
    update public.caissa_account_control_operations set status='EXPIRED', updated_at=pg_catalog.clock_timestamp() where id=v_operation.id;
    insert into public.caissa_account_control_audit(operation_id,event_type) values(v_operation.id,'EXPIRED');
    raise exception 'CAISSA_ACCOUNT_OPERATION_EXPIRED';
  end if;
  if v_operation.confirmation_hash <> p_confirmation_hash
     or v_operation.reverification_hash <> p_reverification_hash
     or v_operation.idempotency_key_hash <> p_idempotency_key_hash then
    raise exception 'CAISSA_ACCOUNT_CONFIRMATION_INVALID';
  end if;
  if p_external_subject_hash !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from public.identity_bindings b
    where b.id=p_binding_id and b.user_id=p_user_id and b.provider='clerk' and b.status='ACTIVE'
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(b.external_subject,'UTF8')),'hex')=p_external_subject_hash
  ) or exists (
    select 1 from public.caissa_identity_ownership_reviews r
    where r.user_id=p_user_id and r.status in ('REVIEW_REQUIRED','QUARANTINED','REVOKED')
  ) then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;

  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    execute 'delete from public.puzzle_training_attempts where user_id = $1' using p_user_id;
    get diagnostics v_attempts = row_count;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    execute 'delete from public.puzzle_training_progress where user_id = $1' using p_user_id;
    get diagnostics v_progress = row_count;
  end if;

  update public.caissa_account_control_operations
  set status='COMPLETED', result=pg_catalog.jsonb_build_object(
      'puzzleAttemptsDeleted',v_attempts,'puzzleProgressDeleted',v_progress,
      'preserved',pg_catalog.jsonb_build_array('credits','entitlements','login','publicIdentity','onlineRatings')
    ), updated_at=pg_catalog.clock_timestamp(), completed_at=pg_catalog.clock_timestamp()
  where id=v_operation.id returning result into v_operation.result;
  insert into public.caissa_account_control_audit(operation_id,event_type,detail)
  values(v_operation.id,'RESET_COMPLETED',pg_catalog.jsonb_build_object('attempts',v_attempts,'progress',v_progress));
  return v_operation.result;
end;
$$;

create or replace function public.lock_caissa_account_deletion(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding_id uuid,
  p_confirmation_hash text,
  p_reverification_hash text,
  p_idempotency_key_hash text,
  p_external_subject_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_operation public.caissa_account_control_operations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select o.* into v_operation from public.caissa_account_control_operations o
  where o.id=p_operation_id and o.user_id=p_user_id and o.binding_id=p_binding_id
    and o.kind='ACCOUNT_DELETION' for update;
  if v_operation.id is null then raise exception 'CAISSA_ACCOUNT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status in ('AUTH_DELETION_PENDING','COMPLETED') then
    return pg_catalog.jsonb_build_object('status',v_operation.status,'duplicate',true);
  end if;
  if v_operation.status not in ('PREPARED','LOCKED') then raise exception 'CAISSA_ACCOUNT_OPERATION_INVALID_STATE'; end if;
  if v_operation.expires_at <= pg_catalog.clock_timestamp() then raise exception 'CAISSA_ACCOUNT_OPERATION_EXPIRED'; end if;
  if v_operation.confirmation_hash <> p_confirmation_hash
     or v_operation.reverification_hash <> p_reverification_hash
     or v_operation.idempotency_key_hash <> p_idempotency_key_hash then
    raise exception 'CAISSA_ACCOUNT_CONFIRMATION_INVALID';
  end if;
  if p_external_subject_hash !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from public.identity_bindings b
    where b.id=p_binding_id and b.user_id=p_user_id and b.provider='clerk' and b.status='ACTIVE'
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(b.external_subject,'UTF8')),'hex')=p_external_subject_hash
  ) then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;
  if v_operation.status='LOCKED' then
    return pg_catalog.jsonb_build_object('status','LOCKED','duplicate',true);
  end if;
  if public.caissa_account_has_blocking_state(p_user_id)
     or public.caissa_account_active_entitlement_count(p_user_id)>0
     or public.caissa_account_storage_reference_count(p_user_id)>0
     or public.caissa_account_has_active_economic_work(p_user_id)
     or exists(select 1 from public.caissa_identity_ownership_reviews r where r.user_id=p_user_id
       and r.status in ('REVIEW_REQUIRED','QUARANTINED','REVOKED')) then
    update public.caissa_account_control_operations set status='REVIEW_REQUIRED',updated_at=pg_catalog.clock_timestamp() where id=v_operation.id;
    insert into public.caissa_account_control_audit(operation_id,event_type) values(v_operation.id,'REVIEW_REQUIRED');
    return pg_catalog.jsonb_build_object('status','REVIEW_REQUIRED','duplicate',false);
  end if;
  insert into public.caissa_account_states(user_id,state,operation_id,reason_code)
  values(p_user_id,'DELETION_PENDING',v_operation.id,'SELF_SERVICE_REQUEST')
  on conflict(user_id) do update set state='DELETION_PENDING',operation_id=excluded.operation_id,
    reason_code=excluded.reason_code,updated_at=pg_catalog.clock_timestamp();
  update public.caissa_account_control_operations set status='LOCKED',updated_at=pg_catalog.clock_timestamp() where id=v_operation.id;
  insert into public.caissa_account_control_audit(operation_id,event_type) values(v_operation.id,'DELETION_LOCKED');
  return pg_catalog.jsonb_build_object('status','LOCKED','duplicate',false);
end;
$$;

create or replace function public.mark_caissa_data_deletion_failed(
  p_operation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.caissa_account_control_operations
  set status='FAILED_REVIEW',updated_at=pg_catalog.clock_timestamp(),result='{"reason":"DATA_ERASURE_FAILED"}'::jsonb
  where id=p_operation_id and user_id=p_user_id and status='LOCKED';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return; end if;
  update public.caissa_account_states set state='REVIEW_REQUIRED',reason_code='DATA_ERASURE_FAILED',updated_at=pg_catalog.clock_timestamp()
  where user_id=p_user_id and operation_id=p_operation_id;
  insert into public.caissa_account_control_audit(operation_id,event_type,detail)
  select p_operation_id,'DATA_ERASURE_FAILED','{"reason":"DATA_ERASURE_FAILED"}'::jsonb
  where exists(select 1 from public.caissa_account_control_operations where id=p_operation_id and user_id=p_user_id);
end;
$$;

create or replace function public.erase_caissa_account_data(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding_id uuid,
  p_external_subject_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.caissa_account_control_operations%rowtype;
  v_binding public.identity_bindings%rowtype;
  v_deleted_subject text := 'deleted_' || pg_catalog.replace(p_user_id::text,'-','');
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  select o.* into v_operation from public.caissa_account_control_operations o
  where o.id=p_operation_id and o.user_id=p_user_id and o.binding_id=p_binding_id
    and o.kind='ACCOUNT_DELETION' for update;
  if v_operation.id is null then raise exception 'CAISSA_ACCOUNT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status='AUTH_DELETION_PENDING' then return v_operation.result || '{"duplicate":true}'::jsonb; end if;
  if v_operation.status <> 'LOCKED' then raise exception 'CAISSA_ACCOUNT_OPERATION_INVALID_STATE'; end if;

  if public.caissa_account_has_blocking_state(p_user_id)
     or public.caissa_account_active_entitlement_count(p_user_id)>0
     or public.caissa_account_storage_reference_count(p_user_id)>0
     or public.caissa_account_has_active_economic_work(p_user_id) then
    update public.caissa_account_control_operations set status='REVIEW_REQUIRED',updated_at=pg_catalog.clock_timestamp()
      where id=p_operation_id;
    update public.caissa_account_states set state='REVIEW_REQUIRED',reason_code='CONCURRENT_REVIEW_REQUIRED',updated_at=pg_catalog.clock_timestamp()
      where user_id=p_user_id and operation_id=p_operation_id;
    insert into public.caissa_account_control_audit(operation_id,event_type) values(p_operation_id,'REVIEW_REQUIRED');
    return pg_catalog.jsonb_build_object('status','REVIEW_REQUIRED','duplicate',false);
  end if;

  select * into v_binding from public.identity_bindings
  where id=p_binding_id and user_id=p_user_id and provider='clerk' and status='ACTIVE'
    and p_external_subject_hash ~ '^[0-9a-f]{64}$'
    and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(external_subject,'UTF8')),'hex')=p_external_subject_hash
  for update;
  if v_binding.id is null then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;

  delete from public.caissa_online_matchmaking_tickets where user_id=p_user_id;
  delete from public.caissa_online_presence where user_id=p_user_id;
  update public.caissa_online_challenges set state='cancelled',updated_at=pg_catalog.clock_timestamp()
  where (challenger_user_id=p_user_id or challenged_user_id=p_user_id) and state='pending';
  update public.caissa_online_tournaments set owner_user_id=null where owner_user_id=p_user_id;
  delete from public.caissa_online_ratings where user_id=p_user_id;
  delete from public.caissa_online_profiles where user_id=p_user_id;
  delete from public.insight_reports where user_id=p_user_id;
  delete from public.insight_datasets where user_id=p_user_id;
  delete from public.caissa_public_identities where user_id=p_user_id;
  if pg_catalog.to_regclass('public.library_positions') is not null then
    execute 'delete from public.library_positions where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_collections') is not null then
    execute 'delete from public.library_collections where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_sync_log') is not null then
    execute 'delete from public.library_sync_log where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
    execute 'delete from public.mentor_operation_results where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_feedback') is not null then
    execute 'delete from public.scanner_beta_feedback where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scan_failures') is not null then
    execute 'delete from public.scanner_beta_scan_failures where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'delete from public.scanner_beta_scans where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    execute 'delete from public.puzzle_training_attempts where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    execute 'delete from public.puzzle_training_progress where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.beta_audit_events') is not null then
    execute 'delete from public.beta_audit_events where user_id=$1' using p_user_id;
  end if;

  update public.caissa_online_games set
    white_clerk_id=v_deleted_subject,
    white_display_name='Deleted Player',
    identity_policy_version=0,
    pgn=pg_catalog.regexp_replace(pgn,E'\\[White "[^"\\r\\n]*"\\]','[White "Deleted Player"]','g')
  where white_user_id=p_user_id;
  update public.caissa_online_games set
    black_clerk_id=v_deleted_subject,
    black_display_name='Deleted Player',
    identity_policy_version=0,
    pgn=pg_catalog.regexp_replace(pgn,E'\\[Black "[^"\\r\\n]*"\\]','[Black "Deleted Player"]','g')
  where black_user_id=p_user_id;
  delete from public.caissa_online_rate_limits where clerk_id=v_binding.external_subject;

  update public.identity_migration_challenges set status='REVOKED'
  where user_id=p_user_id and status='PENDING';
  update public.identity_manual_recovery_previews set status='REVOKED'
  where user_id=p_user_id and status='PENDING';
  update public.identity_bindings set
    status='RETIRED',
    retired_at=coalesce(retired_at,pg_catalog.clock_timestamp()),
    external_subject='deleted_' || pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(id::text || ':' || external_subject,'UTF8')
    ),'hex'),
    metadata=pg_catalog.jsonb_build_object('erased',true)
  where user_id=p_user_id;
  update public.users set
    clerk_id='deleted_' || pg_catalog.replace(id::text,'-',''),
    email=null,is_premium=false,stripe_customer_id=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_user_id;
  update public.caissa_account_control_operations set status='AUTH_DELETION_PENDING',
    result=pg_catalog.jsonb_build_object(
      'status','AUTH_DELETION_PENDING','dataErased',true,
      'economicRecordsRetained',true,'sharedGamesRetained',true
    ),updated_at=pg_catalog.clock_timestamp()
  where id=p_operation_id returning * into v_operation;
  insert into public.caissa_account_control_audit(operation_id,event_type)
  values(p_operation_id,'DATA_ERASURE_COMPLETED');
  return v_operation.result;
end;
$$;

create or replace function public.mark_caissa_auth_deletion_failed(
  p_operation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_updated integer;
begin
  update public.caissa_account_control_operations
  set status='FAILED_REVIEW',updated_at=pg_catalog.clock_timestamp(),result='{"reason":"AUTH_PROVIDER_UNAVAILABLE","dataErased":true}'::jsonb
  where id=p_operation_id and user_id=p_user_id and status='AUTH_DELETION_PENDING';
  get diagnostics v_updated = row_count;
  if v_updated=0 then return; end if;
  update public.caissa_account_states set state='REVIEW_REQUIRED',reason_code='AUTH_PROVIDER_UNAVAILABLE',updated_at=pg_catalog.clock_timestamp()
  where user_id=p_user_id and operation_id=p_operation_id;
  insert into public.caissa_account_control_audit(operation_id,event_type,detail)
  values(p_operation_id,'AUTH_DELETION_FAILED','{"reason":"AUTH_PROVIDER_UNAVAILABLE"}'::jsonb);
end;
$$;

create or replace function public.complete_caissa_account_deletion(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_operation public.caissa_account_control_operations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  select o.* into v_operation from public.caissa_account_control_operations o
  where o.id=p_operation_id and o.user_id=p_user_id and o.binding_id=p_binding_id
    and o.kind='ACCOUNT_DELETION' for update;
  if v_operation.id is null then raise exception 'CAISSA_ACCOUNT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status='COMPLETED' then return v_operation.result || '{"duplicate":true}'::jsonb; end if;
  if v_operation.status<>'AUTH_DELETION_PENDING' then raise exception 'CAISSA_ACCOUNT_OPERATION_INVALID_STATE'; end if;
  update public.caissa_account_states set state='DELETED',reason_code='SELF_SERVICE_COMPLETED',updated_at=pg_catalog.clock_timestamp()
  where user_id=p_user_id and operation_id=p_operation_id;
  update public.caissa_account_control_operations set status='COMPLETED',
    result=result || pg_catalog.jsonb_build_object('status','COMPLETED','accountDeleted',true),
    updated_at=pg_catalog.clock_timestamp(),completed_at=pg_catalog.clock_timestamp()
  where id=p_operation_id returning * into v_operation;
  insert into public.caissa_account_control_audit(operation_id,event_type)
  values(p_operation_id,'DELETION_COMPLETED');
  return v_operation.result;
end;
$$;

-- Prevent old tokens and parallel sync requests from resolving an account once
-- deletion is locked, under review, or complete.
create or replace function public.resolve_caissa_identity_ownership(
  p_external_subject text,
  p_environment text
)
returns table(ownership_state text, user_id uuid, binding_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_binding public.identity_bindings%rowtype;
  v_review public.caissa_identity_ownership_reviews%rowtype;
  v_user public.users%rowtype;
  v_account_state text;
  v_has_other_active boolean;
  v_has_legacy_history boolean;
begin
  if p_environment not in ('legacy_development','production') or p_external_subject is null
     or pg_catalog.char_length(p_external_subject) not between 1 and 255 then
    return query select 'UNRESOLVED'::text,null::uuid,null::uuid; return;
  end if;
  select b.* into v_binding from public.identity_bindings b
  where b.provider='clerk' and b.environment=p_environment and b.external_subject=p_external_subject and b.status='ACTIVE';
  if v_binding.id is null then return query select 'UNRESOLVED'::text,null::uuid,null::uuid; return; end if;
  select s.state into v_account_state from public.caissa_account_states s where s.user_id=v_binding.user_id;
  if v_account_state in ('DELETION_PENDING','DELETED','REVIEW_REQUIRED') then
    return query select 'QUARANTINED'::text,v_binding.user_id,v_binding.id; return;
  end if;
  select u.* into v_user from public.users u where u.id=v_binding.user_id;
  if v_user.id is null or v_user.clerk_id is distinct from p_external_subject then
    return query select 'QUARANTINED'::text,v_binding.user_id,v_binding.id; return;
  end if;
  select exists(select 1 from public.identity_bindings other where other.user_id=v_binding.user_id
    and other.provider='clerk' and other.id<>v_binding.id and other.status='ACTIVE') into v_has_other_active;
  if v_has_other_active then return query select 'QUARANTINED'::text,v_binding.user_id,v_binding.id; return; end if;
  select r.* into v_review from public.caissa_identity_ownership_reviews r where r.binding_id=v_binding.id and r.user_id=v_binding.user_id;
  if v_review.status='VERIFIED' then return query select 'VERIFIED'::text,v_binding.user_id,v_binding.id; return;
  elsif v_review.status in ('QUARANTINED','REVOKED') then return query select 'QUARANTINED'::text,v_binding.user_id,v_binding.id; return;
  elsif v_review.status='REVIEW_REQUIRED' then return query select 'REVIEW_REQUIRED'::text,v_binding.user_id,v_binding.id; return;
  end if;
  if p_environment='legacy_development' and v_binding.proof_method='LEGACY_BACKFILL' then
    return query select 'VERIFIED'::text,v_binding.user_id,v_binding.id; return;
  end if;
  select exists(select 1 from public.identity_bindings legacy where legacy.user_id=v_binding.user_id
    and legacy.provider='clerk' and legacy.environment='legacy_development') into v_has_legacy_history;
  if p_environment='production' and v_binding.proof_method='NEW_ACCOUNT' and not v_has_legacy_history then
    return query select 'VERIFIED'::text,v_binding.user_id,v_binding.id; return;
  end if;
  return query select 'REVIEW_REQUIRED'::text,v_binding.user_id,v_binding.id;
end;
$$;

revoke all on function public.caissa_account_control_summary(uuid,uuid) from public,anon,authenticated;
revoke all on function public.consume_caissa_account_control_rate_limit(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.caissa_account_active_entitlement_count(uuid) from public,anon,authenticated;
revoke all on function public.caissa_account_has_blocking_state(uuid) from public,anon,authenticated;
revoke all on function public.caissa_account_storage_reference_count(uuid) from public,anon,authenticated;
revoke all on function public.caissa_account_has_active_economic_work(uuid) from public,anon,authenticated;
revoke all on function public.export_caissa_account_data(uuid,uuid) from public,anon,authenticated;
revoke all on function public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.confirm_caissa_progress_reset(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.lock_caissa_account_deletion(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_caissa_data_deletion_failed(uuid,uuid) from public,anon,authenticated;
revoke all on function public.erase_caissa_account_data(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.mark_caissa_auth_deletion_failed(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_caissa_account_deletion(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.resolve_caissa_identity_ownership(text,text) from public,anon,authenticated;
grant execute on function public.consume_caissa_account_control_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.caissa_account_active_entitlement_count(uuid) to service_role;
grant execute on function public.caissa_account_has_blocking_state(uuid) to service_role;
grant execute on function public.caissa_account_storage_reference_count(uuid) to service_role;
grant execute on function public.caissa_account_has_active_economic_work(uuid) to service_role;
grant execute on function public.caissa_account_control_summary(uuid,uuid) to service_role;
grant execute on function public.export_caissa_account_data(uuid,uuid) to service_role;
grant execute on function public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.confirm_caissa_progress_reset(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.lock_caissa_account_deletion(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.mark_caissa_data_deletion_failed(uuid,uuid) to service_role;
grant execute on function public.erase_caissa_account_data(uuid,uuid,uuid,text) to service_role;
grant execute on function public.mark_caissa_auth_deletion_failed(uuid,uuid) to service_role;
grant execute on function public.complete_caissa_account_deletion(uuid,uuid,uuid) to service_role;
grant execute on function public.resolve_caissa_identity_ownership(text,text) to service_role;

comment on table public.caissa_account_control_operations is
  'Restricted, idempotent account-control workflow state. Contains no raw Clerk subjects, emails, or confirmation tokens.';
comment on table public.caissa_account_control_audit is
  'Sanitized technical account-control ledger retained independently from erased profile data.';

commit;
