-- UX-HFX-002 follow-up: the API now derives Daily registration closure from
-- starts_at. Retain the legacy overload for forensic compatibility, but remove
-- its only callable role so no server path can submit a separate deadline.
begin;

revoke all on function public.caissa_online_daily_create(
  text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,boolean
) from public,anon,authenticated,service_role;

comment on function public.caissa_online_daily_create(
  text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,boolean
) is 'Legacy Daily S001 creator retained without EXECUTE after UX-HFX-002.';

commit;
