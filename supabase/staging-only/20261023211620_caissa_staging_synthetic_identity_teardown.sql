-- CAISSA Staging-only synthetic identity provisioning teardown.
--
-- This artifact is intentionally outside supabase/migrations. Run it only
-- after both A/B identities have been cleaned, their external receipts have
-- been recorded, finalization has removed both authorization rows, and an
-- action-time project-ref check confirms Supabase Staging aqizagaskicotorfpwfn.

begin;

do $$
declare
  v_system_identifier text;
  v_private_schema oid;
begin
  select s.system_identifier::text into v_system_identifier
  from pg_catalog.pg_control_system() s;

  if pg_catalog.current_database() <> 'postgres'
     or v_system_identifier <> '7678069749886157684' then
    raise exception using
      errcode = '42501',
      message = 'CAISSA_STAGING_PROJECT_MISMATCH';
  end if;

  v_private_schema := pg_catalog.to_regnamespace('caissa_staging_private');
  if v_private_schema is null then
    return;
  end if;

  -- All operational functions take this same transaction-scoped lock through
  -- assert_staging_project(). Waiting here makes the residue checks current at
  -- the exact point where teardown obtains exclusive lifecycle ownership.
  perform pg_catalog.pg_advisory_xact_lock(767806974988615768);

  if pg_catalog.to_regclass(
       'caissa_staging_private.installation_guard'
     ) is null
     or not exists (
       select 1
       from caissa_staging_private.installation_guard g
       where g.singleton
         and g.project_ref = 'aqizagaskicotorfpwfn'
         and g.system_identifier = v_system_identifier
     ) then
    raise exception using
      errcode = '42501',
      message = 'CAISSA_STAGING_INSTALLATION_GUARD_MISMATCH';
  end if;

  if pg_catalog.to_regclass(
       'caissa_staging_private.synthetic_identity_authorizations'
     ) is null
     or exists (
       select 1
       from caissa_staging_private.synthetic_identity_authorizations
     ) then
    raise exception using
      errcode = '55000',
      message = 'CAISSA_STAGING_FIXTURE_AUTHORIZATIONS_NOT_EMPTY';
  end if;

  if exists (
       select 1
       from public.identity_bindings b
       where b.metadata @> '{"staging_synthetic": true}'::jsonb
     ) then
    raise exception using
      errcode = '55000',
      message = 'CAISSA_STAGING_FIXTURE_BINDING_RESIDUE';
  end if;

  if (
       select pg_catalog.count(*)
       from pg_catalog.pg_class c
       where c.relnamespace = v_private_schema
         and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
     ) <> 2
     or pg_catalog.to_regclass(
       'caissa_staging_private.installation_guard'
     ) is null
     or pg_catalog.to_regclass(
       'caissa_staging_private.synthetic_identity_authorizations'
     ) is null then
    raise exception using
      errcode = '55000',
      message = 'CAISSA_STAGING_PRIVATE_SCHEMA_UNEXPECTED_RELATION';
  end if;

  if (
       select pg_catalog.count(*)
       from pg_catalog.pg_proc p
       where p.pronamespace = v_private_schema
     ) <> 6
     or pg_catalog.to_regprocedure(
       'caissa_staging_private.assert_staging_project()'
     ) is null
     or pg_catalog.to_regprocedure(
       'caissa_staging_private.expected_synthetic_run_id(text,uuid,text,text,uuid,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'caissa_staging_private.authorize_synthetic_identity(uuid,text,text,uuid,text,text,timestamptz,text,uuid,text,text,uuid,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'caissa_staging_private.provision_synthetic_identity(uuid,text,uuid,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'caissa_staging_private.cleanup_synthetic_identity(uuid,text,uuid,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'caissa_staging_private.finalize_synthetic_identity_cleanup(uuid,text,uuid,text,text)'
     ) is null then
    raise exception using
      errcode = '55000',
      message = 'CAISSA_STAGING_PRIVATE_SCHEMA_UNEXPECTED_FUNCTION';
  end if;
end;
$$;

drop function if exists caissa_staging_private.authorize_synthetic_identity(
  uuid, text, text, uuid, text, text, timestamptz,
  text, uuid, text, text, uuid, text
);
drop function if exists caissa_staging_private.provision_synthetic_identity(
  uuid, text, uuid, text, text
);
drop function if exists caissa_staging_private.cleanup_synthetic_identity(
  uuid, text, uuid, text, text
);
drop function if exists caissa_staging_private.finalize_synthetic_identity_cleanup(
  uuid, text, uuid, text, text
);
drop function if exists caissa_staging_private.expected_synthetic_run_id(
  text, uuid, text, text, uuid, text
);
drop function if exists caissa_staging_private.assert_staging_project();
drop table if exists caissa_staging_private.synthetic_identity_authorizations;
drop table if exists caissa_staging_private.installation_guard;
drop schema if exists caissa_staging_private;

commit;
