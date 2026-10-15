-- Pending Level 2/3 accounts remain timed by the previous skill.
create or replace function private.quest_deadline(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path='' as $$
  select case p.level
    when 1 then p.skill_1_start+interval '2551442.803 seconds'
    when 2 then case when p.level_2_accepted_at is not null then p.skill_2_start+interval '86400 seconds'
      else p.skill_1_start+interval '2551442.803 seconds' end
    when 3 then case when p.level_3_accepted_at is not null then p.skill_3_start+interval '3600 seconds'
      else p.skill_2_start+interval '86400 seconds' end
  end
  from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
  where p.user_id=p_user_id and f.permanent_account_at is null and p.level between 1 and 3;
$$;
revoke all on function private.quest_deadline(uuid) from public,anon,authenticated;

create or replace function private.apply_account_lock()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.locked is distinct from old.locked then
    -- Auth checks banned_until for password login and token refresh.
    update auth.users set banned_until=case when new.locked
      then '9999-12-31 23:59:59+00'::timestamptz else null end where id=new.id;
    if new.locked then
      delete from auth.sessions where user_id=new.id;
    else
      -- An administrator's unlock gives the current quest a fresh chance.
      -- Practice and all unrelated skill clocks are preserved.
      update public.player set
        skill_1_start=case when level=1 or (level=2 and level_2_accepted_at is null) then clock_timestamp() else skill_1_start end,
        skill_2_start=case when (level=2 and level_2_accepted_at is not null)
          or (level=3 and level_3_accepted_at is null) then clock_timestamp() else skill_2_start end,
        skill_3_start=case when level=3 and level_3_accepted_at is not null then clock_timestamp() else skill_3_start end
        where user_id=new.id and master=new.master and level between 1 and 3;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_account_lock() from public,anon,authenticated;
