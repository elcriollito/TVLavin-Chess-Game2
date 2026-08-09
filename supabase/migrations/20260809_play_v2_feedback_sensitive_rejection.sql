-- PlayV2InviteOnlyFeedbackSensitivePolicy@1.0.0.
-- Forward-only defense in depth for server-side feedback RPC calls.
begin;

create or replace function public._play_beta_feedback_contains_prohibited(
  p_comment text, p_steps text, p_device text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  v_comment text := coalesce(p_comment, '');
  v_steps text := coalesce(p_steps, '');
  v_device text := coalesce(p_device, '');
  v_text text;
begin
  if char_length(v_comment) > 2000 or char_length(v_steps) > 2000 or char_length(v_device) > 160
     or octet_length(v_comment) + octet_length(v_steps) + octet_length(v_device) > 8192 then
    return true;
  end if;

  v_text := lower(regexp_replace(trim(concat_ws(E'\n', v_comment, v_steps, v_device)), '[[:space:]]+', ' ', 'g'));

  return
    -- CONTACT_ADDRESS / IPV4 / IPV6 / CONTACT_URL
    v_text ~ '[[:alnum:]._%+\-]+@[[:alnum:].\-]+\.[[:alpha:]]{2,}'
    or v_text ~ '(^|[^0-9])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9]|$)'
    or v_text ~ '(^|[^[:xdigit:]:])([[:xdigit:]]{0,4}:){2,7}[[:xdigit:]]{0,4}([^[:xdigit:]:]|$)'
    or v_text ~ '(^|[^[:alnum:]])(https?://|www\.)[^[:space:]]+'
    -- LABELED_SECRET / BEARER / COOKIE_SESSION / DEVICE_FINGERPRINT
    or v_text ~ '\m(fen|pgn|moves?|cookies?|tokens?|passwords?|passcodes?|passphrase|secret|api[_ -]?key|authorization|credentials?|fingerprints?|device[_ -]?id|session([_ -]?id)?|user(name)?|account|email|phone|name|ip( address)?)\M[[:space:]]*[:=]'
    or v_text ~ '\m(authorization[[:space:]]*:[[:space:]]*)?bearer[[:space:]]+[[:alnum:]_.~\-]{6,}'
    or v_text ~ '\m(password|passphrase|api[_ -]?key|token|secret|cookies?|session([_ -]?id)?|device[_ -]?id|fingerprints?)\M[[:space:]]*[:=][[:space:]]*[^[:space:]]+'
    -- FEN / PGN_HEADER / NUMBERED_SAN
    or v_text ~ '([prnbqk1-8]+/){7}[prnbqk1-8]+[[:space:]]+[wb][[:space:]]+(-|[kq]{1,4})[[:space:]]+(-|[a-h][36])[[:space:]]+[0-9]+[[:space:]]+[0-9]+'
    or v_text ~ '\[[[:space:]]*(event|site|date|round|white|black|result)[[:space:]]+"'
    or v_text ~ '(^|[[:space:]])[0-9]+\.([.][.])?[[:space:]]*(o-o(-o)?|[kqrbn]?[a-h]?[1-8]?x?[a-h][1-8](=[qrbn])?[+#]?)[[:space:]]+(o-o(-o)?|[kqrbn]?[a-h]?[1-8]?x?[a-h][1-8](=[qrbn])?[+#]?)'
    -- CSV_FORMULA is evaluated at the beginning of each submitted field.
    or v_comment ~ '^[[:space:]]*[=+@-]([[:alpha:]]|[0-9]|[''"])'
    or v_steps ~ '^[[:space:]]*[=+@-]([[:alpha:]]|[0-9]|[''"])'
    or v_device ~ '^[[:space:]]*[=+@-]([[:alpha:]]|[0-9]|[''"])'
    -- MARKUP / CONTROL (tabs and line breaks remain permitted).
    or concat_ws(E'\n', v_comment, v_steps, v_device) ~ '<[^>]*>'
    or regexp_replace(concat_ws(E'\n', v_comment, v_steps, v_device), E'[\t\n\r]', '', 'g') ~ '[[:cntrl:]]';
end
$$;

revoke all on function public._play_beta_feedback_contains_prohibited(text,text,text) from public;
revoke all on function public._play_beta_feedback_contains_prohibited(text,text,text) from anon, authenticated, service_role;

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
  if p_category is null or p_category not in ('Bug','Confusing','Visual','Suggestion','Other')
     or p_mode is null or p_mode not in ('games','bots','coach')
     or p_comment is null or btrim(p_comment) = '' or char_length(p_comment) not between 1 and 2000
     or char_length(coalesce(p_steps,'')) > 2000 or char_length(coalesce(p_device,'')) > 160
     or p_consent_version is distinct from 'PlayV2BetaFeedbackConsent@1.0.0'
     or public._play_beta_feedback_contains_prohibited(p_comment,p_steps,p_device) then
    return query select false,'FEEDBACK_REJECTED',null::text; return;
  end if;
  select count(*) into v_count from public.beta_feedback where session_id=v_session.id and created_at>p_now-interval '1 hour';
  if v_count>=5 then return query select false,'RATE_LIMITED',null::text; return; end if;
  insert into public.beta_feedback(session_id,category,mode,comment,steps,device_browser,consent_version,created_at,delete_after)
    values(v_session.id,p_category,p_mode,p_comment,nullif(p_steps,''),nullif(p_device,''),p_consent_version,p_now,p_now+interval '90 days') returning id into v_id;
  return query select true,'ACCEPTED',upper(substr(replace(v_id::text,'-',''),1,10));
end $$;

revoke all on function public.submit_play_beta_feedback(text,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.submit_play_beta_feedback(text,text,text,text,text,text,text,timestamptz) from anon, authenticated;
grant execute on function public.submit_play_beta_feedback(text,text,text,text,text,text,text,timestamptz) to service_role;

commit;
