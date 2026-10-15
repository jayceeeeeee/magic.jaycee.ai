-- Upgrade: Level 3 acceptance, account unlock notices, Master switching and owned game editing.
alter table public.player add column if not exists level_3_accepted_at timestamptz;
alter table public.skills add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists skills_user_id_idx on public.skills(user_id);
-- Attribute existing skills only when they belong to exactly one game owner.
update public.skills s set user_id = owners.owner_id::uuid from (
  select skill_id, min(g.user_id::text) as owner_id from public.game g
  cross join lateral unnest(array[g.skill_0,g.skill_1,g.skill_2,g.skill_3,g.skill_4]) as slot(skill_id)
  where skill_id is not null group by skill_id having count(distinct g.user_id) = 1
) owners where s.id = owners.skill_id and s.user_id is null;

insert into public.notifications(id,stage,position,title,tone,dismissible,content) values
('level_two_map.v1','linked_master',12,'Unlocked','unlocked',true,
 '{"level":2,"occurrence":"level","text":"You can now modify your Health and Manna bars in the Map section of your account panel."}'),
('level_three_unlocked.v1','linked_master',10,'Unlocked','unlocked',true,
 '{"level":3,"occurrence":"level","text":"Congratulations! You have unlocked Level 3! You have access to a new skill."}'),
('level_three_game.v1','linked_master',12,'Unlocked','unlocked',true,
 '{"level":3,"occurrence":"level","text":"You can now create your own game and skills in the Skills section of your account panel, and become a Master in your turn."}'),
('level_three_prepare.v1','linked_master',15,'Quest','quest',false,
 '{"level":3,"occurrence":"level","action":"accept_quest","actionLabel":"Accept","text":["Before beginning this Quest you must have checked the resources of {passiveSkillName}, {skillOneName} and {skillTwoName} skills. Check their description below to access it.","Only after that, click on Accept and the Quest will begin.","In the meantime practice {skillOneName} if you don\u0027t want to lose your account."]}')
on conflict(id) do update set stage=excluded.stage,position=excluded.position,title=excluded.title,
 tone=excluded.tone,dismissible=excluded.dismissible,content=excluded.content,enabled=true;
-- Keep the user's existing Level 2 copy and receipts.
update public.notifications set content=jsonb_set(content,'{action}','"accept_quest"')
 where id='level_two_prepare.v1';

create or replace function public.accept_player_quest(p_player_id uuid,p_level integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  participant public.player%rowtype;
  burned integer;
  notification text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_level is null or p_level not in (2,3) then raise exception 'Invalid quest level'; end if;
  select * into participant from public.player where id=p_player_id and user_id=owner_id for update;
  if not found then raise exception 'Player not found' using errcode='42501'; end if;
  if participant.level<>p_level then raise exception 'The player quest level has changed. Reload and try again.'; end if;
  if p_level=2 and participant.level_2_accepted_at is null then
    update public.player set level_2_accepted_at=now(),skill_2_start=now()
      where id=participant.id returning * into participant;
  elsif p_level=3 and participant.level_3_accepted_at is null then
    update public.player set level_3_accepted_at=now(),skill_3_start=now()
      where id=participant.id returning * into participant;
  end if;
  notification := case when p_level=2 then 'level_two_prepare.v1' else 'level_three_prepare.v1' end;
  perform public.record_notification_events(jsonb_build_array(
    jsonb_build_object('notification_id',notification,'occurrence',participant.id::text||':'||p_level,'action','clicked'),
    jsonb_build_object('notification_id',notification,'occurrence',participant.id::text||':'||p_level,'action','completed')));
  select years_burned into burned from public.profiles where id=owner_id;
  return jsonb_build_object('player',to_jsonb(participant),'years_burned',burned,'completed_occurrence',null);
end;
$$;
revoke all on function public.accept_player_quest(uuid,integer) from public,anon;
grant execute on function public.accept_player_quest(uuid,integer) to authenticated;

-- Compatibility for already loaded clients.
create or replace function public.accept_level_two_quest(p_player_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select public.accept_player_quest(p_player_id,2);
$$;

create or replace function public.can_author_game()
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.player where user_id=(select auth.uid()) and level>=3);
$$;
revoke all on function public.can_author_game() from public,anon;
grant execute on function public.can_author_game() to authenticated;

alter table public.skills enable row level security;
drop policy if exists jaycee_skills_insert on public.skills;
drop policy if exists jaycee_skills_update on public.skills;
drop policy if exists jaycee_skills_delete on public.skills;
create policy jaycee_skills_insert on public.skills for insert to authenticated
 with check(user_id=(select auth.uid()) and (select public.can_author_game()));
create policy jaycee_skills_update on public.skills for update to authenticated
 using(user_id=(select auth.uid()) and (select public.can_author_game()))
 with check(user_id=(select auth.uid()) and (select public.can_author_game()));
create policy jaycee_skills_delete on public.skills for delete to authenticated using(user_id=(select auth.uid()));
drop policy if exists jaycee_game_insert_own on public.game;
drop policy if exists jaycee_game_update_own on public.game;
create policy jaycee_game_insert_own on public.game for insert to authenticated
 with check(user_id=(select auth.uid()) and (select public.can_author_game()));
create policy jaycee_game_update_own on public.game for update to authenticated
 using(user_id=(select auth.uid()) and (select public.can_author_game()))
 with check(user_id=(select auth.uid()) and (select public.can_author_game()));

create or replace function public.save_own_game(p_skills jsonb,p_published boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  own_game public.game%rowtype;
  old_ids uuid[];
  new_ids uuid[] := array[]::uuid[];
  skill_id uuid;
  label_value text;
  description_value text;
  i integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.can_author_game() then raise exception 'Reach Level 3 to create your game' using errcode='42501'; end if;
  if jsonb_typeof(p_skills) is distinct from 'array' then raise exception 'Expected five skill slots'; end if;
  if jsonb_array_length(p_skills)<>5 then raise exception 'Expected five skill slots'; end if;
  perform 1 from public.profiles where id=owner_id for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into own_game from public.game where user_id=owner_id for update;
  old_ids := array[own_game.skill_0,own_game.skill_1,own_game.skill_2,own_game.skill_3,own_game.skill_4];
  for i in 0..4 loop
    if jsonb_typeof(p_skills->i) is distinct from 'object' then raise exception 'Invalid skill'; end if;
    label_value := btrim(coalesce(p_skills->i->>'label',''));
    description_value := btrim(coalesce(p_skills->i->>'description',''));
    if length(label_value)>120 or length(description_value)>20000 then raise exception 'Skill text is too long'; end if;
    if label_value='' and description_value<>'' then raise exception 'Each description needs a skill name'; end if;
    if coalesce(p_published,false) and i in (0,1) and label_value='' then
      raise exception 'Add a passive skill and Skill 1 before publishing';
    end if;
    skill_id := null;
    if label_value<>'' then
      -- Never edit another Master's skill; clone a legacy shared slot instead.
      if old_ids[i+1] is not null and array_position(new_ids,old_ids[i+1]) is null then
        update public.skills set label=label_value,description=description_value
          where id=old_ids[i+1] and user_id=owner_id returning id into skill_id;
      end if;
      if skill_id is null then
        insert into public.skills(user_id,label,description) values(owner_id,label_value,description_value) returning id into skill_id;
      end if;
    end if;
    new_ids := array_append(new_ids,skill_id);
  end loop;
  insert into public.game(user_id,skill_0,skill_1,skill_2,skill_3,skill_4)
    values(owner_id,new_ids[1],new_ids[2],new_ids[3],new_ids[4],new_ids[5])
    on conflict(user_id) do update set skill_0=excluded.skill_0,skill_1=excluded.skill_1,
      skill_2=excluded.skill_2,skill_3=excluded.skill_3,skill_4=excluded.skill_4
    returning * into own_game;
  update public.profiles set visibility=coalesce(p_published,false) where id=owner_id;
  return to_jsonb(own_game);
end;
$$;
revoke all on function public.save_own_game(jsonb,boolean) from public,anon;
grant execute on function public.save_own_game(jsonb,boolean) to authenticated;

create or replace function public.switch_player_master(p_master_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  current_master uuid;
  participant public.player%rowtype;
  target public.player%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_master_id is null or p_master_id=owner_id then raise exception 'Choose another Master'; end if;
  -- Match progression's player-before-profile lock order.
  select master into current_master from public.profiles where id=owner_id;
  if current_master is not null then
    select * into participant from public.player where user_id=owner_id and master=current_master for update;
  end if;
  perform 1 from public.profiles where id=owner_id and master is not distinct from current_master for update;
  if not found then raise exception 'Your Master changed. Reload and try again.'; end if;
  if current_master is not null and not coalesce((
    (participant.level=2 and participant.level_2_accepted_at is null) or
    (participant.level=3 and participant.level_3_accepted_at is null)),false) then
    raise exception 'You can change Master only before accepting a Level 2 or Level 3 quest';
  end if;
  if not exists(select 1 from public.profiles p join public.game g on g.user_id=p.id
    where p.id=p_master_id and p.visibility and p.username is not null and g.skill_1 is not null) then
    raise exception 'This Master has no public playable game';
  end if;
  insert into public.player(user_id,master,level,skill_1_start)
    values(owner_id,p_master_id,1,now()) on conflict(user_id,master) do nothing;
  select * into target from public.player where user_id=owner_id and master=p_master_id;
  update public.profiles set master=p_master_id where id=owner_id;
  return to_jsonb(target);
end;
$$;
revoke all on function public.switch_player_master(uuid) from public,anon;
grant execute on function public.switch_player_master(uuid) to authenticated;

create or replace function public.sync_skill_progress(
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

