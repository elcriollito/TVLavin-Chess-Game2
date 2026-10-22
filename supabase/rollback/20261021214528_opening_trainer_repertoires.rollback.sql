-- Manual rollback for review with the matching migration.
-- Destructive: run only after confirming the table is no longer serving data.
drop table if exists public.opening_repertoires;
