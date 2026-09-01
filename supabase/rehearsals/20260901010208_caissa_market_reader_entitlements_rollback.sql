-- Staging rollback rehearsal for the dormant CAISSA Market entitlement foundation.
-- Refuse rollback after any entitlement or product-fulfillment event exists.

begin;

do $market_rollback_preflight$
begin
  if exists (select 1 from public.product_entitlements)
     or exists (
       select 1 from public.stripe_events
       where operation = 'PRODUCT_ENTITLEMENT_GRANT'
     ) then
    raise exception 'CAISSA Market rollback blocked: entitlement history exists';
  end if;
end
$market_rollback_preflight$;

drop function public.fulfill_market_product_checkout(text, text, text, uuid, text, text, text);
drop table public.product_entitlements;

alter table public.stripe_events drop constraint stripe_events_operation_check;
alter table public.stripe_events add constraint stripe_events_operation_check
  check (operation is null or operation in (
    'CREDIT_PURCHASE', 'SUBSCRIPTION_ACTIVATE', 'SUBSCRIPTION_RENEWAL',
    'SUBSCRIPTION_DELETE'
  ));

commit;
