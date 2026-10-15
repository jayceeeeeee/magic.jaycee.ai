-- All fixture changes are rolled back; run as postgres.
begin;
select set_config('test.master_owner',(select g.user_id::text from public.game g
  where exists(select 1 from public.player p where p.user_id=g.user_id) limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.master_owner'),true);
update public.player set level=3 where user_id=auth.uid();
update public.profiles set visibility=false,permanent_account_at=null where id=auth.uid();
set local role authenticated;
do $$
declare
  payload jsonb := '[{"label":"Passive"},{"label":"One"},{"label":"Two"},{"label":"Three"},{"label":"Ultimate"}]';
  rejected boolean;
begin
  perform public.save_own_game(payload);
  if public.is_public_master(auth.uid()) then raise exception 'FAIL: private game listed as Master'; end if;
  if (select visibility from public.profiles where id=auth.uid()) then raise exception 'FAIL: saving made profile public'; end if;
  rejected:=false;
  begin update public.profiles set visibility=true where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: browser can change visibility'; end if;
  rejected:=false;
  begin insert into public.profiles(id,visibility) values(auth.uid(),true);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: browser can insert a public profile'; end if;
  rejected:=false;
  begin perform public.save_own_game(payload,true);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: legacy publication bypass'; end if;
  update public.profiles set visibility=visibility where id=auth.uid();
end;
$$;
reset role;
-- An administrator can make a complete game visible.
update public.profiles set visibility=true where id=current_setting('test.master_owner')::uuid;
set local role anon;
do $$ begin
  if not public.is_public_master(current_setting('test.master_owner')::uuid) then raise exception 'FAIL: complete visible game rejected'; end if;
  if not exists(select 1 from public.list_public_masters(1000) where id=current_setting('test.master_owner')::uuid) then
    raise exception 'FAIL: complete Master absent from anonymous discovery';
  end if;
end; $$;
reset role;
do $$
declare
  owner_id uuid := current_setting('test.master_owner')::uuid;
  game_row public.game%rowtype;
  ids uuid[];
  i integer;
  old_label text;
begin
  select * into game_row from public.game where user_id=owner_id;
  ids:=array[game_row.skill_0,game_row.skill_1,game_row.skill_2,game_row.skill_3,game_row.skill_4];
  for i in 0..4 loop
    execute format('update public.game set skill_%s=null where user_id=$1',i) using owner_id;
    if public.is_public_master(owner_id) then raise exception 'FAIL: missing slot % allowed',i; end if;
    execute format('update public.game set skill_%s=$1 where user_id=$2',i) using ids[i+1],owner_id;
    select label into old_label from public.skills where id=ids[i+1];
    update public.skills set label='   ' where id=ids[i+1];
    if public.is_public_master(owner_id) then raise exception 'FAIL: unnamed slot % allowed',i; end if;
    update public.skills set label=old_label where id=ids[i+1];
  end loop;
  if not public.is_public_master(owner_id) then raise exception 'FAIL: restored game not eligible'; end if;
end;
$$;
rollback;
select 'PASS: private saves, managed visibility, legacy API protection, anonymous discovery, all five required slots and nonblank names' as result;
