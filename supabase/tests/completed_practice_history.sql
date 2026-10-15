-- Run as postgres; all fixtures/history/rewards are rolled back.
begin;
select set_config('test.history_player',(select p.id::text from public.player p join public.game g on g.user_id=p.master
  where g.skill_1 is not null and g.skill_2 is not null and g.skill_3 is not null limit 1),true);
select set_config('request.jwt.claim.sub',(select user_id::text from public.player where id=current_setting('test.history_player')::uuid),true);
set local role authenticated;
do $$
declare
  player_id uuid:=current_setting('test.history_player')::uuid;
  owner_id uuid:=auth.uid();
  one_goal double precision:=31556926.08/1826.211;
  three_goal double precision:=31556926.08/1826.211/576;
  one_start timestamptz:=now()-interval '10 minutes';
  two_start timestamptz:=now()-interval '5 minutes';
  three_start timestamptz:=now()-interval '10 seconds';
  next_start timestamptz;
  result jsonb;
  baseline bigint;
  baseline_credit double precision;
  burned integer;
  rejected boolean;
begin
  select count(*) into baseline from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id;
  baseline_credit:=public.get_practice_completion_totals();
  select years_burned into burned from public.profiles where id=owner_id;
  update public.player set level=4,skill_1_start=one_start,skill_2_start=two_start,skill_3_start=three_start,
    skill_1_practice=0,skill_2_practice=0,skill_3_practice=0 where id=player_id;
  result:=public.sync_skill_progress(player_id,3,three_goal*0.4,three_start);
  if (result->>'years_burned')::integer<>burned then raise exception 'FAIL: partial practice burned karma'; end if;
  if (select count(*) from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id)<>baseline then raise exception 'FAIL: partial practice archived'; end if;
  if abs((result->'player'->>'skill_3_practice')::double precision-three_goal*0.4)>0.000001 then raise exception 'FAIL: partial practice lost'; end if;
  update public.player set skill_3_start=now()-interval '2 hours' where id=player_id;
  result:=public.sync_skill_progress(player_id);
  three_start:=(result->'player'->>'skill_3_start')::timestamptz;
  if three_start is distinct from now() or (select count(*) from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id)<>baseline
    or abs((result->'player'->>'skill_3_practice')::double precision-three_goal*0.4)>0.000001 then
    raise exception 'FAIL: natural expiry archived or reset partial practice';
  end if;
  result:=public.sync_skill_progress(player_id,3,three_goal+2,three_start);
  if (result->>'years_burned')::integer<>burned+1 then raise exception 'FAIL: complete goal did not burn one year'; end if;
  next_start:=(result->'player'->>'skill_3_start')::timestamptz;
  if next_start=three_start or (result->'player'->>'skill_1_start')::timestamptz is distinct from one_start
    or (result->'player'->>'skill_2_start')::timestamptz is distinct from two_start
    or abs((result->'player'->>'skill_3_practice')::double precision-2)>0.000001 then
    raise exception 'FAIL: completion did not reset only its own clock/counter or lost excess practice';
  end if;
  if (select count(*) from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id)<>baseline+1
    or not exists(select 1 from public.practice_completions pc where pc.player_id=current_setting('test.history_player')::uuid and skill_number=3
      and completed_at=next_start) then
    raise exception 'FAIL: full goal not recorded';
  end if;
  result:=public.sync_skill_progress(player_id,3,three_goal+2,three_start);
  if (result->>'years_burned')::integer<>burned+1 then raise exception 'FAIL: retry duplicated karma reward'; end if;
  if (select count(*) from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id)<>baseline+1 then raise exception 'FAIL: retry duplicated history'; end if;
  result:=public.sync_skill_progress(player_id,3,2*three_goal+2,next_start);
  if (select count(*) from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id)<>baseline+3
    or abs(public.get_practice_completion_totals()-baseline_credit-10800)>0.000001 then
    raise exception 'FAIL: accumulated complete goals or credits incorrect';
  end if;
  if (result->'player'->>'level')::integer<>4 or (result->>'years_burned')::integer<>burned+3 then raise exception 'FAIL: Level 4 goals changed level or did not each burn a year'; end if;
  -- Current quest completion advances one level but preserves every other start/counter.
  update public.player set level=1,skill_1_start=one_start,skill_1_practice=0,skill_2_practice=4 where id=player_id;
  three_start:=(result->'player'->>'skill_3_start')::timestamptz;
  result:=public.sync_skill_progress(player_id,1,one_goal*2+2,one_start);
  if (result->>'years_burned')::integer<>burned+5 then raise exception 'FAIL: progression goals did not each burn one year'; end if;
  if (result->'player'->>'level')::integer<>2
    or (result->'player'->>'skill_2_start')::timestamptz is distinct from two_start
    or (result->'player'->>'skill_3_start')::timestamptz is distinct from three_start
    or (result->'player'->>'skill_2_practice')::double precision<>4 then
    raise exception 'FAIL: level progression changed another skill';
  end if;
  -- Completing an earlier skill during a pending quest archives without advancing it.
  update public.player set level=3,level_3_accepted_at=null,skill_3_practice=0 where id=player_id;
  one_start:=(result->'player'->>'skill_1_start')::timestamptz;
  burned:=(result->>'years_burned')::integer;
  result:=public.sync_skill_progress(player_id,1,one_goal,one_start);
  if (result->'player'->>'level')::integer<>3 or (result->>'years_burned')::integer<>burned+1
    or (result->'player'->>'skill_2_start')::timestamptz is distinct from two_start
    or (result->'player'->>'skill_3_start')::timestamptz is distinct from three_start
    or not (result->'completed_skills' @> '[1]'::jsonb) then
    raise exception 'FAIL: earlier completed skill advanced the pending quest or changed other clocks';
  end if;
  update public.player set level_3_accepted_at=now() where id=player_id;
  one_start:=(result->'player'->>'skill_1_start')::timestamptz;
  result:=public.sync_skill_progress(player_id,3,three_goal,three_start);
  if (result->>'years_burned')::integer<>burned+2 then raise exception 'FAIL: Level 3 goal did not burn exactly one year'; end if;
  if (result->'player'->>'level')::integer<>4
    or (result->'player'->>'skill_1_start')::timestamptz is distinct from one_start
    or (result->'player'->>'skill_2_start')::timestamptz is distinct from two_start then
    raise exception 'FAIL: Level 3 completion reset other clocks';
  end if;
  result:=public.sync_skill_progress(player_id,2,one_goal/24,two_start);
  if (result->>'years_burned')::integer<>burned+3 or (result->'player'->>'level')::integer<>4 then
    raise exception 'FAIL: Skill 2 goal did not burn one year at Level 4';
  end if;
  result:=public.sync_skill_progress(player_id,2,one_goal/24,two_start);
  if (result->>'years_burned')::integer<>burned+3 then raise exception 'FAIL: Skill 2 retry duplicated karma'; end if;
  rejected:=false;
  begin insert into public.practice_completions(player_id) values(player_id);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: browser can fabricate history rows'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  if exists(select 1 from public.practice_completions h join public.player p on p.id=h.player_id where p.user_id=owner_id) then raise exception 'FAIL: history leaked across users'; end if;
  rejected:=false;
  begin perform private.complete_practice_goal(player_id,1);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: another user completed this player goal'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
end;
$$;
rollback;
select 'PASS: partial practice, natural rollover, completed-only history, per-skill resets, remainder, retries, multi-goal credits, progression and owner-only history' as result;
