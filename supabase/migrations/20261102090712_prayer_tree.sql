-- Additive: keep all legacy rows and the website's two-field insert contract.
begin;

alter table public.prayers
  add column tree jsonb,
  add column process text not null default 'basic-v1',
  add column player_id uuid references public.player(id) on delete set null,
  add column master_id uuid references public.profiles(id) on delete set null;
create index prayers_player_idx on public.prayers(player_id) where player_id is not null;
create index prayers_master_idx on public.prayers(master_id) where master_id is not null;

-- Pure validator, callable by both website roles for CHECK evaluation. No data access.
create function public.prayer_tree_is_valid(p_tree jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare k text; item jsonb;
begin
  if p_tree is null or jsonb_typeof(p_tree) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_tree)) <> 9 then return false; end if;
  foreach k in array array['kether','chokmah','binah','chesed','geburah','tipharet','netzach','hod','yesod'] loop
    item := p_tree->k;
    if item is null or jsonb_typeof(item) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item)) <> 2 then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string'
      or jsonb_typeof(item->'description') is distinct from 'string'
      or char_length(btrim(item->>'title')) not between 1 and 160
      or char_length(btrim(item->>'description')) not between 1 and 12000
    then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.prayer_tree_is_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.prayer_tree_is_valid(jsonb) to anon, authenticated, service_role;

alter table public.prayers add constraint prayers_tree_contract check (
  (process = 'basic-v1' and tree is null and player_id is null and master_id is null)
  or (process = 'tree-v1' and tree is not null and public.prayer_tree_is_valid(tree)
    and problem = tree->'binah'->>'description'
    and prayer = tree->'chokmah'->>'description')
);

-- Restrictive policy also guards direct PostgREST writes: the permissive legacy
-- submission policy cannot be used to attach someone else's participation.
create policy "Prayer tree active participation" on public.prayers
as restrictive for insert to anon, authenticated
with check (
  process = 'basic-v1' or (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.player p join public.profiles f on f.id=p.user_id
      where p.id=prayers.player_id and p.user_id=(select auth.uid())
        and p.master=prayers.master_id and f.master=p.master and p.level>=1
    )
  )
);

-- SECURITY INVOKER: all existing owner/access RLS remains effective.
-- No practice/notification/progression calls. Existing AFTER INSERT email trigger
-- keeps its behavior; an identical retry inserts nothing and cannot retrigger it.
create function public.submit_prayer(p_prayer_id uuid, p_player_id uuid, p_tree jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  participant public.player%rowtype;
  account public.profiles%rowtype;
  saved public.prayers%rowtype;
begin
  if owner_id is null or not private.account_has_access() then
    raise exception 'Authentication and an unlocked account are required' using errcode='42501';
  end if;
  if p_prayer_id is null or p_player_id is null or not public.prayer_tree_is_valid(p_tree) then
    raise exception 'A prayer ID, participation and complete nine-sefirot tree are required' using errcode='22023';
  end if;

  -- A retry can retrieve its own identical saved result even if the active Master
  -- has since changed. It can never overwrite content or read another owner.
  select * into saved from public.prayers where id=p_prayer_id and user_id=owner_id;
  if found then
    if saved.process <> 'tree-v1' or saved.player_id is distinct from p_player_id or saved.tree is distinct from p_tree then
      raise exception 'This prayer ID already holds a different prayer' using errcode='22023';
    end if;
    return to_jsonb(saved);
  end if;

  -- Follow the engine's player-before-profile lock order. Recheck the active
  -- Master inside the transaction, rather than trusting a stale MCP snapshot.
  select * into participant from public.player
    where id=p_player_id and user_id=owner_id for update;
  if not found or participant.level<1 then
    raise exception 'Your participation is unavailable' using errcode='42501';
  end if;
  select * into account from public.profiles where id=owner_id for update;
  if not found or account.master is distinct from participant.master or not private.account_has_access() then
    raise exception 'Your active Master changed or account access expired' using errcode='42501';
  end if;
  insert into public.prayers(id,user_id,username,problem,prayer,tree,process,player_id,master_id)
    values(p_prayer_id,owner_id,coalesce(nullif(btrim(account.username),''),nullif(btrim(account.full_name),''),'Player'),
      p_tree->'binah'->>'description',p_tree->'chokmah'->>'description',p_tree,'tree-v1',participant.id,participant.master)
    on conflict (id) do nothing;
  select * into saved from public.prayers where id=p_prayer_id and user_id=owner_id;
  if not found or saved.process <> 'tree-v1' or saved.player_id is distinct from p_player_id or saved.tree is distinct from p_tree then
    raise exception 'Prayer ID conflict; no prayer was overwritten' using errcode='22023';
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.submit_prayer(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_prayer(uuid,uuid,jsonb) to authenticated;

commit;
