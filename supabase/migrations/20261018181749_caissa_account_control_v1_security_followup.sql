-- Additive security follow-up for databases that already applied Account Control v1.
-- New installations receive the same definitions from the canonical migration.

drop function if exists public.export_caissa_account_data(uuid,uuid);

-- Serialize account-scoped writes against the deletion lock. If a write wins
-- the advisory lock first, deletion waits and its later sweep removes it. If
-- deletion wins first, the writer observes the durable state and fails closed.
create or replace function public.caissa_account_assert_writable(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_erasure_operation text := pg_catalog.current_setting('caissa.account_control_erasure_operation',true);
begin
  if p_user_id is null then return; end if;
  if v_erasure_operation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and exists(select 1 from public.caissa_account_control_operations o
       where o.id=v_erasure_operation::uuid and o.kind='ACCOUNT_DELETION' and o.status='LOCKED') then
    return;
  end if;
  -- Fail fast instead of waiting from a row trigger that may already hold a
  -- tuple needed by the erasure transaction holding this advisory lock.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0)) then
    raise exception 'CAISSA_ACCOUNT_WRITE_BLOCKED' using errcode='55000';
  end if;
  select s.state into v_state from public.caissa_account_states s where s.user_id=p_user_id;
  if v_state is null or v_state not in ('DELETION_PENDING','DELETED','REVIEW_REQUIRED') then return; end if;
  raise exception 'CAISSA_ACCOUNT_WRITE_BLOCKED' using errcode='55000';
end;
$$;

create or replace function public.caissa_account_write_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text;
  v_user_id uuid;
  v_old_user_id uuid;
begin
  foreach v_column in array tg_argv loop
    v_old_user_id := null;
    if tg_op <> 'INSERT' then
      v_old_user_id := nullif(to_jsonb(old)->>v_column,'')::uuid;
      perform public.caissa_account_assert_writable(v_old_user_id);
    end if;
    if tg_op <> 'DELETE' then
      v_user_id := nullif(to_jsonb(new)->>v_column,'')::uuid;
      if v_user_id is distinct from v_old_user_id then
        perform public.caissa_account_assert_writable(v_user_id);
      end if;
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.caissa_account_rate_limit_write_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid; v_subject text; v_old_subject text; v_seen_subject text;
begin
  v_old_subject := case when tg_op='INSERT' then null else old.clerk_id end;
  foreach v_subject in array array[v_old_subject,case when tg_op='DELETE' then null else new.clerk_id end] loop
    if v_subject is null or v_subject is not distinct from v_seen_subject then
      continue;
    end if;
    v_seen_subject := v_subject;
    if v_subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      continue;
    end if;
    v_user_id := null;
    select u.id into v_user_id from public.users u where u.clerk_id=v_subject;
    if v_user_id is null then
      select b.user_id into v_user_id from public.identity_bindings b
        where b.provider='clerk' and b.external_subject=v_subject and b.status='ACTIVE'
        order by b.activated_at desc nulls last,b.id limit 1;
    end if;
    if v_user_id is null then
      raise exception 'CAISSA_ACCOUNT_IDENTITY_REQUIRED' using errcode='42501';
    end if;
    perform public.caissa_account_assert_writable(v_user_id);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

-- Install the barrier on every current public table that directly references
-- users. Account-control ledgers are excluded so they can advance the state
-- machine itself. The users row is covered separately because it is the root.
do $$
declare v_target record;
begin
  for v_target in
    select c.conrelid::pg_catalog.regclass as relation_name,
      pg_catalog.string_agg(pg_catalog.quote_literal(a.attname),',' order by key_column.ordinality) as trigger_args
    from pg_catalog.pg_constraint c
    cross join lateral pg_catalog.unnest(c.conkey) with ordinality as key_column(attnum,ordinality)
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=key_column.attnum
    join pg_catalog.pg_class cl on cl.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=cl.relnamespace
    where c.contype='f' and c.confrelid='public.users'::pg_catalog.regclass
      and n.nspname='public' and cl.relkind in ('r','p')
      and cl.relname not in (
        'caissa_account_states','caissa_account_control_operations',
        'caissa_account_control_audit','caissa_account_control_rate_limits'
      )
    group by c.conrelid
  loop
    execute pg_catalog.format('drop trigger if exists caissa_account_write_barrier on %s',v_target.relation_name);
    execute pg_catalog.format(
      'create trigger caissa_account_write_barrier before insert or update or delete on %s for each row execute function public.caissa_account_write_barrier(%s)',
      v_target.relation_name,v_target.trigger_args);
  end loop;
end;
$$;

drop trigger if exists caissa_account_write_barrier on public.users;
create trigger caissa_account_write_barrier
before insert or update or delete on public.users
for each row execute function public.caissa_account_write_barrier('id');

drop trigger if exists caissa_account_write_barrier on public.caissa_online_rate_limits;
create trigger caissa_account_write_barrier
before insert or update or delete on public.caissa_online_rate_limits
for each row execute function public.caissa_account_rate_limit_write_barrier();

create or replace function public.export_caissa_account_data_records(
  p_user_id uuid,
  p_binding_id uuid
)
returns table(section text, ordinal bigint, data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
begin
  v_summary := public.caissa_account_control_summary(p_user_id, p_binding_id);
  if v_summary->>'ownership' <> 'VERIFIED' or v_summary->>'accountState' <> 'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;

  return query select 'manifest'::text, 0::bigint, pg_catalog.jsonb_build_object(
    'schemaVersion','caissa.account-export.v2',
    'generatedAt',pg_catalog.clock_timestamp(),
    'localDataNotice','Browser-local libraries remain on the device and are not transferred to the server export.',
    'sharedHistoryNotice','Shared games are counted but third-party player data is not included.'
  );
  return query select 'account'::text, 0::bigint, pg_catalog.jsonb_build_object(
    'id',u.id,'email',u.email,'createdAt',u.created_at,'role',u.role,
    'credits',u.credits,'isPremium',u.is_premium
  ) from public.users u where u.id=p_user_id;
  return query select 'publicIdentity'::text, 0::bigint,
    to_jsonb(i)-'user_id'-'nickname_key'
    from public.caissa_public_identities i where i.user_id=p_user_id;

  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    return query execute $q$select 'puzzleTraining.progress'::text,0::bigint,to_jsonb(p)-'user_id'
      from public.puzzle_training_progress p where user_id=$1$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    return query execute $q$select 'puzzleTraining.attempts'::text,
      row_number() over(order by a.created_at,a.id)::bigint,to_jsonb(a)-'user_id'
      from public.puzzle_training_attempts a where user_id=$1 order by a.created_at,a.id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_positions') is not null then
    return query execute $q$select 'library.positions'::text,
      row_number() over(order by p.synced_at,p.id)::bigint,to_jsonb(p)-'user_id'
      from public.library_positions p where user_id=$1 order by p.synced_at,p.id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_collections') is not null then
    return query execute $q$select 'library.collections'::text,
      row_number() over(order by c.synced_at,c.id)::bigint,to_jsonb(c)-'user_id'
      from public.library_collections c where user_id=$1 order by c.synced_at,c.id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    return query execute $q$select 'scanner.scans'::text,
      row_number() over(order by s.created_at,s.scan_id)::bigint,to_jsonb(s)-'user_id'
      from public.scanner_beta_scans s where user_id=$1 order by s.created_at,s.scan_id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
    return query execute $q$select 'mentor.results'::text,
      row_number() over(order by m.created_at,m.operation_id)::bigint,jsonb_build_object(
        'operationId',m.operation_id,'contentType',m.content_type,'plaintextBytes',m.plaintext_bytes,
        'expiresAt',m.expires_at,'deliveredAt',m.delivered_at,'createdAt',m.created_at)
      from public.mentor_operation_results m where user_id=$1 order by m.created_at,m.operation_id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.product_entitlements') is not null then
    return query execute $q$select 'economy.productEntitlements'::text,
      row_number() over(order by e.granted_at,e.id)::bigint,
      to_jsonb(e)-'user_id'-'source_reference'-'source_event_id'
      from public.product_entitlements e where user_id=$1 order by e.granted_at,e.id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.user_entitlements') is not null then
    return query execute $q$select 'economy.userEntitlements'::text,
      row_number() over(order by e.granted_at,e.id)::bigint,
      to_jsonb(e)-'user_id'-'granted_by'-'revoked_by'-'note'
      from public.user_entitlements e where user_id=$1 order by e.granted_at,e.id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.credit_reservations') is not null then
    return query execute $q$select 'economy.creditReservations'::text,
      row_number() over(order by r.created_at,r.id)::bigint,to_jsonb(r)-'user_id'
      from public.credit_reservations r where user_id=$1 order by r.created_at,r.id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.economic_usage_events') is not null then
    return query execute $q$select 'economy.usageEvents'::text,
      row_number() over(order by e.created_at,e.event_id)::bigint,to_jsonb(e)-'user_id'
      from public.economic_usage_events e where user_id=$1 order by e.created_at,e.event_id$q$ using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.beta_audit_events') is not null then
    return query execute $q$select 'betaActivity'::text,
      row_number() over(order by e.created_at,e.id)::bigint,to_jsonb(e)-'user_id'
      from public.beta_audit_events e where user_id=$1 order by e.created_at,e.id$q$ using p_user_id;
  end if;

  return query select 'online.profile'::text,0::bigint,to_jsonb(p)-'user_id'-'clerk_id'
    from public.caissa_online_profiles p where p.user_id=p_user_id;
  return query select 'online.ratings'::text,row_number() over(order by r.pool)::bigint,
    to_jsonb(r)-'user_id' from public.caissa_online_ratings r where r.user_id=p_user_id order by r.pool;
  return query select 'online.summary'::text,0::bigint,pg_catalog.jsonb_build_object(
    'gameCount',count(*)) from public.caissa_online_games g
    where g.white_user_id=p_user_id or g.black_user_id=p_user_id;
  return query select 'insights.datasets'::text,row_number() over(order by d.created_at,d.id)::bigint,
    pg_catalog.jsonb_build_object('id',d.id,'schemaVersion',d.schema_version,'gameCount',d.game_count,'createdAt',d.created_at)
    from public.insight_datasets d where d.user_id=p_user_id order by d.created_at,d.id;
  return query select 'insights.reports'::text,row_number() over(order by r.created_at,r.id)::bigint,
    pg_catalog.jsonb_build_object('id',r.id,'datasetId',r.dataset_id,'schemaVersion',r.schema_version,
      'analysisStatus',r.analysis_status,'verificationStatus',r.verification_status,'createdAt',r.created_at)
    from public.insight_reports r where r.user_id=p_user_id order by r.created_at,r.id;
  return query select 'economy.creditEvents'::text,row_number() over(order by c.created_at,c.id)::bigint,
    to_jsonb(c)-'user_id' from public.credit_events c where c.user_id=p_user_id order by c.created_at,c.id;
  return query select 'economy.summary'::text,0::bigint,pg_catalog.jsonb_build_object(
    'billingRecordCount',count(*)) from public.stripe_events s where s.user_id=p_user_id;
end;
$$;

drop function if exists public.export_caissa_account_data_records(uuid,uuid);

create or replace function public.export_caissa_account_data_page(
  p_user_id uuid,p_binding_id uuid,p_section text,p_offset integer,p_limit integer,p_snapshot_at timestamptz
)
returns table(data jsonb)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_summary jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,0),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
begin
  if p_section not in (
    'account','publicIdentity','puzzleProgress','puzzleAttempts',
    'libraryPositions','libraryCollections','scannerScans','mentorResults','betaActivity',
    'onlineProfile','onlineRatings','onlineGameCount','insightDatasets','insightReports',
    'creditEvents','productEntitlements','userEntitlements','creditReservations',
    'usageEvents','billingRecordCount'
  ) or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
     or p_snapshot_at is null or p_snapshot_at > pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'CAISSA_ACCOUNT_EXPORT_PAGE_INVALID';
  end if;
  v_summary := public.caissa_account_control_summary(p_user_id,p_binding_id);
  if v_summary->>'ownership' <> 'VERIFIED' or v_summary->>'accountState' <> 'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;

  if p_section='account' then
    return query select pg_catalog.jsonb_build_object(
      'id',u.id,'email',u.email,'createdAt',u.created_at,'role',u.role,
      'credits',u.credits,'isPremium',u.is_premium
    ) from public.users u where u.id=p_user_id offset v_offset limit v_limit;
  elsif p_section='publicIdentity' then
    return query select to_jsonb(i)-'user_id'-'nickname_key'
      from public.caissa_public_identities i where i.user_id=p_user_id offset v_offset limit v_limit;
  elsif p_section='puzzleProgress' then
    if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
      return query execute $q$select to_jsonb(p)-'user_id' from public.puzzle_training_progress p
        where user_id=$1 offset $2 limit $3$q$ using p_user_id,v_offset,v_limit;
    end if;
  elsif p_section='puzzleAttempts' then
    if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
      return query execute $q$select to_jsonb(a)-'user_id' from public.puzzle_training_attempts a
        where user_id=$1 and created_at<=$2 order by created_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='libraryPositions' then
    if pg_catalog.to_regclass('public.library_positions') is not null then
      return query execute $q$select to_jsonb(p)-'user_id' from public.library_positions p
        where user_id=$1 and synced_at<=$2 order by synced_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='libraryCollections' then
    if pg_catalog.to_regclass('public.library_collections') is not null then
      return query execute $q$select to_jsonb(c)-'user_id' from public.library_collections c
        where user_id=$1 and synced_at<=$2 order by synced_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='scannerScans' then
    if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
      return query execute $q$select to_jsonb(s)-'user_id' from public.scanner_beta_scans s
        where user_id=$1 and created_at<=$2 order by created_at,scan_id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='mentorResults' then
    if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
      return query execute $q$select jsonb_build_object(
        'operationId',m.operation_id,'contentType',m.content_type,'plaintextBytes',m.plaintext_bytes,
        'expiresAt',m.expires_at,'deliveredAt',m.delivered_at,'createdAt',m.created_at)
        from public.mentor_operation_results m where user_id=$1 and created_at<=$2
        order by created_at,operation_id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='betaActivity' then
    if pg_catalog.to_regclass('public.beta_audit_events') is not null then
      return query execute $q$select to_jsonb(e)-'user_id' from public.beta_audit_events e
        where user_id=$1 and created_at<=$2 order by created_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='onlineProfile' then
    return query select to_jsonb(p)-'user_id'-'clerk_id' from public.caissa_online_profiles p
      where p.user_id=p_user_id offset v_offset limit v_limit;
  elsif p_section='onlineRatings' then
    return query select to_jsonb(r)-'user_id' from public.caissa_online_ratings r
      where r.user_id=p_user_id order by r.pool offset v_offset limit v_limit;
  elsif p_section='onlineGameCount' then
    return query select to_jsonb(count(*)) from public.caissa_online_games g
      where g.white_user_id=p_user_id or g.black_user_id=p_user_id offset v_offset limit v_limit;
  elsif p_section='insightDatasets' then
    return query select pg_catalog.jsonb_build_object(
      'id',d.id,'schemaVersion',d.schema_version,'gameCount',d.game_count,'createdAt',d.created_at
    ) from public.insight_datasets d where d.user_id=p_user_id and d.created_at<=p_snapshot_at
      order by d.created_at,d.id offset v_offset limit v_limit;
  elsif p_section='insightReports' then
    return query select pg_catalog.jsonb_build_object(
      'id',r.id,'datasetId',r.dataset_id,'schemaVersion',r.schema_version,
      'analysisStatus',r.analysis_status,'verificationStatus',r.verification_status,'createdAt',r.created_at
    ) from public.insight_reports r where r.user_id=p_user_id and r.created_at<=p_snapshot_at
      order by r.created_at,r.id offset v_offset limit v_limit;
  elsif p_section='creditEvents' then
    return query select to_jsonb(c)-'user_id' from public.credit_events c
      where c.user_id=p_user_id and c.created_at<=p_snapshot_at
      order by c.created_at,c.id offset v_offset limit v_limit;
  elsif p_section='productEntitlements' then
    if pg_catalog.to_regclass('public.product_entitlements') is not null then
      return query execute $q$select to_jsonb(e)-'user_id'-'source_reference'-'source_event_id'
        from public.product_entitlements e where user_id=$1 and granted_at<=$2
        order by granted_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='userEntitlements' then
    if pg_catalog.to_regclass('public.user_entitlements') is not null then
      return query execute $q$select to_jsonb(e)-'user_id'-'granted_by'-'revoked_by'-'note'
        from public.user_entitlements e where user_id=$1 and granted_at<=$2
        order by granted_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='creditReservations' then
    if pg_catalog.to_regclass('public.credit_reservations') is not null then
      return query execute $q$select to_jsonb(r)-'user_id' from public.credit_reservations r
        where user_id=$1 and created_at<=$2 order by created_at,id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='usageEvents' then
    if pg_catalog.to_regclass('public.economic_usage_events') is not null then
      return query execute $q$select to_jsonb(e)-'user_id' from public.economic_usage_events e
        where user_id=$1 and created_at<=$2 order by created_at,event_id offset $3 limit $4$q$
        using p_user_id,p_snapshot_at,v_offset,v_limit;
    end if;
  elsif p_section='billingRecordCount' then
    return query select to_jsonb(count(*)) from public.stripe_events s where s.user_id=p_user_id
      offset v_offset limit v_limit;
  end if;
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
  -- Serialize all erasure sweeps before taking their per-user locks. Shared
  -- game/challenge rows can otherwise be acquired in opposite order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('caissa.account-control.erasure.global',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  select o.* into v_operation from public.caissa_account_control_operations o
  where o.id=p_operation_id and o.user_id=p_user_id and o.binding_id=p_binding_id
    and o.kind='ACCOUNT_DELETION' for update;
  if v_operation.id is null then raise exception 'CAISSA_ACCOUNT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status='AUTH_DELETION_PENDING' then return v_operation.result || '{"duplicate":true}'::jsonb; end if;
  if v_operation.status <> 'LOCKED' then raise exception 'CAISSA_ACCOUNT_OPERATION_INVALID_STATE'; end if;
  perform pg_catalog.set_config('caissa.account_control_erasure_operation',p_operation_id::text,true);

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

revoke all on function public.caissa_account_assert_writable(uuid) from public,anon,authenticated;
revoke all on function public.caissa_account_write_barrier() from public,anon,authenticated;
revoke all on function public.caissa_account_rate_limit_write_barrier() from public,anon,authenticated;
revoke all on function public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.erase_caissa_account_data(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz) to service_role;
grant execute on function public.erase_caissa_account_data(uuid,uuid,uuid,text) to service_role;

