-- Notify prayers sent before signup, preserving first-only delivery for accounts.
begin;
lock table public.prayers in share row exclusive mode;
alter table public.first_prayer_emails add column id uuid not null default gen_random_uuid();
alter table public.first_prayer_emails drop constraint first_prayer_emails_pkey;
alter table public.first_prayer_emails alter column user_id drop not null;
alter table public.first_prayer_emails add primary key (id);
alter table public.first_prayer_emails add unique (user_id);
alter table public.first_prayer_emails add unique (prayer_id);
create or replace function private.dispatch_first_prayer_emails()
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
    select id from public.first_prayer_emails
    where sent_at is null and payload is not null
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
      and (delivery_started_at is null or delivery_started_at > now() - interval '23 hours')
    order by last_attempt_at nulls first limit 10 for update skip locked
  loop
    perform net.http_post(
      url := project_url || '/functions/v1/first-prayer-email',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-prayer-webhook-secret', webhook_secret),
      body := jsonb_build_object('notification_id', item.id),
      timeout_milliseconds := 15000
    );
    update public.first_prayer_emails
      set last_attempt_at = now(), delivery_started_at = coalesce(delivery_started_at, now())
      where id = item.id;
  end loop;
end;
$$;

create or replace function private.enqueue_first_prayer_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.first_prayer_emails (user_id, prayer_id, payload)
  values (new.user_id, new.id, jsonb_build_object(
    'username', new.username, 'problem', new.problem, 'prayer', new.prayer,
    'created_at', new.created_at))
  on conflict (user_id) do nothing;
  -- Sending is asynchronous: Resend failures never undo a saved prayer.
  perform private.dispatch_first_prayer_emails();
  return new;
end;
$$;

commit;
