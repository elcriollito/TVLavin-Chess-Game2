-- Inspect after applying the migration to a rehearsal database.
select tablename, rowsecurity, forcerowsecurity from pg_tables
where schemaname = 'public' and tablename in ('puzzle_training_progress', 'puzzle_training_attempts');
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('puzzle_training_progress', 'puzzle_training_attempts')
order by table_name, grantee, privilege_type;
select proname, prosecdef from pg_proc
where oid = 'public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean)'::regprocedure;
