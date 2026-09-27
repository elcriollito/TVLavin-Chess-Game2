-- Roll back only after all catalog readers have returned to the bundled beta.
begin;
drop table if exists public.puzzles;
commit;
