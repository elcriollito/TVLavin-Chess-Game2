-- Private, server-only Insights snapshots. Clerk authentication is resolved to
-- public.users.id by the API; Supabase auth.uid() is not the CAISSA owner UUID.
create table public.insight_datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  schema_version text not null check (schema_version = '1.0.0'),
  raw_pgn text not null check (octet_length(raw_pgn) between 1 and 1048576),
  subject jsonb not null check (jsonb_typeof(subject) = 'object'),
  import_metadata jsonb not null default '[]'::jsonb check (jsonb_typeof(import_metadata) = 'array'),
  game_count integer not null check (game_count between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, input_hash),
  unique (user_id, id)
);
create table public.insight_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  dataset_id uuid not null,
  operation_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  schema_version text not null check (schema_version = '1.0.0'),
  analysis_status text not null check (analysis_status in ('complete', 'partial', 'unavailable')),
  verification_status text not null check (verification_status = 'structurally_validated'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2097152),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (user_id, dataset_id) references public.insight_datasets(user_id, id),
  unique (user_id, operation_id)
);
create index insight_reports_owner_history on public.insight_reports(user_id, created_at desc, id desc);
create index insight_reports_owner_dataset on public.insight_reports(user_id, dataset_id);
alter table public.insight_datasets enable row level security;
alter table public.insight_datasets force row level security;
alter table public.insight_reports enable row level security;
alter table public.insight_reports force row level security;
-- No browser grants or policies. service_role is only available in server APIs.
revoke all on public.insight_datasets, public.insight_reports from public, anon, authenticated, service_role;
grant select, insert, delete on public.insight_datasets, public.insight_reports to service_role;

create function public.save_insight_report(
  p_user_id uuid, p_dataset_id uuid, p_operation_id uuid, p_payload_hash text,
  p_snapshot jsonb, p_summary jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.insight_reports%rowtype;
  inserted_id uuid;
begin
  -- Serializes idempotent writes and per-owner quotas, across server instances.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 913001));
  select * into saved from public.insight_reports
    where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if saved.payload_hash <> p_payload_hash or saved.dataset_id <> p_dataset_id then
      return jsonb_build_object('status', 'conflict');
    end if;
    return jsonb_build_object('status', 'existing', 'reportId', saved.id, 'createdAt', saved.created_at);
  end if;
  perform 1 from public.insight_datasets where user_id = p_user_id and id = p_dataset_id;
  if not found then raise exception 'Dataset unavailable' using errcode = '23503'; end if;
  if (select count(*) from public.insight_reports where user_id = p_user_id) >= 1000 then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.insight_reports(user_id, dataset_id, operation_id, payload_hash,
    schema_version, analysis_status, verification_status, snapshot, summary)
  values (p_user_id, p_dataset_id, p_operation_id, p_payload_hash, '1.0.0',
    p_snapshot->>'analysisStatus', 'structurally_validated', p_snapshot, p_summary)
  returning * into saved;
  return jsonb_build_object('status', 'created', 'reportId', saved.id, 'createdAt', saved.created_at);
end;
$$;

create function public.delete_insight_report(p_user_id uuid, p_report_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare dataset uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 913001));
  select dataset_id into dataset from public.insight_reports where user_id = p_user_id and id = p_report_id;
  if not found then return jsonb_build_object('deleted', false); end if;
  delete from public.insight_reports where user_id = p_user_id and id = p_report_id;
  if not exists (select 1 from public.insight_reports where user_id = p_user_id and dataset_id = dataset) then
    delete from public.insight_datasets where user_id = p_user_id and id = dataset;
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function public.save_insight_report(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_insight_report(uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_insight_report(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.delete_insight_report(uuid, uuid) to service_role;
comment on table public.insight_reports is 'Private immutable browser engine reports. Structural validation does not certify engine execution.';
notify pgrst, 'reload schema';
