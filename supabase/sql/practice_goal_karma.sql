-- Every completed practice goal burns one year, independently of progression.
-- Row locking, remainder retention and cycle stamps prevent duplicate rewards.
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
  insert into public.practice_completions(player_id,skill_number,completed_at)
    select participant.id,p_skill_number,next_start from generate_series(1::bigint,goals);
  update public.profiles set years_burned=years_burned+goals where id=owner_id;
  if not found then raise exception 'Profile not found'; end if;
  if advances then
    occurrence:=participant.id::text||':'||participant.level::text||':'||coalesce(snapshot->>('skill_'||p_skill_number||'_start'),'none');
    perform public.record_notification_events(jsonb_build_array(jsonb_build_object(
      'notification_id','master_linked.v1','occurrence',occurrence,'action','completed')));
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
