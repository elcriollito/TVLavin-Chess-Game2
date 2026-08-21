-- OBS1 rollback: remove only the bounded discovery primitive.
drop function if exists public.find_recent_mentor_operation(uuid,timestamptz,timestamptz);
