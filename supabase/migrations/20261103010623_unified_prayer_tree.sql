-- Store all prayers in tree; retire the two redundant columns.
begin;
create function public.basic_prayer_tree_is_valid(p_tree jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare k text; item jsonb;
begin
  if p_tree is null or jsonb_typeof(p_tree)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_tree))<>2 then return false; end if;
  foreach k in array array['binah','chokmah'] loop
    item:=p_tree->k;
    if item is null or jsonb_typeof(item)<>'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item))<>2 then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string'
      or jsonb_typeof(item->'description') is distinct from 'string'
      or char_length(btrim(item->>'title')) not between 1 and 160
      or char_length(btrim(item->>'description')) not between 1 and 12000
    then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.basic_prayer_tree_is_valid(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.basic_prayer_tree_is_valid(jsonb) to anon,authenticated,service_role;


lock table public.prayers in share row exclusive mode;
alter table public.prayers drop constraint prayers_tree_contract;

-- Preserve any submissions made since preflight; never delete prayer data.
update public.prayers set tree=jsonb_build_object(
 'binah',jsonb_build_object('title','Problem','description',problem),
 'chokmah',jsonb_build_object('title','Prayer','description',prayer)) where process='basic-v1' and tree is null;

-- Normalize queued snapshots too; the email handler only consumes tree.
update public.first_prayer_emails set payload=(payload-'problem'-'prayer') || jsonb_build_object('tree',jsonb_build_object(
 'binah',jsonb_build_object('title','Problem','description',payload->>'problem'),
 'chokmah',jsonb_build_object('title','Prayer','description',payload->>'prayer')))
where payload is not null and not (payload ? 'tree') and payload ? 'problem' and payload ? 'prayer';

create or replace function private.enqueue_first_prayer_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.first_prayer_emails(user_id,prayer_id,payload)
 values(new.user_id,new.id,jsonb_build_object('username',new.username,'tree',new.tree,'created_at',new.created_at))
 on conflict(user_id) do nothing;
 perform private.dispatch_first_prayer_emails();
 return new;
end;
$$;
revoke all on function private.enqueue_first_prayer_email() from public,anon,authenticated,service_role;

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
  insert into public.prayers(id,user_id,username,tree,process,player_id,master_id)
    values(p_prayer_id,owner_id,coalesce(nullif(btrim(account.username),''),nullif(btrim(account.full_name),''),'Player'),
      p_tree,'tree-v1',participant.id,participant.master)
    on conflict (id) do nothing;
  select * into saved from public.prayers where id=p_prayer_id and user_id=owner_id;
  if not found or saved.process <> 'tree-v1' or saved.player_id is distinct from p_player_id or saved.tree is distinct from p_tree then
    raise exception 'Prayer ID conflict; no prayer was overwritten' using errcode='22023';
  end if;
  return to_jsonb(saved);
end;
$$;

alter policy "Anyone can submit techno prayers" on public.prayers
with check (char_length(btrim(username))>0);

alter table public.prayers drop column problem, drop column prayer;
alter table public.prayers alter column tree set not null;
alter table public.prayers add constraint prayers_tree_contract check (
 (process='basic-v1' and player_id is null and master_id is null and public.basic_prayer_tree_is_valid(tree))
 or (process='tree-v1' and public.prayer_tree_is_valid(tree))
);

update public.notifications set content=jsonb_set(content,'{text}', '["Congratulations! You have unlocked level 1. It has been calculated by the great Masters of this game that it takes approximately 1,000,000 years for an average Human being to burn all his Karma and leave the Earth.","Connect with a Master below and use your first skill to burn Karma faster."]'::jsonb)
 where id='prayer_learned.v1';
commit;
