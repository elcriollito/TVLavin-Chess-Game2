-- SEC-010 atomic Stripe webhook claim and economic fulfillment.
-- Apply after supabase-schema-v2.sql.

alter table public.stripe_events
  add column if not exists business_key text,
  add column if not exists operation text,
  add column if not exists status text not null default 'COMPLETED',
  add column if not exists claimed_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists user_id uuid references public.users(id) on delete restrict;

update public.stripe_events
set completed_at = coalesce(completed_at, processed_at)
where status = 'COMPLETED' and completed_at is null;

alter table public.stripe_events drop constraint if exists stripe_events_status_check;
alter table public.stripe_events add constraint stripe_events_status_check
  check (status in ('PROCESSING', 'COMPLETED'));
alter table public.stripe_events drop constraint if exists stripe_events_operation_check;
alter table public.stripe_events add constraint stripe_events_operation_check
  check (operation is null or operation in (
    'CREDIT_PURCHASE', 'SUBSCRIPTION_ACTIVATE', 'SUBSCRIPTION_RENEWAL', 'SUBSCRIPTION_DELETE'
  ));

create unique index if not exists stripe_events_business_key_unique
  on public.stripe_events(business_key)
  where business_key is not null;
create index if not exists stripe_events_status_claimed
  on public.stripe_events(status, claimed_at);
create unique index if not exists users_stripe_customer_id_unique
  on public.users(stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.stripe_events enable row level security;

create or replace function public.fulfill_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_business_key text,
  p_operation text,
  p_user_id uuid,
  p_legacy_clerk_subject text,
  p_stripe_customer_id text,
  p_credit_amount integer,
  p_reason text
)
returns table(success boolean, code text, resulting_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed text;
  v_existing public.stripe_events%rowtype;
  v_user public.users%rowtype;
  v_balance integer;
begin
  if coalesce(length(p_event_id), 0) < 5 or length(p_event_id) > 255
     or coalesce(length(p_business_key), 0) < 5 or length(p_business_key) > 512
     or coalesce(length(p_stripe_customer_id), 0) < 5 or length(p_stripe_customer_id) > 255 then
    raise exception 'invalid Stripe fulfillment identifiers' using errcode = '22023';
  end if;

  if not (
    (p_event_type = 'checkout.session.completed' and p_operation in ('CREDIT_PURCHASE', 'SUBSCRIPTION_ACTIVATE'))
    or (p_event_type = 'invoice.paid' and p_operation = 'SUBSCRIPTION_RENEWAL')
    or (p_event_type = 'customer.subscription.deleted' and p_operation = 'SUBSCRIPTION_DELETE')
  ) then
    raise exception 'invalid Stripe event operation' using errcode = '22023';
  end if;

  if p_operation = 'CREDIT_PURCHASE' and p_credit_amount not in (25, 75, 200) then
    raise exception 'invalid credit entitlement' using errcode = '22023';
  end if;
  if p_operation = 'SUBSCRIPTION_RENEWAL' and p_credit_amount <> 50 then
    raise exception 'invalid renewal entitlement' using errcode = '22023';
  end if;

  insert into public.stripe_events(
    event_id, event_type, business_key, operation, status, claimed_at, processed_at
  ) values (
    p_event_id, p_event_type, p_business_key, p_operation, 'PROCESSING', now(), now()
  )
  on conflict (event_id) do nothing
  returning event_id into v_claimed;

  if v_claimed is null then
    select e.* into v_existing from public.stripe_events e where e.event_id = p_event_id;
    return query select false,
      case when v_existing.status = 'COMPLETED' then 'ALREADY_COMPLETED'::text else 'ALREADY_PROCESSING'::text end,
      null::integer;
    return;
  end if;

  if p_user_id is not null then
    select u.* into v_user from public.users u
    where u.id = p_user_id and u.stripe_customer_id = p_stripe_customer_id
    for update;
  elsif p_legacy_clerk_subject is not null then
    select u.* into v_user from public.users u
    where u.clerk_id = p_legacy_clerk_subject and u.stripe_customer_id = p_stripe_customer_id
    for update;
  else
    select u.* into v_user from public.users u
    where u.stripe_customer_id = p_stripe_customer_id
    for update;
  end if;

  if v_user.id is null then
    raise exception 'Stripe customer has no authoritative CAISSA account' using errcode = 'P0001';
  end if;

  if p_operation in ('CREDIT_PURCHASE', 'SUBSCRIPTION_RENEWAL') then
    v_balance := v_user.credits + p_credit_amount;
    update public.users u
    set credits = v_balance, updated_at = now()
    where u.id = v_user.id;
    insert into public.credit_events(user_id, action, delta, balance_after)
    values (v_user.id, p_reason, p_credit_amount, v_balance);
  elsif p_operation = 'SUBSCRIPTION_ACTIVATE' then
    update public.users u
    set is_premium = true, updated_at = now()
    where u.id = v_user.id;
    v_balance := v_user.credits;
  elsif p_operation = 'SUBSCRIPTION_DELETE' then
    update public.users u
    set is_premium = false, updated_at = now()
    where u.id = v_user.id;
    v_balance := v_user.credits;
  end if;

  update public.stripe_events e
  set status = 'COMPLETED', completed_at = now(), user_id = v_user.id
  where e.event_id = p_event_id;

  return query select true, 'COMPLETED'::text, v_balance;
exception
  when unique_violation then
    return query select false, 'BUSINESS_OPERATION_ALREADY_COMPLETED'::text, null::integer;
end;
$$;

revoke all on public.stripe_events from anon, authenticated, service_role;
revoke execute on function public.fulfill_stripe_webhook_event(text, text, text, text, uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.fulfill_stripe_webhook_event(text, text, text, text, uuid, text, text, integer, text)
  to service_role;
