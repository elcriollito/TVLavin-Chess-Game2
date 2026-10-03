-- Keep Insights snapshots and datasets immutable while allowing the
-- security-invoker RPCs to run with the intentionally narrow service_role
-- table grants. Per-owner advisory locks already serialize these RPCs, and
-- the composite foreign key protects the dataset/report relationship.

create or replace function public.save_insight_report(
  p_user_id uuid, p_dataset_id uuid, p_operation_id uuid, p_payload_hash text,
  p_snapshot jsonb, p_summary jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.insight_reports%rowtype;
begin
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

create or replace function public.delete_insight_report(p_user_id uuid, p_report_id uuid)
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

revoke update on public.insight_datasets, public.insight_reports from service_role;
revoke all on function public.save_insight_report(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_insight_report(uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_insight_report(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.delete_insight_report(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
