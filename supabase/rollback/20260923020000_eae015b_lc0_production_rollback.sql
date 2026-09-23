-- EAE-015B forward rollback. Apply only after the relay/runtime are disabled
-- and drained. This is intentionally separate from normal migration history.
-- It removes only EAE-011/EAE-013A/EAE-015A objects introduced for Lc0.

do $$
declare existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'eae015a-lc0-cleanup'
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

drop function if exists public.eae015a_metrics_snapshot(integer);
drop function if exists public.eae015a_alert_snapshot();
drop function if exists public.eae015a_record_metrics(jsonb);
drop function if exists public.eae015a_cleanup(bigint, integer, bigint);
drop function if exists public.eae015a_allow_rate(text, text, bigint, integer, integer);
drop function if exists public.eae011_cleanup(bigint);
drop function if exists public.eae013a_delete_session(text, bigint, text, text, text, text, text);
drop function if exists public.eae011_create_session(text, text, text, text, bigint, bigint, jsonb);

drop trigger if exists eae013a_session_audit_trigger on public.eae011_sessions;
drop function if exists public.eae013a_audit_session();

drop table if exists public.eae015a_metric_minutes;
drop table if exists public.eae015a_alert_rules;
drop table if exists public.eae015a_rate_windows;
drop table if exists public.eae015a_control;
drop table if exists public.eae013a_session_audit;
drop table if exists public.eae011_creation_windows;
drop table if exists public.eae011_sessions;
