-- Run only in staging. All synthetic data is rolled back, including users.
begin;
create temporary table insights_acceptance_results (result jsonb) on commit drop;
do $$
declare
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  dataset_a uuid := gen_random_uuid(); dataset_b uuid := gen_random_uuid();
  operation uuid := gen_random_uuid(); operation_two uuid := gen_random_uuid();
  first_result jsonb; retry_result jsonb; second_result jsonb; response jsonb;
  payload jsonb := '{"schemaVersion":"1.0.0","analysisStatus":"unavailable","method":"engine_browser","verificationStatus":"structurally_validated"}'::jsonb;
  snapshot_summary jsonb := '{"gamesAnalyzed":1,"analysisStatus":"unavailable"}'::jsonb;
begin
  insert into public.users(id, clerk_id, credits) values
    (owner_a, 'insights-test-a-' || owner_a::text, 0), (owner_b, 'insights-test-b-' || owner_b::text, 0);
  insert into public.insight_datasets(id, user_id, input_hash, schema_version, raw_pgn, subject, game_count) values
    (dataset_a, owner_a, repeat('a',64), '1.0.0', '[Event "Synthetic"]', '{"provider":"local","username":"Synthetic"}', 1),
    (dataset_b, owner_b, repeat('a',64), '1.0.0', '[Event "Synthetic"]', '{"provider":"local","username":"Synthetic"}', 1);
  first_result := public.save_insight_report(owner_a, dataset_a, operation, repeat('b',64), payload, snapshot_summary);
  retry_result := public.save_insight_report(owner_a, dataset_a, operation, repeat('b',64), payload, snapshot_summary);
  if first_result->>'status' <> 'created' or retry_result->>'status' <> 'existing'
    or first_result->>'reportId' <> retry_result->>'reportId' then raise exception 'Idempotent persistence failed'; end if;
  response := public.save_insight_report(owner_a, dataset_a, operation, repeat('c',64), payload, snapshot_summary);
  if response->>'status' <> 'conflict' then raise exception 'Mutation of immutable operation was accepted'; end if;
  begin
    insert into public.insight_reports(user_id,dataset_id,operation_id,payload_hash,schema_version,analysis_status,verification_status,snapshot,summary)
    values(owner_b,dataset_a,gen_random_uuid(),repeat('d',64),'1.0.0','unavailable','structurally_validated',payload,snapshot_summary);
    raise exception 'Cross-owner dataset reference was accepted';
  exception when foreign_key_violation then null;
  end;
  response := public.delete_insight_report(owner_b, (first_result->>'reportId')::uuid);
  if response->>'deleted' <> 'false' then raise exception 'Foreign report was deleted'; end if;
  if (select count(*) from public.insight_reports where user_id = owner_a) <> 1
     or (select count(*) from public.insight_reports where user_id = owner_b) <> 0 then raise exception 'Owner-scoped retrieval failed'; end if;
  second_result := public.save_insight_report(owner_a,dataset_a,operation_two,repeat('e',64),payload,snapshot_summary);
  perform public.delete_insight_report(owner_a,(first_result->>'reportId')::uuid);
  if not exists(select 1 from public.insight_datasets where id=dataset_a) then raise exception 'Shared dataset deleted too early'; end if;
  perform public.delete_insight_report(owner_a,(second_result->>'reportId')::uuid);
  if exists(select 1 from public.insight_datasets where id=dataset_a) then raise exception 'Orphan PGN was not deleted'; end if;
  if not exists(select 1 from public.insight_datasets where id=dataset_b) then raise exception 'Other owner dataset was touched'; end if;
  if has_table_privilege('anon','public.insight_reports','SELECT')
     or has_table_privilege('authenticated','public.insight_reports','SELECT')
     or has_table_privilege('anon','public.insight_datasets','SELECT')
     or has_table_privilege('authenticated','public.insight_datasets','INSERT')
     or has_table_privilege('service_role','public.insight_reports','UPDATE')
     or has_function_privilege('authenticated','public.save_insight_report(uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.delete_insight_report(uuid,uuid)','EXECUTE') then raise exception 'Private access grants failed'; end if;
  if not has_table_privilege('service_role','public.insight_reports','INSERT')
     or not has_function_privilege('service_role','public.save_insight_report(uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE') then raise exception 'Server grants missing'; end if;
  insert into insights_acceptance_results values(jsonb_build_object(
    'idempotency',true,'immutable_snapshot',true,'composite_owner_fk',true,'foreign_delete_rejected',true,
    'owner_scoped_retrieval',true,'shared_dataset_preserved',true,'orphan_pgn_removed',true,'private_grants',true,'server_grants',true));
end $$;
select result from insights_acceptance_results;
rollback;
