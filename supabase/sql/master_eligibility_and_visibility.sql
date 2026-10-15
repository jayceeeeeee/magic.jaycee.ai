-- Public Masters need a visible profile and all five skill slots named.
-- This does not change the visibility of any existing profile.
alter table public.profiles alter column visibility set default false;

create or replace function public.is_public_master(p_profile_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(
    select 1 from public.profiles p join public.game g on g.user_id=p.id
    where p.id=p_profile_id and p.visibility and nullif(btrim(p.username),'') is not null
      and not exists(
        select 1 from unnest(array[g.skill_0,g.skill_1,g.skill_2,g.skill_3,g.skill_4]) as slot(skill_id)
        where skill_id is null or not exists(
          select 1 from public.skills s where s.id=slot.skill_id and nullif(btrim(s.label),'') is not null
        )
      )
  );
$$;
revoke all on function public.is_public_master(uuid) from public;
grant execute on function public.is_public_master(uuid) to anon,authenticated;

create or replace function public.list_public_masters(p_limit integer default 100)
returns table(id uuid,username text,full_name text,avatar_path text,role text)
language sql stable security invoker set search_path='' as $$
  select p.id,p.username,p.full_name,p.avatar_path,p.role from public.profiles p
    where public.is_public_master(p.id) order by p.username
    limit greatest(1,least(coalesce(p_limit,100),1000));
$$;
revoke all on function public.list_public_masters(integer) from public;
grant execute on function public.list_public_masters(integer) to anon,authenticated;

-- Browsers cannot publish/unpublish themselves through direct profile writes.
-- SQL administrators and trusted backend roles can still manage this flag.
create or replace function public.guard_profile_visibility()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if coalesce(new.visibility,false) then
        raise exception 'Profile visibility is managed by an administrator' using errcode='42501';
      end if;
    elsif new.visibility is distinct from old.visibility then
      raise exception 'Profile visibility is managed by an administrator' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_visibility() from public,anon,authenticated;
create trigger guard_profile_visibility before insert or update on public.profiles
  for each row execute function public.guard_profile_visibility();

-- The legacy publication argument is retained only for old clients; true is rejected.
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
  if coalesce(p_published,false) then raise exception 'Profile visibility is managed by an administrator' using errcode='42501'; end if;
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
  if not public.is_public_master(p_master_id) then
    raise exception 'This Master needs a visible profile and five named skills';
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


