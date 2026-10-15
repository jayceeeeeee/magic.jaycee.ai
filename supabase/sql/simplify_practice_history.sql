-- Upgrade the initial history table to four columns, one row per completed goal.
-- Expand any earlier multi-goal rows before removing the redundant fields.
insert into public.practice_completions(user_id,player_id,master_id,skill_id,skill_number,
  skill_label,cycle_started_at,completed_at,goals_completed,goal_seconds,practice_seconds,passive_seconds)
select h.user_id,h.player_id,h.master_id,h.skill_id,h.skill_number,
  h.skill_label,h.cycle_started_at+n*interval '1 microsecond',h.completed_at,1,
  h.goal_seconds,h.goal_seconds,h.passive_seconds/h.goals_completed
from public.practice_completions h cross join lateral generate_series(1::bigint,h.goals_completed-1) n;
drop policy "Read own completed practice" on public.practice_completions;
alter table public.practice_completions
  drop constraint practice_completions_player_id_fkey,
  alter column player_id set not null,
  add foreign key(player_id) references public.player(id) on delete cascade,
  drop column user_id,
  drop column master_id,
  drop column skill_id,
  drop column skill_label,
  drop column cycle_started_at,
  drop column goals_completed,
  drop column goal_seconds,
  drop column practice_seconds,
  drop column passive_seconds;
create policy "Read own completed practice" on public.practice_completions for select to authenticated
  using(player_id in (select id from public.player where user_id=(select auth.uid())));

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

create or replace function public.get_practice_completion_totals()
returns double precision language sql stable security invoker set search_path='' as $$
  select coalesce(sum(case h.skill_number when 1 then 2551442.803
    when 2 then 86400 else 3600 end),0)::double precision
    from public.practice_completions h join public.player p on p.id=h.player_id
    where p.user_id=(select auth.uid());
$$;
revoke all on function public.get_practice_completion_totals() from public,anon;
grant execute on function public.get_practice_completion_totals() to authenticated;

