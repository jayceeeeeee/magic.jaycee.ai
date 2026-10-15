-- Canonical schema + seed. Applied remotely as notification_persistence_v1
-- plus notification_receipt_catalog_index and rename_notification_definitions_to_notifications.
create table public.notifications (
  id text primary key check (length(id) between 1 and 100),
  stage text not null check (stage in ('guest', 'account', 'choose_master', 'linked_master')),
  position smallint not null,
  title text not null,
  tone text not null check (tone in ('notification', 'unlocked', 'quest')),
  dismissible boolean not null default false,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  enabled boolean not null default true
);

create table public.user_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null references public.notifications(id),
  occurrence text not null default 'once' check (length(occurrence) between 1 and 160),
  read_at timestamptz,
  dismissed_at timestamptz,
  clicked_at timestamptz,
  completed_at timestamptz,
  primary key (user_id, notification_id, occurrence)
);
create index user_notifications_notification_id_idx on public.user_notifications (notification_id);

alter table public.notifications enable row level security;
alter table public.user_notifications enable row level security;
revoke all on public.notifications, public.user_notifications from anon, authenticated;
grant select on public.notifications to anon, authenticated;
grant select, insert, update on public.user_notifications to authenticated;
create policy "Read enabled notification definitions" on public.notifications
  for select to anon, authenticated using (enabled);
create policy "Read own notifications" on public.user_notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own notifications" on public.user_notifications
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own notifications" on public.user_notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Server timestamps, monotonic updates, idempotent retries and concurrent tabs.
-- Invoker deliberately keeps the same ownership policies as the Data API.
create function public.record_notification_events(p_events jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  event jsonb;
  action text;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then
    raise exception 'Expected at most 100 notification events';
  end if;
  for event in select value from jsonb_array_elements(p_events) loop
    action := event->>'action';
    if action is null or action not in ('read', 'dismissed', 'clicked', 'completed') then
      raise exception 'Invalid notification action';
    end if;
    insert into public.user_notifications as receipt
      (user_id, notification_id, occurrence, read_at, dismissed_at, clicked_at, completed_at)
    values (owner_id, event->>'notification_id', coalesce(event->>'occurrence', 'once'),
      case when action in ('read', 'dismissed', 'clicked') then now() end,
      case when action = 'dismissed' then now() end,
      case when action = 'clicked' then now() end,
      case when action = 'completed' then now() end)
    on conflict (user_id, notification_id, occurrence) do update set
      read_at = coalesce(receipt.read_at, excluded.read_at),
      dismissed_at = coalesce(receipt.dismissed_at, excluded.dismissed_at),
      clicked_at = coalesce(receipt.clicked_at, excluded.clicked_at),
      completed_at = coalesce(receipt.completed_at, excluded.completed_at);
  end loop;
end;
$$;
revoke all on function public.record_notification_events(jsonb) from public, anon;
grant execute on function public.record_notification_events(jsonb) to authenticated;

insert into public.notifications (id, stage, position, title, tone, dismissible, content) values
('masters_present.v1', 'guest', 10, 'Notification', 'notification', true,
 '{"component":"masters"}'),
('karma_master.v1', 'guest', 20, 'Notification', 'notification', true,
 '{"component":"karma_master"}'),
('prayer_level.v1', 'guest', 30, 'Unlocked', 'unlocked', true,
 '{"text":"Congratulations! You have unlocked level 1. It has been calculated by the great Masters of this game that it takes approximately {lifeMaxYears} years for an average Human being to burn all his Karma and leave the Earth. Your prayer has burned {prayerKarmaYears} years of Karma. You have more than {remainingKarmaYears} years left."}'),
('create_account.v1', 'guest', 40, 'Quest', 'quest', false,
 '{"text":"Unlock Level 2: burn Karma faster and try to get enlightened in this life, save your progress and connect directly with a Master.","action":"signup","actionLabel":"Accept"}'),
('prayer_learned.v1', 'account', 10, 'Unlocked', 'unlocked', true,
 '{"text":"Congratulations! You have learned to pray! You can now save your progress and connect with a Master to continue to play. Click on the top right icon to add your informations."}'),
('choose_master.v1', 'choose_master', 20, 'Quest', 'quest', false,
 '{"text":"Connect with a Master: Each Master offers a different path, with different quests and benefits. You have {firstActivePassiveTime} to choose a Master and get your first quest. Beyond that timing your account will be deleted automatically. Click on a Master below to link to their game.","component":"master_choices"}'),
('master_linked.v1', 'linked_master', 20, 'Quest', 'quest', false,
 '{"component":"linked_quest"}');
