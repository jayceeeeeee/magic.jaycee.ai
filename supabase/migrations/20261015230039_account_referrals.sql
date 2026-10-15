-- Username invite URLs resolve to immutable account attribution on confirmation.
-- Duplicate nonblank usernames must be resolved before this migration is applied.
alter table public.profiles add column referrer_id uuid;
alter table public.profiles add constraint profiles_referrer_id_fkey
  foreign key (referrer_id) references public.profiles(id) on delete set null;
alter table public.profiles add constraint profiles_referrer_not_self
  check (referrer_id is distinct from id);
create unique index profiles_username_ci_unique on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username)<>'';
create index profiles_referrer_idx on public.profiles (referrer_id) where referrer_id is not null;

create or replace function public.create_confirmed_profile()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  inviter_id uuid;
  referral_username text:=nullif(btrim(new.raw_user_meta_data->>'referral_username'),'');
begin
  if referral_username is not null and length(referral_username)<=100 then
    select p.id into inviter_id from public.profiles p
      where lower(btrim(p.username))=lower(referral_username) and p.id<>new.id;
  end if;
  insert into public.profiles(id,full_name,referrer_id)
    values(new.id,new.raw_user_meta_data->>'full_name',inviter_id)
    on conflict(id) do nothing;
  return new;
end;
$$;

create function private.guard_profile_referrer()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and new.referrer_id is not null) or
    (tg_op='UPDATE' and new.referrer_id is distinct from old.referrer_id)
  ) then
    raise exception 'Referral attribution is managed at account creation' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_referrer() from public,anon,authenticated;
create trigger guard_profile_referrer before insert or update on public.profiles
  for each row execute function private.guard_profile_referrer();

-- Targeted public lookup keeps the inviter available beyond the discovery page limit.
create function public.get_public_referrer(p_referrer_id uuid default null,p_username text default null)
returns table(id uuid,username text,full_name text,avatar_path text,role text)
language sql stable security invoker set search_path='' as $$
  select p.id,p.username,p.full_name,p.avatar_path,p.role from public.profiles p
    where public.is_public_master(p.id) and (
      (p_referrer_id is not null and p.id=p_referrer_id) or
      (p_referrer_id is null and lower(btrim(p.username))=lower(btrim(p_username)))
    );
$$;
revoke all on function public.get_public_referrer(uuid,text) from public,anon,authenticated;
grant execute on function public.get_public_referrer(uuid,text) to anon,authenticated,service_role;
