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

create table public.users (id text primary key, clerk_id text unique not null);
create table public.caissa_public_identities (user_id text primary key references public.users(id) on delete cascade);
create table public.identity_bindings (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.identity_migration_challenges (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.identity_migration_audit (
  id text primary key,
  user_id text references public.users(id) on delete set null,
  binding_id text references public.identity_bindings(id) on delete set null,
  challenge_id text references public.identity_migration_challenges(id) on delete set null
);

create table public.credit_events (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.credit_reservations (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.economic_usage_events (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.user_entitlements (id text primary key, user_id text not null references public.users(id) on delete cascade, revoked_at timestamptz);
create table public.puzzle_training_progress (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.puzzle_training_attempts (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.insight_datasets (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.insight_reports (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.library_positions (id text primary key, user_id text not null references public.users(id) on delete cascade);
create table public.library_collections (id text primary key, user_id text not null references public.users(id) on delete cascade);

create table public.scanner_beta_scans (id text primary key, user_id text references public.users(id), client_metadata jsonb);
create table public.scanner_beta_scan_failures (id text primary key, user_id text references public.users(id), client_metadata jsonb);
create table public.scanner_beta_feedback (id text primary key, user_id text references public.users(id), client_metadata jsonb);
create table public.stripe_events (id text primary key, user_id text references public.users(id));

create table public.caissa_online_games (id text primary key, status text);
create table public.caissa_online_game_events (id text primary key);
create table public.caissa_online_challenges (id text primary key);
create table public.caissa_online_matchmaking_tickets (id text primary key);
create table public.caissa_online_presence (id text primary key);

insert into public.users values ('user-1', 'clerk-subject-1');
insert into public.caissa_public_identities values ('user-1');
insert into public.identity_bindings values ('binding-1', 'user-1');
insert into public.identity_migration_challenges values ('challenge-1', 'user-1');
insert into public.identity_migration_audit values ('audit-1', 'user-1', 'binding-1', 'challenge-1');
insert into public.credit_events values ('credit-1', 'user-1');
insert into public.credit_reservations values ('reservation-1', 'user-1');
insert into public.economic_usage_events values ('usage-1', 'user-1');
insert into public.user_entitlements values ('entitlement-1', 'user-1', null);
insert into public.puzzle_training_progress values ('progress-1', 'user-1');
insert into public.puzzle_training_attempts values ('attempt-1', 'user-1');
insert into public.insight_datasets values ('dataset-1', 'user-1');
insert into public.insight_reports values ('report-1', 'user-1');
insert into public.library_positions values ('position-1', 'user-1');
insert into public.library_collections values ('collection-1', 'user-1');
insert into public.scanner_beta_scans values ('scan-1', 'user-1', '{"selectedImage":"private-name.png","browser":"fixture"}');
insert into public.scanner_beta_scan_failures values ('failure-1', 'user-1', '{"selectedImage":"private-name.png","reason":"fixture"}');
insert into public.scanner_beta_feedback values ('feedback-1', 'user-1', '{"selectedImage":"private-name.png","label":"fixture"}');
insert into public.stripe_events values ('stripe-1', 'user-1');

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
