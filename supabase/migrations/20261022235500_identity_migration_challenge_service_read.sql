begin;

-- findPendingMigrationHandoff performs a direct server-side lookup through
-- PostgREST. Make that dependency explicit for projects created after the
-- Supabase default-privilege change without exposing the table to browsers.
revoke all on table public.identity_migration_challenges
  from public, anon, authenticated;
grant select on table public.identity_migration_challenges
  to service_role;

commit;
