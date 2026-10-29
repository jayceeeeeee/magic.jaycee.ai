-- First prayer per account. No historical emails, no anonymous notifications.
begin;
create extension if not exists pg_net with schema extensions;
lock table public.prayers in share row exclusive mode;

create table public.first_prayer_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prayer_id uuid,
  payload jsonb,
  created_at timestamptz not null default now(),
  delivery_started_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz
);
alter table public.first_prayer_emails enable row level security;
revoke all on public.first_prayer_emails from public, anon, authenticated, service_role;
grant select, update on public.first_prayer_emails to service_role;
create index first_prayer_emails_pending on public.first_prayer_emails (last_attempt_at)
  where sent_at is null;

-- Existing accounts with prayers have already passed their first prayer.
insert into public.first_prayer_emails (user_id, sent_at)
select distinct user_id, now() from public.prayers where user_id is not null;

-- Prevent a caller from attributing a prayer to someone else's account.
create policy "Prayer account ownership" on public.prayers
as restrictive for insert to anon, authenticated
with check (user_id is null or user_id = (select auth.uid()));

-- Generate internally: no additional Edge Function secret needs to be copied.
select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'prayer_email_webhook_secret'
)
where not exists (select 1 from vault.secrets where name = 'prayer_email_webhook_secret');

create function public.get_first_prayer_webhook_secret()
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
    where name = 'prayer_email_webhook_secret';
$$;
revoke all on function public.get_first_prayer_webhook_secret() from public, anon, authenticated, service_role;
grant execute on function public.get_first_prayer_webhook_secret() to service_role;

create function private.dispatch_first_prayer_emails()
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
    select user_id from public.first_prayer_emails
    where sent_at is null and payload is not null
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
      and (delivery_started_at is null or delivery_started_at > now() - interval '23 hours')
    order by last_attempt_at nulls first limit 10 for update skip locked
  loop
    perform net.http_post(
      url := project_url || '/functions/v1/first-prayer-email',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-prayer-webhook-secret', webhook_secret),
      body := jsonb_build_object('user_id', item.user_id),
      timeout_milliseconds := 15000
    );
    update public.first_prayer_emails
      set last_attempt_at = now(), delivery_started_at = coalesce(delivery_started_at, now())
      where user_id = item.user_id;
  end loop;
end;
$$;
revoke all on function private.dispatch_first_prayer_emails() from public, anon, authenticated, service_role;

create function private.enqueue_first_prayer_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
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
revoke all on function private.enqueue_first_prayer_email() from public, anon, authenticated, service_role;
create trigger first_prayer_email after insert on public.prayers
for each row execute function private.enqueue_first_prayer_email();

-- Retry failures within Resend's 24-hour idempotency window, with a safety margin.
select cron.schedule('first-prayer-emails', '*/5 * * * *',
  'select private.dispatch_first_prayer_emails()');
commit;
