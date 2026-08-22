-- Rollback restores only the previous function definitions; it performs no execution.
drop function if exists public.inspect_mentor_economic_maintenance(integer);
\ir ../migrations/20260815_mentor_economic_foundation.sql
\ir ../migrations/20260820095640_mentor_maintenance_inspection.sql
