-- Run as postgres on a migrated TEST database. All fixtures/writes roll back.
begin;
select set_config('test.prayer_owner', gen_random_uuid()::text, true);
select set_config('test.prayer_other', gen_random_uuid()::text, true);
select set_config('test.prayer_master', gen_random_uuid()::text, true);
select set_config('test.prayer_player', gen_random_uuid()::text, true);
select set_config('test.prayer_foreign_player', gen_random_uuid()::text, true);
select set_config('test.prayer_id', gen_random_uuid()::text, true);
select set_config('test.prayer_tree', (
  select jsonb_object_agg(k,jsonb_build_object('title',k,'description','Player words for '||k))::text
  from unnest(array['kether','chokmah','binah','chesed','geburah','tipharet','netzach','hod','yesod']) k
), true);

insert into auth.users(id,created_at) values
  (current_setting('test.prayer_owner')::uuid,now()),
  (current_setting('test.prayer_other')::uuid,now()),
  (current_setting('test.prayer_master')::uuid,now());
insert into public.profiles(id,username,permanent_account_at) values
  (current_setting('test.prayer_owner')::uuid,'prayer-test-'||current_setting('test.prayer_owner'),now()),
  (current_setting('test.prayer_other')::uuid,'prayer-test-'||current_setting('test.prayer_other'),now()),
  (current_setting('test.prayer_master')::uuid,'prayer-test-'||current_setting('test.prayer_master'),now())
on conflict(id) do update set permanent_account_at=now();
update public.profiles set master=current_setting('test.prayer_master')::uuid
where id in (current_setting('test.prayer_owner')::uuid,current_setting('test.prayer_other')::uuid);
insert into public.player(id,user_id,master,level,skill_1_start) values
  (current_setting('test.prayer_player')::uuid,current_setting('test.prayer_owner')::uuid,current_setting('test.prayer_master')::uuid,1,now()),
  (current_setting('test.prayer_foreign_player')::uuid,current_setting('test.prayer_other')::uuid,current_setting('test.prayer_master')::uuid,1,now());

select set_config('request.jwt.claim.sub',current_setting('test.prayer_owner'),true);
set local role authenticated;
do $$
declare t jsonb := current_setting('test.prayer_tree')::jsonb; r jsonb; again jsonb;
begin
  r := public.submit_prayer(current_setting('test.prayer_id')::uuid,current_setting('test.prayer_player')::uuid,t);
  if r->>'process'<>'tree-v1' or r->'tree'<>t or r->>'problem'<>t->'binah'->>'description'
    or r->>'prayer'<>t->'chokmah'->>'description' or r->>'master_id'<>current_setting('test.prayer_master') then
    raise exception 'FAIL: saved tree or legacy projection differs';
  end if;
  again := public.submit_prayer(current_setting('test.prayer_id')::uuid,current_setting('test.prayer_player')::uuid,t);
  if again<>r or (select count(*) from public.prayers where id=current_setting('test.prayer_id')::uuid)<>1 then
    raise exception 'FAIL: retry duplicated or changed the prayer';
  end if;
  if (select skill_1_practice from public.player where id=current_setting('test.prayer_player')::uuid)<>0
    or (select level from public.player where id=current_setting('test.prayer_player')::uuid)<>1 then
    raise exception 'FAIL: prayer granted practice or progression';
  end if;
  begin
    perform public.submit_prayer(current_setting('test.prayer_id')::uuid,current_setting('test.prayer_player')::uuid,
      jsonb_set(t,'{yesod,description}','"Changed after approval"'));
    raise exception 'FAIL: changed retry accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_foreign_player')::uuid,t);
    raise exception 'FAIL: foreign participation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,t-'yesod');
    raise exception 'FAIL: partial prayer accepted';
  exception when invalid_parameter_value then null; end;
  if public.prayer_tree_is_valid(jsonb_set(t,'{yesod,title}','null'))
    or public.prayer_tree_is_valid(t||'{"malkuth":{}}')
    or public.prayer_tree_is_valid(jsonb_set(t,'{kether,title}',to_jsonb(repeat('x',161))))
    or public.prayer_tree_is_valid(jsonb_set(t,'{kether,description}',to_jsonb(repeat('x',12001))))
    or public.prayer_tree_is_valid(jsonb_set(t,'{kether,description}','"   "'))
    or public.prayer_tree_is_valid(jsonb_set(t,'{kether}', '{"title": "A", "extra":"B"}')) then
    raise exception 'FAIL: malformed tree accepted';
  end if;
  begin
    insert into public.prayers(user_id,username,problem,prayer,tree,process,player_id,master_id)
      values(auth.uid(),'Player',t->'binah'->>'description',t->'chokmah'->>'description',t,'tree-v1',
        current_setting('test.prayer_foreign_player')::uuid,current_setting('test.prayer_master')::uuid);
    raise exception 'FAIL: direct foreign attribution accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prayers(user_id,username,problem,prayer,tree,process,player_id,master_id)
      values(auth.uid(),'Player','Mismatch',t->'chokmah'->>'description',t,'tree-v1',
        current_setting('test.prayer_player')::uuid,current_setting('test.prayer_master')::uuid);
    raise exception 'FAIL: mismatched legacy projection accepted';
  exception when check_violation then null; end;
  insert into public.prayers(user_id,username,problem,prayer) values(auth.uid(),'Player','Problem','Prayer');
end;
$$;
reset role;

-- A later Master/level change must not invalidate an identical retry.
update public.profiles set master=null where id=current_setting('test.prayer_owner')::uuid;
set local role authenticated;
do $$ begin
  perform public.submit_prayer(current_setting('test.prayer_id')::uuid,current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
    raise exception 'FAIL: stale active Master accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
update public.profiles set master=current_setting('test.prayer_master')::uuid where id=current_setting('test.prayer_owner')::uuid;
update public.player set level=4 where id=current_setting('test.prayer_player')::uuid;
set local role authenticated;
select public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb)->>'id';
reset role;
update public.profiles set locked=true where id=current_setting('test.prayer_owner')::uuid;
set local role authenticated;
do $$ begin
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
    raise exception 'FAIL: locked account saved';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- Expired access is rejected even before the account's locked flag is updated.
update public.profiles set permanent_account_at=null,locked=false where id=current_setting('test.prayer_owner')::uuid;
update public.player set level=1,skill_1_start=now()-interval '40 days' where id=current_setting('test.prayer_player')::uuid;
set local role authenticated;
do $$ begin
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
    raise exception 'FAIL: expired account saved';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- Another user (including the associated Master) cannot read this private tree.
select set_config('request.jwt.claim.sub',current_setting('test.prayer_master'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.prayers where id=current_setting('test.prayer_id')::uuid) then
    raise exception 'FAIL: Master can read private prayer';
  end if;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
insert into public.prayers(username,problem,prayer) values('Guest','Guest problem','Guest prayer');
do $$ begin
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
    raise exception 'FAIL: anonymous RPC execution accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prayers(username,problem,prayer,tree,process,player_id,master_id)
      values('Guest','Player words for binah','Player words for chokmah',current_setting('test.prayer_tree')::jsonb,'tree-v1',
        current_setting('test.prayer_player')::uuid,current_setting('test.prayer_master')::uuid);
    raise exception 'FAIL: anonymous tree accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'PASS: prayer tree validation, ownership, privacy, active Master, access, idempotence and legacy website' as result;
