-- Dev regression test. No outgoing request or persisted fixture.
begin;
delete from vault.secrets where name = 'prayer_email_project_url';
do $$
declare
  account_id uuid := gen_random_uuid();
  anonymous_id uuid := gen_random_uuid();
  email_address text;
begin
  email_address := account_id || '@example.invalid';
  insert into auth.users (id, email, raw_user_meta_data)
    values (account_id, email_address, '{"full_name":"Signup test"}'::jsonb);
  if not exists (select 1 from public.signup_emails
    where user_id = account_id and payload->>'email' = email_address
      and payload->>'username' = 'Signup test' and sent_at is null and delivery_started_at is null) then
    raise exception 'Signup must be queued before email confirmation';
  end if;
  update auth.users set raw_user_meta_data = '{"full_name":"Changed"}'::jsonb where id = account_id;
  if (select count(*) from public.signup_emails where user_id = account_id) <> 1 then
    raise exception 'Account updates must not queue another notification';
  end if;
  insert into auth.users (id, is_anonymous) values (anonymous_id, true);
  if exists (select 1 from public.signup_emails where user_id = anonymous_id) then
    raise exception 'Anonymous auth sessions must not be treated as signups';
  end if;
  if has_table_privilege('anon', 'public.signup_emails', 'select')
    or has_table_privilege('authenticated', 'public.signup_emails', 'select')
    or has_table_privilege('authenticated', 'public.signup_emails', 'insert')
    or has_function_privilege('authenticated', 'private.enqueue_signup_email()', 'execute') then
    raise exception 'Signup notification data must be server-only';
  end if;
  delete from auth.users where id = account_id;
  if exists (select 1 from public.signup_emails where user_id = account_id) then
    raise exception 'Deleting an account must remove its notification data';
  end if;
end;
$$;
rollback;
