-- Run in dev after the migration. Fixtures and all effects are rolled back.
begin;
-- Keep tests from contacting an email provider even on a configured project.
delete from vault.secrets where name in ('prayer_email_project_url', 'prayer_email_webhook_secret');
do $$
declare
  account_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  anonymous_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (account_id, account_id || '@example.test');
  insert into public.prayers (id, user_id, username, problem, prayer)
    values (first_id, account_id, 'Test', 'Problem', 'First prayer');
  insert into public.prayers (user_id, username, problem, prayer)
    values (account_id, 'Test', 'Problem', 'Second prayer');
  insert into public.prayers (id, username, problem, prayer)
    values (anonymous_id, 'Visitor', 'Problem', 'Anonymous prayer');
  if (select count(*) from public.first_prayer_emails where user_id = account_id) <> 1 then
    raise exception 'Expected exactly one queue entry';
  end if;
  if not exists (select 1 from public.first_prayer_emails
    where user_id = account_id and prayer_id = first_id and payload->>'prayer' = 'First prayer'
      and sent_at is null and delivery_started_at is null) then
    raise exception 'First prayer must remain queued without configuration';
  end if;
  if not exists (select 1 from public.first_prayer_emails
    where prayer_id = anonymous_id and user_id is null
      and payload->>'prayer' = 'Anonymous prayer' and sent_at is null) then
    raise exception 'Anonymous prayer must be queued';
  end if;
  if has_table_privilege('anon', 'public.first_prayer_emails', 'select')
     or has_table_privilege('authenticated', 'public.first_prayer_emails', 'select')
     or has_function_privilege('anon', 'private.dispatch_first_prayer_emails()', 'execute')
     or has_function_privilege('authenticated', 'public.get_first_prayer_webhook_secret()', 'execute')
     or not has_function_privilege('service_role', 'public.get_first_prayer_webhook_secret()', 'execute') then
    raise exception 'Queue must be inaccessible to clients';
  end if;
end;
$$;
set local role anon;
insert into public.prayers (username, problem, prayer)
values ('Anonymous RLS test', 'Test', 'Public submission can enqueue a notification');
reset role;
rollback;
