-- Isolated accounts; all profile/Auth changes are rolled back.
begin;
select set_config('test.selection_user',gen_random_uuid()::text,true);
insert into auth.users(id,created_at)
  values(current_setting('test.selection_user')::uuid,now());
insert into public.profiles(id,username)
  values(current_setting('test.selection_user')::uuid,'deadline-'||current_setting('test.selection_user'));
select set_config('request.jwt.claim.sub',current_setting('test.selection_user'),true);

set local role authenticated;
do $$
declare result jsonb; rejected boolean:=false;
begin
  result:=public.check_account_access();
  if (result->>'locked')::boolean or (result->>'deadline')::timestamptz
    is distinct from now()+interval '2551442.803 seconds' then
    raise exception 'FAIL: initial selection is not timed from account creation';
  end if;
  begin update public.profiles set master_selection_started_at=now()+interval '1 year' where id=auth.uid();
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: browser extended its own deadline'; end if;
end;
$$;
reset role;
-- Old accounts at a later stage, public Masters, permanent accounts and admins
-- must not acquire an initial-selection deadline.
update auth.users set created_at=now()-interval '40 days' where id=auth.uid();
update public.profiles set role='admin' where id=auth.uid();
do $$ begin
  if private.quest_deadline(auth.uid()) is not null then raise exception 'FAIL: admin timed'; end if;
end; $$;
update public.profiles set role='user',visibility=true where id=auth.uid();
do $$ begin
  if private.quest_deadline(auth.uid()) is not null then raise exception 'FAIL: public Master timed'; end if;
end; $$;
update public.profiles set visibility=false,permanent_account_at=now() where id=auth.uid();
do $$ begin
  if private.quest_deadline(auth.uid()) is not null then raise exception 'FAIL: permanent account timed'; end if;
end; $$;
update public.profiles set permanent_account_at=null where id=auth.uid();
insert into public.player(user_id,master,level,skill_1_start)
  select auth.uid(),id,1,now() from public.profiles where role='admin' and id<>auth.uid() limit 1;
do $$ begin
  if not exists(select 1 from public.player where user_id=auth.uid()) then
    raise exception 'Test fixture needs an existing admin profile';
  end if;
  if private.quest_deadline(auth.uid()) is not null then
    raise exception 'FAIL: previous participation acquired an initial-selection deadline';
  end if;
end; $$;
update public.profiles set master=(select master from public.player where user_id=auth.uid()) where id=auth.uid();
do $$ begin
  if private.quest_deadline(auth.uid()) is distinct from now()+interval '2551442.803 seconds' then
    raise exception 'FAIL: linked game did not replace account-creation deadline';
  end if;
end; $$;
update public.profiles set master=null where id=auth.uid();
delete from public.player where user_id=auth.uid();

-- A reconnect locks the expired account and revokes Auth access.
set local role authenticated;
do $$ begin
  if not (public.check_account_access()->>'locked')::boolean then
    raise exception 'FAIL: expired first selection allowed at reconnect';
  end if;
end; $$;
reset role;
do $$ begin
  if not (select locked from public.profiles where id=auth.uid())
    or not (select banned_until>now() from auth.users where id=auth.uid()) then
    raise exception 'FAIL: expired selection did not persist lock/Auth ban';
  end if;
end; $$;

-- Admin recovery provides a fresh cycle without rewriting account creation.
update public.profiles set locked=false where id=auth.uid();
do $$ begin
  if private.quest_deadline(auth.uid())<now()+interval '2551442 seconds'
    or (public.check_account_access()->>'locked')::boolean
    or (select banned_until from auth.users where id=auth.uid()) is not null then
    raise exception 'FAIL: admin unlock did not restore selection time';
  end if;
end; $$;
update public.profiles set master_selection_started_at=now()-interval '40 days' where id=auth.uid();
-- Run the exact scheduled function against fixtures only. The rollback also
-- restores any other accounts the scheduled sweep happens to encounter.
select private.lock_expired_quest_accounts();
do $$ begin
  if not (select locked from public.profiles where id=auth.uid()) then
    raise exception 'FAIL: offline first selection did not lock';
  end if;
end; $$;
rollback;
select 'PASS: first-selection cycle, reconnect/offline locking, exemptions, managed deadline and admin unlock' as result;
