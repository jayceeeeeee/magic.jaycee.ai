-- Integration test against the real roles/RLS, rolled back without keeping test data.
-- Requires two existing auth users. Run as postgres (SQL editor or MCP execute_sql).
begin;
select set_config('test.notification_owner', (select id::text from auth.users order by id limit 1), true);
select set_config('test.notification_other', (select id::text from auth.users order by id offset 1 limit 1), true);
select set_config('request.jwt.claim.sub', current_setting('test.notification_owner'), true);
set local role authenticated;
select public.record_notification_events('[{"notification_id":"prayer_learned.v1","occurrence":"__notification_test__","action":"read"}]');
select public.record_notification_events('[{"notification_id":"prayer_learned.v1","occurrence":"__notification_test__","action":"dismissed"},{"notification_id":"prayer_learned.v1","occurrence":"__notification_test__","action":"read"}]');
do $$ begin
  if (select count(*) from public.user_notifications where occurrence = '__notification_test__' and read_at is not null and dismissed_at is not null) <> 1 then
    raise exception 'FAIL: idempotent receipts';
  end if;
  if has_table_privilege(current_user, 'public.user_notifications', 'DELETE') then
    raise exception 'FAIL: client receipt deletion allowed';
  end if;
  begin
    update public.user_notifications set user_id = current_setting('test.notification_other')::uuid where occurrence = '__notification_test__';
    raise exception 'FAIL: ownership reassignment allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notifications (id, stage, position, title, tone) values ('__test__', 'guest', 0, 'test', 'quest');
    raise exception 'FAIL: client catalog writes allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('test.notification_other'), true);
set local role authenticated;
do $$ declare affected integer; begin
  if exists (select 1 from public.user_notifications where occurrence = '__notification_test__') then
    raise exception 'FAIL: another user can read receipts';
  end if;
  update public.user_notifications set read_at = null where occurrence = '__notification_test__';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another user can update receipts'; end if;
  begin
    insert into public.user_notifications (user_id, notification_id, occurrence)
    values (current_setting('test.notification_owner')::uuid, 'prayer_learned.v1', '__forged_test__');
    raise exception 'FAIL: forged owner allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  if not exists (select 1 from public.notifications where id = 'prayer_learned.v1') then raise exception 'FAIL: public catalog'; end if;
  if has_table_privilege(current_user, 'public.user_notifications', 'INSERT')
    or has_table_privilege(current_user, 'public.user_notifications', 'UPDATE')
    or has_table_privilege(current_user, 'public.user_notifications', 'DELETE') then
    raise exception 'FAIL: anon receipt writes allowed';
  end if;
  begin
    perform 1 from public.user_notifications;
    raise exception 'FAIL: anon receipt read allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_notification_events('[]');
    raise exception 'FAIL: anon RPC allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: idempotency, catalog access, user isolation, ownership checks, anonymous restrictions' as result;
rollback;
