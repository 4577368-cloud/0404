-- =============================================================================
-- 管理后台：分享列表（分享人、短链、访问次数、独立访客、带来邮箱、访客对话摘要）
-- 依赖：001、004、005（share_links / share_link_visits / share_link_oauth_attributions / user_prompt_logs）
-- 邮箱口径：优先 auth.users.email（访客后续邮箱授权后会有值），否则 OAuth 归因表 visitor_email，否则访问记录时的 visitor_email。
-- 仅 service_role 执行；在 Supabase SQL Editor 以 postgres 执行。
-- =============================================================================

begin;

create or replace function public.admin_share_list(
  p_page int default 1,
  p_page_size int default 20,
  p_keyword text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_size int := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_offset int := (v_page - 1) * v_size;
  v_kw text := trim(coalesce(p_keyword, ''));
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_visits bigint;
  v_unique bigint;
  v_visitor record;
  v_resolved text;
  v_oa_email text;
  v_previews jsonb;
  v_visitors jsonb := '[]'::jsonb;
  v_emails text[] := array[]::text[];
  v_row jsonb;
  v_max_visitors constant int := 60;
  v_max_previews constant int := 8;
  v_preview_len constant int := 500;
begin
  select count(*) into v_total
  from public.share_links sl
  left join auth.users ou on ou.id = sl.owner_user_id
  where
    v_kw = ''
    or sl.short_code ilike '%' || v_kw || '%'
    or coalesce(sl.owner_email, '') ilike '%' || v_kw || '%'
    or coalesce(ou.email, '') ilike '%' || v_kw || '%';

  for r in
    select
      sl.id as share_link_id,
      sl.short_code,
      sl.owner_user_id as sharer_user_id,
      coalesce(nullif(trim(sl.owner_email), ''), nullif(trim(ou.email), ''), sl.owner_user_id::text) as sharer_email,
      coalesce(sl.owner_is_anonymous, false) as sharer_is_anonymous,
      sl.created_at as link_created_at
    from public.share_links sl
    left join auth.users ou on ou.id = sl.owner_user_id
    where
      v_kw = ''
      or sl.short_code ilike '%' || v_kw || '%'
      or coalesce(sl.owner_email, '') ilike '%' || v_kw || '%'
      or coalesce(ou.email, '') ilike '%' || v_kw || '%'
    order by sl.created_at desc
    limit v_size
    offset v_offset
  loop
    select count(*) into v_visits
    from public.share_link_visits v
    where v.share_link_id = r.share_link_id;

    select count(distinct v.visitor_user_id) into v_unique
    from public.share_link_visits v
    where v.share_link_id = r.share_link_id;

    v_visitors := '[]'::jsonb;
    v_emails := array[]::text[];

    for v_visitor in
      select distinct on (v.visitor_user_id)
        v.visitor_user_id,
        v.visitor_email as visit_snapshot_email
      from public.share_link_visits v
      where v.share_link_id = r.share_link_id
      order by v.visitor_user_id, v.created_at desc
      limit v_max_visitors
    loop
      select nullif(trim(a.visitor_email), '') into v_oa_email
      from public.share_link_oauth_attributions a
      where a.share_link_id = r.share_link_id
        and a.attributed_user_id = v_visitor.visitor_user_id
      order by a.created_at desc
      limit 1;

      select
        coalesce(
          nullif(trim(u.email), ''),
          v_oa_email,
          nullif(trim(v_visitor.visit_snapshot_email), '')
        )
      into v_resolved
      from auth.users u
      where u.id = v_visitor.visitor_user_id;

      if v_resolved is not null and length(v_resolved) > 0 then
        if not (v_resolved = any (v_emails)) then
          v_emails := array_append(v_emails, v_resolved);
        end if;
      end if;

      select coalesce(
        jsonb_agg(to_jsonb(left(t.preview, v_preview_len)) order by t.created_at desc),
        '[]'::jsonb
      )
      into v_previews
      from (
        select pl.content_preview as preview, pl.created_at
        from public.user_prompt_logs pl
        where pl.user_id = v_visitor.visitor_user_id
        order by pl.created_at desc
        limit v_max_previews
      ) t;

      v_visitors := v_visitors || jsonb_build_array(
        jsonb_build_object(
          'visitor_user_id', v_visitor.visitor_user_id,
          'resolved_email', coalesce(v_resolved, ''),
          'prompt_previews', v_previews
        )
      );
    end loop;

    v_row := jsonb_build_object(
      'share_link_id', r.share_link_id,
      'short_code', r.short_code,
      'ref_param', '?ref=' || r.short_code,
      'sharer_user_id', r.sharer_user_id,
      'sharer_email', r.sharer_email,
      'sharer_is_anonymous', r.sharer_is_anonymous,
      'link_created_at', r.link_created_at,
      'visit_count', v_visits,
      'unique_visitors', v_unique,
      'brought_emails', coalesce(to_jsonb(v_emails), '[]'::jsonb),
      'visitors', v_visitors
    );

    v_rows := v_rows || jsonb_build_array(v_row);
  end loop;

  return jsonb_build_object(
    'page', v_page,
    'page_size', v_size,
    'total', v_total,
    'rows', v_rows
  );
end;
$$;

comment on function public.admin_share_list(int, int, text) is '分享列表：访问/独立访客/带来邮箱/访客对话摘要（分页，每链最多展开访客数与预览条数有上限）';

revoke all on function public.admin_share_list(int, int, text) from public, anon, authenticated;
grant execute on function public.admin_share_list(int, int, text) to service_role;

commit;

-- select public.admin_share_list(1, 10, '');
