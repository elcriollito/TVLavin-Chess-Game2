-- Emergency rollback for CAISSA public registration v1.
-- Disable CAISSA_PUBLIC_REGISTRATION_MODE before applying this rollback.
-- Existing enrolled users are intentionally preserved; this only closes the
-- server-side enrollment entry point.

begin;

revoke all on function public.register_caissa_clerk_identity(text, text, text, text)
  from public, anon, authenticated, service_role;
drop function if exists public.register_caissa_clerk_identity(text, text, text, text);

commit;
