-- CAISSA Market staging foundation for durable product entitlements.
-- Source-only migration: do not apply to Production without a separate release authorization.

begin;

do $market_preflight$
begin
  if to_regclass('public.users') is null
     or to_regclass('public.stripe_events') is null
     or to_regprocedure('public.fulfill_stripe_webhook_event(text,text,text,text,uuid,text,text,integer,text)') is null then
    raise exception 'CAISSA Market requires the Security Season 12 Stripe foundation';
  end if;
  if to_regclass('public.product_entitlements') is not null
     or to_regprocedure('public.fulfill_market_product_checkout(text,text,text,uuid,text,text,text)') is not null then
    raise exception 'CAISSA Market entitlement foundation is partial or already present';
  end if;
end
$market_preflight$;

create table public.product_entitlements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  product_id text not null,
  status text not null default 'active',
  source text not null,
  source_reference text not null,
  source_event_id text not null,
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint product_entitlements_product_check
    check (product_id = 'caissa-pgn-reader'),
  constraint product_entitlements_status_check
    check (status in ('active', 'revoked')),
  constraint product_entitlements_source_check
    check (source = 'stripe_checkout'),
  constraint product_entitlements_reference_check
    check (length(source_reference) between 5 and 255),
  constraint product_entitlements_event_check
    check (length(source_event_id) between 5 and 255),
  unique(user_id, product_id),
  unique(source, source_reference)
);

create index product_entitlements_active_lookup
  on public.product_entitlements(user_id, product_id)
  where status = 'active';

alter table public.product_entitlements enable row level security;
revoke all on table public.product_entitlements from public, anon, authenticated, service_role;
grant select, insert, update on table public.product_entitlements to service_role;

alter table public.stripe_events drop constraint if exists stripe_events_operation_check;
alter table public.stripe_events add constraint stripe_events_operation_check
  check (operation is null or operation in (
    'CREDIT_PURCHASE', 'SUBSCRIPTION_ACTIVATE', 'SUBSCRIPTION_RENEWAL',
    'SUBSCRIPTION_DELETE', 'PRODUCT_ENTITLEMENT_GRANT'
  ));

create function public.fulfill_market_product_checkout(
  p_event_id text,
  p_event_type text,
  p_business_key text,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_product_id text,
  p_checkout_session_id text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = pg_catalog
as $fulfill_market_product_checkout$
declare
  v_user public.users%rowtype;
  v_existing public.stripe_events%rowtype;
begin
  if p_event_type <> 'checkout.session.completed'
     or p_product_id <> 'caissa-pgn-reader'
     or p_user_id is null
     or coalesce(length(p_event_id), 0) not between 5 and 255
     or coalesce(length(p_business_key), 0) not between 5 and 512
     or coalesce(length(p_stripe_customer_id), 0) not between 5 and 255
     or coalesce(length(p_checkout_session_id), 0) not between 5 and 255
     or p_business_key <> 'checkout_session:' || p_checkout_session_id then
    raise exception 'invalid CAISSA Market fulfillment' using errcode = '22023';
  end if;

  select u.* into v_user
  from public.users u
  where u.id = p_user_id
  for update;

  if v_user.id is null or v_user.stripe_customer_id is distinct from p_stripe_customer_id then
    raise exception 'authoritative CAISSA account required' using errcode = '22023';
  end if;

  begin
    insert into public.stripe_events(
      event_id, event_type, business_key, operation, status,
      processed_at, claimed_at, user_id
    ) values (
      p_event_id, p_event_type, p_business_key, 'PRODUCT_ENTITLEMENT_GRANT',
      'PROCESSING', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), p_user_id
    );
  exception when unique_violation then
    select e.* into v_existing
    from public.stripe_events e
    where e.event_id = p_event_id or e.business_key = p_business_key
    order by case when e.event_id = p_event_id then 0 else 1 end
    limit 1;

    if v_existing.event_id = p_event_id then
      return query select false,
        case when v_existing.status = 'COMPLETED' then 'ALREADY_COMPLETED'::text
             else 'ALREADY_PROCESSING'::text end;
      return;
    end if;
    return query select false, 'BUSINESS_OPERATION_ALREADY_COMPLETED'::text;
    return;
  end;

  insert into public.product_entitlements(
    user_id, product_id, status, source, source_reference, source_event_id
  ) values (
    p_user_id, p_product_id, 'active', 'stripe_checkout',
    p_checkout_session_id, p_event_id
  )
  on conflict (user_id, product_id) do update
  set status = 'active',
      source = excluded.source,
      source_reference = excluded.source_reference,
      source_event_id = excluded.source_event_id,
      updated_at = pg_catalog.clock_timestamp();

  update public.stripe_events e
  set status = 'COMPLETED',
      completed_at = pg_catalog.clock_timestamp(),
      processed_at = pg_catalog.clock_timestamp()
  where e.event_id = p_event_id;

  return query select true, 'COMPLETED'::text;
end
$fulfill_market_product_checkout$;

alter function public.fulfill_market_product_checkout(text, text, text, uuid, text, text, text)
  owner to postgres;
revoke all on function public.fulfill_market_product_checkout(text, text, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fulfill_market_product_checkout(text, text, text, uuid, text, text, text)
  to service_role;

commit;
