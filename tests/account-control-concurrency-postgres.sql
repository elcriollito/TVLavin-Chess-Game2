\set ON_ERROR_STOP on

create extension if not exists dblink;

create or replace function pg_temp.assert_true(value boolean,message text) returns void
language plpgsql as $$ begin if value is not true then raise exception '%',message; end if; end $$;

select dblink_connect('account_writer',format(
  'host=127.0.0.1 port=%s dbname=%I user=%I',inet_server_port(),current_database(),current_user));

-- Deletion wins: a stale writer waits for the account lock and then fails
-- against the committed DELETION_PENDING state.
insert into public.caissa_account_states(user_id,state)
values
  ('10000000-0000-4000-8000-000000000001','ACTIVE'),
  ('10000000-0000-4000-8000-000000000002','ACTIVE')
on conflict(user_id) do update set state='ACTIVE',operation_id=null,reason_code=null;
update public.caissa_account_states set state='ACTIVE',operation_id=null,reason_code=null
where user_id='10000000-0000-4000-8000-000000000001';
delete from public.caissa_online_presence where user_id='10000000-0000-4000-8000-000000000001';
delete from public.scanner_beta_scans where user_id='10000000-0000-4000-8000-000000000002';
insert into public.caissa_online_presence(user_id)
values('10000000-0000-4000-8000-000000000001');
select dblink_send_query('account_writer',$remote$
  do $body$ begin
    perform pg_advisory_xact_lock(hashtextextended('10000000-0000-4000-8000-000000000001',0));
    update public.caissa_account_states set state='DELETION_PENDING',reason_code='CONCURRENCY_TEST'
      where user_id='10000000-0000-4000-8000-000000000001';
    perform pg_sleep(0.8);
  end $body$;
$remote$);
select pg_sleep(0.08);
do $$ begin
  begin
    update public.caissa_online_presence set user_id=user_id
      where user_id='10000000-0000-4000-8000-000000000001';
    raise exception 'deletion-first update unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.caissa_online_presence
      where user_id='10000000-0000-4000-8000-000000000001';
    raise exception 'deletion-first delete unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.caissa_online_presence(user_id)
      values('10000000-0000-4000-8000-000000000001');
    raise exception 'deletion-first writer unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
end $$;
select * from dblink_get_result('account_writer') as t(status text);
select * from dblink_get_result('account_writer') as t(status text);

-- Writer wins: deletion waits, then its sweep removes the committed write.
update public.caissa_account_states set state='ACTIVE',operation_id=null,reason_code=null
where user_id='10000000-0000-4000-8000-000000000002';
delete from public.caissa_online_presence where user_id='10000000-0000-4000-8000-000000000002';
insert into public.caissa_online_presence(user_id)
values('10000000-0000-4000-8000-000000000002');
insert into public.caissa_account_control_operations(
  id,user_id,binding_id,kind,status,idempotency_key_hash,confirmation_hash,reverification_hash,expires_at
)
select '30000000-0000-4000-8000-0000000000b0',u.id,b.id,'ACCOUNT_DELETION','LOCKED',
  repeat('1',64),repeat('2',64),repeat('3',64),clock_timestamp()+interval '5 minutes'
from public.users u join public.identity_bindings b on b.user_id=u.id
where u.id='10000000-0000-4000-8000-000000000002';
select dblink_send_query('account_writer',$remote$
  do $body$ begin
    update public.caissa_online_presence set user_id=user_id
      where user_id='10000000-0000-4000-8000-000000000002';
    perform pg_sleep(0.35);
  end $body$;
$remote$);
select pg_sleep(0.08);
do $$ begin
  perform pg_advisory_xact_lock(hashtextextended('10000000-0000-4000-8000-000000000002',0));
  update public.caissa_account_states set state='DELETION_PENDING',reason_code='CONCURRENCY_TEST'
    where user_id='10000000-0000-4000-8000-000000000002';
  perform set_config('caissa.account_control_erasure_operation','30000000-0000-4000-8000-0000000000b0',true);
  delete from public.caissa_online_presence where user_id='10000000-0000-4000-8000-000000000002';
end $$;
select * from dblink_get_result('account_writer') as t(status text);
select * from dblink_get_result('account_writer') as t(status text);
select pg_temp.assert_true(not exists(
  select 1 from public.caissa_online_presence where user_id='10000000-0000-4000-8000-000000000002'
),'writer-first row survived the deletion sweep');
delete from public.caissa_account_control_operations where id='30000000-0000-4000-8000-0000000000b0';

-- Two real erasure sweeps touching two reverse-color shared games must
-- serialize before their per-user locks and complete without a cycle.
insert into public.caissa_account_control_operations(
  id,user_id,binding_id,kind,status,idempotency_key_hash,confirmation_hash,reverification_hash,expires_at
)
select '30000000-0000-4000-8000-0000000000a1',u.id,b.id,'ACCOUNT_DELETION','LOCKED',
  repeat('a',64),repeat('b',64),repeat('c',64),clock_timestamp()+interval '5 minutes'
from public.users u join public.identity_bindings b on b.user_id=u.id
where u.id='10000000-0000-4000-8000-000000000001'
on conflict(id) do update set status='LOCKED';
insert into public.caissa_account_control_operations(
  id,user_id,binding_id,kind,status,idempotency_key_hash,confirmation_hash,reverification_hash,expires_at
)
select '30000000-0000-4000-8000-0000000000b2',u.id,b.id,'ACCOUNT_DELETION','LOCKED',
  repeat('d',64),repeat('e',64),repeat('f',64),clock_timestamp()+interval '5 minutes'
from public.users u join public.identity_bindings b on b.user_id=u.id
where u.id='10000000-0000-4000-8000-000000000002'
on conflict(id) do update set status='LOCKED';
update public.caissa_account_states set state='ACTIVE',operation_id=null,reason_code=null
where user_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
insert into public.caissa_online_games(id,white_user_id,black_user_id) values
  ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
update public.caissa_account_states set state='DELETION_PENDING'
where user_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');

select dblink_send_query('account_writer',$remote$
  do $body$ begin
    set local lock_timeout='3s';
    perform pg_advisory_xact_lock(hashtextextended('caissa.account-control.erasure.global',0));
    perform pg_sleep(0.35);
    perform public.erase_caissa_account_data(
      '30000000-0000-4000-8000-0000000000a1',
      '10000000-0000-4000-8000-000000000001',
      (select id from public.identity_bindings where user_id='10000000-0000-4000-8000-000000000001' and status='ACTIVE'),
      encode(sha256(convert_to('synthetic_dev_a','UTF8')),'hex'));
  end $body$;
$remote$);
select pg_sleep(0.08);
do $$ begin
  set local lock_timeout='3s';
  perform public.erase_caissa_account_data(
    '30000000-0000-4000-8000-0000000000b2',
    '10000000-0000-4000-8000-000000000002',
    (select id from public.identity_bindings where user_id='10000000-0000-4000-8000-000000000002' and status='ACTIVE'),
    encode(sha256(convert_to('synthetic_dev_b','UTF8')),'hex'));
end $$;
select * from dblink_get_result('account_writer') as t(status text);
select pg_temp.assert_true((
  select count(*)=2 and bool_and(white_display_name='Deleted Player' and black_display_name='Deleted Player')
  from public.caissa_online_games
  where id in ('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002')
),'serialized erasures did not anonymize both sides of both reverse-color games');
select * from dblink_get_result('account_writer') as t(status text);

select dblink_disconnect('account_writer');
\echo CAISSA_ACCOUNT_CONTROL_CONCURRENCY_PASS
