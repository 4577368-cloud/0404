-- =============================================================================
-- 管理后台：对话用量、分享裂变、按邮箱查对话明细（本地 service_role / admin_overview 同模型）
-- 依赖：001_user_analytics.sql（user_prompt_logs / user_stats）
--       004_share_referral.sql + 005_share_referral_emails.sql（分享相关表）
-- 在 Supabase SQL Editor 以 postgres 执行；勿对 anon/authenticated 开放 EXECUTE。
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 每日对话用量（实时聚合，不依赖物化视图刷新）
-- ---------------------------------------------------------------------------
create or replace function public.admin_conversation_usage(p_days int default 30)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with ndays as (
    select greatest(least(coalesce(p_days, 30), 365), 1) as n
  ),
  d as (
    select generate_series(
      (current_date - (select n - 1 from ndays))::date,
      current_date::date,
      interval '1 day'
    )::date as day
  ),
  daily as (
    select
      date_trunc('day', pl.created_at)::date as day,
      count(*)::int as total_prompts,
      count(distinct pl.user_id)::int as active_users,
      count(distinct pl.user_id) filter (where coalesce(u.is_anonymous, false) = true)::int as anonymous_active_users,
      count(distinct pl.user_id) filter (where coalesce(u.is_anonymous, false) = false)::int as authorized_active_users,
      count(distinct pl.conversation_id)::int as distinct_conversations,
      count(*) filter (where coalesce(us.is_vip, false) = true)::int as vip_prompts,
      count(*) filter (where coalesce(us.is_vip, false) = false)::int as free_prompts,
      count(*) filter (where coalesce(u.is_anonymous, false) = true)::int as anonymous_prompts,
      count(*) filter (where coalesce(u.is_anonymous, false) = false)::int as authorized_prompts
    from public.user_prompt_logs pl
    left join auth.users u on u.id = pl.user_id
    left join public.user_stats us on us.user_id = pl.user_id
    cross join ndays
    where pl.created_at >= (current_date - (select n - 1 from ndays))
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.day,
        'total_prompts', coalesce(x.total_prompts, 0),
        'active_users', coalesce(x.active_users, 0),
        'anonymous_active_users', coalesce(x.anonymous_active_users, 0),
        'authorized_active_users', coalesce(x.authorized_active_users, 0),
        'distinct_conversations', coalesce(x.distinct_conversations, 0),
        'vip_prompts', coalesce(x.vip_prompts, 0),
        'free_prompts', coalesce(x.free_prompts, 0),
        'anonymous_prompts', coalesce(x.anonymous_prompts, 0),
        'authorized_prompts', coalesce(x.authorized_prompts, 0)
      )
      order by d.day
    ),
    '[]'::jsonb
  )
  from d
  left join daily x on x.day = d.day;
$$;

-- ---------------------------------------------------------------------------
-- 2) 分享裂变：汇总 + 漏斗 + 日趋势（一次返回，便于前端）
-- ---------------------------------------------------------------------------
create or replace function public.admin_share_insights(p_days int default 30)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with ndays as (
    select greatest(least(coalesce(p_days, 30), 365), 1) as n
  ),
  summary as (
    select jsonb_build_object(
      'total_share_links', (select count(*)::int from public.share_links),
      'total_visits', (select count(*)::int from public.share_link_visits),
      'anonymous_visits', (
        select count(*)::int
        from public.share_link_visits v
        where coalesce(v.visitor_is_anonymous, false) = true or v.visitor_user_id is null
      ),
      'authorized_visits', (
        select count(*)::int
        from public.share_link_visits v
        where coalesce(v.visitor_is_anonymous, false) = false and v.visitor_user_id is not null
      ),
      'links_with_visits', (select count(distinct share_link_id)::int from public.share_link_visits),
      'oauth_attributions', (select count(*)::int from public.share_link_oauth_attributions),
      'unique_referred_users', (select count(distinct attributed_user_id)::int from public.share_link_oauth_attributions)
    ) as j
  ),
  funnel as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'stage', f.stage,
          'count', f.cnt,
          'percentage', f.pct
        )
        order by f.ord
      ),
      '[]'::jsonb
    ) as j
    from (
      select 1 as ord, '分享链接总数'::text as stage,
        (select count(*)::bigint from public.share_links) as cnt,
        100.0::numeric as pct
      union all
      select 2, '有过访问的链接数',
        (select count(distinct share_link_id)::bigint from public.share_link_visits),
        round(
          (select count(distinct share_link_id)::numeric from public.share_link_visits)
          / nullif((select count(*)::numeric from public.share_links), 0) * 100,
          2
        )
      union all
      select 3, '累计访问次数',
        (select count(*)::bigint from public.share_link_visits),
        null::numeric
      union all
      select 4, 'OAuth 归因次数',
        (select count(*)::bigint from public.share_link_oauth_attributions),
        round(
          (select count(*)::numeric from public.share_link_oauth_attributions)
          / nullif((select count(*)::numeric from public.share_links), 0) * 100,
          2
        )
    ) f
  ),
  d as (
    select generate_series(
      (current_date - (select n - 1 from ndays))::date,
      current_date::date,
      interval '1 day'
    )::date as day
  ),
  links_daily as (
    select date_trunc('day', sl.created_at)::date as day, count(*)::int as new_share_links
    from public.share_links sl
    cross join ndays
    where sl.created_at >= (current_date - (select n - 1 from ndays))
    group by 1
  ),
  visits_daily as (
    select
      date_trunc('day', v.created_at)::date as day,
      count(*)::int as visits,
      count(distinct v.visitor_user_id)::int as unique_visitors,
      count(*) filter (where coalesce(v.visitor_is_anonymous, false) = true or v.visitor_user_id is null)::int as anonymous_visits,
      count(*) filter (where coalesce(v.visitor_is_anonymous, false) = false and v.visitor_user_id is not null)::int as authorized_visits
    from public.share_link_visits v
    cross join ndays
    where v.created_at >= (current_date - (select n - 1 from ndays))
    group by 1
  ),
  oauth_daily as (
    select date_trunc('day', oa.created_at)::date as day, count(*)::int as oauth_signups
    from public.share_link_oauth_attributions oa
    cross join ndays
    where oa.created_at >= (current_date - (select n - 1 from ndays))
    group by 1
  ),
  daily_series as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', d.day,
          'new_share_links', coalesce(l.new_share_links, 0),
          'visits', coalesce(v.visits, 0),
          'unique_visitors', coalesce(v.unique_visitors, 0),
          'anonymous_visits', coalesce(v.anonymous_visits, 0),
          'authorized_visits', coalesce(v.authorized_visits, 0),
          'oauth_signups', coalesce(o.oauth_signups, 0)
        )
        order by d.day
      ),
      '[]'::jsonb
    ) as j
    from d
    left join links_daily l on l.day = d.day
    left join visits_daily v on v.day = d.day
    left join oauth_daily o on o.day = d.day
  )
  select jsonb_build_object(
    'summary', (select j from summary),
    'funnel', (select j from funnel),
    'daily', (select j from daily_series)
  );
$$;

comment on function public.admin_share_insights(int) is '分享裂变：汇总指标、漏斗、按日趋势（与 009 视图语义相近，实时聚合）';

-- ---------------------------------------------------------------------------
-- 3) 按邮箱关键词查对话明细（最多匹配 10 个用户，避免全表扫过大）
-- ---------------------------------------------------------------------------
create or replace function public.admin_prompt_logs_by_email(
  p_email text default '',
  p_page int default 1,
  p_page_size int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_page_size int := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset int := (v_page - 1) * v_page_size;
  v_kw text := trim(coalesce(p_email, ''));
  v_match_count int := 0;
  v_ids uuid[];
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_matched jsonb := '[]'::jsonb;
begin
  if v_kw = '' then
    return jsonb_build_object(
      'error', 'email_required',
      'message', '请填写邮箱或关键词'
    );
  end if;

  select count(*) into v_match_count
  from (
    select 1
    from auth.users u
    where coalesce(u.is_anonymous, false) = false
      and coalesce(u.email, '') ilike '%' || v_kw || '%'
    limit 11
  ) s;

  if v_match_count = 0 then
    return jsonb_build_object(
      'page', v_page,
      'page_size', v_page_size,
      'total', 0,
      'matched_user_count', 0,
      'matched_emails', '[]'::jsonb,
      'rows', '[]'::jsonb
    );
  end if;

  if v_match_count > 10 then
    return jsonb_build_object(
      'error', 'too_many_matches',
      'message', '匹配到超过 10 个用户，请输入更精确的邮箱',
      'match_count', v_match_count
    );
  end if;

  select array_agg(id order by created_at desc) into v_ids
  from (
    select u.id, u.created_at
    from auth.users u
    where coalesce(u.is_anonymous, false) = false
      and coalesce(u.email, '') ilike '%' || v_kw || '%'
    order by u.created_at desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(u.email order by u.created_at desc), '[]'::jsonb)
  into v_matched
  from auth.users u
  where u.id = any(v_ids);

  select count(*) into v_total
  from public.user_prompt_logs pl
  where pl.user_id = any(v_ids);

  with page_rows as (
    select
      pl.id,
      pl.user_id,
      coalesce(u.email, '') as email,
      pl.conversation_id,
      pl.content_preview,
      pl.extracted_urls,
      pl.created_at
    from public.user_prompt_logs pl
    join auth.users u on u.id = pl.user_id
    where pl.user_id = any(v_ids)
    order by pl.created_at desc
    limit v_page_size
    offset v_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'user_id', pr.user_id,
        'email', pr.email,
        'conversation_id', pr.conversation_id,
        'content_preview', pr.content_preview,
        'extracted_urls', pr.extracted_urls,
        'created_at', pr.created_at
      )
      order by pr.created_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_rows
  from page_rows pr;

  return jsonb_build_object(
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'matched_user_count', coalesce(array_length(v_ids, 1), 0),
    'matched_emails', v_matched,
    'rows', v_rows
  );
end;
$$;

comment on function public.admin_prompt_logs_by_email(text, int, int) is '按邮箱关键词分页查询 user_prompt_logs，最多聚合 10 个匹配用户';

-- ---------------------------------------------------------------------------
-- 权限：仅 service_role（与 008 一致）
-- ---------------------------------------------------------------------------
revoke all on function public.admin_conversation_usage(int) from public, anon, authenticated;
revoke all on function public.admin_share_insights(int) from public, anon, authenticated;
revoke all on function public.admin_prompt_logs_by_email(text, int, int) from public, anon, authenticated;

grant execute on function public.admin_conversation_usage(int) to service_role;
grant execute on function public.admin_share_insights(int) to service_role;
grant execute on function public.admin_prompt_logs_by_email(text, int, int) to service_role;

commit;

-- select public.admin_conversation_usage(14);
-- select public.admin_share_insights(30);
-- select public.admin_prompt_logs_by_email('gmail', 1, 20);
