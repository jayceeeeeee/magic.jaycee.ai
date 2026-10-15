-- Run as postgres against an installation with an existing Level 2 player.
-- All game state and receipt changes are rolled back.
begin;
select set_config('test.level_two_player', (select id::text from public.player where level = 2 limit 1), true);
select set_config('request.jwt.claim.sub', (select user_id::text from public.player
  where id = current_setting('test.level_two_player')::uuid), true);
set local role authenticated;
do $$
declare
  player_id uuid := current_setting('test.level_two_player')::uuid;
  original_owner text := auth.uid()::text;
  result jsonb;
  started text;
  rejected boolean := false;
begin
  if player_id is null then raise exception 'Test requires a Level 2 player'; end if;
  update public.player set level_2_accepted_at = null, skill_2_start = null,
    skill_2_practice = 1000000 where id = player_id;
  result := public.sync_skill_progress(player_id);
  if (result->'player'->>'level')::integer <> 2
    or result->'player'->>'skill_2_start' is not null then
    raise exception 'FAIL: sync started or advanced the unaccepted quest';
  end if;
  begin
    perform public.sync_skill_progress(player_id, 2, 1000001, null);
  exception when others then
    if sqlerrm <> 'Accept the Level 2 quest before starting practice' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: practice allowed before Accept'; end if;
  update public.player set skill_2_practice = 10 where id = player_id;
  result := public.accept_level_two_quest(player_id);
  started := result->'player'->>'skill_2_start';
  if started is null or result->'player'->>'level_2_accepted_at' <> started
    or (result->'player'->>'skill_2_practice')::double precision <> 10 then
    raise exception 'FAIL: acceptance did not start clock or preserve practice';
  end if;
  if not exists (select 1 from public.user_notifications
    where notification_id = 'level_two_prepare.v1' and occurrence = player_id::text || ':2'
      and clicked_at is not null and completed_at is not null) then
    raise exception 'FAIL: preparation receipt not committed with acceptance';
  end if;
  result := public.accept_level_two_quest(player_id);
  if result->'player'->>'skill_2_start' <> started then
    raise exception 'FAIL: retry reset the accepted clock';
  end if;
  result := public.sync_skill_progress(player_id);
  if result->'player'->>'level_2_accepted_at' is null
    or result->'player'->>'skill_2_start' <> started then
    raise exception 'FAIL: acceptance did not survive reload sync';
  end if;
  -- A different account must not be able to start this player's quest.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  rejected := false;
  begin
    perform public.accept_level_two_quest(player_id);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'FAIL: cross-account acceptance allowed'; end if;
  perform set_config('request.jwt.claim.sub', original_owner, true);
  -- Completing Level 1 must unlock Level 2 without starting its quest.
  update public.player set level = 1, level_2_accepted_at = null,
    skill_1_practice = 1000000, skill_1_start = now(), skill_2_start = now()
    where id = player_id;
  result := public.sync_skill_progress(player_id);
  if (result->'player'->>'level')::integer <> 2
    or result->'player'->>'skill_2_start' is not null
    or result->'player'->>'level_2_accepted_at' is not null then
    raise exception 'FAIL: Level 1 completion did not pause the next quest';
  end if;
  -- Other levels keep their automatic quest clock behavior.
  update public.player set level = 3, skill_3_practice = 0, skill_3_start = null where id = player_id;
  result := public.sync_skill_progress(player_id);
  if (result->'player'->>'level')::integer <> 3 or result->'player'->>'skill_3_start' is null then
    raise exception 'FAIL: other level timing changed';
  end if;
end;
$$;
rollback;
select 'PASS: Level 2 acceptance, pending progression, clock persistence, preserved practice, receipts, ownership and other levels' as result;
