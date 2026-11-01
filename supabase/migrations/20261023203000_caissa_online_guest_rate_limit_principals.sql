-- CAISSA Online / Account Control integration follow-up.
-- The Guest P2 outer quotas use only these server-derived rate-limit principals:
-- one global bucket and one HMAC-free, one-way source digest. They are not Clerk
-- subjects and must not be resolved as account owners by the deletion barrier.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.caissa_account_rate_limit_write_barrier()') is null
     or pg_catalog.to_regclass('public.caissa_account_states') is null then
    raise exception 'CAISSA_ONLINE_RATE_LIMIT_PRINCIPALS_REQUIRE_ACCOUNT_CONTROL';
  end if;
end;
$$;

create or replace function public.caissa_account_rate_limit_write_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_subject text;
  v_old_subject text;
  v_seen_subject text;
begin
  v_old_subject := case when tg_op='INSERT' then null else old.clerk_id end;
  foreach v_subject in array array[v_old_subject,case when tg_op='DELETE' then null else new.clerk_id end] loop
    if v_subject is null or v_subject is not distinct from v_seen_subject then
      continue;
    end if;
    v_seen_subject := v_subject;

    -- These principals are generated only by api/online.js after a verified
    -- Supabase anonymous session and the trusted Vercel source boundary pass.
    -- Keep the allowlist exact so arbitrary non-account subjects still fail.
    if v_subject = 'online-global'
       or v_subject ~ '^online-source:[0-9a-f]{64}$' then
      continue;
    end if;

    if v_subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      continue;
    end if;
    v_user_id := null;
    select u.id into v_user_id from public.users u where u.clerk_id=v_subject;
    if v_user_id is null then
      select b.user_id into v_user_id from public.identity_bindings b
        where b.provider='clerk' and b.external_subject=v_subject and b.status='ACTIVE'
        order by b.activated_at desc nulls last,b.id limit 1;
    end if;
    if v_user_id is null then
      raise exception 'CAISSA_ACCOUNT_IDENTITY_REQUIRED' using errcode='42501';
    end if;
    perform public.caissa_account_assert_writable(v_user_id);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.caissa_account_rate_limit_write_barrier()
  from public, anon, authenticated;

comment on function public.caissa_account_rate_limit_write_barrier() is
  'Blocks account-scoped Online rate-limit writes during erasure while allowing only the fixed Guest outer-quota principals.';

commit;
