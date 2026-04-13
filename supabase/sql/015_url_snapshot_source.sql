-- =============================================================================
-- URL 快照来源统计：记录每个 URL 使用 Jina 还是 Trickle 代理抓取
-- 依赖：001_user_analytics.sql（user_prompt_logs 表）
-- =============================================================================

begin;

-- 1) 在 user_prompt_logs 表添加 snapshot_sources 字段（记录每个 URL 的抓取来源）
alter table public.user_prompt_logs 
add column if not exists snapshot_sources jsonb default '{}'::jsonb;

comment on column public.user_prompt_logs.snapshot_sources is 'URL 快照来源记录，格式: {"https://example.com": "jina", "https://test.com": "trickle"}';

-- 2) 修改 consume_chat_turn RPC，增加 snapshot_sources 参数
CREATE OR REPLACE FUNCTION public.consume_chat_turn(
  p_conversation_id TEXT,
  p_content TEXT,
  p_extracted_urls JSONB DEFAULT '[]'::jsonb,
  p_snapshot_sources JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  max_free INTEGER;
  row RECORD;
  preview TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  END IF;

  SELECT (value)::integer INTO max_free FROM public.app_config WHERE key = 'max_free_quota';
  IF max_free IS NULL OR max_free < 1 THEN max_free := 30; END IF;

  SELECT * INTO row FROM public.user_stats WHERE user_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_stats (user_id) VALUES (uid) RETURNING * INTO row;
  END IF;

  IF row.is_vip THEN
    UPDATE public.user_stats
    SET total_prompts = total_prompts + 1, updated_at = now()
    WHERE user_id = uid;
    preview := left(coalesce(p_content, ''), 4000);
    INSERT INTO public.user_prompt_logs (user_id, conversation_id, content_preview, extracted_urls, snapshot_sources)
    VALUES (uid, p_conversation_id, preview, coalesce(p_extracted_urls, '[]'::jsonb), coalesce(p_snapshot_sources, '{}'::jsonb));
    RETURN jsonb_build_object(
      'allowed', true,
      'is_vip', true,
      'remaining_free', NULL,
      'total_prompts', row.total_prompts + 1
    );
  END IF;

  IF row.free_quota_used >= max_free THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exhausted', 'max_free', max_free);
  END IF;

  UPDATE public.user_stats
  SET
    free_quota_used = free_quota_used + 1,
    total_prompts = total_prompts + 1,
    updated_at = now()
  WHERE user_id = uid;

  preview := left(coalesce(p_content, ''), 4000);
  INSERT INTO public.user_prompt_logs (user_id, conversation_id, content_preview, extracted_urls, snapshot_sources)
  VALUES (uid, p_conversation_id, preview, coalesce(p_extracted_urls, '[]'::jsonb), coalesce(p_snapshot_sources, '{}'::jsonb));

  RETURN jsonb_build_object(
    'allowed', true,
    'is_vip', false,
    'remaining_free', max_free - (row.free_quota_used + 1),
    'total_prompts', row.total_prompts + 1,
    'max_free', max_free
  );
END;
$$;

comment on function public.consume_chat_turn(TEXT, TEXT, JSONB, JSONB) is '消费一次对话额度，支持记录 URL 快照来源（jina/trickle）';

-- 3) 更新 admin_url_inputs 函数，增加 snapshot_source 列
CREATE OR REPLACE FUNCTION public.admin_url_inputs(
  p_page int default 1,
  p_page_size int default 20,
  p_keyword text default ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
      pl.created_at,
      pl.snapshot_sources
    from public.user_prompt_logs pl
    cross join lateral jsonb_array_elements_text(coalesce(pl.extracted_urls, '[]'::jsonb)) as url(value)
  ),
  normalized as (
    select
      e.user_id,
      e.url,
      e.created_at,
      e.snapshot_sources,
      regexp_replace(lower(e.url), '^https?://', '') as url_no_scheme
    from expanded e
    where e.url is not null and e.url <> ''
  ),
  with_sources as (
    select
      n.url,
      n.user_id,
      n.created_at,
      -- 从 snapshot_sources 中提取当前 URL 的来源
      n.snapshot_sources->>n.url as snapshot_source
    from normalized n
  ),
  grouped as (
    select
      n.url as product_url,
      n.url_no_scheme,
      n.user_id,
      count(*)::int as mentioned_times,
      min(n.created_at) as first_seen_at,
      max(n.created_at) as last_seen_at,
      -- 取最新非空来源（在分组后通过 string_agg + 过滤实现）
      (
        select ws.snapshot_source
        from with_sources ws
        where ws.url = n.url and ws.user_id = n.user_id and ws.snapshot_source is not null
        order by ws.created_at desc
        limit 1
      ) as snapshot_source
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

  with expanded2 as (
    select
      pl.user_id,
      nullif(trim(url.value), '') as url,
      pl.created_at,
      pl.snapshot_sources
    from public.user_prompt_logs pl
    cross join lateral jsonb_array_elements_text(coalesce(pl.extracted_urls, '[]'::jsonb)) as url(value)
  ),
  normalized2 as (
    select
      e.user_id,
      e.url,
      e.created_at,
      e.snapshot_sources,
      regexp_replace(lower(e.url), '^https?://', '') as url_no_scheme
    from expanded2 e
    where e.url is not null and e.url <> ''
  ),
  with_sources2 as (
    select
      n.url,
      n.user_id,
      n.created_at,
      n.snapshot_sources->>n.url as snapshot_source
    from normalized2 n
  ),
  grouped2 as (
    select
      n.url as product_url,
      n.url_no_scheme,
      n.user_id,
      count(*)::int as mentioned_times,
      min(n.created_at) as first_seen_at,
      max(n.created_at) as last_seen_at,
      (
        select ws.snapshot_source
        from with_sources2 ws
        where ws.url = n.url and ws.user_id = n.user_id and ws.snapshot_source is not null
        order by ws.created_at desc
        limit 1
      ) as snapshot_source
    from normalized2 n
    group by n.url, n.url_no_scheme, n.user_id
  ),
  filtered as (
    select
      g.*,
      coalesce(nullif(trim(u.email), ''), g.user_id::text) as user_identity,
      coalesce(u.email, '') as email
    from grouped2 g
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
        'last_seen_at', f.last_seen_at,
        'snapshot_source', f.snapshot_source
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

comment on function public.admin_url_inputs(int, int, text) is 'URL 输入明细：用户输入并被提取/分析过的商品链接，包含快照来源统计（jina/trickle）';

-- 4) 权限更新
GRANT EXECUTE ON FUNCTION public.consume_chat_turn(TEXT, TEXT, JSONB, JSONB) TO authenticated;

revoke all on function public.admin_url_inputs(int, int, text) from public, anon, authenticated;
grant execute on function public.admin_url_inputs(int, int, text) to service_role;

commit;

-- =============================================================================
-- 验证查询
-- =============================================================================
-- 查看某个用户的 URL 和对应的快照来源
-- select 
--   id,
--   content_preview,
--   extracted_urls,
--   snapshot_sources,
--   created_at
-- from public.user_prompt_logs 
-- where user_id = 'xxx'
-- order by created_at desc;

-- 统计各来源使用量
-- select 
--   value as snapshot_source,
--   count(*) as usage_count
-- from public.user_prompt_logs,
-- jsonb_each(snapshot_sources)
-- where value is not null
-- group by value;
