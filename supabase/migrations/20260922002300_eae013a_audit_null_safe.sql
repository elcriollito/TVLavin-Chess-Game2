-- Staging repair for installations that ran the first EAE-013A audit revision.
-- Fresh databases already have the null-safe expression in that migration.
do $$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.eae013a_audit_session()'::pg_catalog.regprocedure);
  if pg_catalog.strpos(definition, 'reason = ''EXPLICIT_TERMINATE''') > 0 then
    execute pg_catalog.replace(definition, 'reason = ''EXPLICIT_TERMINATE''',
      'coalesce(reason = ''EXPLICIT_TERMINATE'', false)');
  end if;
end;
$$;
