-- Extend existing account locking to the very first Master selection.
-- Normally timed from Auth account creation; only an admin unlock resets it.
alter table public.profiles add column master_selection_started_at timestamptz;

create or replace function private.guard_account_lock()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and (new.locked or new.master_selection_started_at is not null))
    or (tg_op='UPDATE' and (new.locked is distinct from old.locked
      or new.master_selection_started_at is distinct from old.master_selection_started_at))
  ) then
    raise exception 'Only an administrator can change account locking' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_account_lock() from public,anon,authenticated;

create or replace function private.quest_deadline(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path='' as $$
  select case
    when f.master is null and not coalesce(f.visibility,false) and f.role is distinct from 'admin'
      and not exists(select 1 from public.player prior where prior.user_id=f.id)
      then coalesce(f.master_selection_started_at,u.created_at)+interval '2551442.803 seconds'
    else case p.level
      when 1 then p.skill_1_start+interval '2551442.803 seconds'
      when 2 then case when p.level_2_accepted_at is not null then p.skill_2_start+interval '86400 seconds'
        else p.skill_1_start+interval '2551442.803 seconds' end
      when 3 then case when p.level_3_accepted_at is not null then p.skill_3_start+interval '3600 seconds'
        else p.skill_2_start+interval '86400 seconds' end
    end
  end
  from public.profiles f join auth.users u on u.id=f.id
    left join public.player p on p.user_id=f.id and p.master=f.master
  where f.id=p_user_id and f.permanent_account_at is null;
$$;
revoke all on function private.quest_deadline(uuid) from public,anon,authenticated;

create or replace function private.enforce_current_account()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  deadline timestamptz;
  is_locked boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Same player-before-profile order as progression and Master selection.
  perform 1 from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
    where p.user_id=owner_id for update of p;
  perform 1 from public.profiles where id=owner_id for update;
  deadline:=private.quest_deadline(owner_id);
  if deadline<=clock_timestamp() then
    update public.profiles set locked=true where id=owner_id and not locked;
  end if;
  select locked into is_locked from public.profiles where id=owner_id;
  return jsonb_build_object('locked',coalesce(is_locked,false),'deadline',deadline);
end;
$$;
revoke all on function private.enforce_current_account() from public,anon;
grant execute on function private.enforce_current_account() to authenticated;

create or replace function private.lock_expired_quest_accounts()
returns void language plpgsql security definer set search_path='' as $$
declare participant public.player%rowtype; candidate uuid;
begin
  -- Preserve existing locking/order for linked quests.
  for participant in select p.* from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
    where not f.locked and f.permanent_account_at is null and p.level between 1 and 3
      and private.quest_deadline(p.user_id)<=clock_timestamp()
    for update of p skip locked loop
    if private.quest_deadline(participant.user_id)<=clock_timestamp() then
      update public.profiles set locked=true where id=participant.user_id and not locked;
    end if;
  end loop;
  for candidate in select f.id from public.profiles f
    where not f.locked and f.master is null and f.permanent_account_at is null
      and private.quest_deadline(f.id)<=clock_timestamp()
    for update of f skip locked
  loop
    if private.quest_deadline(candidate)<=clock_timestamp() then
      update public.profiles set locked=true where id=candidate and not locked;
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_expired_quest_accounts() from public,anon,authenticated;

-- Preserve the existing unlock behavior for linked quests, and give initial
-- Master selection a fresh cycle when an administrator unlocks an account.
create function private.restart_master_selection_on_unlock()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.locked and not new.locked and new.master is null
    and new.permanent_account_at is null and not coalesce(new.visibility,false)
    and new.role is distinct from 'admin'
    and not exists(select 1 from public.player where user_id=new.id) then
    update public.profiles set master_selection_started_at=clock_timestamp() where id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.restart_master_selection_on_unlock() from public,anon,authenticated;
create trigger restart_master_selection_on_unlock after update of locked on public.profiles
  for each row execute function private.restart_master_selection_on_unlock();
