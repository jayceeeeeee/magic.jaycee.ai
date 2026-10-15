-- Run only in a migrated TEST database as postgres. All fixtures are rolled back.
begin;
select set_config('test.inviter_id',gen_random_uuid()::text,true);
select set_config('test.invited_id',gen_random_uuid()::text,true);
select set_config('test.unknown_id',gen_random_uuid()::text,true);
select set_config('test.inviter_name','invite-'||current_setting('test.inviter_id'),true);
insert into auth.users(id,created_at) values
  (current_setting('test.inviter_id')::uuid,now()),
  (current_setting('test.invited_id')::uuid,now()),
  (current_setting('test.unknown_id')::uuid,now());
insert into public.profiles(id,username) values
  (current_setting('test.inviter_id')::uuid,current_setting('test.inviter_name'));
update auth.users set raw_user_meta_data=jsonb_build_object(
  'full_name','Invited Player','referral_username',upper(current_setting('test.inviter_name'))),
  email_confirmed_at=now() where id=current_setting('test.invited_id')::uuid;
update auth.users set raw_user_meta_data=jsonb_build_object(
  'full_name','Unknown Inviter','referral_username','missing-'||gen_random_uuid()),
  email_confirmed_at=now() where id=current_setting('test.unknown_id')::uuid;
do $$ begin
  if not exists(select 1 from public.profiles where id=current_setting('test.invited_id')::uuid
    and full_name='Invited Player' and referrer_id=current_setting('test.inviter_id')::uuid) then
    raise exception 'FAIL: confirmation lost full name or did not resolve the referral UUID';
  end if;
  if not exists(select 1 from public.profiles where id=current_setting('test.unknown_id')::uuid
    and referrer_id is null) then raise exception 'FAIL: invalid referral blocked profile creation'; end if;
  if exists(select 1 from public.get_public_referrer(current_setting('test.inviter_id')::uuid)) then
    raise exception 'FAIL: private inviter is publicly discoverable';
  end if;
end; $$;
select set_config('request.jwt.claim.sub',current_setting('test.invited_id'),true);
set local role authenticated;
do $$
declare rejected boolean:=false;
begin
  begin update public.profiles set referrer_id=null where id=auth.uid();
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'FAIL: browser can change referral attribution'; end if;
end; $$;
reset role;
-- Renaming the inviter preserves the saved association; names are case-insensitively unique.
update public.profiles set username='renamed-'||current_setting('test.inviter_id')
  where id=current_setting('test.inviter_id')::uuid;
do $$
declare rejected boolean:=false;
begin
  if (select referrer_id from public.profiles where id=current_setting('test.invited_id')::uuid)
    is distinct from current_setting('test.inviter_id')::uuid then raise exception 'FAIL: rename lost referral'; end if;
  begin update public.profiles set username=upper('renamed-'||current_setting('test.inviter_id'))
    where id=current_setting('test.unknown_id')::uuid;
  exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'FAIL: ambiguous invite usernames allowed'; end if;
end; $$;
delete from auth.users where id=current_setting('test.inviter_id')::uuid;
do $$ begin
  if (select referrer_id from public.profiles where id=current_setting('test.invited_id')::uuid) is not null then
    raise exception 'FAIL: deleting inviter did not clear referral safely';
  end if;
end; $$;
rollback;
select 'PASS: confirmation attribution, unknown/private referrals, browser immutability, renames, username uniqueness and inviter deletion' as result;
