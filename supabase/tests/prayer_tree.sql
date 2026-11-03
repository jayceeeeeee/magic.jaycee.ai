-- Run as postgres on a migrated TEST database. All fixtures/writes roll back.
begin;
select set_config('test.prayer_owner', gen_random_uuid()::text, true);
select set_config('test.prayer_other', gen_random_uuid()::text, true);
-- On a migrated Supabase dev database use the existing creator without updating
-- their profile. In isolated PostgreSQL create the canonical fixture if absent.
select set_config('test.prayer_master',coalesce((select id::text from public.profiles where id='89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5'), 'd70b5c69-daae-4a77-9955-4385439ae292'), true);
select set_config('test.prayer_other_master',gen_random_uuid()::text,true);
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
  (current_setting('test.prayer_master')::uuid,now()),
  (current_setting('test.prayer_other_master')::uuid,now()) on conflict(id) do nothing;
insert into public.profiles(id,username,permanent_account_at) values
  (current_setting('test.prayer_owner')::uuid,'prayer-test-'||current_setting('test.prayer_owner'),now()),
  (current_setting('test.prayer_other')::uuid,'prayer-test-'||current_setting('test.prayer_other'),now()),
  (current_setting('test.prayer_master')::uuid,'prayer-test-'||current_setting('test.prayer_master'),now()),
  (current_setting('test.prayer_other_master')::uuid,'prayer-test-'||current_setting('test.prayer_other_master'),now())
on conflict(id) do nothing;
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
  if r->>'process'<>'tree-v1' or r->'tree'<>t or r ? 'problem' or r ? 'prayer' or r->>'master_id'<>current_setting('test.prayer_master') then
    raise exception 'FAIL: saved tree differs or legacy fields leaked';
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
    insert into public.prayers(user_id,username,tree,process,player_id,master_id)
      values(auth.uid(),'Player',t,'tree-v1',
        current_setting('test.prayer_foreign_player')::uuid,current_setting('test.prayer_master')::uuid);
    raise exception 'FAIL: direct foreign attribution accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prayers(user_id,username,tree,process,player_id,master_id)
      values(auth.uid(),'Player',t-'yesod','tree-v1',
        current_setting('test.prayer_player')::uuid,current_setting('test.prayer_master')::uuid);
    raise exception 'FAIL: partial full tree accepted';
  exception when check_violation then null; end;
  insert into public.prayers(user_id,username,tree) values(auth.uid(),'Player',jsonb_build_object('binah',jsonb_build_object('title','Problem','description','Problem'),'chokmah',jsonb_build_object('title','Prayer','description','Prayer')));
end;
$$;
reset role;

-- After changing away from Cedric, own history remains readable but submission
-- (including replay) is unavailable. A same-name impostor grants no access.
update public.profiles set full_name='Cédric JAUBERT' where id=current_setting('test.prayer_other_master')::uuid;
update public.profiles set master=current_setting('test.prayer_other_master')::uuid where id=current_setting('test.prayer_owner')::uuid;
insert into public.player(id,user_id,master,level,skill_1_start)
values(gen_random_uuid(),current_setting('test.prayer_owner')::uuid,current_setting('test.prayer_other_master')::uuid,1,now());
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.prayers where id=current_setting('test.prayer_id')::uuid) then raise exception 'FAIL: own history lost after Master change'; end if;
  begin
    perform public.submit_prayer(current_setting('test.prayer_id')::uuid,current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
    raise exception 'FAIL: restricted skill still available for replay';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prayers(user_id,username,tree,process,player_id,master_id)
      select auth.uid(),'Player',current_setting('test.prayer_tree')::jsonb,'tree-v1',id,master
      from public.player where user_id=auth.uid() and master=current_setting('test.prayer_other_master')::uuid;
    raise exception 'FAIL: another Master accepted a direct tree insert';
  exception when insufficient_privilege then null; end;
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
insert into public.prayers(username,tree) values('Guest',jsonb_build_object('binah',jsonb_build_object('title','Problem','description','Guest problem'),'chokmah',jsonb_build_object('title','Prayer','description','Guest prayer')));
do $$ begin
  begin
    perform public.submit_prayer(gen_random_uuid(),current_setting('test.prayer_player')::uuid,current_setting('test.prayer_tree')::jsonb);
    raise exception 'FAIL: anonymous RPC execution accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prayers(username,tree,process,player_id,master_id)
      values('Guest',current_setting('test.prayer_tree')::jsonb,'tree-v1',
        current_setting('test.prayer_player')::uuid,current_setting('test.prayer_master')::uuid);
    raise exception 'FAIL: anonymous tree accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'PASS: prayer tree validation, ownership, privacy, active Master, access, idempotence and legacy website' as result;
