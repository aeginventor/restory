-- Restory: personal archives are private tables; publication is an explicit RPC.
-- Apply as the Supabase database owner. Never expose an administrator key to clients.
create schema if not exists restory_private;
revoke all on schema restory_private from public;

create function restory_private.valid_experience_date(value text, precision_value text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if precision_value = 'unknown' then return value is null; end if;
  if value is null then return false; end if;
  if precision_value = 'year' then
    return value ~ '^[0-9]{4}$' and value <> '0000';
  elsif precision_value = 'month' then
    return value ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and left(value,4) <> '0000';
  elsif precision_value = 'day' then
    return value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and to_char(value::date, 'YYYY-MM-DD') = value;
  end if;
  return false;
exception when others then return false;
end $$;

create function restory_private.valid_tags(value text[]) returns boolean
language sql immutable set search_path = '' as $$
  select value is not null and cardinality(value) <= 5
    and not exists (select 1 from unnest(value) tag where tag is null or char_length(btrim(tag)) not between 1 and 20)
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '기록하는 사람' check (char_length(btrim(nickname)) between 1 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.works (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  media_type text not null check (media_type in ('film','series','animation','book','comic','game','other')),
  creator text not null default '' check (char_length(creator) <= 150),
  release_year integer check (release_year between 1 and 9999),
  is_public boolean not null default false,
  catalog_work_id uuid references public.works(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint work_ownership check ((is_public and owner_id is null and catalog_work_id is null) or (not is_public and owner_id is not null))
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null references public.works(id),
  public_work_id uuid references public.works(id),
  experienced_on text,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','year','unknown')),
  summary text not null default '' check (char_length(summary) <= 240),
  body text not null default '' check (char_length(body) <= 20000),
  tags text[] not null default '{}' check (restory_private.valid_tags(tags)),
  favorite boolean not null default false,
  spoiler boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private','public')),
  moderated_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_date_shape check (restory_private.valid_experience_date(experienced_on, date_precision)),
  constraint published_work_required check (visibility <> 'public' or public_work_id is not null)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  unique(reporter_id, entry_id)
);

create index works_owner_idx on public.works(owner_id);
create index entries_owner_created_idx on public.entries(user_id, created_at desc);
create index entries_public_created_idx on public.entries(created_at desc, id desc) where visibility = 'public' and not moderated_hidden;
create index entries_public_work_idx on public.entries(public_work_id) where visibility = 'public' and not moderated_hidden;
create index reports_entry_idx on public.reports(entry_id);

create function restory_private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Accept only the explicit nickname field. Never derive it from an email, and
  -- never copy administrator flags from user-editable authentication metadata.
  insert into public.profiles(id,nickname) values (new.id, case
    when jsonb_typeof(new.raw_user_meta_data -> 'nickname') = 'string'
      and char_length(btrim(new.raw_user_meta_data ->> 'nickname')) between 1 and 40
    then btrim(new.raw_user_meta_data ->> 'nickname')
    else '기록하는 사람'
  end) on conflict(id) do nothing;
  return new;
end $$;
create trigger restory_create_profile after insert on auth.users
for each row execute function restory_private.create_profile();
insert into public.profiles(id) select id from auth.users on conflict(id) do nothing;

create function restory_private.catalog_visible(p_work_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.entries e where e.public_work_id = p_work_id and e.visibility = 'public' and not e.moderated_hidden)
$$;

create function restory_private.work_in_my_archive(p_work_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.entries where work_id = p_work_id and user_id = auth.uid())
$$;

create function restory_private.guard_entry_work() returns trigger
language plpgsql security definer set search_path = '' as $$
declare selected_work public.works;
begin
  select * into selected_work from public.works where id = new.work_id;
  if not found or not (selected_work.owner_id = new.user_id or selected_work.is_public) then
    raise exception 'Cannot attach a private work belonging to another user' using errcode = '42501';
  end if;
  -- A new reference may only select a currently visible public work. Existing
  -- personal records survive when another author later unpublishes that work.
  if selected_work.is_public and (tg_op = 'INSERT' or new.work_id is distinct from old.work_id)
    and not restory_private.catalog_visible(new.work_id) then
    raise exception 'Public work is no longer available' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.work_id is distinct from old.work_id then
    new.visibility := 'private';
    new.public_work_id := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger restory_guard_entry before insert or update on public.entries
for each row execute function restory_private.guard_entry_work();

alter table public.profiles enable row level security;
alter table public.works enable row level security;
alter table public.entries enable row level security;
alter table public.reports enable row level security;
revoke all on public.profiles, public.works, public.entries, public.reports from anon, authenticated;
grant select(id,nickname), update(nickname) on public.profiles to authenticated;
grant select on public.works to anon, authenticated;
grant insert(owner_id,title,media_type,creator,release_year) on public.works to authenticated;
grant select, delete on public.entries to authenticated;
grant insert(user_id,work_id,experienced_on,date_precision,summary,body,tags,favorite,spoiler) on public.entries to authenticated;
grant update(work_id,experienced_on,date_precision,summary,body,tags,favorite,spoiler) on public.entries to authenticated;
grant select on public.reports to authenticated;

create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy works_read on public.works for select to anon, authenticated using (
  owner_id = (select auth.uid()) or (is_public and (restory_private.catalog_visible(id) or restory_private.work_in_my_archive(id)))
);
create policy works_self_insert on public.works for insert to authenticated with check (owner_id = (select auth.uid()) and not is_public and catalog_work_id is null);
create policy entries_self_read on public.entries for select to authenticated using (user_id = (select auth.uid()));
create policy entries_self_insert on public.entries for insert to authenticated with check (user_id = (select auth.uid()) and visibility = 'private' and not moderated_hidden);
create policy entries_self_update on public.entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy entries_self_delete on public.entries for delete to authenticated using (user_id = (select auth.uid()));
create policy reports_self_read on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

create function public.set_entry_visibility(p_entry_id uuid, p_visibility text, p_catalog_work_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.entries; source_work public.works; public_id uuid;
begin
  if auth.uid() is null then raise exception 'Login required' using errcode = '42501'; end if;
  if p_visibility not in ('private','public') or p_visibility is null then raise exception 'Invalid visibility' using errcode = '22023'; end if;
  select * into item from public.entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if p_visibility = 'private' then
    update public.entries set visibility = 'private' where id = item.id returning * into item;
    return to_jsonb(item);
  end if;
  if item.moderated_hidden then raise exception 'Moderated entry cannot be republished' using errcode = '42501'; end if;
  select * into source_work from public.works where id = item.work_id for update;
  if p_catalog_work_id is not null then
    select id into public_id from public.works where id = p_catalog_work_id and is_public and restory_private.catalog_visible(id);
    if public_id is null then raise exception 'Public work not found' using errcode = 'P0002'; end if;
  elsif source_work.is_public then
    public_id := source_work.id;
  else
    public_id := source_work.catalog_work_id;
  end if;
  if public_id is null then
    -- Never merge different works merely because their titles match.
    insert into public.works(title,media_type,creator,release_year,is_public)
    values(source_work.title,source_work.media_type,source_work.creator,source_work.release_year,true)
    returning id into public_id;
  end if;
  if not source_work.is_public then
    update public.works set catalog_work_id = public_id where id = source_work.id;
  end if;
  update public.entries set visibility = 'public', public_work_id = public_id where id = item.id returning * into item;
  return to_jsonb(item);
end $$;

create function public.list_public_entries(p_work_id uuid default null, p_page integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(result.item order by result.created_at desc, result.id desc), '[]'::jsonb)
  from (
    select e.id, e.created_at, jsonb_build_object(
      'id',e.id,'work_id',w.id,'experienced_on',e.experienced_on,'date_precision',e.date_precision,
      'summary',e.summary,'body',e.body,'tags',e.tags,'favorite',false,'visibility','public',
      'spoiler',e.spoiler,'created_at',e.created_at,'updated_at',e.updated_at,'author_name',p.nickname,
      'work',jsonb_build_object('id',w.id,'title',w.title,'media_type',w.media_type,'creator',w.creator,
        'release_year',w.release_year,'owner_id',null,'is_public',true,'created_at',w.created_at)
    ) as item
    from public.entries e join public.works w on w.id = e.public_work_id join public.profiles p on p.id = e.user_id
    where e.visibility = 'public' and not e.moderated_hidden and w.is_public
      and (p_work_id is null or e.public_work_id = p_work_id or
        -- An owner may open the public discussion using their own private work ID.
        exists(select 1 from public.works own where own.id = p_work_id and own.owner_id = auth.uid() and own.catalog_work_id = e.public_work_id))
    order by e.created_at desc, e.id desc limit 20 offset (least(greatest(coalesce(p_page,0),0),100000)::bigint * 20)
  ) result
$$;

create function public.get_public_entry(p_entry_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',e.id,'work_id',w.id,'experienced_on',e.experienced_on,'date_precision',e.date_precision,
    'summary',e.summary,'body',e.body,'tags',e.tags,'favorite',false,'visibility','public',
    'spoiler',e.spoiler,'created_at',e.created_at,'updated_at',e.updated_at,'author_name',p.nickname,
    'work',jsonb_build_object('id',w.id,'title',w.title,'media_type',w.media_type,'creator',w.creator,
      'release_year',w.release_year,'owner_id',null,'is_public',true,'created_at',w.created_at)
  ) from public.entries e join public.works w on w.id = e.public_work_id join public.profiles p on p.id = e.user_id
  where e.id = p_entry_id and e.visibility = 'public' and not e.moderated_hidden and w.is_public
$$;

create function public.report_entry(p_entry_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required' using errcode = '42501'; end if;
  if not exists(select 1 from public.entries where id = p_entry_id and visibility = 'public' and not moderated_hidden) then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  insert into public.reports(reporter_id,entry_id,reason) values(auth.uid(),p_entry_id,btrim(p_reason))
  on conflict(reporter_id,entry_id) do update set reason = excluded.reason, status = 'open', created_at = now();
end $$;

create function public.is_current_user_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_admin)
$$;

create function public.list_moderation_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_current_user_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb) into result from (
    select r.created_at,jsonb_build_object('id',r.id,'entryId',e.id,'reason',r.reason,'createdAt',r.created_at,
      'status',r.status,'summary',e.summary,'body',e.body,'authorName',p.nickname,'hidden',e.moderated_hidden) item
    from public.reports r join public.entries e on e.id = r.entry_id join public.profiles p on p.id = e.user_id
    order by r.created_at desc limit 100
  ) reports;
  return result;
end $$;

create function public.moderate_entry(p_entry_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_current_user_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  update public.entries set moderated_hidden = p_hidden where id = p_entry_id;
  if not found then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  update public.reports set status = 'resolved' where entry_id = p_entry_id;
end $$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare current_id uuid := auth.uid();
begin
  if current_id is null then raise exception 'Login required' using errcode = '42501'; end if;
  -- Delete records first so their work references do not block cascading deletion.
  delete from public.entries where user_id = current_id;
  delete from auth.users where id = current_id;
end $$;

-- Functions default to EXECUTE for PUBLIC in PostgreSQL. Explicitly allow only
-- intended callers; security-definer helpers use a fixed empty search_path.
revoke all on all functions in schema restory_private from public, anon, authenticated;
grant usage on schema restory_private to anon, authenticated;
grant execute on function restory_private.catalog_visible(uuid), restory_private.work_in_my_archive(uuid) to anon, authenticated;
grant execute on function restory_private.valid_experience_date(text,text), restory_private.valid_tags(text[]) to authenticated;
revoke all on function public.set_entry_visibility(uuid,text,uuid), public.list_public_entries(uuid,integer),
  public.report_entry(uuid,text), public.is_current_user_admin(), public.list_moderation_reports(),
  public.moderate_entry(uuid,boolean), public.delete_my_account(), public.get_public_entry(uuid) from public, anon, authenticated;
grant execute on function public.list_public_entries(uuid,integer), public.get_public_entry(uuid) to anon, authenticated;
grant execute on function public.set_entry_visibility(uuid,text,uuid), public.report_entry(uuid,text),
  public.is_current_user_admin(), public.list_moderation_reports(), public.moderate_entry(uuid,boolean),
  public.delete_my_account() to authenticated;
