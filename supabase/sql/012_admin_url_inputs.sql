-- =============================================================================
-- 管理后台：链接网站 / 商品链接维度（用户输入并分析过的 URL 明细）
-- 依赖：001_user_analytics.sql（user_prompt_logs.extracted_urls）
-- 口径：以 user_prompt_logs.extracted_urls 中的 URL 为准。
-- 展示身份：优先 email；无邮箱时使用 user_id。
-- =============================================================================

begin;

create or replace function public.admin_url_inputs(
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
  v_size int := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset int := (v_page - 1) * v_size;
  v_kw text := trim(coalesce(p_keyword, ''));
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  with expanded as (
    select
      pl.user_id,
      nullif(trim(url.value), '') as url,
      pl.created_at
    from public.user_prompt_logs pl
    cross join lateral jsonb_array_elements_text(coalesce(pl.extracted_urls, '[]'::jsonb)) as url(value)
  ),
  normalized as (
    select
      e.user_id,
      e.url,
      e.created_at,
      regexp_replace(lower(e.url), '^https?://', '') as url_no_scheme
    from expanded e
    where e.url is not null and e.url <> ''
  ),
  grouped as (
    select
      n.url as product_url,
      n.url_no_scheme,
      n.user_id,
      count(*)::int as mentioned_times,
      min(n.created_at) as first_seen_at,
      max(n.created_at) as last_seen_at
    from normalized n
    group by n.url, n.url_no_scheme, n.user_id
  ),
  filtered as (
    select
      g.*,
      coalesce(nullif(trim(u.email), ''), g.user_id::text) as user_identity
    from grouped g
    left join auth.users u on u.id = g.user_id
    where
      v_kw = ''
      or g.product_url ilike '%' || v_kw || '%'
      or coalesce(u.email, '') ilike '%' || v_kw || '%'
      or g.user_id::text ilike '%' || v_kw || '%'
  )
  select count(*) into v_total from filtered;

  with expanded as (
    select
      pl.user_id,
      nullif(trim(url.value), '') as url,
      pl.created_at
    from public.user_prompt_logs pl
    cross join lateral jsonb_array_elements_text(coalesce(pl.extracted_urls, '[]'::jsonb)) as url(value)
  ),
  normalized as (
    select
      e.user_id,
      e.url,
      e.created_at,
      regexp_replace(lower(e.url), '^https?://', '') as url_no_scheme
    from expanded e
    where e.url is not null and e.url <> ''
  ),
  grouped as (
    select
      n.url as product_url,
      n.url_no_scheme,
      n.user_id,
      count(*)::int as mentioned_times,
      min(n.created_at) as first_seen_at,
      max(n.created_at) as last_seen_at
    from normalized n
    group by n.url, n.url_no_scheme, n.user_id
  ),
  filtered as (
    select
      g.*,
      coalesce(nullif(trim(u.email), ''), g.user_id::text) as user_identity,
      coalesce(u.email, '') as email
    from grouped g
    left join auth.users u on u.id = g.user_id
    where
      v_kw = ''
      or g.product_url ilike '%' || v_kw || '%'
      or coalesce(u.email, '') ilike '%' || v_kw || '%'
      or g.user_id::text ilike '%' || v_kw || '%'
    order by g.last_seen_at desc
    limit v_size
    offset v_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_url', f.product_url,
        'url_no_scheme', f.url_no_scheme,
        'user_id', f.user_id,
        'email', f.email,
        'user_identity', f.user_identity,
        'mentioned_times', f.mentioned_times,
        'first_seen_at', f.first_seen_at,
        'last_seen_at', f.last_seen_at
      )
      order by f.last_seen_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from filtered f;

  return jsonb_build_object(
    'page', v_page,
    'page_size', v_size,
    'total', v_total,
    'rows', v_rows
  );
end;
$$;

comment on function public.admin_url_inputs(int, int, text) is 'URL 输入明细：用户输入并被提取/分析过的商品链接（按用户+URL 聚合）';

revoke all on function public.admin_url_inputs(int, int, text) from public, anon, authenticated;
grant execute on function public.admin_url_inputs(int, int, text) to service_role;

commit;

-- select public.admin_url_inputs(1, 20, '');
