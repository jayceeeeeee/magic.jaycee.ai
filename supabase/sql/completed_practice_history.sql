-- One row per completed goal. Partial practice remains on player.
create table public.practice_completions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player(id) on delete cascade,
  skill_number smallint not null check(skill_number between 1 and 3),
  completed_at timestamptz not null default clock_timestamp()
);
create index practice_completions_player_idx on public.practice_completions(player_id);
alter table public.practice_completions enable row level security;
revoke all on public.practice_completions from anon,authenticated;
grant select on public.practice_completions to authenticated;
create policy "Read own completed practice" on public.practice_completions for select to authenticated
  using(player_id in (select id from public.player where user_id=(select auth.uid())));

-- The invoker RPC uses this narrow, non-exposed helper for append-only history.
-- Every call checks ownership and locks the row; callers cannot supply rewards/durations.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
create function private.complete_practice_goal(p_player_id uuid,p_skill_number integer)
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

create function public.get_practice_completion_totals()
returns double precision language sql stable security invoker set search_path='' as $$
  select coalesce(sum(case h.skill_number when 1 then 2551442.803
    when 2 then 86400 else 3600 end),0)::double precision
    from public.practice_completions h join public.player p on p.id=h.player_id
    where p.user_id=(select auth.uid());
$$;
revoke all on function public.get_practice_completion_totals() from public,anon;
grant execute on function public.get_practice_completion_totals() to authenticated;

create or replace function public.sync_skill_progress(
  p_player_id uuid,p_skill_number integer default null,
  p_practice_seconds double precision default null,p_started_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  participant public.player%rowtype;
  snapshot jsonb;
  quest integer;
  skill_number integer;
  burned integer;
  pending boolean;
  completion jsonb;
  completed text:=null;
  completed_skills integer[]:=array[]::integer[];
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into participant from public.player where id=p_player_id and user_id=owner_id for update;
  if not found then raise exception 'Player not found' using errcode='42501'; end if;
  snapshot:=to_jsonb(participant);
  quest:=least(3,greatest(1,participant.level));
  pending:=participant.level in (2,3) and snapshot->>('level_'||participant.level||'_accepted_at') is null;
  if snapshot->>('skill_'||quest||'_start') is null and not pending and participant.level<4 then
    update public.player set
      skill_1_start=case when quest=1 then now() else skill_1_start end,
      skill_2_start=case when quest=2 then now() else skill_2_start end,
      skill_3_start=case when quest=3 then now() else skill_3_start end
      where id=participant.id returning * into participant;
    snapshot:=to_jsonb(participant);
  end if;
  if p_practice_seconds is not null then
    if p_skill_number is null or p_skill_number not between 1 and quest
      or not(p_practice_seconds>=0 and p_practice_seconds<'Infinity'::double precision) then
      raise exception 'Invalid practice time';
    end if;
    if p_skill_number=quest and pending then raise exception 'Accept the Level % quest before starting practice',participant.level; end if;
    if p_started_at is not distinct from (snapshot->>('skill_'||p_skill_number||'_start'))::timestamptz then
      update public.player set
        skill_1_practice=case when p_skill_number=1 then greatest(coalesce(skill_1_practice,0),p_practice_seconds) else skill_1_practice end,
        skill_2_practice=case when p_skill_number=2 then greatest(coalesce(skill_2_practice,0),p_practice_seconds) else skill_2_practice end,
        skill_3_practice=case when p_skill_number=3 then greatest(coalesce(skill_3_practice,0),p_practice_seconds) else skill_3_practice end
        where id=participant.id returning * into participant;
    end if;
  end if;
  for skill_number in 1..quest loop
    completion:=private.complete_practice_goal(participant.id,skill_number);
    if (completion->>'completed')::boolean then
      completed_skills:=array_append(completed_skills,skill_number);
      completed:=coalesce(completion->>'completed_occurrence',completed);
    end if;
  end loop;
  select * into participant from public.player where id=p_player_id and user_id=owner_id;
  if participant.level>=4 then
    update public.player set
      skill_1_start=case when skill_1_start is null or skill_1_start+interval '2551442.803 seconds'<=now() then now() else skill_1_start end,
      skill_2_start=case when skill_2_start is null or skill_2_start+interval '86400 seconds'<=now() then now() else skill_2_start end,
      skill_3_start=case when skill_3_start is null or skill_3_start+interval '3600 seconds'<=now() then now() else skill_3_start end
      where id=participant.id and (
        skill_1_start is null or skill_1_start+interval '2551442.803 seconds'<=now()
        or skill_2_start is null or skill_2_start+interval '86400 seconds'<=now()
        or skill_3_start is null or skill_3_start+interval '3600 seconds'<=now()
      );
    select * into participant from public.player where id=p_player_id and user_id=owner_id;
    update public.profiles set permanent_account_at=coalesce(permanent_account_at,now())
      where id=owner_id and master=participant.master and permanent_account_at is null;
  end if;
  update public.user_notifications as receipt set completed_at=now()
    where receipt.user_id=owner_id and notification_id='master_linked.v1' and completed_at is null
      and split_part(receipt.occurrence,':',1)=participant.id::text
      and split_part(receipt.occurrence,':',2)~'^[0-9]+$'
      and split_part(receipt.occurrence,':',2)::integer<participant.level;
  select years_burned into burned from public.profiles where id=owner_id;
  return jsonb_build_object('player',to_jsonb(participant),'years_burned',burned,
    'completed_occurrence',completed,'completed_skills',to_jsonb(completed_skills),
    'completed_passive_seconds',public.get_practice_completion_totals());
end;
$$;
