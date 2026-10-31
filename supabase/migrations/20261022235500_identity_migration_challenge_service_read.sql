begin;

-- findPendingMigrationHandoff performs a direct server-side lookup through
-- PostgREST. Make that dependency explicit for projects created after the
-- Supabase default-privilege change without exposing the table to browsers.
-- Existing projects can retain broad service_role default privileges from the
-- historical Data API grant model. Reset every API-facing role first so the
-- resulting privilege is SELECT-only even on an existing Production ledger.
revoke all on table public.identity_migration_challenges
  from public, anon, authenticated, service_role;
grant select on table public.identity_migration_challenges
  to service_role;

commit;
