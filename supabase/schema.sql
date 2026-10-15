-- Current application schema, captured read-only from Supabase on 2026-10-15.
-- Source reference / bootstrap for a NEW Supabase project, not an upgrade script.
-- Includes account_referrals, deployed on 2026-10-16; this file is not auto-deployed.
-- Managed Auth/Storage schemas and roles must already exist. See README.md.
-- No user accounts, profiles, practice history or private data are included.
begin;
set local search_path = public, extensions;
set local check_function_bodies = false;

create schema private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema "private" to "authenticated";
create extension if not exists "pg_cron" with schema "pg_catalog";

-- Tables. Foreign keys follow after all referenced tables exist.
create table public."game" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "user_id" uuid not null,
  "skill_0" uuid,
  "skill_1" uuid,
  "skill_2" uuid,
  "skill_3" uuid,
  "skill_4" uuid
);

create table public."notifications" (
  "id" text not null,
  "stage" text not null,
  "position" smallint not null,
  "title" text not null,
  "tone" text not null,
  "dismissible" boolean default false not null,
  "content" jsonb default '{}'::jsonb not null,
  "enabled" boolean default true not null
);

create table public."player" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "master" uuid not null,
  "level" smallint default 1 not null,
  "skill_1_practice" double precision default 0 not null,
  "skill_2_practice" double precision default 0 not null,
  "skill_3_practice" double precision default 0 not null,
  "skill_1_start" timestamp with time zone,
  "skill_2_start" timestamp with time zone,
  "skill_3_start" timestamp with time zone,
  "level_2_accepted_at" timestamp with time zone,
  "level_3_accepted_at" timestamp with time zone
);

create table public."practice_completions" (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid not null,
  "skill_number" smallint not null,
  "completed_at" timestamp with time zone default clock_timestamp() not null
);

create table public."prayers" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "user_id" uuid,
  "problem" text not null,
  "prayer" text not null,
  "username" text not null
);

create table public."profiles" (
  "id" uuid not null,
  "username" text,
  "avatar_path" text,
  "created_at" timestamp with time zone default now(),
  "theme" text default 'aurora'::text not null,
  "primary_color" text,
  "secondary_color" text,
  "background_path" text,
  "birth_date" date,
  "birth_time" time without time zone,
  "birth_place" text,
  "birth_place_position" text,
  "birth_timezone" text,
  "sex" text,
  "full_name" text,
  "manna_target" double precision default 0,
  "manna_unit" text,
  "manna_cycle" text,
  "visibility" boolean default false not null,
  "role" text default 'user'::text not null,
  "master" uuid,
  "years_burned" integer default 0 not null,
  "permanent_account_at" timestamp with time zone,
  "locked" boolean default false not null,
  "master_selection_started_at" timestamp with time zone,
  "referrer_id" uuid
);

create table public."skills" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "label" text not null,
  "description" text,
  "user_id" uuid
);

create table public."user_notifications" (
  "user_id" uuid not null,
  "notification_id" text not null,
  "occurrence" text default 'once'::text not null,
  "read_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "clicked_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

alter table public."game" add constraint "jaycee_default_fractal_pkey" PRIMARY KEY (id);
alter table public."notifications" add constraint "notification_definitions_pkey" PRIMARY KEY (id);
alter table public."player" add constraint "jaycee_player_pkey" PRIMARY KEY (id);
alter table public."practice_completions" add constraint "practice_completions_pkey" PRIMARY KEY (id);
alter table public."prayers" add constraint "techno_prayers_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."skills" add constraint "jaycee_skills_pkey" PRIMARY KEY (id);
alter table public."user_notifications" add constraint "user_notifications_pkey" PRIMARY KEY (user_id, notification_id, occurrence);
alter table public."game" add constraint "jaycee_default_fractal_user_id_key" UNIQUE (user_id);
alter table public."game" add constraint "jaycee_game_user_id_unique" UNIQUE (user_id);
alter table public."player" add constraint "jaycee_player_user_id_game_id_key" UNIQUE (user_id, master);
alter table public."player" add constraint "player_user_game_unique" UNIQUE (user_id, master);
alter table public."notifications" add constraint "notification_definitions_content_check" CHECK (jsonb_typeof(content) = 'object'::text);
alter table public."notifications" add constraint "notification_definitions_id_check" CHECK (length(id) >= 1 AND length(id) <= 100);
alter table public."notifications" add constraint "notification_definitions_stage_check" CHECK (stage = ANY (ARRAY['guest'::text, 'account'::text, 'choose_master'::text, 'linked_master'::text]));
alter table public."notifications" add constraint "notification_definitions_tone_check" CHECK (tone = ANY (ARRAY['notification'::text, 'unlocked'::text, 'quest'::text]));
alter table public."player" add constraint "jaycee_player_level_check" CHECK (level >= 1 AND level <= 4);
alter table public."practice_completions" add constraint "practice_completions_skill_number_check" CHECK (skill_number >= 1 AND skill_number <= 3);
alter table public."profiles" add constraint "profiles_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'user'::text]));
alter table public."profiles" add constraint "profiles_years_burned_check" CHECK (years_burned >= 0);
alter table public."user_notifications" add constraint "user_notifications_occurrence_check" CHECK (length(occurrence) >= 1 AND length(occurrence) <= 160);
alter table public."game" add constraint "game_skill_0_fkey" FOREIGN KEY (skill_0) REFERENCES skills(id);
alter table public."game" add constraint "game_skill_1_fkey" FOREIGN KEY (skill_1) REFERENCES skills(id);
alter table public."game" add constraint "game_skill_2_fkey" FOREIGN KEY (skill_2) REFERENCES skills(id);
alter table public."game" add constraint "game_skill_3_fkey" FOREIGN KEY (skill_3) REFERENCES skills(id);
alter table public."game" add constraint "game_skill_4_fkey" FOREIGN KEY (skill_4) REFERENCES skills(id);
alter table public."game" add constraint "jaycee_default_fractal_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."player" add constraint "jaycee_player_game_id_fkey" FOREIGN KEY (master) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."player" add constraint "jaycee_player_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."practice_completions" add constraint "practice_completions_player_id_fkey" FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;
alter table public."prayers" add constraint "techno_prayers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."profiles" add constraint "profiles_master_fkey" FOREIGN KEY (master) REFERENCES profiles(id);
alter table public."skills" add constraint "skills_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."user_notifications" add constraint "user_notifications_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id);
alter table public."user_notifications" add constraint "user_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Additional indexes.
CREATE UNIQUE INDEX profiles_username_ci_unique ON public.profiles (lower(btrim(username))) WHERE username IS NOT NULL AND btrim(username) <> '';
CREATE INDEX profiles_referrer_idx ON public.profiles (referrer_id) WHERE referrer_id IS NOT NULL;
alter table public.profiles add constraint profiles_referrer_id_fkey foreign key (referrer_id) references public.profiles(id) on delete set null;
alter table public.profiles add constraint profiles_referrer_not_self check (referrer_id is distinct from id);
CREATE INDEX practice_completions_player_idx ON public.practice_completions USING btree (player_id);
CREATE INDEX skills_user_id_idx ON public.skills USING btree (user_id);
CREATE INDEX user_notifications_notification_id_idx ON public.user_notifications USING btree (notification_id);

-- Database functions. Each signature is defined once.

-- private.account_has_access
CREATE OR REPLACE FUNCTION private.account_has_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists(select 1 from public.profiles where id=(select auth.uid()) and locked)
    and coalesce(private.quest_deadline((select auth.uid()))>now(),true);
$function$;

-- private.apply_account_lock
CREATE OR REPLACE FUNCTION private.apply_account_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- private.complete_practice_goal
CREATE OR REPLACE FUNCTION private.complete_practice_goal(p_player_id uuid, p_skill_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_id uuid:=auth.uid();
  participant public.player%rowtype;
  snapshot jsonb;
  required_seconds double precision:=31556926.08 / 1826.211;
  practiced double precision;
  remainder double precision;
  goals bigint;
  previous_start timestamptz;
  next_start timestamptz:=clock_timestamp();
  occurrence text:=null;
  advances boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into participant from public.player where id=p_player_id and user_id=owner_id for update;
  if not found then raise exception 'Player not found' using errcode='42501'; end if;
  if p_skill_number is null or p_skill_number not between 1 and least(3,participant.level) then
    raise exception 'Invalid skill';
  end if;
  if not private.account_has_access() then raise exception 'Account locked or quest expired' using errcode='42501'; end if;
  snapshot:=to_jsonb(participant);
  if participant.level in (2,3) and p_skill_number=participant.level
    and snapshot->>('level_'||participant.level||'_accepted_at') is null then
    return jsonb_build_object('completed',false);
  end if;
  required_seconds:=required_seconds / power(24,p_skill_number-1);
  practiced:=coalesce((snapshot->>('skill_'||p_skill_number||'_practice'))::double precision,0);
  if not(practiced>=required_seconds and practiced<'Infinity'::double precision) then
    return jsonb_build_object('completed',false);
  end if;
  if not exists(select 1 from public.game where user_id=participant.master
    and to_jsonb(game)->>('skill_'||p_skill_number) is not null) then
    return jsonb_build_object('completed',false);
  end if;
  previous_start:=(snapshot->>('skill_'||p_skill_number||'_start'))::timestamptz;
  if next_start=previous_start then next_start:=next_start+interval '1 microsecond'; end if;
  goals:=floor(practiced/required_seconds)::bigint;
  remainder:=greatest(0,practiced-goals*required_seconds);
  advances:=participant.level<4 and p_skill_number=participant.level;
  insert into public.practice_completions(player_id,skill_number,completed_at)
    select participant.id,p_skill_number,next_start from generate_series(1::bigint,goals);
  update public.profiles set years_burned=years_burned+goals where id=owner_id;
  if not found then raise exception 'Profile not found'; end if;
  if advances then
    occurrence:=participant.id::text||':'||participant.level::text||':'||coalesce(snapshot->>('skill_'||p_skill_number||'_start'),'none');
    perform public.record_notification_events(jsonb_build_array(jsonb_build_object(
      'notification_id','master_linked.v1','occurrence',occurrence,'action','completed')));
  end if;
  update public.player set
    level=level+case when advances then 1 else 0 end,
    level_2_accepted_at=case when advances and participant.level=1 then null else level_2_accepted_at end,
    level_3_accepted_at=case when advances and participant.level=2 then null else level_3_accepted_at end,
    skill_1_start=case when p_skill_number=1 then next_start else skill_1_start end,
    skill_2_start=case when p_skill_number=2 then next_start else skill_2_start end,
    skill_3_start=case when p_skill_number=3 then next_start else skill_3_start end,
    skill_1_practice=case when p_skill_number=1 then remainder else skill_1_practice end,
    skill_2_practice=case when p_skill_number=2 then remainder else skill_2_practice end,
    skill_3_practice=case when p_skill_number=3 then remainder else skill_3_practice end
    where id=participant.id;
  return jsonb_build_object('completed',true,'completed_occurrence',occurrence);
end;
$function$;

-- private.enforce_current_account
CREATE OR REPLACE FUNCTION private.enforce_current_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_id uuid:=auth.uid();
  deadline timestamptz;
  is_locked boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Same player-before-profile order as progression and Master selection.
  perform 1 from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
    where p.user_id=owner_id for update of p;
  perform 1 from public.profiles where id=owner_id for update;
  deadline:=private.quest_deadline(owner_id);
  if deadline<=clock_timestamp() then
    update public.profiles set locked=true where id=owner_id and not locked;
  end if;
  select locked into is_locked from public.profiles where id=owner_id;
  return jsonb_build_object('locked',coalesce(is_locked,false),'deadline',deadline);
end;
$function$;

-- private.guard_account_lock
CREATE OR REPLACE FUNCTION private.guard_account_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and (new.locked or new.master_selection_started_at is not null))
    or (tg_op='UPDATE' and (new.locked is distinct from old.locked
      or new.master_selection_started_at is distinct from old.master_selection_started_at))
  ) then
    raise exception 'Only an administrator can change account locking' using errcode='42501';
  end if;
  return new;
end;
$function$;

-- Referral attribution is set by Auth profile creation, not by browser updates.
-- private.guard_profile_referrer
CREATE OR REPLACE FUNCTION private.guard_profile_referrer()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and new.referrer_id is not null) or
    (tg_op='UPDATE' and new.referrer_id is distinct from old.referrer_id)
  ) then
    raise exception 'Referral attribution is managed at account creation' using errcode='42501';
  end if;
  return new;
end;
$function$;

-- private.lock_expired_quest_accounts
CREATE OR REPLACE FUNCTION private.lock_expired_quest_accounts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare participant public.player%rowtype; candidate uuid;
begin
  -- Preserve existing locking/order for linked quests.
  for participant in select p.* from public.player p join public.profiles f on f.id=p.user_id and f.master=p.master
    where not f.locked and f.permanent_account_at is null and p.level between 1 and 3
      and private.quest_deadline(p.user_id)<=clock_timestamp()
    for update of p skip locked loop
    if private.quest_deadline(participant.user_id)<=clock_timestamp() then
      update public.profiles set locked=true where id=participant.user_id and not locked;
    end if;
  end loop;
  for candidate in select f.id from public.profiles f
    where not f.locked and f.master is null and f.permanent_account_at is null
      and private.quest_deadline(f.id)<=clock_timestamp()
    for update of f skip locked
  loop
    if private.quest_deadline(candidate)<=clock_timestamp() then
      update public.profiles set locked=true where id=candidate and not locked;
    end if;
  end loop;
end;
$function$;

-- private.quest_deadline
CREATE OR REPLACE FUNCTION private.quest_deadline(p_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when f.master is null and not coalesce(f.visibility,false) and f.role is distinct from 'admin'
      and not exists(select 1 from public.player prior where prior.user_id=f.id)
      then coalesce(f.master_selection_started_at,u.created_at)+interval '2551442.803 seconds'
    else case p.level
      when 1 then p.skill_1_start+interval '2551442.803 seconds'
      when 2 then case when p.level_2_accepted_at is not null then p.skill_2_start+interval '86400 seconds'
        else p.skill_1_start+interval '2551442.803 seconds' end
      when 3 then case when p.level_3_accepted_at is not null then p.skill_3_start+interval '3600 seconds'
        else p.skill_2_start+interval '86400 seconds' end
    end
  end
  from public.profiles f join auth.users u on u.id=f.id
    left join public.player p on p.user_id=f.id and p.master=f.master
  where f.id=p_user_id and f.permanent_account_at is null;
$function$;

-- private.restart_master_selection_on_unlock
CREATE OR REPLACE FUNCTION private.restart_master_selection_on_unlock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.locked and not new.locked and new.master is null
    and new.permanent_account_at is null and not coalesce(new.visibility,false)
    and new.role is distinct from 'admin'
    and not exists(select 1 from public.player where user_id=new.id) then
    update public.profiles set master_selection_started_at=clock_timestamp() where id=new.id;
  end if;
  return new;
end;
$function$;

-- private.sync_unlocked_skill_progress
CREATE OR REPLACE FUNCTION private.sync_unlocked_skill_progress(p_player_id uuid, p_skill_number integer DEFAULT NULL::integer, p_practice_seconds double precision DEFAULT NULL::double precision, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  owner_id uuid:=auth.uid();
  participant public.player%rowtype;
  snapshot jsonb;
  quest integer;
  skill_number integer;
  burned integer;
  pending boolean;
  completion jsonb;
  completed text:=null;
  completed_skills integer[]:=array[]::integer[];
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into participant from public.player where id=p_player_id and user_id=owner_id for update;
  if not found then raise exception 'Player not found' using errcode='42501'; end if;
  snapshot:=to_jsonb(participant);
  quest:=least(3,greatest(1,participant.level));
  pending:=participant.level in (2,3) and snapshot->>('level_'||participant.level||'_accepted_at') is null;
  if snapshot->>('skill_'||quest||'_start') is null and not pending and participant.level<4 then
    update public.player set
      skill_1_start=case when quest=1 then now() else skill_1_start end,
      skill_2_start=case when quest=2 then now() else skill_2_start end,
      skill_3_start=case when quest=3 then now() else skill_3_start end
      where id=participant.id returning * into participant;
    snapshot:=to_jsonb(participant);
  end if;
  if p_practice_seconds is not null then
    if p_skill_number is null or p_skill_number not between 1 and quest
      or not(p_practice_seconds>=0 and p_practice_seconds<'Infinity'::double precision) then
      raise exception 'Invalid practice time';
    end if;
    if p_skill_number=quest and pending then raise exception 'Accept the Level % quest before starting practice',participant.level; end if;
    if p_started_at is not distinct from (snapshot->>('skill_'||p_skill_number||'_start'))::timestamptz then
      update public.player set
        skill_1_practice=case when p_skill_number=1 then greatest(coalesce(skill_1_practice,0),p_practice_seconds) else skill_1_practice end,
        skill_2_practice=case when p_skill_number=2 then greatest(coalesce(skill_2_practice,0),p_practice_seconds) else skill_2_practice end,
        skill_3_practice=case when p_skill_number=3 then greatest(coalesce(skill_3_practice,0),p_practice_seconds) else skill_3_practice end
        where id=participant.id returning * into participant;
    end if;
  end if;
  for skill_number in 1..quest loop
    completion:=private.complete_practice_goal(participant.id,skill_number);
    if (completion->>'completed')::boolean then
      completed_skills:=array_append(completed_skills,skill_number);
      completed:=coalesce(completion->>'completed_occurrence',completed);
    end if;
  end loop;
  select * into participant from public.player where id=p_player_id and user_id=owner_id;
  if participant.level>=4 then
    update public.player set
      skill_1_start=case when skill_1_start is null or skill_1_start+interval '2551442.803 seconds'<=now() then now() else skill_1_start end,
      skill_2_start=case when skill_2_start is null or skill_2_start+interval '86400 seconds'<=now() then now() else skill_2_start end,
      skill_3_start=case when skill_3_start is null or skill_3_start+interval '3600 seconds'<=now() then now() else skill_3_start end
      where id=participant.id and (
        skill_1_start is null or skill_1_start+interval '2551442.803 seconds'<=now()
        or skill_2_start is null or skill_2_start+interval '86400 seconds'<=now()
        or skill_3_start is null or skill_3_start+interval '3600 seconds'<=now()
      );
    select * into participant from public.player where id=p_player_id and user_id=owner_id;
    update public.profiles set permanent_account_at=coalesce(permanent_account_at,now())
      where id=owner_id and master=participant.master and permanent_account_at is null;
  end if;
  update public.user_notifications as receipt set completed_at=now()
    where receipt.user_id=owner_id and notification_id='master_linked.v1' and completed_at is null
      and split_part(receipt.occurrence,':',1)=participant.id::text
      and split_part(receipt.occurrence,':',2)~'^[0-9]+$'
      and split_part(receipt.occurrence,':',2)::integer<participant.level;
  select years_burned into burned from public.profiles where id=owner_id;
  return jsonb_build_object('player',to_jsonb(participant),'years_burned',burned,
    'completed_occurrence',completed,'completed_skills',to_jsonb(completed_skills),
    'completed_passive_seconds',public.get_practice_completion_totals());
end;
$function$;

-- public.accept_level_two_quest
CREATE OR REPLACE FUNCTION public.accept_level_two_quest(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select public.accept_player_quest(p_player_id,2);
$function$;

-- public.accept_player_quest
CREATE OR REPLACE FUNCTION public.accept_player_quest(p_player_id uuid, p_level integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := auth.uid();
  participant public.player%rowtype;
  burned integer;
  notification text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_level is null or p_level not in (2,3) then raise exception 'Invalid quest level'; end if;
  select * into participant from public.player where id=p_player_id and user_id=owner_id for update;
  if not found then raise exception 'Player not found' using errcode='42501'; end if;
  if participant.level<>p_level then raise exception 'The player quest level has changed. Reload and try again.'; end if;
  if p_level=2 and participant.level_2_accepted_at is null then
    update public.player set level_2_accepted_at=now(),skill_2_start=now()
      where id=participant.id returning * into participant;
  elsif p_level=3 and participant.level_3_accepted_at is null then
    update public.player set level_3_accepted_at=now(),skill_3_start=now()
      where id=participant.id returning * into participant;
  end if;
  notification := case when p_level=2 then 'level_two_prepare.v1' else 'level_three_prepare.v1' end;
  perform public.record_notification_events(jsonb_build_array(
    jsonb_build_object('notification_id',notification,'occurrence',participant.id::text||':'||p_level,'action','clicked'),
    jsonb_build_object('notification_id',notification,'occurrence',participant.id::text||':'||p_level,'action','completed')));
  select years_burned into burned from public.profiles where id=owner_id;
  return jsonb_build_object('player',to_jsonb(participant),'years_burned',burned,'completed_occurrence',null);
end;
$function$;

-- public.can_author_game
CREATE OR REPLACE FUNCTION public.can_author_game()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.player where user_id=(select auth.uid()) and level>=3)
    or exists(select 1 from public.profiles where id=(select auth.uid()) and permanent_account_at is not null);
$function$;

-- public.check_account_access
CREATE OR REPLACE FUNCTION public.check_account_access()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.enforce_current_account();
$function$;

-- public.create_confirmed_profile
CREATE OR REPLACE FUNCTION public.create_confirmed_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  inviter_id uuid;
  referral_username text := nullif(btrim(NEW.raw_user_meta_data ->> 'referral_username'), '');
BEGIN
  if referral_username is not null and length(referral_username) <= 100 then
    select p.id into inviter_id from public.profiles p
      where lower(btrim(p.username))=lower(referral_username) and p.id<>NEW.id;
  end if;
  INSERT INTO public.profiles (id, full_name, referrer_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    inviter_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Public invite-card lookup, with the same visibility/playability gate as Masters.
-- public.get_public_referrer
CREATE OR REPLACE FUNCTION public.get_public_referrer(p_referrer_id uuid DEFAULT NULL,p_username text DEFAULT NULL)
 RETURNS TABLE(id uuid,username text,full_name text,avatar_path text,role text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select p.id,p.username,p.full_name,p.avatar_path,p.role from public.profiles p
    where public.is_public_master(p.id) and (
      (p_referrer_id is not null and p.id=p_referrer_id) or
      (p_referrer_id is null and lower(btrim(p.username))=lower(btrim(p_username)))
    );
$function$;

-- public.get_practice_completion_totals
CREATE OR REPLACE FUNCTION public.get_practice_completion_totals()
 RETURNS double precision
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(case h.skill_number when 1 then 2551442.803
    when 2 then 86400 else 3600 end),0)::double precision
    from public.practice_completions h join public.player p on p.id=h.player_id
    where p.user_id=(select auth.uid());
$function$;

-- public.guard_profile_visibility
CREATE OR REPLACE FUNCTION public.guard_profile_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if coalesce(new.visibility,false) or new.permanent_account_at is not null then
        raise exception 'New accounts must start private without permanent status' using errcode='42501';
      end if;
    else
      if new.master is distinct from old.master and (
        old.permanent_account_at is not null or exists(
          select 1 from public.player where user_id=old.id and master=old.master and level>=4
        )) then
        raise exception 'Your Master link is permanent at Level 4' using errcode='42501';
      end if;
      if new.permanent_account_at is distinct from old.permanent_account_at then
        if old.permanent_account_at is not null or new.permanent_account_at is null
          or new.master is distinct from old.master or not exists(
            select 1 from public.player where user_id=old.id and master=old.master and level>=4
          ) then
          raise exception 'Permanent status is granted only upon reaching Level 4' using errcode='42501';
        end if;
        new.permanent_account_at := now();
      end if;
      if new.visibility and not coalesce(old.visibility,false) and not public.has_named_game_skills(old.id) then
        raise exception 'Name all five skills before making your account visible' using errcode='23514';
      end if;
      if new.visibility is distinct from old.visibility and old.permanent_account_at is null
        and not exists(select 1 from public.player where user_id=old.id and level>=4) then
        raise exception 'Reach Level 4 to change account visibility' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- public.handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (
    id,
    username
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'username'
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

-- public.has_named_game_skills
CREATE OR REPLACE FUNCTION public.has_named_game_skills(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.game g where g.user_id=p_profile_id
    and not exists(
      select 1 from unnest(array[g.skill_0,g.skill_1,g.skill_2,g.skill_3,g.skill_4]) as slot(skill_id)
      where skill_id is null or not exists(
        select 1 from public.skills s where s.id=slot.skill_id and nullif(btrim(s.label),'') is not null
      )
    )
  );
$function$;

-- public.is_public_master
CREATE OR REPLACE FUNCTION public.is_public_master(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.profiles p where p.id=p_profile_id and p.visibility
    and nullif(btrim(p.username),'') is not null and public.has_named_game_skills(p.id));
$function$;

-- public.list_public_masters
CREATE OR REPLACE FUNCTION public.list_public_masters(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, username text, full_name text, avatar_path text, role text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p.id,p.username,p.full_name,p.avatar_path,p.role from public.profiles p
    where public.is_public_master(p.id) order by p.username
    limit greatest(1,least(coalesce(p_limit,100),1000));
$function$;

-- public.record_notification_events
CREATE OR REPLACE FUNCTION public.record_notification_events(p_events jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  event jsonb;
  action text;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then
    raise exception 'Expected at most 100 notification events';
  end if;
  for event in select value from jsonb_array_elements(p_events) loop
    action := event->>'action';
    if action is null or action not in ('read', 'dismissed', 'clicked', 'completed') then
      raise exception 'Invalid notification action';
    end if;
    insert into public.user_notifications as receipt
      (user_id, notification_id, occurrence, read_at, dismissed_at, clicked_at, completed_at)
    values (owner_id, event->>'notification_id', coalesce(event->>'occurrence', 'once'),
      case when action in ('read', 'dismissed', 'clicked') then now() end,
      case when action = 'dismissed' then now() end,
      case when action = 'clicked' then now() end,
      case when action = 'completed' then now() end)
    on conflict (user_id, notification_id, occurrence) do update set
      read_at = coalesce(receipt.read_at, excluded.read_at),
      dismissed_at = coalesce(receipt.dismissed_at, excluded.dismissed_at),
      clicked_at = coalesce(receipt.clicked_at, excluded.clicked_at),
      completed_at = coalesce(receipt.completed_at, excluded.completed_at);
  end loop;
end;
$function$;

-- public.save_own_game
CREATE OR REPLACE FUNCTION public.save_own_game(p_skills jsonb, p_published boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := auth.uid();
  own_game public.game%rowtype;
  old_ids uuid[];
  new_ids uuid[] := array[]::uuid[];
  skill_id uuid;
  label_value text;
  description_value text;
  i integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if coalesce(p_published,false) then raise exception 'Profile visibility is managed by an administrator' using errcode='42501'; end if;
  if not public.can_author_game() then raise exception 'Reach Level 3 to create your game' using errcode='42501'; end if;
  if jsonb_typeof(p_skills) is distinct from 'array' then raise exception 'Expected five skill slots'; end if;
  if jsonb_array_length(p_skills)<>5 then raise exception 'Expected five skill slots'; end if;
  perform 1 from public.profiles where id=owner_id for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into own_game from public.game where user_id=owner_id for update;
  old_ids := array[own_game.skill_0,own_game.skill_1,own_game.skill_2,own_game.skill_3,own_game.skill_4];
  for i in 0..4 loop
    if jsonb_typeof(p_skills->i) is distinct from 'object' then raise exception 'Invalid skill'; end if;
    label_value := btrim(coalesce(p_skills->i->>'label',''));
    description_value := btrim(coalesce(p_skills->i->>'description',''));
    if length(label_value)>120 or length(description_value)>20000 then raise exception 'Skill text is too long'; end if;
    if label_value='' and description_value<>'' then raise exception 'Each description needs a skill name'; end if;

    skill_id := null;
    if label_value<>'' then
      -- Never edit another Master's skill; clone a legacy shared slot instead.
      if old_ids[i+1] is not null and array_position(new_ids,old_ids[i+1]) is null then
        update public.skills set label=label_value,description=description_value
          where id=old_ids[i+1] and user_id=owner_id returning id into skill_id;
      end if;
      if skill_id is null then
        insert into public.skills(user_id,label,description) values(owner_id,label_value,description_value) returning id into skill_id;
      end if;
    end if;
    new_ids := array_append(new_ids,skill_id);
  end loop;
  insert into public.game(user_id,skill_0,skill_1,skill_2,skill_3,skill_4)
    values(owner_id,new_ids[1],new_ids[2],new_ids[3],new_ids[4],new_ids[5])
    on conflict(user_id) do update set skill_0=excluded.skill_0,skill_1=excluded.skill_1,
      skill_2=excluded.skill_2,skill_3=excluded.skill_3,skill_4=excluded.skill_4
    returning * into own_game;

  return to_jsonb(own_game);
end;
$function$;

-- public.switch_player_master
CREATE OR REPLACE FUNCTION public.switch_player_master(p_master_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := auth.uid();
  current_master uuid;
  participant public.player%rowtype;
  target public.player%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_master_id is null or p_master_id=owner_id then raise exception 'Choose another Master'; end if;
  -- Match progression's player-before-profile lock order.
  select master into current_master from public.profiles where id=owner_id;
  if current_master is not null then
    select * into participant from public.player where user_id=owner_id and master=current_master for update;
  end if;
  perform 1 from public.profiles where id=owner_id and master is not distinct from current_master for update;
  if not found then raise exception 'Your Master changed. Reload and try again.'; end if;
  if current_master is not null and not coalesce((
    (participant.level=2 and participant.level_2_accepted_at is null) or
    (participant.level=3 and participant.level_3_accepted_at is null)),false) then
    raise exception 'You can change Master only before accepting a Level 2 or Level 3 quest';
  end if;
  if not public.is_public_master(p_master_id) then
    raise exception 'This Master needs a visible profile and five named skills';
  end if;
  insert into public.player(user_id,master,level,skill_1_start)
    values(owner_id,p_master_id,1,now()) on conflict(user_id,master) do nothing;
  select * into target from public.player where user_id=owner_id and master=p_master_id;
  update public.profiles set master=p_master_id where id=owner_id;
  return to_jsonb(target);
end;
$function$;

-- public.sync_skill_progress
CREATE OR REPLACE FUNCTION public.sync_skill_progress(p_player_id uuid, p_skill_number integer DEFAULT NULL::integer, p_practice_seconds double precision DEFAULT NULL::double precision, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (public.check_account_access()->>'locked')::boolean then
    -- Return normally so the account lock commits before the client signs out.
    return jsonb_build_object('account_locked',true);
  end if;
  return private.sync_unlocked_skill_progress(p_player_id,p_skill_number,p_practice_seconds,p_started_at);
end;
$function$;

-- Explicit function permissions (including trigger-only/private functions).
revoke all on function private.guard_profile_referrer() from public, anon, authenticated;
revoke all on function public.get_public_referrer(uuid,text) from public, anon, authenticated;
grant execute on function public.get_public_referrer(uuid,text) to anon, authenticated, service_role;
revoke all on function "private"."account_has_access"() from public, anon, authenticated, service_role;
grant execute on function "private"."account_has_access"() to "authenticated";
revoke all on function "private"."apply_account_lock"() from public, anon, authenticated, service_role;
revoke all on function "private"."complete_practice_goal"(p_player_id uuid, p_skill_number integer) from public, anon, authenticated, service_role;
grant execute on function "private"."complete_practice_goal"(p_player_id uuid, p_skill_number integer) to "authenticated";
revoke all on function "private"."enforce_current_account"() from public, anon, authenticated, service_role;
grant execute on function "private"."enforce_current_account"() to "authenticated";
revoke all on function "private"."guard_account_lock"() from public, anon, authenticated, service_role;
revoke all on function "private"."lock_expired_quest_accounts"() from public, anon, authenticated, service_role;
revoke all on function "private"."quest_deadline"(p_user_id uuid) from public, anon, authenticated, service_role;
revoke all on function "private"."restart_master_selection_on_unlock"() from public, anon, authenticated, service_role;
revoke all on function "private"."sync_unlocked_skill_progress"(p_player_id uuid, p_skill_number integer, p_practice_seconds double precision, p_started_at timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function "private"."sync_unlocked_skill_progress"(p_player_id uuid, p_skill_number integer, p_practice_seconds double precision, p_started_at timestamp with time zone) to "authenticated";
grant execute on function "private"."sync_unlocked_skill_progress"(p_player_id uuid, p_skill_number integer, p_practice_seconds double precision, p_started_at timestamp with time zone) to "service_role";
revoke all on function "public"."accept_level_two_quest"(p_player_id uuid) from public, anon, authenticated, service_role;
grant execute on function "public"."accept_level_two_quest"(p_player_id uuid) to "authenticated";
grant execute on function "public"."accept_level_two_quest"(p_player_id uuid) to "service_role";
revoke all on function "public"."accept_player_quest"(p_player_id uuid, p_level integer) from public, anon, authenticated, service_role;
grant execute on function "public"."accept_player_quest"(p_player_id uuid, p_level integer) to "authenticated";
grant execute on function "public"."accept_player_quest"(p_player_id uuid, p_level integer) to "service_role";
revoke all on function "public"."can_author_game"() from public, anon, authenticated, service_role;
grant execute on function "public"."can_author_game"() to "authenticated";
grant execute on function "public"."can_author_game"() to "service_role";
revoke all on function "public"."check_account_access"() from public, anon, authenticated, service_role;
grant execute on function "public"."check_account_access"() to "authenticated";
grant execute on function "public"."check_account_access"() to "service_role";
revoke all on function "public"."create_confirmed_profile"() from public, anon, authenticated, service_role;
grant execute on function "public"."create_confirmed_profile"() to public;
grant execute on function "public"."create_confirmed_profile"() to "anon";
grant execute on function "public"."create_confirmed_profile"() to "authenticated";
grant execute on function "public"."create_confirmed_profile"() to "service_role";
revoke all on function "public"."get_practice_completion_totals"() from public, anon, authenticated, service_role;
grant execute on function "public"."get_practice_completion_totals"() to "authenticated";
grant execute on function "public"."get_practice_completion_totals"() to "service_role";
revoke all on function "public"."guard_profile_visibility"() from public, anon, authenticated, service_role;
grant execute on function "public"."guard_profile_visibility"() to "service_role";
revoke all on function "public"."handle_new_user"() from public, anon, authenticated, service_role;
grant execute on function "public"."handle_new_user"() to public;
grant execute on function "public"."handle_new_user"() to "anon";
grant execute on function "public"."handle_new_user"() to "authenticated";
grant execute on function "public"."handle_new_user"() to "service_role";
revoke all on function "public"."has_named_game_skills"(p_profile_id uuid) from public, anon, authenticated, service_role;
grant execute on function "public"."has_named_game_skills"(p_profile_id uuid) to "anon";
grant execute on function "public"."has_named_game_skills"(p_profile_id uuid) to "authenticated";
grant execute on function "public"."has_named_game_skills"(p_profile_id uuid) to "service_role";
revoke all on function "public"."is_public_master"(p_profile_id uuid) from public, anon, authenticated, service_role;
grant execute on function "public"."is_public_master"(p_profile_id uuid) to "anon";
grant execute on function "public"."is_public_master"(p_profile_id uuid) to "authenticated";
grant execute on function "public"."is_public_master"(p_profile_id uuid) to "service_role";
revoke all on function "public"."list_public_masters"(p_limit integer) from public, anon, authenticated, service_role;
grant execute on function "public"."list_public_masters"(p_limit integer) to "anon";
grant execute on function "public"."list_public_masters"(p_limit integer) to "authenticated";
grant execute on function "public"."list_public_masters"(p_limit integer) to "service_role";
revoke all on function "public"."record_notification_events"(p_events jsonb) from public, anon, authenticated, service_role;
grant execute on function "public"."record_notification_events"(p_events jsonb) to "authenticated";
grant execute on function "public"."record_notification_events"(p_events jsonb) to "service_role";
revoke all on function "public"."save_own_game"(p_skills jsonb, p_published boolean) from public, anon, authenticated, service_role;
grant execute on function "public"."save_own_game"(p_skills jsonb, p_published boolean) to "authenticated";
grant execute on function "public"."save_own_game"(p_skills jsonb, p_published boolean) to "service_role";
revoke all on function "public"."switch_player_master"(p_master_id uuid) from public, anon, authenticated, service_role;
grant execute on function "public"."switch_player_master"(p_master_id uuid) to "authenticated";
grant execute on function "public"."switch_player_master"(p_master_id uuid) to "service_role";
revoke all on function "public"."sync_skill_progress"(p_player_id uuid, p_skill_number integer, p_practice_seconds double precision, p_started_at timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function "public"."sync_skill_progress"(p_player_id uuid, p_skill_number integer, p_practice_seconds double precision, p_started_at timestamp with time zone) to "authenticated";
grant execute on function "public"."sync_skill_progress"(p_player_id uuid, p_skill_number integer, p_practice_seconds double precision, p_started_at timestamp with time zone) to "service_role";

-- Auth/profile triggers.
CREATE TRIGGER guard_profile_referrer BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_profile_referrer();
CREATE TRIGGER on_email_confirmed_create_profile AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN (old.email_confirmed_at IS NULL AND new.email_confirmed_at IS NOT NULL) EXECUTE FUNCTION create_confirmed_profile();
CREATE TRIGGER apply_account_lock AFTER UPDATE OF locked ON profiles FOR EACH ROW EXECUTE FUNCTION private.apply_account_lock();
CREATE TRIGGER guard_account_lock BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.guard_account_lock();
CREATE TRIGGER guard_profile_visibility BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_visibility();
CREATE TRIGGER restart_master_selection_on_unlock AFTER UPDATE OF locked ON profiles FOR EACH ROW EXECUTE FUNCTION private.restart_master_selection_on_unlock();

-- Table permissions and row-level security.
revoke all on table public."game" from public, anon, authenticated, service_role;
alter table public."game" enable row level security;
revoke all on table public."notifications" from public, anon, authenticated, service_role;
alter table public."notifications" enable row level security;
revoke all on table public."player" from public, anon, authenticated, service_role;
alter table public."player" enable row level security;
revoke all on table public."practice_completions" from public, anon, authenticated, service_role;
alter table public."practice_completions" enable row level security;
revoke all on table public."prayers" from public, anon, authenticated, service_role;
alter table public."prayers" enable row level security;
revoke all on table public."profiles" from public, anon, authenticated, service_role;
alter table public."profiles" enable row level security;
revoke all on table public."skills" from public, anon, authenticated, service_role;
alter table public."skills" enable row level security;
revoke all on table public."user_notifications" from public, anon, authenticated, service_role;
alter table public."user_notifications" enable row level security;
grant delete on table "public"."game" to "anon";
grant insert on table "public"."game" to "anon";
grant references on table "public"."game" to "anon";
grant select on table "public"."game" to "anon";
grant trigger on table "public"."game" to "anon";
grant truncate on table "public"."game" to "anon";
grant update on table "public"."game" to "anon";
grant delete on table "public"."game" to "authenticated";
grant insert on table "public"."game" to "authenticated";
grant references on table "public"."game" to "authenticated";
grant select on table "public"."game" to "authenticated";
grant trigger on table "public"."game" to "authenticated";
grant truncate on table "public"."game" to "authenticated";
grant update on table "public"."game" to "authenticated";
grant delete on table "public"."game" to "service_role";
grant insert on table "public"."game" to "service_role";
grant references on table "public"."game" to "service_role";
grant select on table "public"."game" to "service_role";
grant trigger on table "public"."game" to "service_role";
grant truncate on table "public"."game" to "service_role";
grant update on table "public"."game" to "service_role";
grant select on table "public"."notifications" to "anon";
grant select on table "public"."notifications" to "authenticated";
grant delete on table "public"."notifications" to "service_role";
grant insert on table "public"."notifications" to "service_role";
grant references on table "public"."notifications" to "service_role";
grant select on table "public"."notifications" to "service_role";
grant trigger on table "public"."notifications" to "service_role";
grant truncate on table "public"."notifications" to "service_role";
grant update on table "public"."notifications" to "service_role";
grant delete on table "public"."player" to "anon";
grant insert on table "public"."player" to "anon";
grant references on table "public"."player" to "anon";
grant select on table "public"."player" to "anon";
grant trigger on table "public"."player" to "anon";
grant truncate on table "public"."player" to "anon";
grant update on table "public"."player" to "anon";
grant delete on table "public"."player" to "authenticated";
grant insert on table "public"."player" to "authenticated";
grant references on table "public"."player" to "authenticated";
grant select on table "public"."player" to "authenticated";
grant trigger on table "public"."player" to "authenticated";
grant truncate on table "public"."player" to "authenticated";
grant update on table "public"."player" to "authenticated";
grant delete on table "public"."player" to "service_role";
grant insert on table "public"."player" to "service_role";
grant references on table "public"."player" to "service_role";
grant select on table "public"."player" to "service_role";
grant trigger on table "public"."player" to "service_role";
grant truncate on table "public"."player" to "service_role";
grant update on table "public"."player" to "service_role";
grant select on table "public"."practice_completions" to "authenticated";
grant delete on table "public"."practice_completions" to "service_role";
grant insert on table "public"."practice_completions" to "service_role";
grant references on table "public"."practice_completions" to "service_role";
grant select on table "public"."practice_completions" to "service_role";
grant trigger on table "public"."practice_completions" to "service_role";
grant truncate on table "public"."practice_completions" to "service_role";
grant update on table "public"."practice_completions" to "service_role";
grant delete on table "public"."prayers" to "anon";
grant insert on table "public"."prayers" to "anon";
grant references on table "public"."prayers" to "anon";
grant select on table "public"."prayers" to "anon";
grant trigger on table "public"."prayers" to "anon";
grant truncate on table "public"."prayers" to "anon";
grant update on table "public"."prayers" to "anon";
grant delete on table "public"."prayers" to "authenticated";
grant insert on table "public"."prayers" to "authenticated";
grant references on table "public"."prayers" to "authenticated";
grant select on table "public"."prayers" to "authenticated";
grant trigger on table "public"."prayers" to "authenticated";
grant truncate on table "public"."prayers" to "authenticated";
grant update on table "public"."prayers" to "authenticated";
grant delete on table "public"."prayers" to "service_role";
grant insert on table "public"."prayers" to "service_role";
grant references on table "public"."prayers" to "service_role";
grant select on table "public"."prayers" to "service_role";
grant trigger on table "public"."prayers" to "service_role";
grant truncate on table "public"."prayers" to "service_role";
grant update on table "public"."prayers" to "service_role";
grant delete on table "public"."profiles" to "anon";
grant insert on table "public"."profiles" to "anon";
grant references on table "public"."profiles" to "anon";
grant select on table "public"."profiles" to "anon";
grant trigger on table "public"."profiles" to "anon";
grant truncate on table "public"."profiles" to "anon";
grant update on table "public"."profiles" to "anon";
grant delete on table "public"."profiles" to "authenticated";
grant insert on table "public"."profiles" to "authenticated";
grant references on table "public"."profiles" to "authenticated";
grant select on table "public"."profiles" to "authenticated";
grant trigger on table "public"."profiles" to "authenticated";
grant truncate on table "public"."profiles" to "authenticated";
grant update on table "public"."profiles" to "authenticated";
grant delete on table "public"."profiles" to "service_role";
grant insert on table "public"."profiles" to "service_role";
grant references on table "public"."profiles" to "service_role";
grant select on table "public"."profiles" to "service_role";
grant trigger on table "public"."profiles" to "service_role";
grant truncate on table "public"."profiles" to "service_role";
grant update on table "public"."profiles" to "service_role";
grant delete on table "public"."skills" to "anon";
grant insert on table "public"."skills" to "anon";
grant references on table "public"."skills" to "anon";
grant select on table "public"."skills" to "anon";
grant trigger on table "public"."skills" to "anon";
grant truncate on table "public"."skills" to "anon";
grant update on table "public"."skills" to "anon";
grant delete on table "public"."skills" to "authenticated";
grant insert on table "public"."skills" to "authenticated";
grant references on table "public"."skills" to "authenticated";
grant select on table "public"."skills" to "authenticated";
grant trigger on table "public"."skills" to "authenticated";
grant truncate on table "public"."skills" to "authenticated";
grant update on table "public"."skills" to "authenticated";
grant delete on table "public"."skills" to "service_role";
grant insert on table "public"."skills" to "service_role";
grant references on table "public"."skills" to "service_role";
grant select on table "public"."skills" to "service_role";
grant trigger on table "public"."skills" to "service_role";
grant truncate on table "public"."skills" to "service_role";
grant update on table "public"."skills" to "service_role";
grant insert on table "public"."user_notifications" to "authenticated";
grant select on table "public"."user_notifications" to "authenticated";
grant update on table "public"."user_notifications" to "authenticated";
grant delete on table "public"."user_notifications" to "service_role";
grant insert on table "public"."user_notifications" to "service_role";
grant references on table "public"."user_notifications" to "service_role";
grant select on table "public"."user_notifications" to "service_role";
grant trigger on table "public"."user_notifications" to "service_role";
grant truncate on table "public"."user_notifications" to "service_role";
grant update on table "public"."user_notifications" to "service_role";
create policy "Jaycee game is publicly readable" on "public"."game" as permissive for select to "public" using (true);
create policy "Unlocked account delete" on "public"."game" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "public"."game" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "public"."game" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "jaycee_game_delete_own" on "public"."game" as permissive for delete to "authenticated" using ((auth.uid() = user_id));
create policy "jaycee_game_insert_own" on "public"."game" as permissive for insert to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_author_game() AS can_author_game)));
create policy "jaycee_game_select_own" on "public"."game" as permissive for select to "authenticated" using ((auth.uid() = user_id));
create policy "jaycee_game_update_own" on "public"."game" as permissive for update to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_author_game() AS can_author_game))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_author_game() AS can_author_game)));
create policy "Read enabled notification definitions" on "public"."notifications" as permissive for select to "anon", "authenticated" using (enabled);
create policy "Players can join games" on "public"."player" as permissive for insert to "authenticated" with check ((auth.uid() = user_id));
create policy "Players can leave games" on "public"."player" as permissive for delete to "authenticated" using ((auth.uid() = user_id));
create policy "Players can update their participations" on "public"."player" as permissive for update to "authenticated" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Players can view their participations" on "public"."player" as permissive for select to "authenticated" using ((auth.uid() = user_id));
create policy "Unlocked account delete" on "public"."player" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "public"."player" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account read" on "public"."player" as restrictive for select to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "public"."player" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Read own completed practice" on "public"."practice_completions" as permissive for select to "authenticated" using ((player_id IN ( SELECT player.id
   FROM player
  WHERE (player.user_id = ( SELECT auth.uid() AS uid)))));
create policy "Unlocked account read" on "public"."practice_completions" as restrictive for select to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Anyone can submit techno prayers" on "public"."prayers" as permissive for insert to "anon", "authenticated" with check (((length(TRIM(BOTH FROM username)) > 0) AND (length(TRIM(BOTH FROM problem)) > 0) AND (length(TRIM(BOTH FROM prayer)) > 0)));
create policy "Unlocked account delete" on "public"."prayers" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "public"."prayers" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "public"."prayers" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Users can read their own techno-prayers" on "public"."prayers" as permissive for select to "authenticated" using ((auth.uid() = user_id));
create policy "Profiles are publicly readable" on "public"."profiles" as permissive for select to "public" using (true);
create policy "Unlocked account delete" on "public"."profiles" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "public"."profiles" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "public"."profiles" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Users can delete their own profile" on "public"."profiles" as permissive for delete to "authenticated" using ((auth.uid() = id));
create policy "Users can insert their own profile" on "public"."profiles" as permissive for insert to "authenticated" with check ((auth.uid() = id));
create policy "Users can update their own profile" on "public"."profiles" as permissive for update to "authenticated" using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "Unlocked account delete" on "public"."skills" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "public"."skills" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "public"."skills" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "jaycee_skills_delete" on "public"."skills" as permissive for delete to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "jaycee_skills_insert" on "public"."skills" as permissive for insert to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_author_game() AS can_author_game)));
create policy "jaycee_skills_read" on "public"."skills" as permissive for select to "anon", "authenticated" using (true);
create policy "jaycee_skills_update" on "public"."skills" as permissive for update to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_author_game() AS can_author_game))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_author_game() AS can_author_game)));
create policy "Insert own notifications" on "public"."user_notifications" as permissive for insert to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Read own notifications" on "public"."user_notifications" as permissive for select to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Unlocked account delete" on "public"."user_notifications" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "public"."user_notifications" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account read" on "public"."user_notifications" as restrictive for select to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "public"."user_notifications" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Update own notifications" on "public"."user_notifications" as permissive for update to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Unlocked account delete" on "storage"."objects" as restrictive for delete to "authenticated" using (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account insert" on "storage"."objects" as restrictive for insert to "authenticated" with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Unlocked account update" on "storage"."objects" as restrictive for update to "authenticated" using (( SELECT private.account_has_access() AS account_has_access)) with check (( SELECT private.account_has_access() AS account_has_access));
create policy "Users can delete their own media" on "storage"."objects" as permissive for delete to "authenticated" using (((bucket_id = 'users'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can update their own media" on "storage"."objects" as permissive for update to "authenticated" using (((bucket_id = 'users'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'users'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can upload their own media" on "storage"."objects" as permissive for insert to "authenticated" with check (((bucket_id = 'users'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users media are publicly readable" on "storage"."objects" as permissive for select to "public" using ((bucket_id = 'users'::text));

-- Application storage bucket configuration (no uploaded files).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('users', 'users', false, null, null);

-- Deadline enforcement while browsers are closed.
select cron.schedule('lock-expired-quest-accounts', '* * * * *', 'select private.lock_expired_quest_accounts()');

commit;

