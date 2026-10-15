-- Real-role integration checks; all fixture changes are rolled back.
-- Requires an existing player with a Master's first two active skills and another game owner.
begin;
select set_config('test.quest_player',(select p.id::text from public.player p join public.game g
  on g.user_id=p.master where g.skill_1 is not null and g.skill_2 is not null limit 1),true);
select set_config('request.jwt.claim.sub',(select user_id::text from public.player
  where id=current_setting('test.quest_player')::uuid),true);
select set_config('test.alternative_master',(select g.user_id::text from public.game g
  join public.profiles pr on pr.id=g.user_id where g.user_id<>auth.uid()
  and g.user_id<>(select master from public.player where id=current_setting('test.quest_player')::uuid)
  limit 1),true);
-- Make the alternative game playable only inside the rollback fixture.
update public.profiles set visibility=true where id=current_setting('test.alternative_master')::uuid;
update public.game g set skill_0=t.skill_0,skill_1=t.skill_1,skill_2=t.skill_2,skill_3=t.skill_3,skill_4=t.skill_4
  from public.game t where t.user_id=(select master from public.player where id=current_setting('test.quest_player')::uuid)
  and g.user_id=current_setting('test.alternative_master')::uuid;
set local role authenticated;
do $$
declare
  player_id uuid := current_setting('test.quest_player')::uuid;
  alternative uuid := current_setting('test.alternative_master')::uuid;
  owner_id uuid := auth.uid();
  result jsonb;
  game_result jsonb;
  accepted_clock text;
  skill_id uuid;
  original_master uuid;
  affected integer;
  rejected boolean;
  was_visible boolean;
  payload jsonb := '[{"label":"Test passive","description":"Resources"},{"label":"Test one","description":"[Link](https://example.com)"},{"label":"Test two","description":"Two"},{"label":"Test three","description":"Three"},{"label":"Test ultimate","description":"Ultimate"}]';
begin
  if player_id is null or alternative is null then raise exception 'Test fixture needs a player and an alternative game'; end if;
  select master into original_master from public.player where id=player_id;
  update public.player set level=2,level_2_accepted_at=now(),skill_2_practice=1000000,
    skill_2_start=now(),level_3_accepted_at=null where id=player_id;
  result := public.sync_skill_progress(player_id);
  if (result->'player'->>'level')::integer<>3 or result->'player'->>'skill_3_start' is not null then
    raise exception 'FAIL: Level 2 completion did not pause Level 3';
  end if;
  update public.player set skill_3_practice=1000000 where id=player_id;
  result := public.sync_skill_progress(player_id);
  if (result->'player'->>'level')::integer<>3 or result->'player'->>'skill_3_start' is not null then
    raise exception 'FAIL: pending Level 3 advanced or started';
  end if;
  rejected := false;
  begin perform public.sync_skill_progress(player_id,3,1000001,null);
  exception when others then
    if sqlerrm<>'Accept the Level 3 quest before starting practice' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: Level 3 practice allowed before Accept'; end if;
  update public.player set skill_3_practice=1 where id=player_id;
  result := public.accept_player_quest(player_id,3);
  accepted_clock := result->'player'->>'skill_3_start';
  if accepted_clock is null or result->'player'->>'level_3_accepted_at' is distinct from accepted_clock
    or (result->'player'->>'skill_3_practice')::double precision<>1 then
    raise exception 'FAIL: Level 3 acceptance lost practice or clock';
  end if;
  result := public.accept_player_quest(player_id,3);
  if result->'player'->>'skill_3_start' is distinct from accepted_clock then raise exception 'FAIL: retry reset clock'; end if;
  result := public.sync_skill_progress(player_id);
  if result->'player'->>'level_3_accepted_at' is null then raise exception 'FAIL: acceptance lost on reload'; end if;
  if not exists(select 1 from public.user_notifications where notification_id='level_three_prepare.v1'
    and occurrence=player_id::text||':3' and clicked_at is not null and completed_at is not null) then
    raise exception 'FAIL: missing acceptance receipt';
  end if;
  rejected:=false;
  begin perform public.switch_player_master(alternative);
  exception when others then
    if sqlerrm<>'You can change Master only before accepting a Level 2 or Level 3 quest' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: Master switch allowed during active quest'; end if;
  -- Authors edit only their own skills; repeated saves keep IDs stable.
  select visibility into was_visible from public.profiles where id=owner_id;
  game_result := public.save_own_game(payload);
  skill_id := (game_result->>'skill_1')::uuid;
  if not exists(select 1 from public.skills where id=skill_id and user_id=owner_id and label='Test one') then
    raise exception 'FAIL: owned skills not saved';
  end if;
  payload := jsonb_set(payload,'{1,label}','"Edited test one"');
  game_result := public.save_own_game(payload);
  if (game_result->>'skill_1')::uuid<>skill_id then raise exception 'FAIL: repeated save replaced an owned skill ID'; end if;
  if (select visibility from public.profiles where id=owner_id) is distinct from was_visible then
    raise exception 'FAIL: saving changed profile visibility';
  end if;
  update public.skills set label='FORBIDDEN' where user_id<>owner_id;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: editing other Master skills allowed'; end if;
  rejected:=false;
  begin insert into public.skills(user_id,label) values(alternative,'FORBIDDEN');
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: assigning skills to another user allowed'; end if;
  rejected:=false;
  begin perform public.save_own_game(payload,true);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: user could publish via legacy argument'; end if;
  rejected:=false;
  begin update public.profiles set visibility=not was_visible where id=owner_id;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: direct visibility update allowed'; end if;
  -- Simulate a player below Level 3, including direct RPC attempts.
  update public.player set level=1 where user_id=owner_id;
  rejected:=false;
  begin perform public.save_own_game(payload);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: game authoring allowed below Level 3'; end if;
  update public.player set level=3,level_3_accepted_at=null,skill_3_start=null where id=player_id;
  result := public.switch_player_master(alternative);
  if (result->>'master')::uuid<>alternative then raise exception 'FAIL: Master link not switched'; end if;
  if not exists(select 1 from public.player where id=player_id and level=3)
    or not exists(select 1 from public.profiles where id=owner_id and master=alternative) then
    raise exception 'FAIL: switching lost previous progress or profile link';
  end if;
  if not public.can_author_game() then raise exception 'FAIL: switching removed earned authoring access'; end if;
  -- Cross-account acceptance is forbidden.
  perform set_config('request.jwt.claim.sub',alternative::text,true);
  rejected:=false;
  begin perform public.accept_player_quest(player_id,3);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: cross-account acceptance allowed'; end if;
end;
$$;
rollback;
select 'PASS: Level 3 lifecycle, retries, preserved progress, game save/edit, managed visibility, ownership, level gate and Master switching' as result;
