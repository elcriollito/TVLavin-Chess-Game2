-- Inspect after applying the migration to a rehearsal database.
select c.relname as tablename, c.relrowsecurity as rowsecurity,
       c.relforcerowsecurity as forcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('puzzle_training_progress', 'puzzle_training_attempts');
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('puzzle_training_progress', 'puzzle_training_attempts')
order by table_name, grantee, privilege_type;
select proname, prosecdef from pg_proc
where oid = 'public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean)'::regprocedure;

do $$
begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid = 'public.puzzle_training_progress'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid = 'public.puzzle_training_attempts'::regclass) then
    raise exception 'Puzzle progress tables must force RLS';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.puzzle_training_progress', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.puzzle_training_attempts', 'select')
     or pg_catalog.has_function_privilege('anon',
       'public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean)', 'execute')
     or pg_catalog.has_function_privilege('authenticated',
       'public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean)', 'execute')
     or not pg_catalog.has_function_privilege('service_role',
       'public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean)', 'execute') then
    raise exception 'Puzzle progress privileges are not service-role-only';
  end if;
  if not exists (select 1 from pg_proc
      where oid = 'public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean)'::regprocedure
        and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'Puzzle progress RPC security configuration is invalid';
  end if;
end;
$$;

begin;
insert into public.users(id, clerk_id, email)
values ('00000000-0000-4000-8000-000000000024', 'caissa-pr24-idempotence-check', null);
do $$
declare
  first_result jsonb;
  retry_result jsonb;
  repeated_puzzle_result jsonb;
begin
  first_result := public.record_puzzle_training_attempt(
    '00000000-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111',
    date '2026-09-10', '4TN7E', 1820, 'solved', false);
  retry_result := public.record_puzzle_training_attempt(
    '00000000-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111',
    date '2026-09-10', '4TN7E', 1820, 'solved', false);
  repeated_puzzle_result := public.record_puzzle_training_attempt(
    '00000000-0000-4000-8000-000000000024', '22222222-2222-4222-8222-222222222222',
    date '2026-09-10', '4TN7E', 1820, 'solved', false);
  if first_result->>'duplicate' <> 'false'
     or retry_result->>'duplicate' <> 'true'
     or repeated_puzzle_result->>'duplicate' <> 'true'
     or (select count(*) from public.puzzle_training_attempts
          where user_id = '00000000-0000-4000-8000-000000000024') <> 1
     or (select solved from public.puzzle_training_progress
          where user_id = '00000000-0000-4000-8000-000000000024') <> 1 then
    raise exception 'Puzzle progress idempotence check failed';
  end if;
end;
$$;
rollback;
