-- Rehearsal rollback only: drops training history. Take a backup before using on production.
begin;
drop function if exists public.record_puzzle_training_attempt(uuid,uuid,date,text,integer,text,boolean);
drop table if exists public.puzzle_training_attempts;
drop table if exists public.puzzle_training_progress;
commit;
