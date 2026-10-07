-- Public reflections are searched on the server so results are not limited to the first page.
-- The query matches work title, creator, summary, body and tags. Nicknames and emails are not searched.
drop function if exists public.list_public_entries(uuid, integer);

create function public.list_public_entries(p_work_id uuid default null, p_page integer default 0, p_query text default '')
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
    cross join lateral (
      select '%' || replace(replace(replace(left(btrim(coalesce(p_query, '')), 200), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
             left(btrim(coalesce(p_query, '')), 200) = '' as empty
    ) q
    where e.visibility = 'public' and not e.moderated_hidden and w.is_public
      and (p_work_id is null or e.public_work_id = p_work_id or
        -- An owner may open the public discussion using their own private work ID.
        exists(select 1 from public.works own where own.id = p_work_id and own.owner_id = auth.uid() and own.catalog_work_id = e.public_work_id))
      and (q.empty or w.title ilike q.pattern escape '\' or w.creator ilike q.pattern escape '\'
        or e.summary ilike q.pattern escape '\' or e.body ilike q.pattern escape '\'
        or exists(select 1 from unnest(e.tags) tag where tag ilike q.pattern escape '\'))
    order by e.created_at desc, e.id desc limit 20 offset (least(greatest(coalesce(p_page,0),0),100000)::bigint * 20)
  ) result
$$;

revoke all on function public.list_public_entries(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.list_public_entries(uuid,integer,text) to anon, authenticated;
