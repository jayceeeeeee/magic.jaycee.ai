-- Run as postgres. All fixture changes are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select g.user_id::text from public.game g
  where exists(select 1 from public.player p where p.user_id=g.user_id) limit 1),true);
update public.profiles set permanent_account_at=now(),visibility=false where id=auth.uid();
set local role authenticated;
do $$
declare
  result jsonb;
  skill_id uuid;
  i integer;
  rejected boolean;
  payload jsonb := '[{"label":"Passive"},{"label":"One"},{"label":"Two"},{"label":"Three"},{"label":"Ultimate"}]';
begin
  result:=public.save_own_game(payload);
  if not public.has_named_game_skills(auth.uid()) then raise exception 'FAIL: complete game rejected'; end if;
  update public.profiles set visibility=true where id=auth.uid();
  update public.profiles set visibility=false where id=auth.uid();
  for i in 0..4 loop
    skill_id:=(result->>('skill_'||i))::uuid;
    update public.skills set label='   ' where id=skill_id;
    rejected:=false;
    begin update public.profiles set visibility=true where id=auth.uid();
    exception when check_violation then rejected:=true;
    end;
    if not rejected then raise exception 'FAIL: unnamed slot % allowed publication',i; end if;
    if (select visibility from public.profiles where id=auth.uid()) then raise exception 'FAIL: failed publication changed visibility'; end if;
    update public.skills set label=payload->i->>'label' where id=skill_id;
    execute format('update public.game set skill_%s=null where user_id=$1',i) using auth.uid();
    rejected:=false;
    begin update public.profiles set visibility=true where id=auth.uid();
    exception when check_violation then rejected:=true;
    end;
    if not rejected then raise exception 'FAIL: missing slot % allowed publication',i; end if;
    execute format('update public.game set skill_%s=$1 where user_id=$2',i) using skill_id,auth.uid();
  end loop;
  update public.profiles set visibility=true where id=auth.uid();
  if not public.is_public_master(auth.uid()) then raise exception 'FAIL: restored named game cannot be published'; end if;
  -- Making the account private is always available, including incomplete legacy games.
  update public.skills set label='' where id=(result->>'skill_4')::uuid;
  update public.profiles set visibility=false where id=auth.uid();
end;
$$;
rollback;
select 'PASS: all five names required for publication, missing/blank slots rejected, restored names accepted and making private allowed' as result;
