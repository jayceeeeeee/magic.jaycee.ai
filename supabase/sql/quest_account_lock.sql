-- Below Level 4, pending quests use the previous skill's deadline.
alter table public.profiles add column locked boolean not null default false;

create function private.quest_deadline(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path='' as $$
  select case p.level
    when 1 then p.skill_1_start+interval '2551442.803 seconds'
    when 2 then case when p.level_2_accepted_at is not null then p.skill_2_start+interval '86400 seconds'
      else p.skill_1_start+interval '2551442.803 seconds' end
    when 3 then case when p.level_3_accepted_at is not null then p.skill_3_start+interval '3600 seconds'
      else p.skill_2_start+interval '86400 seconds' end
  end
  from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
  where p.user_id=p_user_id and f.permanent_account_at is null and p.level between 1 and 3;
$$;
revoke all on function private.quest_deadline(uuid) from public,anon,authenticated;

-- Keep authorization effective for already-issued access tokens too.
create function private.account_has_access()
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.profiles where id=(select auth.uid()) and locked)
    and coalesce(private.quest_deadline((select auth.uid()))>now(),true);
$$;
revoke all on function private.account_has_access() from public,anon;
grant execute on function private.account_has_access() to authenticated;

create function private.guard_account_lock()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and new.locked) or (tg_op='UPDATE' and new.locked is distinct from old.locked)
  ) then
    raise exception 'Only an administrator can change account locking' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_account_lock() from public,anon,authenticated;
create trigger guard_account_lock before insert or update on public.profiles
  for each row execute function private.guard_account_lock();

create function private.apply_account_lock()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.locked is distinct from old.locked then
    -- Auth checks banned_until for password login and token refresh.
    update auth.users set banned_until=case when new.locked
      then '9999-12-31 23:59:59+00'::timestamptz else null end where id=new.id;
    if new.locked then
      delete from auth.sessions where user_id=new.id;
    else
      -- An administrator's unlock gives the current quest a fresh chance.
      -- Practice and all unrelated skill clocks are preserved.
      update public.player set
        skill_1_start=case when level=1 or (level=2 and level_2_accepted_at is null) then clock_timestamp() else skill_1_start end,
        skill_2_start=case when (level=2 and level_2_accepted_at is not null)
          or (level=3 and level_3_accepted_at is null) then clock_timestamp() else skill_2_start end,
        skill_3_start=case when level=3 and level_3_accepted_at is not null then clock_timestamp() else skill_3_start end
        where user_id=new.id and master=new.master and level between 1 and 3;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_account_lock() from public,anon,authenticated;
create trigger apply_account_lock after update of locked on public.profiles
  for each row execute function private.apply_account_lock();

-- This helper can only check/lock the caller's own account.
create function private.enforce_current_account()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  deadline timestamptz;
  is_locked boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Serialize expiration with practice/progression before deciding to lock.
  perform 1 from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
    where p.user_id=owner_id for update of p;
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
create function public.check_account_access()
returns jsonb language sql security invoker set search_path='' as $$
  select private.enforce_current_account();
$$;
revoke all on function public.check_account_access() from public,anon;
grant execute on function public.check_account_access() to authenticated;

-- Check before saving: late practice cannot resurrect an expired quest.
alter function public.sync_skill_progress(uuid,integer,double precision,timestamptz) set schema private;
alter function private.sync_skill_progress(uuid,integer,double precision,timestamptz) rename to sync_unlocked_skill_progress;
create function public.sync_skill_progress(
  p_player_id uuid,p_skill_number integer default null,
  p_practice_seconds double precision default null,p_started_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if (public.check_account_access()->>'locked')::boolean then
    -- Return normally so the account lock commits before the client signs out.
    return jsonb_build_object('account_locked',true);
  end if;
  return private.sync_unlocked_skill_progress(p_player_id,p_skill_number,p_practice_seconds,p_started_at);
end;
$$;
revoke all on function public.sync_skill_progress(uuid,integer,double precision,timestamptz) from public,anon;
grant execute on function public.sync_skill_progress(uuid,integer,double precision,timestamptz) to authenticated;

-- Restrictive policies supplement existing owner policies without replacing them.
do $$
declare target text; operation text;
begin
  foreach target in array array['public.profiles','public.player','public.game','public.skills',
    'public.user_notifications','public.prayers','storage.objects'] loop
    foreach operation in array array['insert','update','delete'] loop
      execute format('create policy %I on %s as restrictive for %s to authenticated %s',
        'Unlocked account '||operation,target,operation,
        case operation when 'insert' then 'with check ((select private.account_has_access()))'
          when 'update' then 'using ((select private.account_has_access())) with check ((select private.account_has_access()))'
          else 'using ((select private.account_has_access()))' end);
    end loop;
  end loop;
  foreach target in array array['public.player','public.user_notifications','public.practice_completions'] loop
    execute format('create policy "Unlocked account read" on %s as restrictive for select to authenticated using ((select private.account_has_access()))',target);
  end loop;
end;
$$;

-- Enforce deadlines while the browser is closed; lock rows in the same order as sync.
create function private.lock_expired_quest_accounts()
returns void language plpgsql security definer set search_path='' as $$
declare participant public.player%rowtype;
begin
  for participant in select p.* from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
    where not f.locked and f.permanent_account_at is null and p.level between 1 and 3
      and private.quest_deadline(p.user_id)<=clock_timestamp()
    for update of p skip locked loop
    if private.quest_deadline(participant.user_id)<=clock_timestamp() then
      update public.profiles set locked=true where id=participant.user_id and not locked;
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_expired_quest_accounts() from public,anon,authenticated;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('lock-expired-quest-accounts','* * * * *','select private.lock_expired_quest_accounts()');

create or replace function private.complete_practice_goal(p_player_id uuid,p_skill_number integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  participant public.player%rowtype;
  snapshot jsonb;
  required_seconds double precision:=31556926.08 / 1826.211;
  practiced double precision;
  remainder double precision;
  goals bigint;
  previous_start timestamptz;
  next_start timestamptz:=clock_timestamp();
  occurrence text:=null;
  advances boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into participant from public.player where id=p_player_id and user_id=owner_id for update;
  if not found then raise exception 'Player not found' using errcode='42501'; end if;
  if p_skill_number is null or p_skill_number not between 1 and least(3,participant.level) then
    raise exception 'Invalid skill';
  end if;
  if not private.account_has_access() then raise exception 'Account locked or quest expired' using errcode='42501'; end if;
  snapshot:=to_jsonb(participant);
  if participant.level in (2,3) and p_skill_number=participant.level
    and snapshot->>('level_'||participant.level||'_accepted_at') is null then
    return jsonb_build_object('completed',false);
  end if;
  required_seconds:=required_seconds / power(24,p_skill_number-1);
  practiced:=coalesce((snapshot->>('skill_'||p_skill_number||'_practice'))::double precision,0);
  if not(practiced>=required_seconds and practiced<'Infinity'::double precision) then
    return jsonb_build_object('completed',false);
  end if;
  if not exists(select 1 from public.game where user_id=participant.master
    and to_jsonb(game)->>('skill_'||p_skill_number) is not null) then
    return jsonb_build_object('completed',false);
  end if;
  previous_start:=(snapshot->>('skill_'||p_skill_number||'_start'))::timestamptz;
  if next_start=previous_start then next_start:=next_start+interval '1 microsecond'; end if;
  goals:=floor(practiced/required_seconds)::bigint;
  remainder:=greatest(0,practiced-goals*required_seconds);
  advances:=participant.level<4 and p_skill_number=participant.level;
  -- One row per goal, including when a save contains multiple complete goals.
  insert into public.practice_completions(player_id,skill_number,completed_at)
    select participant.id,p_skill_number,next_start from generate_series(1::bigint,goals);
  if advances then
    occurrence:=participant.id::text||':'||participant.level::text||':'||coalesce(snapshot->>('skill_'||p_skill_number||'_start'),'none');
    perform public.record_notification_events(jsonb_build_array(jsonb_build_object(
      'notification_id','master_linked.v1','occurrence',occurrence,'action','completed')));
    update public.profiles set years_burned=years_burned+1 where id=owner_id;
    if not found then raise exception 'Profile not found'; end if;
  end if;
  update public.player set
    level=level+case when advances then 1 else 0 end,
    level_2_accepted_at=case when advances and participant.level=1 then null else level_2_accepted_at end,
    level_3_accepted_at=case when advances and participant.level=2 then null else level_3_accepted_at end,
    skill_1_start=case when p_skill_number=1 then next_start else skill_1_start end,
    skill_2_start=case when p_skill_number=2 then next_start else skill_2_start end,
    skill_3_start=case when p_skill_number=3 then next_start else skill_3_start end,
    skill_1_practice=case when p_skill_number=1 then remainder else skill_1_practice end,
    skill_2_practice=case when p_skill_number=2 then remainder else skill_2_practice end,
    skill_3_practice=case when p_skill_number=3 then remainder else skill_3_practice end
    where id=participant.id;
  return jsonb_build_object('completed',true,'completed_occurrence',occurrence);
end;
$$;
revoke all on function private.complete_practice_goal(uuid,integer) from public,anon;
grant execute on function private.complete_practice_goal(uuid,integer) to authenticated;

