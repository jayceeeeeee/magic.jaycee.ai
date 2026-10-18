-- Run as postgres. Temporary accounts and all updates are rolled back.
begin;
select set_config('test.lore_owner', gen_random_uuid()::text, true);
select set_config('test.lore_other', gen_random_uuid()::text, true);
insert into auth.users(id, created_at) values
  (current_setting('test.lore_owner')::uuid, now()),
  (current_setting('test.lore_other')::uuid, now());
insert into public.profiles(id) values
  (current_setting('test.lore_owner')::uuid),
  (current_setting('test.lore_other')::uuid);

select set_config('request.jwt.claim.sub', current_setting('test.lore_owner'), true);
set local role authenticated;
do $$
declare affected integer;
begin
  if (select lore from public.profiles where id=auth.uid()) <> '' then
    raise exception 'FAIL: lore must default to an empty story';
  end if;
  update public.profiles set lore='A traveler with **a story**.' where id=auth.uid();
  if (select lore from public.profiles where id=auth.uid()) <> 'A traveler with **a story**.' then
    raise exception 'FAIL: own lore did not save';
  end if;
  update public.profiles set lore='Overwrite' where id=current_setting('test.lore_other')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another account lore can be edited'; end if;
  begin
    update public.profiles set lore=repeat('a',20001) where id=auth.uid();
    raise exception 'FAIL: oversized lore accepted';
  exception when check_violation then null;
  end;
  update public.profiles set lore='' where id=auth.uid();
end;
$$;
reset role;
set local role anon;
do $$
declare affected integer;
begin
  update public.profiles set lore='Anonymous overwrite' where id=current_setting('test.lore_owner')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: anonymous lore edit accepted'; end if;
end;
$$;
reset role;
rollback;
select 'PASS: lore defaults, owner save/clear, length limit, and unauthorized edit protection' as result;
