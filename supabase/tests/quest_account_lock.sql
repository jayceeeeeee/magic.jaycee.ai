-- One focused transaction; player/profile/Auth changes are all rolled back.
begin;
select set_config('test.lock_player',(select p.id::text from public.player p
  join public.profiles f on f.id=p.user_id and f.master=p.master
  join public.game g on g.user_id=p.master where g.skill_3 is not null limit 1),true);
select set_config('request.jwt.claim.sub',(select user_id::text from public.player
  where id=current_setting('test.lock_player')::uuid),true);
update public.profiles set locked=false,permanent_account_at=null where id=auth.uid();
update public.player set level=2,level_2_accepted_at=null,skill_2_start=now()-interval '2 days',
  skill_1_start=now(),skill_3_start=now(),skill_1_practice=0,skill_2_practice=0,skill_3_practice=4
  where id=current_setting('test.lock_player')::uuid;
set local role authenticated;
do $$
declare result jsonb; rejected boolean:=false;
begin
  result:=public.check_account_access();
  if (result->>'locked')::boolean
    or (result->>'deadline')::timestamptz is distinct from now()+interval '2551442.803 seconds' then
    raise exception 'FAIL: pending Level 2 did not use the first skill deadline';
  end if;
  update public.player set level=3,level_3_accepted_at=now(),skill_3_start=now(),skill_1_start=now()-interval '40 days'
    where id=current_setting('test.lock_player')::uuid;
  if (public.check_account_access()->>'locked')::boolean then raise exception 'FAIL: older skill expired the current quest'; end if;
  update public.player set level=4,skill_3_start=now()-interval '2 hours' where id=current_setting('test.lock_player')::uuid;
  result:=public.sync_skill_progress(current_setting('test.lock_player')::uuid);
  if coalesce((result->>'account_locked')::boolean,false) or (result->'player'->>'skill_3_practice')::double precision<>4 then
    raise exception 'FAIL: Level 4 locked or lost practice';
  end if;
  begin update public.profiles set locked=true where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: browser can change managed locking'; end if;
end;
$$;
reset role;
update public.profiles set permanent_account_at=null where id=auth.uid();
update public.player set level=3,level_3_accepted_at=now(),skill_3_start=now()-interval '2 hours',
  skill_1_start=now(),skill_2_start=now() where id=current_setting('test.lock_player')::uuid;
set local role authenticated;
do $$
declare result jsonb; changed integer;
begin
  result:=public.sync_skill_progress(current_setting('test.lock_player')::uuid,3,1000000,now()-interval '2 hours');
  if not (result->>'account_locked')::boolean then raise exception 'FAIL: expired quest accepted late practice'; end if;
  update public.profiles set locked=false where id=auth.uid();
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'FAIL: browser unlocked itself'; end if;
  if exists(select 1 from public.player) then raise exception 'FAIL: stale token still has private game access'; end if;
end;
$$;
reset role;
do $$
begin
  if not (select locked from public.profiles where id=auth.uid())
    or not (select banned_until>now() from auth.users where id=auth.uid())
    or exists(select 1 from auth.sessions where user_id=auth.uid()) then
    raise exception 'FAIL: persistent lock, Auth ban or session revocation missing';
  end if;
  if (select skill_3_start from public.player where id=current_setting('test.lock_player')::uuid) is distinct from now()-interval '2 hours'
    or (select skill_3_practice from public.player where id=current_setting('test.lock_player')::uuid)<>4 then
    raise exception 'FAIL: expiry reset clock or changed practice';
  end if;
end;
$$;
update public.profiles set locked=false where id=auth.uid();
do $$
begin
  if (select banned_until from auth.users where id=auth.uid()) is not null
    or (select skill_3_start from public.player where id=current_setting('test.lock_player')::uuid)<now()
    or (select skill_3_practice from public.player where id=current_setting('test.lock_player')::uuid)<>4
    or (select skill_1_start from public.player where id=current_setting('test.lock_player')::uuid) is distinct from now() then
    raise exception 'FAIL: admin unlock did not restore Auth and only restart the current quest';
  end if;
end;
$$;
update public.player set skill_3_start=now()-interval '2 hours' where id=current_setting('test.lock_player')::uuid;
select private.lock_expired_quest_accounts();
do $$ begin
  if not (select locked from public.profiles where id=auth.uid()) then raise exception 'FAIL: background enforcement did not lock'; end if;
end; $$;
-- Pending Level 3 uses Skill 2, including automatic locking and admin recovery.
update public.profiles set locked=false where id=auth.uid();
update public.player set level=3,level_3_accepted_at=null,skill_2_start=now()-interval '2 days'
  where id=current_setting('test.lock_player')::uuid;
set local role authenticated;
do $$ begin
  if not (public.check_account_access()->>'locked')::boolean then
    raise exception 'FAIL: pending Level 3 ignored expired Skill 2';
  end if;
end; $$;
reset role;
update public.profiles set locked=false where id=auth.uid();
do $$ begin
  if (select skill_2_start from public.player where id=current_setting('test.lock_player')::uuid)<now()
    or (public.check_account_access()->>'locked')::boolean then
    raise exception 'FAIL: admin unlock did not restart the previous skill for a pending quest';
  end if;
end; $$;
-- Pending Level 2 also expires offline from Skill 1.
update public.player set level=2,level_2_accepted_at=null,skill_1_start=now()-interval '40 days'
  where id=current_setting('test.lock_player')::uuid;
select private.lock_expired_quest_accounts();
do $$ begin
  if not (select locked from public.profiles where id=auth.uid()) then
    raise exception 'FAIL: pending Level 2 ignored expired Skill 1';
  end if;
end; $$;
rollback;
select 'PASS: previous-skill deadlines while pending, accepted/permanent quests, late practice blocked, persistent lock/Auth ban, stale-token denial, admin unlock and background enforcement' as result;
