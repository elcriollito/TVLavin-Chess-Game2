-- EAE-015B production cleanup. Supabase Cron supplies deterministic cleanup
-- without an always-running daemon. The job is bounded and idempotent.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

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

select cron.schedule(
  'eae015a-lc0-cleanup',
  '* * * * *',
  $job$select * from public.eae015a_cleanup(0, 100, 604800000)$job$
);
