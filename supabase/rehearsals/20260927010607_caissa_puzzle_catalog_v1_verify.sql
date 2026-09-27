-- Run after applying the catalog migration to an isolated Supabase branch/local DB.
select n.nspname as table_schema,
       c.relname as table_name,
       c.relrowsecurity as row_security,
       c.relforcerowsecurity as force_row_security
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'puzzles';

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public' and tablename = 'puzzles'
order by indexname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'puzzles'
order by grantee, privilege_type;

explain (costs off)
select puzzle_id, fen, moves, rating, themes
from public.puzzles
where themes @> array['fork']::text[]
  and rating between 1700 and 1900
order by popularity desc, nb_plays desc
limit 20;

explain (costs off)
select puzzle_id, fen, moves, rating, opening_tags
from public.puzzles
where opening_tags @> array['Sicilian_Defense']::text[]
  and rating between 1700 and 1900
limit 20;
