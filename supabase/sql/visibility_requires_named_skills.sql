-- Validate all five names when enabling visibility; linked Master display is client-side.
create or replace function public.has_named_game_skills(p_profile_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.game g where g.user_id=p_profile_id
    and not exists(
      select 1 from unnest(array[g.skill_0,g.skill_1,g.skill_2,g.skill_3,g.skill_4]) as slot(skill_id)
      where skill_id is null or not exists(
        select 1 from public.skills s where s.id=slot.skill_id and nullif(btrim(s.label),'') is not null
      )
    )
  );
$$;
revoke all on function public.has_named_game_skills(uuid) from public;
grant execute on function public.has_named_game_skills(uuid) to anon,authenticated;

create or replace function public.is_public_master(p_profile_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=p_profile_id and p.visibility
    and nullif(btrim(p.username),'') is not null and public.has_named_game_skills(p.id));
$$;
create or replace function public.guard_profile_visibility()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if coalesce(new.visibility,false) or new.permanent_account_at is not null then
        raise exception 'New accounts must start private without permanent status' using errcode='42501';
      end if;
    else
      if new.master is distinct from old.master and (
        old.permanent_account_at is not null or exists(
          select 1 from public.player where user_id=old.id and master=old.master and level>=4
        )) then
        raise exception 'Your Master link is permanent at Level 4' using errcode='42501';
      end if;
      if new.permanent_account_at is distinct from old.permanent_account_at then
        if old.permanent_account_at is not null or new.permanent_account_at is null
          or new.master is distinct from old.master or not exists(
            select 1 from public.player where user_id=old.id and master=old.master and level>=4
          ) then
          raise exception 'Permanent status is granted only upon reaching Level 4' using errcode='42501';
        end if;
        new.permanent_account_at := now();
      end if;
      if new.visibility and not coalesce(old.visibility,false) and not public.has_named_game_skills(old.id) then
        raise exception 'Name all five skills before making your account visible' using errcode='23514';
      end if;
      if new.visibility is distinct from old.visibility and old.permanent_account_at is null
        and not exists(select 1 from public.player where user_id=old.id and level>=4) then
        raise exception 'Reach Level 4 to change account visibility' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;


