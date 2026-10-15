-- Repeatable skill-clock checks. Run as postgres; all fixture changes are rolled back.
begin;
select set_config('test.cycle_player',(select id::text from public.player limit 1),true);
select set_config('request.jwt.claim.sub',(select user_id::text from public.player
  where id=current_setting('test.cycle_player')::uuid),true);
set local role authenticated;
do $$
declare
  player_id uuid:=current_setting('test.cycle_player')::uuid;
  result jsonb;
  previous_one timestamptz:=now()-interval '10 minutes';
  expired_one timestamptz:=now()-interval '40 days';
  burned integer;
  milestone timestamptz;
begin
  update public.player set level=4,skill_1_start=previous_one,
    skill_2_start=now()-interval '2 days',skill_3_start=now()-interval '2 hours',
    skill_1_practice=7,skill_2_practice=11,skill_3_practice=13 where id=player_id;
  select years_burned into burned from public.profiles where id=auth.uid();
  result:=public.sync_skill_progress(player_id);
  if (result->'player'->>'skill_1_start')::timestamptz is distinct from previous_one
    or (result->'player'->>'skill_2_start')::timestamptz is distinct from now()
    or (result->'player'->>'skill_3_start')::timestamptz is distinct from now() then
    raise exception 'FAIL: only expired clocks should reset to the current timestamp';
  end if;
  if (result->'player'->>'skill_1_practice')::double precision<>7
    or (result->'player'->>'skill_2_practice')::double precision<>11
    or (result->'player'->>'skill_3_practice')::double precision<>13
    or (result->'player'->>'level')::integer<>4
    or (result->>'years_burned')::integer<>burned then
    raise exception 'FAIL: clock renewal changed practice, level or rewards';
  end if;
  select permanent_account_at into milestone from public.profiles where id=auth.uid();
  result:=public.sync_skill_progress(player_id);
  if (result->'player'->>'skill_1_start')::timestamptz is distinct from previous_one then
    raise exception 'FAIL: repeated sync renewed a live clock';
  end if;
  -- Save practice against the old clock, then renew it in the same transaction.
  update public.player set skill_1_start=expired_one where id=player_id;
  result:=public.sync_skill_progress(player_id,1,8,expired_one);
  if (result->'player'->>'skill_1_start')::timestamptz is distinct from now()
    or (result->'player'->>'skill_1_practice')::double precision<>8
    or (result->'player'->>'skill_2_practice')::double precision<>11 then
    raise exception 'FAIL: saving practice with rollover lost progress or changed another skill';
  end if;
  result:=public.sync_skill_progress(player_id,1,9,expired_one);
  if (result->'player'->>'skill_1_practice')::double precision<>8 then
    raise exception 'FAIL: stale saves from an old cycle must not overwrite the renewed cycle';
  end if;
  if (select permanent_account_at from public.profiles where id=auth.uid()) is distinct from milestone then
    raise exception 'FAIL: cycle renewal changed permanent status';
  end if;
  update public.player set level=3,level_3_accepted_at=now(),skill_3_start=now()-interval '2 hours',skill_3_practice=0 where id=player_id;
  result:=public.sync_skill_progress(player_id);
  if (result->'player'->>'skill_3_start')::timestamptz is distinct from now()-interval '2 hours' then
    raise exception 'FAIL: pre-Level 4 quest clocks must not automatically renew';
  end if;
end;
$$;
rollback;
select 'PASS: expired Level 4 clocks restart now, unexpired clocks/practice/rewards/milestones stay unchanged, stale writes protected and earlier quests unchanged' as result;
