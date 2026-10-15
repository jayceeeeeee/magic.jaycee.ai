-- Current schema after skill_progression_v1, simplify_skill_progression_v2,
-- level_two_quest_acceptance and level_three_master_games.
-- Keep thresholds aligned with game-config.js.
alter table public.profiles add column years_burned integer not null default 0
  check (years_burned >= 0);
alter table public.player add column level_2_accepted_at timestamptz;
alter table public.player add column level_3_accepted_at timestamptz;

create function public.sync_skill_progress(
  p_player_id uuid, p_skill_number integer default null,
  p_practice_seconds double precision default null, p_started_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  participant public.player%rowtype;
  snapshot jsonb;
  quest integer;
  target double precision := 31556926.08 / 1826.211;
  burned integer;
  occurrence text;
  completed text := null;
  pending boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into participant from public.player
    where id = p_player_id and user_id = owner_id for update;
  if not found then raise exception 'Player not found' using errcode = '42501'; end if;
  snapshot := to_jsonb(participant);
  quest := least(3, greatest(1, participant.level));
  pending := participant.level in (2, 3)
    and snapshot->>('level_' || participant.level || '_accepted_at') is null;
  -- Levels 2 and 3 wait for explicit acceptance.
  if snapshot->>('skill_' || quest || '_start') is null
    and not pending then
    update public.player set skill_1_start = now(), skill_2_start = now(), skill_3_start = now()
      where id = participant.id returning * into participant;
    snapshot := to_jsonb(participant);
  end if;
  if quest >= 2 then target := target / 24; end if;
  if quest >= 3 then target := target / 24; end if;

  if p_practice_seconds is not null then
    if p_skill_number is null or p_skill_number not between 1 and quest
      or not (p_practice_seconds >= 0 and p_practice_seconds < 'Infinity'::double precision) then
      raise exception 'Invalid practice time';
    end if;
    if p_skill_number = quest and pending then
      raise exception 'Accept the Level % quest before starting practice', participant.level;
    end if;
    -- A late save must not restore practice after an objective has reset it.
    if p_started_at is not distinct from
      (snapshot->>('skill_' || p_skill_number || '_start'))::timestamptz then
      update public.player set
        skill_1_practice = case when p_skill_number = 1 then greatest(coalesce(skill_1_practice, 0), p_practice_seconds) else skill_1_practice end,
        skill_2_practice = case when p_skill_number = 2 then greatest(coalesce(skill_2_practice, 0), p_practice_seconds) else skill_2_practice end,
        skill_3_practice = case when p_skill_number = 3 then greatest(coalesce(skill_3_practice, 0), p_practice_seconds) else skill_3_practice end
        where id = participant.id returning * into participant;
      snapshot := to_jsonb(participant);
    end if;
  end if;

  occurrence := participant.id::text || ':' || participant.level::text || ':' ||
    coalesce(snapshot->>('skill_' || quest || '_start'), 'none');
  if coalesce((snapshot->>('skill_' || quest || '_practice'))::double precision, 0) >= target
    and not pending
    and exists (select 1 from public.game where user_id = participant.master
      and to_jsonb(game)->>('skill_' || quest) is not null) then
    -- Progress, reward, reset and notification completion commit together.
    update public.profiles set years_burned = years_burned + 1 where id = owner_id
      returning years_burned into burned;
    if not found then raise exception 'Profile not found'; end if;
    perform public.record_notification_events(jsonb_build_array(jsonb_build_object(
      'notification_id', 'master_linked.v1', 'occurrence', occurrence, 'action', 'completed')));
    completed := occurrence;
    update public.player set level = level + 1,
      skill_1_practice = case when quest = 1 then 0 else skill_1_practice end,
      skill_2_practice = case when quest = 2 then 0 else skill_2_practice end,
      skill_3_practice = case when quest = 3 then 0 else skill_3_practice end,
      skill_1_start = now(),
      skill_2_start = case when quest = 1 then null else now() end,
      skill_3_start = case when quest = 2 then null else now() end
      where id = participant.id returning * into participant;
  end if;
  -- Also close historic guidance when loading an already advanced player.
  update public.user_notifications as receipt set completed_at = now()
    where receipt.user_id = owner_id and notification_id = 'master_linked.v1' and completed_at is null
      and split_part(receipt.occurrence, ':', 1) = participant.id::text
      and split_part(receipt.occurrence, ':', 2) ~ '^[0-9]+$'
      and split_part(receipt.occurrence, ':', 2)::integer < participant.level;
  select years_burned into burned from public.profiles where id = owner_id;
  return jsonb_build_object('player', to_jsonb(participant), 'years_burned', burned,
    'completed_occurrence', completed);
end;
$$;
revoke all on function public.sync_skill_progress(uuid, integer, double precision, timestamptz) from public, anon;
grant execute on function public.sync_skill_progress(uuid, integer, double precision, timestamptz) to authenticated;
