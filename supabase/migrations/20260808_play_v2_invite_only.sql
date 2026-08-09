-- PlayV2InviteOnlyPolicy@1.0.0. Versioned only; do not apply without release authorization.
begin;
create extension if not exists pgcrypto;

create table if not exists public.beta_program (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  stage text not null default 'disabled' check (stage in ('disabled','invite-only')),
  minimum_build text,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'release-owner'
);
insert into public.beta_program(singleton, enabled, stage) values (true, false, 'disabled') on conflict do nothing;

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  cohort text not null default 'initial-five' check (length(cohort) between 1 and 64),
  coach_enabled boolean not null default false,
  expires_at timestamptz not null,
  max_redemptions smallint not null default 3 check (max_redemptions between 1 and 3),
  redemption_count smallint not null default 0 check (redemption_count between 0 and 3),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  invite_id uuid not null references public.beta_invites(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists beta_sessions_invite_idx on public.beta_sessions(invite_id);

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.beta_sessions(id) on delete cascade,
  category text not null check (category in ('Bug','Confusing','Visual','Suggestion','Other')),
  mode text not null check (mode in ('games','bots','coach')),
  comment text not null check (length(comment) between 1 and 2000),
  steps text check (steps is null or length(steps) <= 2000),
  device_browser text check (device_browser is null or length(device_browser) <= 160),
  consent_version text not null check (consent_version = 'PlayV2BetaFeedbackConsent@1.0.0'),
  status text not null default 'new' check (status in ('new','triaged','closed','deleted')),
  created_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '90 days')
);
create index if not exists beta_feedback_session_created_idx on public.beta_feedback(session_id, created_at desc);

alter table public.beta_program enable row level security;
alter table public.beta_invites enable row level security;
alter table public.beta_sessions enable row level security;
alter table public.beta_feedback enable row level security;
revoke all on public.beta_program, public.beta_invites, public.beta_sessions, public.beta_feedback from anon, authenticated;

create or replace function public.get_play_beta_program()
returns table(enabled boolean, stage text, minimum_build text)
language sql security definer set search_path = public as
$$ select enabled, stage, minimum_build from public.beta_program where singleton = true $$;

create or replace function public.redeem_play_beta_invite(
  p_invite_hash text, p_session_hash text, p_now timestamptz, p_idle_seconds integer, p_absolute_seconds integer)
returns table(authorized boolean, reason_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_invite public.beta_invites%rowtype; v_program public.beta_program%rowtype; v_expiry timestamptz;
begin
  select * into v_program from public.beta_program where singleton = true for share;
  if not found or not v_program.enabled or v_program.stage <> 'invite-only' then return query select false,'BETA_DISABLED',null::timestamptz; return; end if;
  select * into v_invite from public.beta_invites where token_hash=p_invite_hash for update;
  if not found or v_invite.revoked_at is not null or v_invite.expires_at <= p_now or v_invite.redemption_count >= v_invite.max_redemptions then
    return query select false,'INVITE_INVALID',null::timestamptz; return;
  end if;
  v_expiry := least(p_now + make_interval(secs => p_absolute_seconds), v_invite.expires_at);
  update public.beta_invites set redemption_count=redemption_count+1 where id=v_invite.id;
  insert into public.beta_sessions(session_hash,invite_id,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    values(p_session_hash,v_invite.id,p_now,p_now,least(p_now+make_interval(secs=>p_idle_seconds),v_expiry),v_expiry);
  return query select true,'AUTHORIZED',v_expiry;
end $$;

create or replace function public.touch_play_beta_session(p_session_hash text,p_now timestamptz,p_touch boolean)
returns table(authorized boolean,reason_code text,session_id uuid,program_enabled boolean,coach_enabled boolean,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_session public.beta_sessions%rowtype; v_invite public.beta_invites%rowtype; v_program public.beta_program%rowtype;
begin
  select * into v_program from public.beta_program where singleton=true for share;
  if not found or not v_program.enabled or v_program.stage<>'invite-only' then return query select false,'BETA_DISABLED',null::uuid,false,false,null::timestamptz; return; end if;
  select * into v_session from public.beta_sessions where session_hash=p_session_hash for update;
  if not found then return query select false,'SESSION_INVALID',null::uuid,true,false,null::timestamptz; return; end if;
  select * into v_invite from public.beta_invites where id=v_session.invite_id for share;
  if v_session.revoked_at is not null or v_session.idle_expires_at<=p_now or v_session.absolute_expires_at<=p_now
    or v_invite.revoked_at is not null or v_invite.expires_at<=p_now then
    return query select false,'SESSION_EXPIRED',v_session.id,true,false,v_session.absolute_expires_at; return;
  end if;
  if p_touch then update public.beta_sessions set last_seen_at=p_now,idle_expires_at=least(p_now+interval '24 hours',absolute_expires_at) where id=v_session.id; end if;
  return query select true,'AUTHORIZED',v_session.id,true,v_invite.coach_enabled,v_session.absolute_expires_at;
end $$;

create or replace function public.revoke_play_beta_session(p_session_hash text) returns boolean
language sql security definer set search_path=public as $$ update public.beta_sessions set revoked_at=now() where session_hash=p_session_hash and revoked_at is null returning true $$;

create or replace function public.submit_play_beta_feedback(p_session_hash text,p_category text,p_mode text,p_comment text,p_steps text,p_device text,p_consent_version text,p_now timestamptz)
returns table(accepted boolean,reason_code text,reference text)
language plpgsql security definer set search_path=public as $$
declare v_session public.beta_sessions%rowtype; v_invite public.beta_invites%rowtype; v_program public.beta_program%rowtype; v_count integer; v_id uuid;
begin
  select * into v_program from public.beta_program where singleton=true for share;
  if not found or not v_program.enabled or v_program.stage<>'invite-only' then return query select false,'BETA_DISABLED',null::text; return; end if;
  select * into v_session from public.beta_sessions where session_hash=p_session_hash and revoked_at is null for update;
  if not found or v_session.idle_expires_at<=p_now or v_session.absolute_expires_at<=p_now then return query select false,'SESSION_INVALID',null::text; return; end if;
  select * into v_invite from public.beta_invites where id=v_session.invite_id for share;
  if not found or v_invite.revoked_at is not null or v_invite.expires_at<=p_now then return query select false,'SESSION_INVALID',null::text; return; end if;
  select count(*) into v_count from public.beta_feedback where session_id=v_session.id and created_at>p_now-interval '1 hour';
  if v_count>=5 then return query select false,'RATE_LIMITED',null::text; return; end if;
  insert into public.beta_feedback(session_id,category,mode,comment,steps,device_browser,consent_version,created_at,delete_after)
    values(v_session.id,p_category,p_mode,p_comment,nullif(p_steps,''),nullif(p_device,''),p_consent_version,p_now,p_now+interval '90 days') returning id into v_id;
  return query select true,'ACCEPTED',upper(substr(replace(v_id::text,'-',''),1,10));
end $$;

create or replace function public.admin_create_play_beta_invite(p_invite_hash text,p_cohort text,p_coach_enabled boolean,p_expires_at timestamptz,p_max_redemptions integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_count integer;
begin
  perform 1 from public.beta_program where singleton=true for update;
  select count(*) into v_count from public.beta_invites where revoked_at is null and expires_at>now();
  if v_count>=5 then raise exception 'ACTIVE_INVITE_LIMIT_REACHED'; end if;
  insert into public.beta_invites(token_hash,cohort,coach_enabled,expires_at,max_redemptions)
    values(p_invite_hash,p_cohort,p_coach_enabled,p_expires_at,p_max_redemptions) returning id into v_id;
  return v_id;
end
$$;
create or replace function public.admin_revoke_play_beta_invite(p_invite_hash text) returns boolean language sql security definer set search_path=public as $$
  update public.beta_invites set revoked_at=now() where token_hash=p_invite_hash and revoked_at is null returning true
$$;
create or replace function public.admin_revoke_play_beta_invite_sessions(p_invite_hash text) returns bigint language sql security definer set search_path=public as $$
  with changed as (update public.beta_sessions s set revoked_at=now() from public.beta_invites i where i.token_hash=p_invite_hash and s.invite_id=i.id and s.revoked_at is null returning 1) select count(*) from changed
$$;
create or replace function public.admin_revoke_play_beta_session(p_session_id uuid) returns boolean language sql security definer set search_path=public as $$
  update public.beta_sessions set revoked_at=now() where id=p_session_id and revoked_at is null returning true
$$;
create or replace function public.admin_revoke_all_play_beta_sessions() returns bigint language sql security definer set search_path=public as $$
  with changed as (update public.beta_sessions set revoked_at=now() where revoked_at is null returning 1) select count(*) from changed
$$;
create or replace function public.admin_purge_play_beta_feedback(p_now timestamptz) returns bigint language sql security definer set search_path=public as $$
  with changed as (delete from public.beta_feedback where delete_after<=p_now returning 1) select count(*) from changed
$$;
create or replace function public.admin_set_play_beta_program(p_enabled boolean) returns boolean language sql security definer set search_path=public as $$
  update public.beta_program set enabled=p_enabled,stage=case when p_enabled then 'invite-only' else 'disabled' end,updated_at=now() where singleton=true returning enabled
$$;
create or replace function public.admin_get_play_beta_status() returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('program',(select to_jsonb(p) from public.beta_program p where singleton=true),'invites',(select count(*) from public.beta_invites where revoked_at is null and expires_at>now()),'sessions',(select count(*) from public.beta_sessions where revoked_at is null and idle_expires_at>now() and absolute_expires_at>now()),'feedbackNew',(select count(*) from public.beta_feedback where status='new'))
$$;

revoke all on function public.get_play_beta_program() from public;
revoke all on function public.redeem_play_beta_invite(text,text,timestamptz,integer,integer) from public;
revoke all on function public.touch_play_beta_session(text,timestamptz,boolean) from public;
revoke all on function public.revoke_play_beta_session(text) from public;
revoke all on function public.submit_play_beta_feedback(text,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.admin_create_play_beta_invite(text,text,boolean,timestamptz,integer) from public;
revoke all on function public.admin_revoke_play_beta_invite(text) from public;
revoke all on function public.admin_revoke_play_beta_invite_sessions(text) from public;
revoke all on function public.admin_revoke_play_beta_session(uuid) from public;
revoke all on function public.admin_revoke_all_play_beta_sessions() from public;
revoke all on function public.admin_purge_play_beta_feedback(timestamptz) from public;
revoke all on function public.admin_set_play_beta_program(boolean) from public;
revoke all on function public.admin_get_play_beta_status() from public;
grant execute on function public.get_play_beta_program(), public.redeem_play_beta_invite(text,text,timestamptz,integer,integer), public.touch_play_beta_session(text,timestamptz,boolean), public.revoke_play_beta_session(text), public.submit_play_beta_feedback(text,text,text,text,text,text,text,timestamptz), public.admin_create_play_beta_invite(text,text,boolean,timestamptz,integer), public.admin_revoke_play_beta_invite(text), public.admin_revoke_play_beta_invite_sessions(text), public.admin_revoke_play_beta_session(uuid), public.admin_revoke_all_play_beta_sessions(), public.admin_purge_play_beta_feedback(timestamptz), public.admin_set_play_beta_program(boolean), public.admin_get_play_beta_status() to service_role;

commit;
