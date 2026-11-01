-- CAISSA Identity Organization v1.
-- Additive, fail-closed ownership classifications for account-scoped actions.

begin;

create table if not exists public.caissa_identity_ownership_reviews (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null unique references public.identity_bindings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('VERIFIED', 'REVIEW_REQUIRED', 'QUARANTINED', 'REVOKED')),
  reason_code text not null check (reason_code in (
    'NEW_ACCOUNT', 'DIRECT_LEGACY_AUTHORITY', 'DUAL_AUTH_REVIEWED',
    'CROSS_IDENTITY_CONFLICT', 'MANUAL_SECURITY_REVIEW'
  )),
  case_reference_hash text,
  reviewed_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (case_reference_hash is null or case_reference_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists caissa_identity_ownership_reviews_user_id
  on public.caissa_identity_ownership_reviews(user_id);

alter table public.caissa_identity_ownership_reviews enable row level security;
revoke all on table public.caissa_identity_ownership_reviews from public, anon, authenticated;

create or replace function public.resolve_caissa_identity_ownership(
  p_external_subject text,
  p_environment text
)
returns table(ownership_state text, user_id uuid, binding_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_binding public.identity_bindings%rowtype;
  v_review public.caissa_identity_ownership_reviews%rowtype;
  v_user public.users%rowtype;
  v_has_other_active boolean;
  v_has_legacy_history boolean;
begin
  if p_environment not in ('legacy_development', 'production')
     or p_external_subject is null
     or pg_catalog.char_length(p_external_subject) not between 1 and 255 then
    return query select 'UNRESOLVED'::text, null::uuid, null::uuid;
    return;
  end if;

  select b.* into v_binding
  from public.identity_bindings b
  where b.provider = 'clerk'
    and b.environment = p_environment
    and b.external_subject = p_external_subject
    and b.status = 'ACTIVE';

  if v_binding.id is null then
    return query select 'UNRESOLVED'::text, null::uuid, null::uuid;
    return;
  end if;

  select u.* into v_user from public.users u where u.id = v_binding.user_id;
  if v_user.id is null or v_user.clerk_id is distinct from p_external_subject then
    return query select 'QUARANTINED'::text, v_binding.user_id, v_binding.id;
    return;
  end if;

  select exists (
    select 1 from public.identity_bindings other
    where other.user_id = v_binding.user_id
      and other.provider = 'clerk'
      and other.id <> v_binding.id
      and other.status = 'ACTIVE'
  ) into v_has_other_active;
  if v_has_other_active then
    return query select 'QUARANTINED'::text, v_binding.user_id, v_binding.id;
    return;
  end if;

  select r.* into v_review
  from public.caissa_identity_ownership_reviews r
  where r.binding_id = v_binding.id and r.user_id = v_binding.user_id;

  if v_review.status = 'VERIFIED' then
    return query select 'VERIFIED'::text, v_binding.user_id, v_binding.id;
    return;
  elsif v_review.status in ('QUARANTINED', 'REVOKED') then
    return query select 'QUARANTINED'::text, v_binding.user_id, v_binding.id;
    return;
  elsif v_review.status = 'REVIEW_REQUIRED' then
    return query select 'REVIEW_REQUIRED'::text, v_binding.user_id, v_binding.id;
    return;
  end if;

  -- A Development subject using its own still-active historical binding is a
  -- direct authority relationship. It is safe in Staging but never accepted by
  -- a Production verifier because the caller supplies the verified authority.
  if p_environment = 'legacy_development'
     and v_binding.proof_method = 'LEGACY_BACKFILL' then
    return query select 'VERIFIED'::text, v_binding.user_id, v_binding.id;
    return;
  end if;

  select exists (
    select 1 from public.identity_bindings legacy
    where legacy.user_id = v_binding.user_id
      and legacy.provider = 'clerk'
      and legacy.environment = 'legacy_development'
  ) into v_has_legacy_history;

  -- A newly provisioned Production account has no inherited historical UUID.
  if p_environment = 'production'
     and v_binding.proof_method = 'NEW_ACCOUNT'
     and not v_has_legacy_history then
    return query select 'VERIFIED'::text, v_binding.user_id, v_binding.id;
    return;
  end if;

  -- Any migrated or historically ambiguous Production binding requires an
  -- explicit security review. A successful migration proof is not, by itself,
  -- proof that the two human accounts represent the same owner.
  return query select 'REVIEW_REQUIRED'::text, v_binding.user_id, v_binding.id;
end;
$$;

revoke all on function public.resolve_caissa_identity_ownership(text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_caissa_identity_ownership(text, text)
  to service_role;

comment on table public.caissa_identity_ownership_reviews is
  'Restricted ownership review decisions. Never store raw emails or Clerk subjects.';
comment on function public.resolve_caissa_identity_ownership(text, text) is
  'Resolves one verified Clerk authority to one CAISSA UUID and fails closed on historical ambiguity.';

commit;
