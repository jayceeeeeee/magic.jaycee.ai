-- Run as postgres. All fixture changes are rolled back.
begin;
select set_config('test.level_four_player',(select p.id::text from public.player p join public.game g
  on g.user_id=p.master where g.skill_3 is not null limit 1),true);
select set_config('request.jwt.claim.sub',(select user_id::text from public.player
  where id=current_setting('test.level_four_player')::uuid),true);
update public.profiles set permanent_account_at=null,visibility=false where id=auth.uid();
set local role authenticated;
do $$
declare
  player_id uuid := current_setting('test.level_four_player')::uuid;
  result jsonb;
  permanent_time timestamptz;
  reward integer;
  rejected boolean;
  alternative uuid;
  payload jsonb := '[{"label":"Passive"},{"label":"One"},{"label":"Two"},{"label":"Three"},{"label":"Ultimate","description":"Passive ultimate description"}]';
begin
  if player_id is null then raise exception 'Test requires a player with the third active skill'; end if;
  update public.player set level=3,level_3_accepted_at=now(),skill_3_start=now(),skill_3_practice=0 where id=player_id;
  -- Complete the game first so this check isolates the Level 4 visibility gate.
  perform public.save_own_game(payload);
  rejected:=false;
  begin update public.profiles set visibility=true where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: visibility allowed before Level 4'; end if;
  rejected:=false;
  begin update public.profiles set permanent_account_at=now() where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: permanent status forged before Level 4'; end if;
  update public.player set skill_3_practice=1000000 where id=player_id;
  result:=public.sync_skill_progress(player_id);
  if (result->'player'->>'level')::integer<>4 then raise exception 'FAIL: Level 3 did not unlock Level 4'; end if;
  select permanent_account_at,years_burned into permanent_time,reward from public.profiles where id=auth.uid();
  if permanent_time is null then raise exception 'FAIL: permanent status not granted automatically'; end if;
  if not exists(select 1 from public.user_notifications where user_id=auth.uid() and notification_id='master_linked.v1'
    and split_part(occurrence,':',1)=player_id::text and split_part(occurrence,':',2)='3' and completed_at is not null) then
    raise exception 'FAIL: Level 3 quest was not completed';
  end if;
  -- Optional practice saves and cycle clocks initialize, without another level/reward.
  update public.player set skill_1_start=null,skill_2_start=null,skill_3_start=null where id=player_id;
  result:=public.sync_skill_progress(player_id,3,1000000,null);
  if (result->'player'->>'level')::integer<>4 or result->'player'->>'skill_3_start' is null then
    raise exception 'FAIL: Level 4 advanced or failed to initialize the skill cycle';
  end if;
  if (select years_burned from public.profiles where id=auth.uid())<>reward then raise exception 'FAIL: Level 4 granted repeated rewards'; end if;
  if (select permanent_account_at from public.profiles where id=auth.uid()) is distinct from permanent_time then
    raise exception 'FAIL: reload changed the permanent milestone';
  end if;
  perform public.save_own_game(payload);
  update public.profiles set visibility=true where id=auth.uid();
  if not public.is_public_master(auth.uid()) then raise exception 'FAIL: complete visible Level 4 game is not discoverable'; end if;
  update public.profiles set visibility=false where id=auth.uid();
  if public.is_public_master(auth.uid()) then raise exception 'FAIL: making account private failed'; end if;
  select id into alternative from public.profiles where id<>auth.uid()
    and id<>(select master from public.profiles where id=auth.uid()) limit 1;
  rejected:=false;
  begin update public.profiles set master=alternative where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: direct permanent Master change allowed'; end if;
  rejected:=false;
  begin perform public.switch_player_master(alternative);
  exception when others then
    if sqlerrm<>'You can change Master only before accepting a Level 2 or Level 3 quest' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: Master switch RPC allowed at Level 4'; end if;
  rejected:=false;
  begin update public.profiles set permanent_account_at=null where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: browser cleared permanent status'; end if;
  -- The account milestone survives changes to participation rows.
  delete from public.player where user_id=auth.uid();
  if not public.can_author_game() then raise exception 'FAIL: permanent account lost authoring access'; end if;
  update public.profiles set visibility=true where id=auth.uid();
end;
$$;
rollback;
select 'PASS: automatic Level 4, permanent milestone/link, no extra quest/rewards, visibility gate and persisted account access' as result;
