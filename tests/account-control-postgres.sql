\set ON_ERROR_STOP on

do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
create extension if not exists pgcrypto;

\if :{?caissa_production_default_acl}
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
\endif

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'user',
  is_premium boolean not null default false,
  credits integer not null default 0,
  stripe_customer_id text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

\ir ../supabase/migrations/20260811_clerk_identity_remapping_foundation.sql
\ir ../supabase/migrations/20260811_clerk_migration_cutover_tooling.sql
\ir ../supabase/migrations/20261015220000_sec005_cutover_compatibility_v1.sql
\ir ../supabase/migrations/20261018171912_caissa_identity_ownership_v1.sql

create table public.identity_incident_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null check (status in ('ACTIVE','RELEASED'))
);
create table public.product_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null,
  source_reference text,
  source_event_id text,
  granted_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  action text not null,
  delta integer not null,
  balance_after integer not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete restrict,
  event_id text not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
\ir ../supabase/migrations/20260823021500_player_album_entitlements.sql
create table public.puzzle_training_progress (
  user_id uuid primary key references public.users(id) on delete cascade,
  rating integer not null default 1800,
  solved integer not null default 0,
  failed integer not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.puzzle_training_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_public_identities (
  user_id uuid primary key references public.users(id) on delete cascade,
  public_nickname text,
  nickname_key text,
  fallback_alias text not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  version integer not null default 1
);
create table public.caissa_online_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  clerk_id text not null unique,
  display_name text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_ratings (
  user_id uuid not null references public.users(id) on delete cascade,
  pool text not null,
  rating integer not null default 1500,
  primary key (user_id,pool)
);
create table public.caissa_online_games (
  id uuid primary key default gen_random_uuid(),
  white_user_id uuid not null references public.users(id) on delete restrict,
  black_user_id uuid not null references public.users(id) on delete restrict,
  white_clerk_id text not null default 'white_subject',
  black_clerk_id text not null default 'black_subject',
  white_display_name text not null default 'White',
  black_display_name text not null default 'Black',
  identity_policy_version smallint not null default 1,
  draw_offer_by text,
  version bigint not null default 1,
  status text not null default 'active',
  pgn text not null default '[White "White"]' || E'\n' || '[Black "Black"]',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_rate_limits (
  clerk_id text not null,
  bucket text not null,
  window_started_at timestamptz not null default pg_catalog.clock_timestamp(),
  request_count integer not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(clerk_id,bucket)
);
create table public.caissa_online_matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  clerk_id text not null default 'ticket_subject',
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  clerk_id text not null default 'presence_subject'
);
create table public.caissa_online_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_user_id uuid not null references public.users(id) on delete cascade,
  challenged_user_id uuid not null references public.users(id) on delete cascade,
  state text not null default 'pending',
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null
);
create table public.caissa_online_tournament_participants (
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (tournament_id,user_id)
);
create table public.insight_datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  schema_version text not null default '1.0.0',
  game_count integer not null default 1,
  raw_pgn text not null default '1. e4',
  subject jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(user_id,id)
);
create table public.insight_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  dataset_id uuid not null,
  schema_version text not null default '1.0.0',
  analysis_status text not null default 'complete',
  verification_status text not null default 'structurally_validated',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (user_id,dataset_id) references public.insight_datasets(user_id,id)
);

-- Production-only data families are represented as contract fixtures so the
-- same migration is rehearsed against both the lean Staging graph and the
-- larger Production graph without touching either remote database.
create table public.library_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null,
  fen text not null,
  synced_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.library_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null,
  name text not null,
  synced_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.library_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entitlement text not null,
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  granted_by uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  note text
);
create table public.beta_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  experiment_id text,
  event_type text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  state text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.economic_usage_events (
  event_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.mentor_operation_results (
  operation_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content_type text not null,
  plaintext_bytes integer not null,
  expires_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.scanner_beta_scans (
  scan_id uuid primary key,
  user_id uuid references public.users(id) on delete restrict,
  image_storage_reference text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  inserted_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.scanner_beta_feedback (
  feedback_id uuid primary key,
  scan_id uuid not null references public.scanner_beta_scans(scan_id) on delete cascade,
  user_id uuid references public.users(id) on delete restrict,
  inserted_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.scanner_beta_scan_failures (
  feedback_id uuid primary key,
  user_id uuid references public.users(id) on delete restrict,
  inserted_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.scanner_beta_square_corrections (
  feedback_id uuid not null references public.scanner_beta_feedback(feedback_id) on delete cascade,
  square text not null,
  corrected_class text,
  primary key(feedback_id,square)
);

-- Minimal Storage contract required by the modern Scanner public-feedback
-- migration. This rehearsal never connects to a remote Supabase project.
create schema private;
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null,
  file_size_limit bigint,
  allowed_mime_types text[]
);

-- Keep this block in the exact filename order used by Supabase.
\ir ../supabase/migrations/20261018174754_caissa_account_control_v1.sql
\ir ../supabase/migrations/20261018174844_caissa_account_control_v1_fk_indexes.sql
\ir ../supabase/migrations/20261018181749_caissa_account_control_v1_security_followup.sql
\ir ../supabase/migrations/20261021214528_opening_trainer_repertoires.sql
\ir ../supabase/migrations/20261022235500_identity_migration_challenge_service_read.sql
\ir ../supabase/migrations/20261023203000_caissa_online_guest_rate_limit_principals.sql
\ir ../supabase/migrations/20261024153000_caissa_account_control_explicit_service_grants.sql
\ir ../supabase/migrations/20261024153000_caissa_account_control_explicit_service_grants.sql
\ir ../supabase/migrations/20261024230355_scanner_public_feedback_v01.sql
\ir ../supabase/migrations/20261031152722_caissa_account_control_scanner_public_evidence_guard.sql
\ir ../supabase/migrations/20261031152722_caissa_account_control_scanner_public_evidence_guard.sql

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ACCOUNT_CONTROL_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

insert into public.users(id,clerk_id,email,credits) values
 ('10000000-0000-4000-8000-000000000001','synthetic_dev_a','a@example.invalid',7),
 ('10000000-0000-4000-8000-000000000002','synthetic_dev_b','b@example.invalid',11),
 ('10000000-0000-4000-8000-000000000003','synthetic_dev_c','c@example.invalid',3),
 ('10000000-0000-4000-8000-000000000004','synthetic_dev_d','reusable@example.invalid',5),
 ('10000000-0000-4000-8000-000000000006','synthetic_dev_scanner','scanner@example.invalid',0),
 ('10000000-0000-4000-8000-000000000007','synthetic_dev_album','album@example.invalid',0);

-- The foundation backfill ran before these fixtures, so create exact synthetic bindings.
insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at)
select id,'legacy_development',clerk_id,'ACTIVE','LEGACY_BACKFILL',pg_catalog.clock_timestamp()
from public.users;
insert into public.identity_bindings(
  user_id,environment,external_subject,status,proof_method,activated_at,retired_at
) values (
  '10000000-0000-4000-8000-000000000004','legacy_development','synthetic_dev_d_old',
  'RETIRED','LEGACY_BACKFILL',pg_catalog.clock_timestamp()-interval '1 day',pg_catalog.clock_timestamp()
);

insert into public.caissa_online_rate_limits(clerk_id,bucket) values
 ('synthetic_dev_d','fixture-current'),
 ('synthetic_dev_d_old','fixture-retired'),
 ('synthetic_dev_a','fixture-other');

insert into public.identity_enrollment_decisions(
  environment,external_subject,decision,reason,expires_at,consumed_at
) values (
  'production','synthetic_dev_d','APPROVED_NEW','synthetic owner approval',
  pg_catalog.clock_timestamp()+interval '1 day',pg_catalog.clock_timestamp()
);

insert into public.puzzle_training_progress(user_id,rating,solved,failed)
values ('10000000-0000-4000-8000-000000000001',1850,18,9);
insert into public.puzzle_training_attempts(user_id,operation_id)
values ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001');
insert into public.credit_events(user_id,action,delta,balance_after) values
 ('10000000-0000-4000-8000-000000000001','fixture',7,7),
 ('10000000-0000-4000-8000-000000000004','fixture',5,5);
insert into public.caissa_public_identities(user_id,public_nickname,nickname_key,fallback_alias) values
 ('10000000-0000-4000-8000-000000000001','Synthetic A','synthetic a','Player-AAAAAAAAAAAAAAAA'),
 ('10000000-0000-4000-8000-000000000004','Synthetic D','synthetic d','Player-DDDDDDDDDDDDDDDD');
insert into public.caissa_online_profiles(user_id,clerk_id,display_name) values
 ('10000000-0000-4000-8000-000000000001','synthetic_dev_a','Synthetic A'),
 ('10000000-0000-4000-8000-000000000004','synthetic_dev_d','Synthetic D');
insert into public.caissa_online_ratings(user_id,pool,rating) values
 ('10000000-0000-4000-8000-000000000001','rapid',1777),
 ('10000000-0000-4000-8000-000000000004','rapid',1666);
insert into public.caissa_online_games(white_user_id,black_user_id) values
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002');
update public.caissa_online_games set draw_offer_by='synthetic_dev_d'
where white_user_id='10000000-0000-4000-8000-000000000004';
insert into public.caissa_online_challenges(challenger_user_id,challenged_user_id) values
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002');
insert into public.caissa_online_tournaments(id,owner_user_id) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.caissa_online_tournament_participants(tournament_id,user_id) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.library_positions(user_id,local_id,fen) values
 ('10000000-0000-4000-8000-000000000004','fixture-position','8/8/8/8/8/8/8/8 w - - 0 1');
insert into public.library_collections(user_id,local_id,name) values
 ('10000000-0000-4000-8000-000000000004','fixture-collection','Fixture');
insert into public.opening_repertoires(
  user_id,local_id,name,color,opening,initial_fen,lines,local_created_at,local_updated_at
) values
 ('10000000-0000-4000-8000-000000000004','fixture-opening','Fixture Opening','white','Fixture Opening',
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','[]'::jsonb,
  pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()),
 ('10000000-0000-4000-8000-000000000001','preserved-opening','Preserved Opening','black','Preserved Opening',
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','[]'::jsonb,
  pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp());
insert into public.library_sync_log(user_id) values
 ('10000000-0000-4000-8000-000000000004');
insert into public.user_entitlements(user_id,entitlement,revoked_at) values
 ('10000000-0000-4000-8000-000000000004','historic_fixture',pg_catalog.clock_timestamp());
insert into public.player_album_entitlements(user_id,album_id,credit_cost,operation_id) values
 ('10000000-0000-4000-8000-000000000007','fixture-album',1,
  '79000000-0000-4000-8000-000000000001');
insert into public.beta_audit_events(user_id,experiment_id,event_type) values
 ('10000000-0000-4000-8000-000000000004','fixture','experiment_opened');
insert into public.credit_reservations(id,user_id,operation_id,state) values
 ('71000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000001','RELEASED');
insert into public.economic_usage_events(event_id,user_id) values
 ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.mentor_operation_results(operation_id,user_id,content_type,plaintext_bytes,expires_at) values
 ('74000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',
  'MENTOR_RESULT_JSON_V1',128,pg_catalog.clock_timestamp()+interval '1 hour');
insert into public.scanner_beta_scans(scan_id,user_id) values
 ('75000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.scanner_beta_feedback(feedback_id,scan_id,user_id) values
 ('76000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004');
insert into public.scanner_beta_square_corrections(feedback_id,square,corrected_class) values
 ('76000000-0000-4000-8000-000000000001','e4','P');
insert into public.scanner_beta_scan_failures(feedback_id,user_id) values
 ('77000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.scanner_beta_scans(scan_id,user_id,image_storage_reference) values
 ('75000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','private/synthetic-board.png');

insert into public.scanner_public_scans(
  scan_id,submitted_by,submitted_at,model_version,model_checksum,occupancy_threshold,
  localization_version,image_hash,snapshot_hash,platform,capture_type,snapshot
) values (
  '85000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006',
  '2026-10-31T14:00:00Z','caissa-piece-classifier-v0.5-occupancy-recovery',
  '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',0.99,
  'caissa-scanner-board-localizer/4',repeat('A',64),repeat('D',64),'test','camera','{}'::jsonb
);
insert into public.scanner_public_feedback_raw(
  feedback_id,scan_id,submitted_by,submitted_at,schema_version,corpus_version,source_trust,
  certification_status,feedback_type,model_version,localization_version,platform,capture_type,
  image_storage_reference,payload_hash,evidence_fingerprint,payload
) values (
  '86000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000006','2026-10-31T14:01:00Z',
  'caissa-scanner-public-feedback/1','caissa-scanner-public-feedback-v0.1','public_user',
  'raw-unverified','CONFIRMED_CORRECT','caissa-piece-classifier-v0.5-occupancy-recovery',
  'caissa-scanner-board-localizer/4','test','camera',
  'supabase://scanner-public-feedback-images/10000000-0000-4000-8000-000000000006/AB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  repeat('B',64),repeat('C',64),'{"feedbackType":"CONFIRMED_CORRECT"}'::jsonb
);
insert into public.scanner_feedback_certifications(
  feedback_id,action,certified_by,certified_at,certification_version,training_eligible,reason_codes
) values (
  '86000000-0000-4000-8000-000000000001','HOLD',
  '10000000-0000-4000-8000-000000000007','2026-10-31T14:02:00Z',
  'caissa-scanner-owner-certification/1',false,array['MANUAL_REVIEW']
);
insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type,recorded_at)
values ('86000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000007','CASE_OPENED','2026-10-31T14:03:00Z');

do $$
declare
  v_binding uuid;
  v_reviewer_binding uuid;
  v_summary jsonb;
  v_export_rows integer;
  v_identity_leaks integer;
  v_reviewer_scope text;
  v_reviewer_target jsonb;
begin
  select id into v_binding from public.identity_bindings
    where external_subject='synthetic_dev_scanner' and status='ACTIVE';
  select id into v_reviewer_binding from public.identity_bindings
    where external_subject='synthetic_dev_album' and status='ACTIVE';
  v_summary:=public.caissa_account_control_summary(
    '10000000-0000-4000-8000-000000000006',v_binding);
  perform pg_temp.assert_true(v_summary->>'ownership'='VERIFIED',
    'immutable Scanner evidence incorrectly blocked private export ownership');
  perform pg_temp.assert_true((v_summary->'counts'->>'scannerPublicEvidence')::integer=4,
    'Scanner public evidence was omitted from account summary');
  perform pg_temp.assert_true((v_summary->'counts'->>'storageReferences')::integer=1,
    'Scanner public image was omitted from storage reference count');
  perform pg_temp.assert_true((v_summary->'capabilities'->>'export')::boolean,
    'Scanner public evidence incorrectly blocked private export');
  perform pg_temp.assert_true(not (v_summary->'capabilities'->>'accountDeletion')::boolean
      and (v_summary->>'manualReviewRequired')::boolean,
    'Scanner public evidence did not fail self-service deletion closed');

  select count(*),count(*) filter(where data ? 'submitted_by' or data ? 'certified_by' or data ? 'reviewer_id')
    into v_export_rows,v_identity_leaks
  from (
    select data from public.export_caissa_scanner_public_data_page(
      '10000000-0000-4000-8000-000000000006',v_binding,'scannerPublicScans',0,2,clock_timestamp())
    union all select data from public.export_caissa_scanner_public_data_page(
      '10000000-0000-4000-8000-000000000006',v_binding,'scannerPublicFeedback',0,2,clock_timestamp())
    union all select data from public.export_caissa_scanner_public_data_page(
      '10000000-0000-4000-8000-000000000006',v_binding,'scannerPublicCertifications',0,2,clock_timestamp())
    union all select data from public.export_caissa_scanner_public_data_page(
      '10000000-0000-4000-8000-000000000006',v_binding,'scannerPublicReviewEvents',0,2,clock_timestamp())
  ) scanner_export;
  perform pg_temp.assert_true(v_export_rows=4,'Scanner public private export is incomplete');
  perform pg_temp.assert_true(v_identity_leaks=0,'Scanner public private export leaked actor identity columns');

  select data->>'scope',data->'feedbackId' into v_reviewer_scope,v_reviewer_target
  from public.export_caissa_scanner_public_data_page(
    '10000000-0000-4000-8000-000000000007',v_reviewer_binding,
    'scannerPublicCertifications',0,2,clock_timestamp());
  perform pg_temp.assert_true(v_reviewer_scope='reviewerAction' and v_reviewer_target='null'::jsonb,
    'reviewer export leaked a cross-account Scanner feedback identifier');

  insert into public.scanner_public_scans(
    scan_id,submitted_by,submitted_at,model_version,model_checksum,occupancy_threshold,
    localization_version,image_hash,snapshot_hash,platform,capture_type,snapshot
  ) values (
    '85000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006',
    '2999-01-01T00:00:00Z','caissa-piece-classifier-v0.5-occupancy-recovery',
    '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',0.99,
    'caissa-scanner-board-localizer/4',repeat('9',64),repeat('8',64),'test','camera','{}'::jsonb
  );
  select pg_catalog.count(*) into v_export_rows
  from public.export_caissa_scanner_public_data_page(
    '10000000-0000-4000-8000-000000000006',v_binding,
    'scannerPublicScans',0,2,pg_catalog.clock_timestamp()) exported
  where exported.data->>'scan_id'='85000000-0000-4000-8000-000000000003';
  perform pg_temp.assert_true(v_export_rows=1,
    'server insertion snapshot incorrectly excluded a future-dated Scanner event');

  begin
    perform public.prepare_caissa_account_control(
      '10000000-0000-4000-8000-000000000006',v_binding,'ACCOUNT_DELETION',
      repeat('7',64),repeat('8',64),repeat('9',64),clock_timestamp()+interval '5 minutes');
    raise exception 'immutable Scanner evidence unexpectedly allowed self-service deletion';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_REVIEW_REQUIRED%' then raise; end if;
  end;

  begin
    update public.scanner_public_feedback_raw set platform='mutated'
      where feedback_id='86000000-0000-4000-8000-000000000001';
    raise exception 'Scanner public evidence unexpectedly allowed update';
  exception when others then
    if sqlerrm not like '%SCANNER_PUBLIC_EVIDENCE_APPEND_ONLY%' then raise; end if;
  end;
  begin
    delete from public.scanner_public_feedback_raw
      where feedback_id='86000000-0000-4000-8000-000000000001';
    raise exception 'Scanner public evidence unexpectedly allowed delete';
  exception when others then
    if sqlerrm not like '%SCANNER_PUBLIC_EVIDENCE_APPEND_ONLY%' then raise; end if;
  end;

  insert into public.caissa_account_states(user_id,state,reason_code)
  values('10000000-0000-4000-8000-000000000006','DELETION_PENDING','TEST_BARRIER')
  on conflict(user_id) do update set state='DELETION_PENDING',reason_code='TEST_BARRIER';
  begin
    insert into public.scanner_public_scans(
      scan_id,submitted_by,model_version,model_checksum,occupancy_threshold,
      localization_version,image_hash,snapshot_hash,snapshot
    ) values (
      '85000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006',
      'caissa-piece-classifier-v0.5-occupancy-recovery',
      '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',0.99,
      'caissa-scanner-board-localizer/4',repeat('E',64),repeat('F',64),'{}'::jsonb
    );
    raise exception 'Scanner public write unexpectedly bypassed account deletion state';
  exception when sqlstate '55000' then null;
  end;
  update public.caissa_account_states set state='ACTIVE',reason_code='TEST_RESTORED'
    where user_id='10000000-0000-4000-8000-000000000006';
end;
$$;

do $$
declare v_binding uuid; v_summary jsonb;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_b';
  v_summary := public.caissa_account_control_summary(
    '10000000-0000-4000-8000-000000000002',v_binding);
  perform pg_temp.assert_true((v_summary->>'manualReviewRequired')::boolean,
    'scanner storage reference did not require manual review');
  perform pg_temp.assert_true(not (v_summary->'capabilities'->>'accountDeletion')::boolean,
    'scanner storage reference allowed automatic deletion');
end;
$$;

do $$
declare v_binding uuid; v_summary jsonb; v_album integer;
begin
  select id into v_binding from public.identity_bindings
   where external_subject='synthetic_dev_album' and status='ACTIVE';
  v_summary:=public.caissa_account_control_summary(
    '10000000-0000-4000-8000-000000000007',v_binding);
  perform pg_temp.assert_true((v_summary->'counts'->>'playerAlbumEntitlements')::integer=1
      and (v_summary->'counts'->>'activeEntitlements')::integer=1
      and not (v_summary->'capabilities'->>'accountDeletion')::boolean,
    'permanent player-album entitlement did not fail account deletion closed');
  select pg_catalog.count(*) into v_album
  from public.export_caissa_account_supplemental_data_page(
    '10000000-0000-4000-8000-000000000007',v_binding,
    'playerAlbumEntitlements',0,100,pg_catalog.clock_timestamp()) exported
  where exported.data->>'albumId'='fixture-album'
    and not (exported.data ? 'user_id') and not (exported.data ? 'operation_id');
  perform pg_temp.assert_true(v_album=1,'player-album entitlement missing from private export');
end;
$$;

do $$
declare v_binding uuid; v_operation uuid; v_duplicate uuid; v_result jsonb;
begin
  select id into v_binding from public.identity_bindings
   where external_subject='synthetic_dev_a' and status='ACTIVE';
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000001',v_binding,'PROGRESS_RESET',
    repeat('a',64),repeat('b',64),repeat('c',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  select operation_id into v_duplicate from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000001',v_binding,'PROGRESS_RESET',
    repeat('a',64),repeat('b',64),repeat('c',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  perform pg_temp.assert_true(v_operation=v_duplicate,'idempotent prepare returned a different operation');
  begin
    perform public.prepare_caissa_account_control(
      '10000000-0000-4000-8000-000000000001',v_binding,'PROGRESS_RESET',
      repeat('9',64),repeat('b',64),repeat('c',64),pg_catalog.clock_timestamp()+interval '5 minutes');
    raise exception 'parallel operation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OPERATION_IN_PROGRESS%' then raise; end if;
  end;
  begin
    perform public.confirm_caissa_progress_reset(
      v_operation,'10000000-0000-4000-8000-000000000001',v_binding,
      repeat('b',64),repeat('c',64),repeat('a',64),
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_b','UTF8')),'hex'));
    raise exception 'cross-subject confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OWNERSHIP_REQUIRED%' then raise; end if;
  end;
  v_result := public.confirm_caissa_progress_reset(
    v_operation,'10000000-0000-4000-8000-000000000001',v_binding,
    repeat('b',64),repeat('c',64),repeat('a',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_a','UTF8')),'hex'));
  perform pg_temp.assert_true((v_result->>'puzzleAttemptsDeleted')::integer=1,'reset did not remove the attempt');
  v_result := public.confirm_caissa_progress_reset(
    v_operation,'10000000-0000-4000-8000-000000000001',v_binding,
    repeat('b',64),repeat('c',64),repeat('a',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_a','UTF8')),'hex'));
  perform pg_temp.assert_true((v_result->>'duplicate')::boolean,'replayed reset was not idempotent');
end;
$$;

select pg_temp.assert_true(
  not exists(select 1 from public.puzzle_training_progress where user_id='10000000-0000-4000-8000-000000000001')
  and not exists(select 1 from public.puzzle_training_attempts where user_id='10000000-0000-4000-8000-000000000001'),
  'selective reset left puzzle data'
);
select pg_temp.assert_true(
  (select credits=7 from public.users where id='10000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.credit_events where user_id='10000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.caissa_public_identities where user_id='10000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.caissa_online_ratings where user_id='10000000-0000-4000-8000-000000000001'),
  'selective reset changed a preserved data class'
);

-- A participant in an active shared game cannot begin automatic deletion.
-- Completing the game releases the hold while preserving the historical row.
do $$
declare v_binding uuid; v_summary jsonb;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_d';
  v_summary := public.caissa_account_control_summary(
    '10000000-0000-4000-8000-000000000004',v_binding);
  perform pg_temp.assert_true(
    not (v_summary->'capabilities'->>'accountDeletion')::boolean,
    'active Online game allowed automatic account deletion');
  begin
    perform * from public.prepare_caissa_account_control(
      '10000000-0000-4000-8000-000000000004',v_binding,'ACCOUNT_DELETION',
      repeat('7',64),repeat('8',64),repeat('9',64),pg_catalog.clock_timestamp()+interval '5 minutes');
    raise exception 'active Online game deletion prepare unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_REVIEW_REQUIRED%' then raise; end if;
  end;
  update public.caissa_online_games set status='completed'
  where white_user_id='10000000-0000-4000-8000-000000000004'
    and black_user_id='10000000-0000-4000-8000-000000000002';
end;
$$;

-- Re-check under the deletion advisory lock: a game that becomes active after
-- prepare must send the operation to review instead of stranding its opponent.
do $$
declare v_binding uuid; v_operation uuid; v_result jsonb; v_game uuid;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_c';
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000003',v_binding,'ACCOUNT_DELETION',
    repeat('4',64),repeat('5',64),repeat('6',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  insert into public.caissa_online_games(white_user_id,black_user_id)
  values('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002')
  returning id into v_game;
  v_result := public.lock_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000003',v_binding,
    repeat('5',64),repeat('6',64),repeat('4',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_c','UTF8')),'hex'));
  perform pg_temp.assert_true(v_result->>'status'='REVIEW_REQUIRED',
    'concurrent active Online game did not stop deletion lock');
  perform pg_temp.assert_true(
    (select status='active' from public.caissa_online_games where id=v_game),
    'deletion hold mutated the active Online game');
  perform pg_temp.assert_true(
    not exists(select 1 from public.caissa_account_states
      where user_id='10000000-0000-4000-8000-000000000003' and state='DELETION_PENDING'),
    'active Online game left the participant deletion-locked');
  update public.caissa_online_games set status='completed' where id=v_game;
end;
$$;

-- Cross-owner confirmation must not locate another account's operation.
do $$
declare v_operation uuid; v_binding_a uuid; v_binding_b uuid;
begin
  select id into v_binding_a from public.identity_bindings where external_subject='synthetic_dev_a';
  select id into v_binding_b from public.identity_bindings where external_subject='synthetic_dev_b';
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000001',v_binding_a,'PROGRESS_RESET',
    repeat('d',64),repeat('e',64),repeat('f',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  begin
    perform public.confirm_caissa_progress_reset(v_operation,
      '10000000-0000-4000-8000-000000000002',v_binding_b,
      repeat('e',64),repeat('f',64),repeat('d',64),
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_b','UTF8')),'hex'));
    raise exception 'cross-owner confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OPERATION_NOT_FOUND%' then raise; end if;
  end;
end;
$$;

-- Provider failure is durable, fail-closed, and audit-idempotent.
do $$
declare v_binding uuid; v_operation uuid;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_c';
  insert into public.caissa_online_presence(user_id)
  values('10000000-0000-4000-8000-000000000003');
  insert into public.caissa_online_rate_limits(clerk_id,bucket)
  values('synthetic_dev_c','before-delete');
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000003',v_binding,'ACCOUNT_DELETION',
    repeat('1',64),repeat('2',64),repeat('3',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  perform public.lock_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000003',v_binding,
    repeat('2',64),repeat('3',64),repeat('1',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_c','UTF8')),'hex'));
  begin
    insert into public.caissa_online_presence(user_id)
    values('10000000-0000-4000-8000-000000000003')
    on conflict(user_id) do update set user_id=excluded.user_id;
    raise exception 'write barrier unexpectedly allowed presence recreation';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.caissa_online_presence
    where user_id='10000000-0000-4000-8000-000000000003';
    raise exception 'write barrier unexpectedly allowed account-scoped delete';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.caissa_online_rate_limits(clerk_id,bucket)
    values('synthetic_dev_c','pending-delete');
    raise exception 'raw subject write unexpectedly bypassed deletion lock';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.caissa_online_rate_limits set bucket='updated-after-lock'
    where clerk_id='synthetic_dev_c' and bucket='before-delete';
    raise exception 'raw subject update unexpectedly bypassed deletion lock';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.users set email='blocked@example.invalid'
    where id='10000000-0000-4000-8000-000000000003';
    raise exception 'write barrier unexpectedly allowed user mutation';
  exception when sqlstate '55000' then null;
  end;
  insert into public.caissa_online_presence(user_id)
  values('10000000-0000-4000-8000-000000000002')
  on conflict(user_id) do update set user_id=excluded.user_id;
  begin
    update public.caissa_online_presence
    set user_id='10000000-0000-4000-8000-000000000003'
    where user_id='10000000-0000-4000-8000-000000000002';
    raise exception 'owner reassignment unexpectedly bypassed deletion lock';
  exception when sqlstate '55000' then null;
  end;
  perform public.erase_caissa_account_data(v_operation,
    '10000000-0000-4000-8000-000000000003',v_binding,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_c','UTF8')),'hex'));
  perform public.mark_caissa_auth_deletion_failed(v_operation,'10000000-0000-4000-8000-000000000003');
  perform public.mark_caissa_auth_deletion_failed(v_operation,'10000000-0000-4000-8000-000000000003');
  perform pg_temp.assert_true(
    (select status='FAILED_REVIEW' from public.caissa_account_control_operations where id=v_operation),
    'provider failure was not quarantined');
  perform pg_temp.assert_true(
    (select count(*)=1 from public.caissa_account_control_audit where operation_id=v_operation and event_type='AUTH_DELETION_FAILED'),
    'provider failure audit was duplicated');
end;
$$;

-- Successful erasure retains the UUID tombstone, economy, and shared game.
do $$
declare
  v_binding uuid;
  v_other_binding uuid;
  v_operation uuid;
  v_summary jsonb;
  v_game_count integer;
  v_library integer;
  v_scanner integer;
  v_scanner_feedback integer;
  v_scanner_failures integer;
  v_scanner_corrections integer;
  v_mentor integer;
  v_beta integer;
  v_economy integer;
  v_opening integer;
  v_identity_decisions integer;
  v_owner_leaks integer;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_d';
  select id into v_other_binding from public.identity_bindings where external_subject='synthetic_dev_a';
  select count(*) into v_game_count from public.caissa_online_games;
  v_summary:=public.caissa_account_control_summary(
    '10000000-0000-4000-8000-000000000004',v_binding);
  perform pg_temp.assert_true((v_summary->'counts'->>'openingRepertoires')::integer=1,
    'Opening Trainer repertoire was omitted from account summary');
  perform pg_temp.assert_true((v_summary->'counts'->>'scannerLegacyFeedback')::integer=1
      and (v_summary->'counts'->>'scannerLegacyFailures')::integer=1
      and (v_summary->'counts'->>'scannerLegacyCorrections')::integer=1
      and (v_summary->'counts'->>'identityEnrollmentDecisions')::integer=1,
    'supplemental Scanner or identity data was omitted from account summary');
  select
    count(*) filter(where section='libraryPositions'),
    count(*) filter(where section='scannerScans'),
    count(*) filter(where section='scannerFeedback'),
    count(*) filter(where section='scannerFailures'),
    count(*) filter(where section='scannerCorrections'),
    count(*) filter(where section='mentorResults'),
    count(*) filter(where section='betaActivity'),
    count(*) filter(where section='creditReservations'),
    count(*) filter(where data ? 'user_id')
  into v_library,v_scanner,v_scanner_feedback,v_scanner_failures,v_scanner_corrections,
    v_mentor,v_beta,v_economy,v_owner_leaks
  from (
    select 'libraryPositions' section,data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'libraryPositions',0,100,clock_timestamp())
    union all select 'scannerScans',data from public.export_caissa_account_supplemental_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'scannerScans',0,2,clock_timestamp())
    union all select 'scannerFeedback',data from public.export_caissa_account_supplemental_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'scannerFeedback',0,2,clock_timestamp())
    union all select 'scannerFailures',data from public.export_caissa_account_supplemental_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'scannerFailures',0,2,clock_timestamp())
    union all select 'scannerCorrections',data from public.export_caissa_account_supplemental_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'scannerCorrections',0,2,clock_timestamp())
    union all select 'mentorResults',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'mentorResults',0,100,clock_timestamp())
    union all select 'betaActivity',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'betaActivity',0,100,clock_timestamp())
    union all select 'creditReservations',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'creditReservations',0,100,clock_timestamp())
  ) export_rows;
  perform pg_temp.assert_true(v_library=1,'library position missing from private export');
  perform pg_temp.assert_true(v_scanner=1,'scanner record missing from private export');
  perform pg_temp.assert_true(v_scanner_feedback=1 and v_scanner_failures=1 and v_scanner_corrections=1,
    'legacy Scanner feedback, failure, or correction missing from private export');
  perform pg_temp.assert_true(v_mentor=1,'mentor result metadata missing from private export');
  perform pg_temp.assert_true(v_beta=1,'beta activity missing from private export');
  perform pg_temp.assert_true(v_economy=1,'economic evidence missing from private export');
  perform pg_temp.assert_true(v_owner_leaks=0,'internal owner column leaked from private export');
  select pg_catalog.count(*) into v_opening
  from public.export_caissa_opening_repertoire_data_page(
    '10000000-0000-4000-8000-000000000004',v_binding,
    'openingRepertoires',0,10,pg_catalog.clock_timestamp()) exported
  where exported.data->>'id'='fixture-opening'
    and not (exported.data ? 'user_id') and not (exported.data ? 'userId');
  perform pg_temp.assert_true(v_opening=1,
    'Opening Trainer owner export was incomplete or leaked the internal owner');
  select pg_catalog.count(*) into v_identity_decisions
  from public.export_caissa_account_supplemental_data_page(
    '10000000-0000-4000-8000-000000000004',v_binding,
    'identityEnrollmentDecisions',0,100,pg_catalog.clock_timestamp()) exported
  where exported.data->>'decision'='APPROVED_NEW'
    and not (exported.data ? 'external_subject');
  perform pg_temp.assert_true(v_identity_decisions=1,
    'identity enrollment decision missing from private export or leaked raw subject');
  begin
    perform * from public.export_caissa_opening_repertoire_data_page(
      '10000000-0000-4000-8000-000000000004',v_other_binding,
      'openingRepertoires',0,10,pg_catalog.clock_timestamp());
    raise exception 'cross-account Opening Trainer export unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OWNERSHIP_REQUIRED%' then raise; end if;
  end;
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000004',v_binding,'ACCOUNT_DELETION',
    repeat('4',64),repeat('5',64),repeat('6',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  perform public.lock_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000004',v_binding,
    repeat('5',64),repeat('6',64),repeat('4',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_d','UTF8')),'hex'));
  perform public.erase_caissa_account_data(v_operation,
    '10000000-0000-4000-8000-000000000004',v_binding,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_d','UTF8')),'hex'));
  perform public.complete_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000004',v_binding);
  perform pg_temp.assert_true((select state='DELETED' from public.caissa_account_states
    where user_id='10000000-0000-4000-8000-000000000004'),'deleted state missing');
  perform pg_temp.assert_true((select clerk_id like 'deleted_%' and email is null from public.users
    where id='10000000-0000-4000-8000-000000000004'),'user tombstone invalid');
  perform pg_temp.assert_true((select count(*)=v_game_count from public.caissa_online_games),'shared game was deleted');
  perform pg_temp.assert_true(exists(select 1 from public.credit_events
    where user_id='10000000-0000-4000-8000-000000000004'),'credit evidence was deleted');
  perform pg_temp.assert_true(exists(select 1 from public.caissa_online_tournament_participants
    where user_id='10000000-0000-4000-8000-000000000004'),'shared tournament history was deleted');
  perform pg_temp.assert_true((select state='cancelled' from public.caissa_online_challenges
    where challenger_user_id='10000000-0000-4000-8000-000000000004'),'pending challenge was not safely cancelled');
  perform pg_temp.assert_true(not exists(select 1 from public.caissa_public_identities
    where user_id='10000000-0000-4000-8000-000000000004'),'public identity was not erased');
  perform pg_temp.assert_true(not exists(select 1 from public.library_positions
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.library_collections
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.scanner_beta_scans
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.scanner_beta_feedback
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.scanner_beta_scan_failures
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.mentor_operation_results
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.beta_audit_events
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.opening_repertoires
    where user_id='10000000-0000-4000-8000-000000000004')
    and exists(select 1 from public.opening_repertoires
    where user_id='10000000-0000-4000-8000-000000000001'),
    'owned library, scanner, mentor, beta, or Opening Trainer data was not erased safely');
  perform pg_temp.assert_true(exists(select 1 from public.user_entitlements
    where user_id='10000000-0000-4000-8000-000000000004')
    and exists(select 1 from public.credit_reservations
    where user_id='10000000-0000-4000-8000-000000000004')
    and exists(select 1 from public.economic_usage_events
    where user_id='10000000-0000-4000-8000-000000000004'),
    'retained entitlement or economic evidence was deleted');
  perform pg_temp.assert_true(not exists(select 1 from public.identity_bindings
    where user_id='10000000-0000-4000-8000-000000000004' and external_subject='synthetic_dev_d'),
    'deleted Clerk subject was retained in plaintext');
  perform pg_temp.assert_true(not exists(select 1 from public.identity_enrollment_decisions
      where external_subject='synthetic_dev_d' or reason='synthetic owner approval')
      and exists(select 1 from public.identity_enrollment_decisions
      where external_subject like 'deleted_%' and reason='ACCOUNT_ERASURE_RETAINED'
        and retired_subject_hash ~ '^[0-9a-f]{64}$'),
    'identity enrollment ledger retained a deleted raw subject or free-form reason');
  perform pg_temp.assert_true(not exists(select 1 from public.caissa_online_games
      where draw_offer_by='synthetic_dev_d'),
    'retained Online game leaked the deleted Clerk subject through draw_offer_by');
  perform pg_temp.assert_true(not exists(select 1 from public.caissa_online_rate_limits
      where clerk_id in ('synthetic_dev_d','synthetic_dev_d_old'))
      and exists(select 1 from public.caissa_online_rate_limits
      where clerk_id='synthetic_dev_a'),
    'Online rate-limit cleanup missed a retired subject or deleted another account');
  begin
    insert into public.caissa_public_identities(user_id,fallback_alias)
    values('10000000-0000-4000-8000-000000000004','should-not-return');
    raise exception 'write barrier unexpectedly allowed deleted identity recreation';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.identity_enrollment_decisions(
      environment,external_subject,decision,reason,expires_at
    ) values (
      'production','synthetic_dev_d','REVIEW','should-not-return',
      pg_catalog.clock_timestamp()+interval '1 day'
    );
    raise exception 'identity enrollment barrier allowed retired raw subject recreation';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.opening_repertoires(
      user_id,local_id,name,color,opening,initial_fen,lines,local_created_at,local_updated_at
    ) values (
      '10000000-0000-4000-8000-000000000004','should-not-return','Blocked','white','Blocked',
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','[]'::jsonb,
      pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()
    );
    raise exception 'Opening Trainer write barrier allowed deleted data recreation';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.caissa_online_rate_limits(clerk_id,bucket)
    values('synthetic_dev_d','post-delete');
    raise exception 'raw external subject unexpectedly returned after deletion';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- Re-registration with the same email creates a new UUID and inherits nothing.
insert into public.users(id,clerk_id,email) values
 ('10000000-0000-4000-8000-000000000005','synthetic_dev_new','reusable@example.invalid');
insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at)
values ('10000000-0000-4000-8000-000000000005','legacy_development','synthetic_dev_new','ACTIVE','NEW_ACCOUNT',pg_catalog.clock_timestamp());
select pg_temp.assert_true(
  not exists(select 1 from public.credit_events where user_id='10000000-0000-4000-8000-000000000005')
  and not exists(select 1 from public.caissa_online_ratings where user_id='10000000-0000-4000-8000-000000000005')
  and (select credits=0 from public.users where id='10000000-0000-4000-8000-000000000005'),
  'new registration inherited deleted-account data'
);

select pg_temp.assert_true(
  not pg_catalog.has_table_privilege('anon','public.caissa_account_control_operations','SELECT')
  and not pg_catalog.has_table_privilege('authenticated','public.caissa_account_control_operations','SELECT')
  and pg_catalog.has_function_privilege('service_role','public.caissa_account_control_summary(uuid,uuid)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.export_caissa_opening_repertoire_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.export_caissa_account_supplemental_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.export_caissa_opening_repertoire_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.export_caissa_account_supplemental_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.caissa_account_control_summary(uuid,uuid)','EXECUTE'),
  'account control privilege boundary is incorrect'
);

select pg_temp.assert_true(
  pg_catalog.has_table_privilege('service_role','public.opening_repertoires','SELECT')
  and pg_catalog.has_table_privilege('service_role','public.opening_repertoires','INSERT')
  and pg_catalog.has_table_privilege('service_role','public.opening_repertoires','UPDATE')
  and pg_catalog.has_table_privilege('service_role','public.opening_repertoires','DELETE')
  and not pg_catalog.has_table_privilege('anon','public.opening_repertoires','SELECT')
  and not pg_catalog.has_table_privilege('authenticated','public.opening_repertoires','SELECT'),
  'Opening Trainer service-only privilege boundary is incorrect'
);

select pg_temp.assert_true(
  pg_catalog.has_table_privilege('service_role','public.player_album_entitlements','SELECT')
  and pg_catalog.has_table_privilege('service_role','public.player_album_entitlements','INSERT')
  and not pg_catalog.has_table_privilege('service_role','public.player_album_entitlements','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.player_album_entitlements','DELETE')
  and not pg_catalog.has_table_privilege('anon','public.player_album_entitlements','SELECT')
  and not pg_catalog.has_table_privilege('authenticated','public.player_album_entitlements','SELECT')
  and not pg_catalog.has_table_privilege('service_role','public.identity_enrollment_decisions','SELECT')
  and not pg_catalog.has_table_privilege('anon','public.identity_enrollment_decisions','SELECT')
  and not pg_catalog.has_table_privilege('authenticated','public.identity_enrollment_decisions','SELECT'),
  'supplemental entitlement or identity-ledger privilege boundary is incorrect'
);

do $$
declare
  v_relation text;
  v_role text;
  v_privilege text;
  v_expected boolean;
begin
  foreach v_relation in array array[
    'public.scanner_public_scans',
    'public.scanner_public_feedback_raw',
    'public.scanner_feedback_certifications',
    'public.scanner_feedback_review_audit'
  ] loop
    foreach v_privilege in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
    ] loop
      v_expected:=v_privilege in ('SELECT','INSERT');
      if pg_catalog.has_table_privilege('service_role',v_relation,v_privilege) is distinct from v_expected then
        raise exception 'Scanner service_role privilege mismatch: relation %, privilege %, expected %',
          v_relation,v_privilege,v_expected;
      end if;
      foreach v_role in array array['anon','authenticated'] loop
        if pg_catalog.has_table_privilege(v_role,v_relation,v_privilege) then
          raise exception '% unexpectedly has % on %',v_role,v_privilege,v_relation;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;

select pg_temp.assert_true(
  pg_catalog.has_sequence_privilege('service_role','public.scanner_feedback_certifications_id_seq','USAGE')
  and pg_catalog.has_sequence_privilege('service_role','public.scanner_feedback_certifications_id_seq','SELECT')
  and not pg_catalog.has_sequence_privilege('service_role','public.scanner_feedback_certifications_id_seq','UPDATE')
  and pg_catalog.has_sequence_privilege('service_role','public.scanner_feedback_review_audit_id_seq','USAGE')
  and pg_catalog.has_sequence_privilege('service_role','public.scanner_feedback_review_audit_id_seq','SELECT')
  and not pg_catalog.has_sequence_privilege('service_role','public.scanner_feedback_review_audit_id_seq','UPDATE')
  and not pg_catalog.has_sequence_privilege('anon','public.scanner_feedback_certifications_id_seq','USAGE')
  and not pg_catalog.has_sequence_privilege('authenticated','public.scanner_feedback_review_audit_id_seq','USAGE'),
  'Scanner sequence privileges were not normalized exactly'
);

select pg_temp.assert_true(
  pg_catalog.has_function_privilege('service_role','public.caissa_account_scanner_public_evidence_count(uuid)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('service_role','public.caissa_account_identity_has_blocking_state(uuid)','EXECUTE')
  and not pg_catalog.has_function_privilege('service_role','private.scanner_public_append_only()','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.caissa_account_scanner_public_evidence_count(uuid)','EXECUTE'),
  'Scanner Account Control function privilege boundary is incorrect'
);

select pg_temp.assert_true(
  not pg_catalog.has_table_privilege('service_role','public.caissa_identity_ownership_reviews','SELECT')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_identity_ownership_reviews','INSERT')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_identity_ownership_reviews','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_identity_ownership_reviews','DELETE')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_states','SELECT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_states','INSERT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_states','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_states','DELETE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_states','TRUNCATE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_states','REFERENCES')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_states','TRIGGER')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_operations','SELECT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_operations','INSERT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_operations','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_control_operations','DELETE')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_audit','SELECT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_audit','INSERT')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_control_audit','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_control_audit','DELETE')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_rate_limits','SELECT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_rate_limits','INSERT')
  and pg_catalog.has_table_privilege('service_role','public.caissa_account_control_rate_limits','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.caissa_account_control_rate_limits','DELETE'),
  'service role table privileges were not normalized exactly'
);

do $$
declare
  v_relation text;
  v_role text;
  v_privilege text;
  v_allowed text[];
  v_expected boolean;
  v_actual boolean;
begin
  foreach v_relation in array array[
    'public.caissa_identity_ownership_reviews',
    'public.caissa_account_states',
    'public.caissa_account_control_operations',
    'public.caissa_account_control_audit',
    'public.caissa_account_control_rate_limits'
  ] loop
    v_allowed := case v_relation
      when 'public.caissa_account_states' then array['SELECT','INSERT','UPDATE']
      when 'public.caissa_account_control_operations' then array['SELECT','INSERT','UPDATE']
      when 'public.caissa_account_control_audit' then array['SELECT','INSERT']
      when 'public.caissa_account_control_rate_limits' then array['SELECT','INSERT','UPDATE']
      else array[]::text[]
    end;

    foreach v_privilege in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
    ] loop
      v_expected := v_privilege = any(v_allowed);
      v_actual := pg_catalog.has_table_privilege('service_role',v_relation,v_privilege);
      if v_actual is distinct from v_expected then
        raise exception 'service_role privilege mismatch: relation %, privilege %, expected %, actual %',
          v_relation, v_privilege, v_expected, v_actual;
      end if;
    end loop;

    foreach v_role in array array['anon','authenticated'] loop
      foreach v_privilege in array array[
        'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      ] loop
        if pg_catalog.has_table_privilege(v_role,v_relation,v_privilege) then
          raise exception '% unexpectedly has % on %', v_role, v_privilege, v_relation;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;

select pg_temp.assert_true(
  pg_catalog.has_sequence_privilege('service_role','public.caissa_account_control_audit_id_seq','USAGE')
  and pg_catalog.has_sequence_privilege('service_role','public.caissa_account_control_audit_id_seq','SELECT')
  and not pg_catalog.has_sequence_privilege('service_role','public.caissa_account_control_audit_id_seq','UPDATE')
  and not pg_catalog.has_sequence_privilege('anon','public.caissa_account_control_audit_id_seq','USAGE')
  and not pg_catalog.has_sequence_privilege('authenticated','public.caissa_account_control_audit_id_seq','USAGE'),
  'service role sequence privileges were not normalized exactly'
);

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege('service_role','public.caissa_account_assert_writable(uuid)','EXECUTE')
  and not pg_catalog.has_function_privilege('service_role','public.caissa_account_write_barrier()','EXECUTE')
  and not pg_catalog.has_function_privilege('service_role','public.caissa_account_rate_limit_write_barrier()','EXECUTE')
  and not pg_catalog.has_function_privilege('service_role','public.caissa_account_external_subject_write_barrier()','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.resolve_caissa_identity_ownership(text,text)','EXECUTE'),
  'service role function privileges were not normalized exactly'
);

do $$
declare
  v_signature text;
  v_role text;
  v_allowed text[] := array[
    'public.consume_caissa_account_control_rate_limit(text,text,integer,integer)',
    'public.caissa_account_active_entitlement_count(uuid)',
    'public.caissa_account_has_blocking_state(uuid)',
    'public.caissa_account_storage_reference_count(uuid)',
    'public.caissa_account_has_active_economic_work(uuid)',
    'public.caissa_account_control_summary(uuid,uuid)',
    'public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz)',
    'public.export_caissa_opening_repertoire_data_page(uuid,uuid,text,integer,integer,timestamptz)',
    'public.export_caissa_account_supplemental_data_page(uuid,uuid,text,integer,integer,timestamptz)',
    'public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz)',
    'public.confirm_caissa_progress_reset(uuid,uuid,uuid,text,text,text,text)',
    'public.lock_caissa_account_deletion(uuid,uuid,uuid,text,text,text,text)',
    'public.mark_caissa_data_deletion_failed(uuid,uuid)',
    'public.erase_caissa_account_data(uuid,uuid,uuid,text)',
    'public.mark_caissa_auth_deletion_failed(uuid,uuid)',
    'public.complete_caissa_account_deletion(uuid,uuid,uuid)',
    'public.resolve_caissa_identity_ownership(text,text)'
  ];
  v_all text[] := v_allowed || array[
    'public.caissa_account_assert_writable(uuid)',
    'public.caissa_account_write_barrier()',
    'public.caissa_account_rate_limit_write_barrier()',
    'public.caissa_account_external_subject_write_barrier()'
  ];
  v_expected boolean;
  v_actual boolean;
begin
  foreach v_signature in array v_all loop
    v_expected := v_signature = any(v_allowed);
    v_actual := pg_catalog.has_function_privilege('service_role',v_signature,'EXECUTE');
    if v_actual is distinct from v_expected then
      raise exception 'service_role function privilege mismatch: function %, expected %, actual %',
        v_signature, v_expected, v_actual;
    end if;

    foreach v_role in array array['anon','authenticated'] loop
      if pg_catalog.has_function_privilege(v_role,v_signature,'EXECUTE') then
        raise exception '% unexpectedly has EXECUTE on %', v_role, v_signature;
      end if;
    end loop;
  end loop;
end
$$;

select pg_temp.assert_true(
  pg_catalog.has_table_privilege('service_role','public.identity_migration_challenges','SELECT')
  and not pg_catalog.has_table_privilege('service_role','public.identity_migration_challenges','INSERT')
  and not pg_catalog.has_table_privilege('service_role','public.identity_migration_challenges','UPDATE')
  and not pg_catalog.has_table_privilege('service_role','public.identity_migration_challenges','DELETE')
  and not pg_catalog.has_table_privilege('anon','public.identity_migration_challenges','SELECT')
  and not pg_catalog.has_table_privilege('authenticated','public.identity_migration_challenges','SELECT'),
  'identity migration challenge grants are not SELECT-only for service role'
);

do $$ declare v_binding uuid; begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_a';
  begin
    perform * from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000001',v_binding,'puzzleAttempts',0,101,clock_timestamp());
    raise exception 'oversized export page unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_EXPORT_PAGE_INVALID%' then raise; end if;
  end;
  begin
    perform * from public.export_caissa_scanner_public_data_page(
      '10000000-0000-4000-8000-000000000001',v_binding,'scannerPublicScans',0,3,clock_timestamp());
    raise exception 'oversized Scanner export page unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_EXPORT_PAGE_INVALID%' then raise; end if;
  end;
  begin
    perform * from public.export_caissa_account_supplemental_data_page(
      '10000000-0000-4000-8000-000000000001',v_binding,'scannerScans',0,3,clock_timestamp());
    raise exception 'oversized legacy Scanner export page unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_EXPORT_PAGE_INVALID%' then raise; end if;
  end;
  begin
    perform * from public.export_caissa_opening_repertoire_data_page(
      '10000000-0000-4000-8000-000000000001',v_binding,'openingRepertoires',0,11,clock_timestamp());
    raise exception 'oversized Opening Trainer export page unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_EXPORT_PAGE_INVALID%' then raise; end if;
  end;
end $$;

select pg_temp.assert_true(
  exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    where c.oid='public.caissa_online_rate_limits'::regclass and t.tgname='caissa_account_write_barrier' and not t.tgisinternal),
  'raw-subject rate-limit barrier is missing'
);

select pg_temp.assert_true(
  exists(select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.identity_enrollment_decisions'::regclass
      and t.tgname='caissa_account_external_subject_write_barrier' and not t.tgisinternal),
  'raw-subject identity enrollment barrier is missing'
);

select pg_temp.assert_true(not exists(
  select 1
  from pg_catalog.pg_constraint fk
  join pg_catalog.pg_class rel on rel.oid=fk.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=rel.relnamespace
  where fk.contype='f' and fk.confrelid='public.users'::regclass and ns.nspname='public'
    and rel.relname not in (
      'caissa_account_states','caissa_account_control_operations',
      'caissa_account_control_audit','caissa_account_control_rate_limits'
    )
    and not exists(select 1 from pg_catalog.pg_trigger t
      where t.tgrelid=rel.oid and t.tgname='caissa_account_write_barrier' and not t.tgisinternal)
), 'a current users foreign-key table is missing the account write barrier');

\echo CAISSA_ACCOUNT_CONTROL_POSTGRES_PASS
