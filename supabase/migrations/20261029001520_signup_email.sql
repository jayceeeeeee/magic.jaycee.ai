-- Notify new accounts at creation, without replaying existing accounts.
begin;
create table public.signup_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivery_started_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz
);
alter table public.signup_emails enable row level security;
revoke all on public.signup_emails from public, anon, authenticated, service_role;
grant select, update on public.signup_emails to service_role;
create index signup_emails_pending on public.signup_emails (last_attempt_at) where sent_at is null;

create function private.dispatch_signup_emails()
returns void language plpgsql security definer set search_path = '' as $$
declare
  project_url text;
  webhook_secret text;
  item record;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets
    where name = 'prayer_email_project_url';
  select decrypted_secret into webhook_secret from vault.decrypted_secrets
    where name = 'prayer_email_webhook_secret';
  if project_url is null or webhook_secret is null then return; end if;
  for item in
    select id from public.signup_emails
    where sent_at is null
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
      and (delivery_started_at is null or delivery_started_at > now() - interval '23 hours')
    order by last_attempt_at nulls first limit 10 for update skip locked
  loop
    perform net.http_post(
      url := project_url || '/functions/v1/first-prayer-email',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-prayer-webhook-secret', webhook_secret),
      body := jsonb_build_object('signup_id', item.id),
      timeout_milliseconds := 15000
    );
    update public.signup_emails
      set last_attempt_at = now(), delivery_started_at = coalesce(delivery_started_at, now())
      where id = item.id;
  end loop;
end;
$$;
revoke all on function private.dispatch_signup_emails() from public, anon, authenticated, service_role;

create function private.enqueue_signup_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.signup_emails (user_id, payload)
  values (new.id, jsonb_build_object(
    'email', new.email,
    'username', coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username', ''),
    'created_at', coalesce(new.created_at, now())
  )) on conflict (user_id) do nothing;
  -- A dispatch failure must not prevent signup; cron will retry the queued row.
  begin
    perform private.dispatch_signup_emails();
  exception when others then
    raise warning 'Signup email dispatch postponed';
  end;
  return new;
end;
$$;
revoke all on function private.enqueue_signup_email() from public, anon, authenticated, service_role;
create trigger signup_email after insert on auth.users for each row
when (new.email is not null and btrim(new.email) <> '' and not coalesce(new.is_anonymous, false))
execute function private.enqueue_signup_email();

select cron.schedule('signup-emails', '*/5 * * * *', 'select private.dispatch_signup_emails()');
commit;
