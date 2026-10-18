\set ON_ERROR_STOP on

create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text not null,
  name text not null,
  primary key (version, name)
);

insert into supabase_migrations.schema_migrations(version, name) values
('20260820095816','mentor_maintenance_inspection'),
('20260820232408','mentor_safe_operation_inspection'),
('20260821210315','mentor_recent_operation_discovery'),
('20260822001706','align_mentor_maintenance_value_available_boundary'),
('20260902175749','coach_game_entitlements'),
('20260919183228','scanner_beta_feedback_v01'),
('20260919183231','scanner_beta_scan_failures_v01'),
('20260919183234','caissa_beta_program_v1'),
('20260919183238','scanner_beta_user_activity_summary'),
('20260923034958','eae015b_01_relay_foundation'),
('20260923035004','eae015b_02_session_audit'),
('20260923035006','eae015b_03_audit_null_safe'),
('20260923035007','eae015b_04_heartbeat_evidence'),
('20260923035008','eae015b_05_pending_deadline_evidence'),
('20260923035010','eae015b_06_production_infrastructure'),
('20260923035012','eae015b_07_cleanup_schedule'),
('20260923035014','eae015b_08_metrics_and_alerts'),
('20260924042610','eae016_rollout_metrics'),
('20260927194000','caissa_puzzle_account_progress_v1'),
('20260928011140','caissa_tablebase_shared_limiter'),
('20261003231923','insights_account_reports_v1'),
('20261003232101','insights_rpc_invoker_privileges'),
('20261005204209','caissa_online_native_v1'),
('20261011150814','caissa_online_hardening_only_v3'),
('20261015101043','caissa_public_identity_v1'),
('20261015225857','sec005_clerk_identity_remapping_foundation_v1'),
('20261015225919','sec005_clerk_migration_cutover_tooling_v1'),
('20261015225930','sec005_cutover_compatibility_v1');

create table public.users (
  id uuid primary key,
  clerk_id text unique not null,
  email text,
  credits integer not null default 5,
  is_premium boolean not null default false,
  stripe_customer_id text
);

create table public.beta_experiments (id text primary key);
create table public.beta_audit_events (
  id bigint primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  experiment_id text references public.beta_experiments(id) on delete restrict,
  event_type text not null
);

create table public.caissa_public_identities (
  user_id uuid primary key references public.users(id) on delete cascade
);
create table public.identity_bindings (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  external_subject text not null
);
create table public.identity_migration_challenges (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  legacy_binding_id uuid not null references public.identity_bindings(id) on delete restrict,
  status text not null
);
create table public.identity_manual_recovery_previews (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  current_binding_id uuid not null references public.identity_bindings(id) on delete restrict,
  expected_current_subject_hash text,
  target_subject_hash text
);
create table public.identity_migration_audit (
  id uuid primary key,
  user_id uuid references public.users(id) on delete set null,
  binding_id uuid references public.identity_bindings(id) on delete set null,
  challenge_id uuid references public.identity_migration_challenges(id) on delete set null
);

-- These account surfaces intentionally have no FK. Their exact column shape is
-- pinned by the Production reset guard so a manual schema change fails closed.
create table public.caissa_online_rate_limits (
  clerk_id text not null,
  bucket text not null,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.identity_enrollment_decisions (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  external_subject text not null,
  decision text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table public.credit_events (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  delta integer not null,
  balance_after integer not null,
  reservation_id uuid,
  reverses_event_id uuid references public.credit_events(id) on delete restrict
);
create table public.credit_reservations (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  state text not null,
  expires_at timestamptz not null,
  consumed_event_id uuid references public.credit_events(id) on delete restrict,
  compensation_event_id uuid references public.credit_events(id) on delete restrict
);
alter table public.credit_events add constraint credit_events_reservation_fk
  foreign key (reservation_id) references public.credit_reservations(id) on delete restrict;
create table public.economic_usage_events (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  reservation_id uuid references public.credit_reservations(id) on delete cascade
);
create table public.mentor_operation_results (
  operation_id uuid primary key,
  reservation_id uuid not null unique references public.credit_reservations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null
);

create table public.user_entitlements (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  entitlement text not null,
  granted_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null
);
create table public.puzzle_training_progress (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.puzzle_training_attempts (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.insight_datasets (
  id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  subject text,
  primary key (user_id, id)
);
create table public.insight_reports (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  dataset_id uuid not null,
  foreign key (user_id, dataset_id) references public.insight_datasets(user_id, id) on delete no action
);
create table public.library_positions (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.library_collections (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.library_sync_log (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  item_type text not null,
  item_count integer not null
);

create table public.scanner_beta_scans (
  scan_id uuid primary key,
  user_id uuid references public.users(id) on delete restrict,
  client_metadata jsonb
);
create table public.scanner_beta_scan_failures (
  id uuid primary key,
  user_id uuid references public.users(id) on delete restrict,
  client_metadata jsonb
);
create table public.scanner_beta_feedback (
  feedback_id uuid primary key,
  scan_id uuid not null references public.scanner_beta_scans(scan_id) on delete cascade,
  user_id uuid references public.users(id) on delete restrict,
  client_metadata jsonb
);
create table public.scanner_beta_square_corrections (
  id uuid primary key,
  feedback_id uuid not null references public.scanner_beta_feedback(feedback_id) on delete cascade
);
create table public.scanner_beta_square_predictions (
  id uuid primary key,
  scan_id uuid not null references public.scanner_beta_scans(scan_id) on delete cascade
);
create table public.stripe_events (
  event_id text primary key,
  user_id uuid references public.users(id) on delete restrict
);

create table public.caissa_online_tournaments (
  id uuid primary key,
  owner_user_id uuid references public.users(id) on delete set null
);
create table public.caissa_online_games (
  id uuid primary key,
  status text not null,
  white_user_id uuid not null references public.users(id) on delete no action,
  black_user_id uuid not null references public.users(id) on delete no action,
  tournament_id uuid references public.caissa_online_tournaments(id) on delete set null
);
create table public.caissa_online_game_events (
  id uuid primary key,
  game_id uuid not null references public.caissa_online_games(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete no action
);
create table public.caissa_online_challenges (
  id uuid primary key,
  challenger_user_id uuid not null references public.users(id) on delete cascade,
  challenged_user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid references public.caissa_online_games(id) on delete set null
);
create table public.caissa_online_matchmaking_tickets (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  matched_game_id uuid references public.caissa_online_games(id) on delete set null
);
create table public.caissa_online_presence (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  active_game_id uuid references public.caissa_online_games(id) on delete set null
);
create table public.caissa_online_profiles (
  user_id uuid primary key references public.users(id) on delete cascade
);
create table public.caissa_online_ratings (
  user_id uuid primary key references public.users(id) on delete cascade
);
create table public.caissa_online_tournament_participants (
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (tournament_id, user_id)
);
create table public.caissa_online_tournament_games (
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  game_id uuid not null references public.caissa_online_games(id) on delete cascade,
  primary key (tournament_id, game_id)
);

insert into public.users(id, clerk_id, credits) values
('10000000-0000-4000-8000-000000000001','clerk-subject-1',5);
insert into public.beta_experiments values ('scanner');
insert into public.beta_audit_events values
(1,'10000000-0000-4000-8000-000000000001','scanner','experiment_opened');
insert into public.caissa_public_identities values ('10000000-0000-4000-8000-000000000001');
insert into public.identity_bindings values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','legacy-subject');
insert into public.identity_migration_challenges values
('21000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','USED');
insert into public.identity_manual_recovery_previews values
('22000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','a','b');
insert into public.identity_migration_audit values
('23000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001');
insert into public.caissa_online_rate_limits values ('clerk-subject-1','state',clock_timestamp(),1,clock_timestamp());
insert into public.identity_enrollment_decisions(environment,external_subject,decision,reason,expires_at)
values ('production','legacy-subject','allow','fixture',clock_timestamp()+interval '1 hour');

insert into public.credit_reservations(id,user_id,state,expires_at) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','CONSUMED',clock_timestamp()-interval '1 hour');
insert into public.credit_events(id,user_id,action,delta,balance_after,reservation_id) values
('31000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mentor_chat',-1,4,'30000000-0000-4000-8000-000000000001');
update public.credit_reservations set consumed_event_id='31000000-0000-4000-8000-000000000001';
insert into public.economic_usage_events values
('32000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into public.mentor_operation_results values
('33000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 minute');
insert into public.user_entitlements values
('34000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','beta_tester',null,null,null);
insert into public.puzzle_training_progress values ('35000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.puzzle_training_attempts values ('36000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.insight_datasets values ('37000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture');
insert into public.insight_reports values ('38000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000001');
insert into public.library_positions values ('39000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.library_collections values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.library_sync_log values ('41000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','push','position',1);

insert into public.scanner_beta_scans values
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"selectedImage":"private-name.png","browser":"fixture"}');
insert into public.scanner_beta_scan_failures values
('51000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"selectedImage":"private-name.png","reason":"fixture"}');
insert into public.scanner_beta_feedback values
('52000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"selectedImage":"private-name.png","label":"fixture"}');
insert into public.scanner_beta_square_corrections values ('53000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001');
insert into public.scanner_beta_square_predictions values ('54000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
do $fixture$
declare
  ledger_rows bigint;
  ledger_fingerprint text;
begin
  select count(*), md5(string_agg(version || ':' || name, E'\n' order by version, name))
    into ledger_rows, ledger_fingerprint
  from supabase_migrations.schema_migrations;
  if ledger_rows <> 28 or ledger_fingerprint <> '8a9e642bcf09f0d1c2c121900261e4de' then
    raise exception 'LAB_LEDGER_FIXTURE_DIVERGED rows=% fingerprint=%', ledger_rows, ledger_fingerprint;
  end if;
end
$fixture$;
