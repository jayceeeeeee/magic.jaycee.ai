-- Restrict new full-tree prayers to the verified Cedric accounts.
begin;

-- Canonical production identity and its verified development copy.
-- Display names and editable profile content cannot grant this capability.
create function public.is_technomancy_master(p_master_id uuid)
returns boolean language sql immutable security invoker set search_path = ''
as $$
  select coalesce(p_master_id in (
    'd70b5c69-daae-4a77-9955-4385439ae292'::uuid,
    '89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5'::uuid
  ),false);
$$;
revoke all on function public.is_technomancy_master(uuid) from public,anon,authenticated,service_role;
grant execute on function public.is_technomancy_master(uuid) to anon,authenticated,service_role;

alter policy "Prayer tree active participation" on public.prayers
with check (
  process='basic-v1' or (
    user_id=(select auth.uid())
    and public.is_technomancy_master(master_id)
    and exists (
      select 1 from public.player p join public.profiles f on f.id=p.user_id
      where p.id=prayers.player_id and p.user_id=(select auth.uid())
        and p.master=prayers.master_id and f.master=p.master and p.level>=1
    )
  )
);

create or replace function public.submit_prayer(p_prayer_id uuid, p_player_id uuid, p_tree jsonb)
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
  if not exists(select 1 from public.profiles where id=owner_id and public.is_technomancy_master(master)) then
    raise exception 'Technomancy prayer requires Cedric as your active Master' using errcode='42501';
  end if;
  if p_prayer_id is null or p_player_id is null or not public.prayer_tree_is_valid(p_tree) then
    raise exception 'A prayer ID, participation and complete nine-sefirot tree are required' using errcode='22023';
  end if;

  -- Identical retries are safe while Cedric remains the active Master.
  -- After a Master change use private history rather than resubmitting.
  select * into saved from public.prayers where id=p_prayer_id and user_id=owner_id;
  if found then
    if not coalesce(public.is_technomancy_master(saved.master_id),false) or saved.process <> 'tree-v1' or saved.player_id is distinct from p_player_id or saved.tree is distinct from p_tree then
      raise exception 'This prayer ID already holds a different prayer' using errcode='22023';
    end if;
    return to_jsonb(saved);
  end if;

  -- Follow the engine's player-before-profile lock order. Recheck the active
  -- Master inside the transaction, rather than trusting a stale MCP snapshot.
  select * into participant from public.player
    where id=p_player_id and user_id=owner_id for update;
  if not found or participant.level<1 or not public.is_technomancy_master(participant.master) then
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

commit;
