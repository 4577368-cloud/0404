-- =============================================================================
-- Tangbuy AI — 管理后台数据分析仪表盘（Dashboard 1-4 物化视图与查询）
-- 在 Supabase Dashboard → SQL Editor 中以 postgres 角色执行
-- 所有时间统一转为 Asia/Shanghai (UTC+8)
--
-- 【执行前依赖】须已部署基础表（否则 CREATE VIEW/MV 会报 relation does not exist）：
--   001_user_analytics.sql（user_stats / user_prompt_logs / tangbuy_click_events）
--   004_share_referral.sql + 005_share_referral_emails.sql（share_links / visits / oauth_attributions）
--   007_product_inquiries.sql（product_inquiries）
--
-- 【常见错误 1】REFRESH MATERIALIZED VIEW CONCURRENTLY 要求物化视图上存在
--   「无 WHERE 的唯一索引」，且刷新时不能有其它会话持有该 MV 的锁。
--   本文件已为各 CONCURRENTLY 用到的 MV 补 UNIQUE INDEX（见下方补丁）。
--
-- 【常见错误 2】不要在终端用错误路径执行；若用 psql，路径含空格/中文请加引号：
--   psql "$DATABASE_URL" -f "009_admin_dashboard_analytics.sql"
--
-- 【语义说明】mv_daily_user_stats 按「用户注册日」分组，列 new_users_daily/weekly 等
--   是窗口过滤，与「按天一条汇总」的常见报表不同；若需按天汇总可后续再改 SQL。
-- =============================================================================

-- =====================
-- 时区辅助函数（如未创建）
-- =====================
CREATE OR REPLACE FUNCTION public.to_cst(ts TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(ts AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
$$;

-- =====================
-- DASHBOARD 1: 用户总览大屏
-- =====================

-- 1.1 每日用户活跃统计（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_user_stats;
CREATE MATERIALIZED VIEW public.mv_daily_user_stats AS
SELECT 
  DATE(u.created_at AT TIME ZONE 'Asia/Shanghai') as date_cst,
  COUNT(*) FILTER (WHERE u.created_at >= CURRENT_DATE - INTERVAL '1 days') as new_users_daily,
  COUNT(*) FILTER (WHERE u.created_at >= CURRENT_DATE - INTERVAL '7 days') as new_users_weekly,
  COUNT(*) FILTER (WHERE u.created_at >= CURRENT_DATE - INTERVAL '30 days') as new_users_monthly,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE COALESCE(u.raw_app_meta_data->>'provider', 'unknown') = 'anonymous') as anonymous_count,
  COUNT(*) FILTER (WHERE COALESCE(u.raw_app_meta_data->>'provider', 'unknown') != 'anonymous') as oauth_count,
  COUNT(*) FILTER (WHERE COALESCE(us.is_vip, false) = true) as vip_count
FROM auth.users u
LEFT JOIN public.user_stats us ON us.user_id = u.id
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX idx_mv_daily_user_stats_date ON public.mv_daily_user_stats (date_cst);
COMMENT ON MATERIALIZED VIEW public.mv_daily_user_stats IS '每日用户注册与身份分布统计（北京时间）';

-- 1.2 实时活跃指标（视图）
CREATE OR REPLACE VIEW public.v_realtime_metrics AS
SELECT 
  -- 总用户数
  (SELECT COUNT(*) FROM auth.users) as total_users,
  -- 今日新增
  (SELECT COUNT(*) FROM auth.users 
   WHERE created_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Shanghai' - INTERVAL '8 hours')) as today_new_users,
  -- 7日活跃（有对话记录的用户）
  (SELECT COUNT(DISTINCT user_id) FROM public.user_prompt_logs 
   WHERE created_at >= NOW() - INTERVAL '7 days') as d7_active_users,
  -- 30日活跃
  (SELECT COUNT(DISTINCT user_id) FROM public.user_prompt_logs 
   WHERE created_at >= NOW() - INTERVAL '30 days') as d30_active_users,
  -- VIP总数
  (SELECT COUNT(*) FROM public.user_stats WHERE is_vip = true) as total_vip,
  -- 总对话次数
  (SELECT COUNT(*) FROM public.user_prompt_logs) as total_prompts,
  -- 分享链接总数
  (SELECT COUNT(*) FROM public.share_links) as total_share_links,
  -- Tangbuy总点击
  (SELECT COUNT(*) FROM public.tangbuy_click_events) as total_tangbuy_clicks;

COMMENT ON VIEW public.v_realtime_metrics IS '实时核心指标卡片数据';

-- 1.3 用户留存分析（视图）
CREATE OR REPLACE VIEW public.v_user_retention AS
WITH user_cohorts AS (
  SELECT 
    user_id,
    DATE(MIN(created_at)) as first_active_date,
    DATE(MAX(created_at)) as last_active_date,
    COUNT(*) as total_prompts
  FROM public.user_prompt_logs
  GROUP BY user_id
)
SELECT 
  first_active_date as cohort_date,
  COUNT(*) as cohort_size,
  COUNT(*) FILTER (WHERE last_active_date >= first_active_date + INTERVAL '1 days') as d1_retained,
  COUNT(*) FILTER (WHERE last_active_date >= first_active_date + INTERVAL '7 days') as d7_retained,
  COUNT(*) FILTER (WHERE last_active_date >= first_active_date + INTERVAL '30 days') as d30_retained,
  ROUND(COUNT(*) FILTER (WHERE last_active_date >= first_active_date + INTERVAL '1 days')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2) as d1_retention_rate,
  ROUND(COUNT(*) FILTER (WHERE last_active_date >= first_active_date + INTERVAL '7 days')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2) as d7_retention_rate,
  ROUND(COUNT(*) FILTER (WHERE last_active_date >= first_active_date + INTERVAL '30 days')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2) as d30_retention_rate
FROM user_cohorts
GROUP BY first_active_date
ORDER BY first_active_date DESC;

COMMENT ON VIEW public.v_user_retention IS '用户留存率分析（按首次活跃日期分群）';

-- 1.4 登录渠道分布（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_auth_provider_distribution;
CREATE MATERIALIZED VIEW public.mv_auth_provider_distribution AS
SELECT 
  COALESCE(raw_app_meta_data->>'provider', 'unknown') as provider,
  COUNT(*) as user_count,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM auth.users) * 100, 2) as percentage
FROM auth.users
GROUP BY 1
ORDER BY 2 DESC;

-- CONCURRENTLY 刷新要求唯一索引（按 provider 每组一行，唯一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_auth_provider_dist_provider
  ON public.mv_auth_provider_distribution (provider);

COMMENT ON MATERIALIZED VIEW public.mv_auth_provider_distribution IS '用户登录渠道分布统计';

-- 1.5 每小时活跃用户趋势（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_hourly_active_users;
CREATE MATERIALIZED VIEW public.mv_hourly_active_users AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_prompts
FROM public.user_prompt_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- CONCURRENTLY 刷新要求唯一索引（按 hour 每组一行）
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_active_users_hour
  ON public.mv_hourly_active_users (hour);
COMMENT ON MATERIALIZED VIEW public.mv_hourly_active_users IS '近7天每小时活跃用户数';

-- =====================
-- Dashboard 1 刷新函数
-- =====================
CREATE OR REPLACE FUNCTION public.refresh_dashboard_1()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_user_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_auth_provider_distribution;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_hourly_active_users;
END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_1() IS '刷新Dashboard 1所有物化视图';

-- =============================================================================
-- Dashboard 1 常用查询示例（复制到 SQL Editor 执行即可查看数据）
-- =============================================================================

-- D1-1: 今日实时指标（用于仪表板顶部卡片）
-- SELECT * FROM v_realtime_metrics;

-- D1-2: 近30天用户增长趋势
-- SELECT * FROM mv_daily_user_stats 
-- WHERE date_cst >= CURRENT_DATE - INTERVAL '30 days' 
-- ORDER BY date_cst;

-- D1-3: 用户登录渠道分布（饼图数据）
-- SELECT * FROM mv_auth_provider_distribution;

-- D1-4: 近7天留存率趋势
-- SELECT * FROM v_user_retention 
-- WHERE cohort_date >= CURRENT_DATE - INTERVAL '7 days';

-- D1-5: 每小时活跃用户（热力图数据）
-- SELECT * FROM mv_hourly_active_users;

-- =============================================================================
-- DASHBOARD 2: 对话与用量分析
-- =============================================================================

-- 2.1 每日对话统计（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_conversation_stats;
CREATE MATERIALIZED VIEW public.mv_daily_conversation_stats AS
SELECT 
  DATE(pl.created_at AT TIME ZONE 'Asia/Shanghai') as date_cst,
  COUNT(*) as total_prompts,
  COUNT(DISTINCT pl.user_id) as active_users,
  COUNT(DISTINCT pl.conversation_id) as distinct_conversations,
  ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT pl.user_id), 0), 2) as avg_prompts_per_user,
  COUNT(*) FILTER (WHERE us.is_vip = true) as vip_prompts,
  COUNT(*) FILTER (WHERE COALESCE(us.is_vip, false) = false) as free_prompts
FROM public.user_prompt_logs pl
LEFT JOIN public.user_stats us ON us.user_id = pl.user_id
WHERE pl.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX idx_mv_daily_conv_stats_date ON public.mv_daily_conversation_stats (date_cst);
COMMENT ON MATERIALIZED VIEW public.mv_daily_conversation_stats IS '每日对话统计（含VIP/免费分布）';

-- 2.2 用户对话深度分布（视图）
CREATE OR REPLACE VIEW public.v_user_conversation_depth AS
SELECT 
  user_depth.depth_bucket,
  COUNT(*) as user_count,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(DISTINCT user_id) FROM public.user_prompt_logs) * 100, 2) as percentage
FROM (
  SELECT 
    user_id,
    CASE 
      WHEN total_prompts = 1 THEN '1次'
      WHEN total_prompts BETWEEN 2 AND 5 THEN '2-5次'
      WHEN total_prompts BETWEEN 6 AND 10 THEN '6-10次'
      WHEN total_prompts BETWEEN 11 AND 20 THEN '11-20次'
      WHEN total_prompts BETWEEN 21 AND 30 THEN '21-30次'
      ELSE '30次以上'
    END as depth_bucket
  FROM (
    SELECT user_id, COUNT(*) as total_prompts
    FROM public.user_prompt_logs
    GROUP BY user_id
  ) t
) user_depth
GROUP BY 1
ORDER BY 
  CASE depth_bucket
    WHEN '1次' THEN 1
    WHEN '2-5次' THEN 2
    WHEN '6-10次' THEN 3
    WHEN '11-20次' THEN 4
    WHEN '21-30次' THEN 5
    ELSE 6
  END;

COMMENT ON VIEW public.v_user_conversation_depth IS '用户对话深度分布（漏斗图数据）';

-- 2.3 额度消耗漏斗（视图）
CREATE OR REPLACE VIEW public.v_quota_funnel AS
WITH quota_usage AS (
  SELECT 
    user_id,
    free_quota_used,
    is_vip,
    CASE 
      WHEN free_quota_used = 0 THEN '未使用'
      WHEN free_quota_used BETWEEN 1 AND 5 THEN '1-5次'
      WHEN free_quota_used BETWEEN 6 AND 10 THEN '6-10次'
      WHEN free_quota_used BETWEEN 11 AND 20 THEN '11-20次'
      WHEN free_quota_used BETWEEN 21 AND 30 THEN '21-30次'
      WHEN free_quota_used >= 30 AND NOT is_vip THEN '已达上限(非VIP)'
      ELSE '30次以上(VIP)'
    END as quota_bucket
  FROM public.user_stats
)
SELECT 
  quota_bucket,
  COUNT(*) as user_count,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM public.user_stats) * 100, 2) as percentage
FROM quota_usage
GROUP BY 1
ORDER BY 
  CASE quota_bucket
    WHEN '未使用' THEN 1
    WHEN '1-5次' THEN 2
    WHEN '6-10次' THEN 3
    WHEN '11-20次' THEN 4
    WHEN '21-30次' THEN 5
    WHEN '已达上限(非VIP)' THEN 6
    ELSE 7
  END;

COMMENT ON VIEW public.v_quota_funnel IS '免费额度消耗分布漏斗';

-- 2.4 每周时段活跃热力图（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_weekly_hourly_heatmap;
CREATE MATERIALIZED VIEW public.mv_weekly_hourly_heatmap AS
SELECT 
  EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Shanghai') as day_of_week,
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai') as hour_of_day,
  COUNT(*) as prompt_count,
  COUNT(DISTINCT user_id) as unique_users
FROM public.user_prompt_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY 1, 2;

-- CONCURRENTLY 刷新要求唯一索引（星期+小时组合唯一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_weekly_hourly_heatmap_dow_h
  ON public.mv_weekly_hourly_heatmap (day_of_week, hour_of_day);

COMMENT ON MATERIALIZED VIEW public.mv_weekly_hourly_heatmap IS '30天时段活跃热力图数据（0=周日, 6=周六）';

-- 2.5 Tangbuy 点击分析（视图）
CREATE OR REPLACE VIEW public.v_tangbuy_click_analytics AS
WITH click_stats AS (
  SELECT 
    target_url,
    COUNT(*) as click_count,
    COUNT(DISTINCT t.user_id) as unique_users,
    COUNT(DISTINCT t.user_id) FILTER (WHERE us.is_vip = true) as vip_users
  FROM public.tangbuy_click_events t
  LEFT JOIN public.user_stats us ON us.user_id = t.user_id
  GROUP BY 1
)
SELECT 
  target_url,
  click_count,
  unique_users,
  vip_users,
  ROUND(click_count::numeric / NULLIF(unique_users, 0), 2) as avg_clicks_per_user,
  ROUND(vip_users::numeric / NULLIF(unique_users, 0) * 100, 2) as vip_rate_pct,
  RANK() OVER (ORDER BY click_count DESC) as click_rank
FROM click_stats
ORDER BY click_count DESC;

COMMENT ON VIEW public.v_tangbuy_click_analytics IS 'Tangbuy链接点击排行榜与分析';

-- 2.6 用户点击转化率（视图）
CREATE OR REPLACE VIEW public.v_click_conversion_rate AS
SELECT 
  COUNT(DISTINCT pl.user_id) as total_active_users,
  COUNT(DISTINCT t.user_id) as users_with_clicks,
  COUNT(DISTINCT t.user_id) FILTER (WHERE us.is_vip = true) as vip_users_with_clicks,
  ROUND(COUNT(DISTINCT t.user_id)::numeric / 
        NULLIF(COUNT(DISTINCT pl.user_id), 0) * 100, 2) as click_conversion_rate,
  ROUND(COUNT(DISTINCT t.user_id) FILTER (WHERE us.is_vip = true)::numeric / 
        NULLIF(COUNT(DISTINCT t.user_id), 0) * 100, 2) as vip_percentage_among_clickers
FROM public.user_prompt_logs pl
LEFT JOIN public.tangbuy_click_events t ON t.user_id = pl.user_id
LEFT JOIN public.user_stats us ON us.user_id = t.user_id;

COMMENT ON VIEW public.v_click_conversion_rate IS 'Tangbuy点击转化率统计';

-- 2.7 URL提取统计（视图）
CREATE OR REPLACE VIEW public.v_url_extraction_stats AS
SELECT 
  DATE(created_at AT TIME ZONE 'Asia/Shanghai') as date_cst,
  COUNT(*) FILTER (WHERE extracted_urls != '[]'::jsonb) as prompts_with_urls,
  COUNT(*) as total_prompts,
  ROUND(COUNT(*) FILTER (WHERE extracted_urls != '[]'::jsonb)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2) as url_extraction_rate
FROM public.user_prompt_logs
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.v_url_extraction_stats IS '每日URL提取命中率';

-- =====================
-- Dashboard 2 刷新函数
-- =====================
CREATE OR REPLACE FUNCTION public.refresh_dashboard_2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_conversation_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_weekly_hourly_heatmap;
END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_2() IS '刷新Dashboard 2所有物化视图';

-- =============================================================================
-- Dashboard 2 常用查询示例
-- =============================================================================

-- D2-1: 近7天对话趋势
-- SELECT * FROM mv_daily_conversation_stats 
-- WHERE date_cst >= CURRENT_DATE - INTERVAL '7 days'
-- ORDER BY date_cst;

-- D2-2: 用户对话深度分布（漏斗图）
-- SELECT * FROM v_user_conversation_depth;

-- D2-3: 额度消耗漏斗
-- SELECT * FROM v_quota_funnel;

-- D2-4: 时段活跃热力图数据
-- SELECT * FROM mv_weekly_hourly_heatmap;

-- D2-5: Tangbuy点击Top 10
-- SELECT * FROM v_tangbuy_click_analytics LIMIT 10;

-- D2-6: 点击转化率
-- SELECT * FROM v_click_conversion_rate;

-- D2-7: URL提取命中率趋势
-- SELECT * FROM v_url_extraction_stats 
-- WHERE date_cst >= CURRENT_DATE - INTERVAL '14 days';

-- =============================================================================
-- DASHBOARD 3: 分享裂变效果分析
-- =============================================================================

-- 3.1 每日分享数据统计（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_share_stats;
CREATE MATERIALIZED VIEW public.mv_daily_share_stats AS
SELECT 
  DATE(sl.created_at AT TIME ZONE 'Asia/Shanghai') as date_cst,
  COUNT(*) as new_share_links,
  COALESCE(SUM(sv.total_visits), 0) as total_visits,
  COALESCE(SUM(sv.unique_visitors), 0) as unique_visitors,
  COALESCE(SUM(oa.oauth_conversions), 0) as oauth_conversions
FROM public.share_links sl
LEFT JOIN LATERAL (
  SELECT COUNT(*) as total_visits, COUNT(DISTINCT visitor_user_id) as unique_visitors
  FROM public.share_link_visits
  WHERE share_link_id = sl.id
) sv ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) as oauth_conversions
  FROM public.share_link_oauth_attributions
  WHERE share_link_id = sl.id
) oa ON true
WHERE sl.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX idx_mv_daily_share_date ON public.mv_daily_share_stats (date_cst);
COMMENT ON MATERIALIZED VIEW public.mv_daily_share_stats IS '每日分享链接创建与访问统计';

-- 3.2 分享转化漏斗（视图）
CREATE OR REPLACE VIEW public.v_share_conversion_funnel AS
SELECT 
  '创建分享链接' as stage,
  COUNT(*) as count,
  100.0 as percentage
FROM public.share_links
UNION ALL
SELECT 
  '获得访问' as stage,
  COUNT(DISTINCT share_link_id) as count,
  ROUND(COUNT(DISTINCT share_link_id)::numeric / 
        NULLIF((SELECT COUNT(*) FROM public.share_links), 0) * 100, 2)
FROM public.share_link_visits
UNION ALL
SELECT 
  '获得独立访客' as stage,
  COUNT(DISTINCT share_link_id) as count,
  ROUND(COUNT(DISTINCT share_link_id)::numeric / 
        NULLIF((SELECT COUNT(*) FROM public.share_links), 0) * 100, 2)
FROM public.share_link_visits
UNION ALL
SELECT 
  '转化为注册用户' as stage,
  COUNT(DISTINCT share_link_id) as count,
  ROUND(COUNT(DISTINCT share_link_id)::numeric / 
        NULLIF((SELECT COUNT(*) FROM public.share_links), 0) * 100, 2)
FROM public.share_link_oauth_attributions
ORDER BY 
  CASE stage 
    WHEN '创建分享链接' THEN 1
    WHEN '获得访问' THEN 2
    WHEN '获得独立访客' THEN 3
    WHEN '转化为注册用户' THEN 4
  END;

COMMENT ON VIEW public.v_share_conversion_funnel IS '分享链接转化漏斗（从创建到注册）';

-- 3.3 KOL贡献排行榜（视图）
CREATE OR REPLACE VIEW public.v_kol_leaderboard AS
WITH sharer_stats AS (
  SELECT 
    sl.owner_user_id,
    COALESCE(u.email, sl.owner_user_id::text) as sharer_email,
    sl.short_code,
    sl.created_at as link_created_at,
    COUNT(v.id) as total_clicks,
    COUNT(DISTINCT v.visitor_user_id) as unique_visitors,
    COUNT(DISTINCT oa.attributed_user_id) as oauth_conversions,
    COUNT(DISTINCT oa.attributed_user_id) FILTER (WHERE us.is_vip = true) as converted_vip_count,
    COALESCE(SUM(us2.total_prompts), 0) as converted_users_total_prompts
  FROM public.share_links sl
  JOIN auth.users u ON u.id = sl.owner_user_id
  LEFT JOIN public.share_link_visits v ON v.share_link_id = sl.id
  LEFT JOIN public.share_link_oauth_attributions oa ON oa.share_link_id = sl.id
  LEFT JOIN public.user_stats us ON us.user_id = oa.attributed_user_id
  LEFT JOIN public.user_stats us2 ON us2.user_id = oa.attributed_user_id
  GROUP BY sl.owner_user_id, u.email, sl.short_code, sl.created_at
)
SELECT 
  sharer_email,
  short_code,
  to_cst(link_created_at) as link_created_cst,
  total_clicks,
  unique_visitors,
  oauth_conversions,
  converted_vip_count,
  converted_users_total_prompts,
  ROUND(oauth_conversions::numeric / NULLIF(unique_visitors, 0) * 100, 2) as visitor_to_user_rate,
  RANK() OVER (ORDER BY oauth_conversions DESC) as by_conversions_rank,
  RANK() OVER (ORDER BY unique_visitors DESC) as by_visitors_rank
FROM sharer_stats
ORDER BY oauth_conversions DESC;

COMMENT ON VIEW public.v_kol_leaderboard IS '分享KOL贡献排行榜（按带来注册用户数排序）';

-- 3.4 裂变层级分析（视图）
CREATE OR REPLACE VIEW public.v_viral_tiers AS
WITH RECURSIVE referral_chain AS (
  -- 第一层：原始分享者
  SELECT 
    sl.owner_user_id as root_user_id,
    sl.owner_user_id as current_user_id,
    1 as tier,
    sl.id as share_link_id
  FROM public.share_links sl
  
  UNION ALL
  
  -- 递归：通过分享注册的用户
  SELECT 
    rc.root_user_id,
    oa.attributed_user_id as current_user_id,
    rc.tier + 1,
    sl2.id
  FROM referral_chain rc
  JOIN public.share_links sl2 ON sl2.owner_user_id = rc.current_user_id
  JOIN public.share_link_visits v ON v.share_link_id = sl2.id
  JOIN public.share_link_oauth_attributions oa ON oa.share_link_id = rc.share_link_id 
    AND oa.attributed_user_id = v.visitor_user_id
  WHERE rc.tier < 5 -- 限制层级深度
)
SELECT 
  tier,
  COUNT(DISTINCT current_user_id) as user_count,
  COUNT(DISTINCT share_link_id) as share_links_created,
  ROUND(COUNT(DISTINCT current_user_id)::numeric / 
        LAG(COUNT(DISTINCT current_user_id)) OVER (ORDER BY tier) * 100, 2) as tier_growth_rate
FROM referral_chain
GROUP BY tier
ORDER BY tier;

COMMENT ON VIEW public.v_viral_tiers IS '裂变传播层级分析（传播深度）';

-- 3.5 分享质量评分（视图）
CREATE OR REPLACE VIEW public.v_share_quality_score AS
WITH share_metrics AS (
  SELECT 
    sl.short_code,
    COALESCE(u.email, sl.owner_user_id::text) as sharer,
    COUNT(v.id) as total_visits,
    COUNT(DISTINCT v.visitor_user_id) as unique_visitors,
    COUNT(DISTINCT oa.attributed_user_id) as conversions,
    COUNT(DISTINCT oa.attributed_user_id) FILTER (WHERE us.is_vip = true) as vip_conversions,
    COALESCE(SUM(us.total_prompts), 0) as total_prompts_from_converted
  FROM public.share_links sl
  JOIN auth.users u ON u.id = sl.owner_user_id
  LEFT JOIN public.share_link_visits v ON v.share_link_id = sl.id
  LEFT JOIN public.share_link_oauth_attributions oa ON oa.share_link_id = sl.id
  LEFT JOIN public.user_stats us ON us.user_id = oa.attributed_user_id
  GROUP BY sl.short_code, u.email, sl.owner_user_id
)
SELECT 
  short_code,
  sharer,
  total_visits,
  unique_visitors,
  conversions,
  vip_conversions,
  total_prompts_from_converted,
  ROUND(conversions::numeric / NULLIF(unique_visitors, 0) * 100, 2) as conversion_rate,
  ROUND(vip_conversions::numeric / NULLIF(conversions, 0) * 100, 2) as vip_conversion_rate,
  -- 综合质量评分 (0-100)
  LEAST(100, ROUND(
    (conversions * 10) + 
    (vip_conversions * 20) + 
    (total_prompts_from_converted * 0.5) +
    (unique_visitors * 0.1)
  )) as quality_score,
  RANK() OVER (ORDER BY 
    (conversions * 10) + (vip_conversions * 20) + (total_prompts_from_converted * 0.5) DESC
  ) as quality_rank
FROM share_metrics
ORDER BY quality_score DESC;

COMMENT ON VIEW public.v_share_quality_score IS '分享链接质量综合评分（含VIP转化权重）';

-- 3.6 分享归因用户活跃度（视图）
CREATE OR REPLACE VIEW public.v_referred_user_activity AS
SELECT 
  COALESCE(sl_o.owner_email, sl_o.owner_user_id::text) as referrer,
  oa.visitor_email as referred_user,
  oa.oauth_provider,
  to_cst(oa.created_at) as registered_at,
  COALESCE(us.total_prompts, 0) as total_prompts,
  COALESCE(us.is_vip, false) as is_vip,
  to_cst(us.vip_unlocked_at) as vip_unlocked_at,
  CASE 
    WHEN us.total_prompts >= 30 THEN '高活跃'
    WHEN us.total_prompts >= 10 THEN '中活跃'
    WHEN us.total_prompts > 0 THEN '低活跃'
    ELSE '无对话'
  END as activity_level
FROM public.share_link_oauth_attributions oa
JOIN public.share_links sl_o ON sl_o.id = oa.share_link_id
LEFT JOIN public.user_stats us ON us.user_id = oa.attributed_user_id
ORDER BY oa.created_at DESC;

COMMENT ON VIEW public.v_referred_user_activity IS '被分享邀请用户的后续活跃度分析';

-- =====================
-- Dashboard 3 刷新函数
-- =====================
CREATE OR REPLACE FUNCTION public.refresh_dashboard_3()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_share_stats;
END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_3() IS '刷新Dashboard 3所有物化视图';

-- =============================================================================
-- Dashboard 3 常用查询示例
-- =============================================================================

-- D3-1: 近7天分享趋势
-- SELECT * FROM mv_daily_share_stats 
-- WHERE date_cst >= CURRENT_DATE - INTERVAL '7 days'
-- ORDER BY date_cst;

-- D3-2: 分享转化漏斗
-- SELECT * FROM v_share_conversion_funnel;

-- D3-3: KOL贡献排行榜Top 20
-- SELECT * FROM v_kol_leaderboard LIMIT 20;

-- D3-4: 裂变层级传播深度
-- SELECT * FROM v_viral_tiers;

-- D3-5: 高质量分享链接Top 10
-- SELECT * FROM v_share_quality_score LIMIT 10;

-- D3-6: 被邀请用户活跃度分布
-- SELECT activity_level, COUNT(*) FROM v_referred_user_activity GROUP BY 1;

-- =============================================================================
-- DASHBOARD 4: 商品询盘分析
-- =============================================================================

-- 4.1 每日询盘统计（物化视图）
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_inquiry_stats;
CREATE MATERIALIZED VIEW public.mv_daily_inquiry_stats AS
SELECT 
  DATE(created_at AT TIME ZONE 'Asia/Shanghai') as date_cst,
  COUNT(*) as total_inquiries,
  COUNT(*) FILTER (WHERE status = 'submitted') as pending_inquiries,
  COUNT(*) FILTER (WHERE status = 'replied') as replied_inquiries,
  ROUND(COUNT(*) FILTER (WHERE status = 'replied')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2) as reply_rate_pct,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT whatsapp) as unique_whatsapp_numbers
FROM public.product_inquiries
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX idx_mv_daily_inquiry_date ON public.mv_daily_inquiry_stats (date_cst);
COMMENT ON MATERIALIZED VIEW public.mv_daily_inquiry_stats IS '每日商品询盘统计（含处理状态）';

-- 4.2 询盘处理时效分析（视图）
CREATE OR REPLACE VIEW public.v_inquiry_response_time AS
WITH response_times AS (
  SELECT 
    id,
    user_id,
    created_at as submitted_at,
    updated_at as replied_at,
    status,
    EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 as response_hours
  FROM public.product_inquiries
  WHERE status = 'replied'
)
SELECT 
  DATE(submitted_at AT TIME ZONE 'Asia/Shanghai') as date_cst,
  COUNT(*) as replied_count,
  ROUND(AVG(response_hours), 2) as avg_response_hours,
  ROUND(MIN(response_hours), 2) as min_response_hours,
  ROUND(MAX(response_hours), 2) as max_response_hours,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_hours)::numeric, 2) as median_response_hours,
  COUNT(*) FILTER (WHERE response_hours <= 1) as within_1h,
  COUNT(*) FILTER (WHERE response_hours <= 4) as within_4h,
  COUNT(*) FILTER (WHERE response_hours <= 24) as within_24h,
  ROUND(COUNT(*) FILTER (WHERE response_hours <= 24)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2) as within_24h_rate_pct
FROM response_times
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.v_inquiry_response_time IS '询盘处理时效分析（24小时内回复率等）';

-- 4.3 热门询盘商品分析（视图）
CREATE OR REPLACE VIEW public.v_popular_inquiry_products AS
WITH product_extract AS (
  SELECT 
    id,
    product_snapshot->>'title' as product_title,
    product_snapshot->>'url' as product_url,
    product_snapshot->>'price' as product_price,
    whatsapp,
    demand,
    created_at
  FROM public.product_inquiries
  WHERE product_snapshot != '{}'::jsonb
)
SELECT 
  COALESCE(product_title, '未识别商品') as product_title,
  product_url,
  COUNT(*) as inquiry_count,
  COUNT(DISTINCT whatsapp) as unique_whatsapp_count,
  STRING_AGG(DISTINCT demand, ' | ' ORDER BY demand) as demand_summary,
  MIN(created_at) as first_inquiry_at,
  MAX(created_at) as last_inquiry_at,
  RANK() OVER (ORDER BY COUNT(*) DESC) as popularity_rank
FROM product_extract
WHERE product_title IS NOT NULL
GROUP BY 1, 2
ORDER BY inquiry_count DESC;

COMMENT ON VIEW public.v_popular_inquiry_products IS '热门询盘商品排行榜';

-- 4.4 WhatsApp地区分布分析（视图）
CREATE OR REPLACE VIEW public.v_whatsapp_geo_distribution AS
WITH country_codes AS (
  SELECT 
    CASE 
      WHEN whatsapp LIKE '+86%' OR whatsapp LIKE '86%' THEN '中国'
      WHEN whatsapp LIKE '+1%' OR whatsapp LIKE '1%' THEN '美国/加拿大'
      WHEN whatsapp LIKE '+44%' OR whatsapp LIKE '44%' THEN '英国'
      WHEN whatsapp LIKE '+61%' OR whatsapp LIKE '61%' THEN '澳大利亚'
      WHEN whatsapp LIKE '+65%' OR whatsapp LIKE '65%' THEN '新加坡'
      WHEN whatsapp LIKE '+852%' OR whatsapp LIKE '852%' THEN '香港'
      WHEN whatsapp LIKE '+886%' OR whatsapp LIKE '886%' THEN '台湾'
      WHEN whatsapp LIKE '+81%' OR whatsapp LIKE '81%' THEN '日本'
      WHEN whatsapp LIKE '+82%' OR whatsapp LIKE '82%' THEN '韩国'
      WHEN whatsapp LIKE '+49%' OR whatsapp LIKE '49%' THEN '德国'
      WHEN whatsapp LIKE '+33%' OR whatsapp LIKE '33%' THEN '法国'
      WHEN whatsapp LIKE '+39%' OR whatsapp LIKE '39%' THEN '意大利'
      WHEN whatsapp LIKE '+34%' OR whatsapp LIKE '34%' THEN '西班牙'
      WHEN whatsapp LIKE '+7%' OR whatsapp LIKE '7%' THEN '俄罗斯'
      WHEN whatsapp LIKE '+55%' OR whatsapp LIKE '55%' THEN '巴西'
      WHEN whatsapp LIKE '+91%' OR whatsapp LIKE '91%' THEN '印度'
      WHEN whatsapp LIKE '+62%' OR whatsapp LIKE '62%' THEN '印尼'
      WHEN whatsapp LIKE '+60%' OR whatsapp LIKE '60%' THEN '马来西亚'
      WHEN whatsapp LIKE '+63%' OR whatsapp LIKE '63%' THEN '菲律宾'
      WHEN whatsapp LIKE '+66%' OR whatsapp LIKE '66%' THEN '泰国'
      WHEN whatsapp LIKE '+84%' OR whatsapp LIKE '84%' THEN '越南'
      ELSE '其他/未知'
    END as country,
    whatsapp,
    created_at
  FROM public.product_inquiries
)
SELECT 
  country,
  COUNT(*) as inquiry_count,
  COUNT(DISTINCT whatsapp) as unique_contacts,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM public.product_inquiries) * 100, 2) as percentage,
  MIN(created_at) as first_inquiry,
  MAX(created_at) as last_inquiry
FROM country_codes
GROUP BY country
ORDER BY inquiry_count DESC;

COMMENT ON VIEW public.v_whatsapp_geo_distribution IS '询盘用户地区分布（从WhatsApp号段推断）';

-- 4.5 询盘用户需求词频分析（视图）
CREATE OR REPLACE VIEW public.v_demand_keyword_analysis AS
WITH demand_words AS (
  SELECT 
    UNNEST(string_to_array(lower(demand), ' ')) as word,
    created_at
  FROM public.product_inquiries
  WHERE demand IS NOT NULL AND length(demand) > 0
)
SELECT 
  word,
  COUNT(*) as frequency,
  MIN(created_at) as first_appearance,
  MAX(created_at) as last_appearance,
  RANK() OVER (ORDER BY COUNT(*) DESC) as frequency_rank
FROM demand_words
WHERE length(word) > 2 
  AND word NOT IN ('the', 'and', 'for', 'with', 'this', 'that', 'will', 'please', 'need', 'want', 'have', 'can', 'you', 'price', 'how', 'much', '谢谢', '请问', '需要', '想要', '价格', '多少', '可以')
GROUP BY word
HAVING COUNT(*) >= 2
ORDER BY frequency DESC
LIMIT 100;

COMMENT ON VIEW public.v_demand_keyword_analysis IS '询盘需求词频分析Top 100';

-- 4.6 询盘转化率分析（视图）
CREATE OR REPLACE VIEW public.v_inquiry_conversion_funnel AS
WITH inquiry_users AS (
  SELECT 
    pi.user_id,
    pi.whatsapp,
    pi.created_at as inquiry_at,
    pi.status,
    pi.product_snapshot->>'url' as inquired_product_url,
    -- 检查该用户后续是否有对话行为
    EXISTS (
      SELECT 1 FROM public.user_prompt_logs pl 
      WHERE pl.user_id = pi.user_id 
      AND pl.created_at > pi.created_at
    ) as has_followup_chat,
    -- 检查是否成为VIP
    COALESCE(us.is_vip, false) as is_vip,
    us.total_prompts,
    -- 计算从询盘到最近对话的时间差
    (SELECT MAX(created_at) FROM public.user_prompt_logs WHERE user_id = pi.user_id) as last_chat_at
  FROM public.product_inquiries pi
  LEFT JOIN public.user_stats us ON us.user_id = pi.user_id
)
SELECT 
  '提交询盘' as stage,
  COUNT(*) as count,
  100.0 as percentage
FROM inquiry_users
UNION ALL
SELECT 
  '被回复' as stage,
  COUNT(*) FILTER (WHERE status = 'replied'),
  ROUND(COUNT(*) FILTER (WHERE status = 'replied')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2)
FROM inquiry_users
UNION ALL
SELECT 
  '后续有对话' as stage,
  COUNT(*) FILTER (WHERE has_followup_chat = true),
  ROUND(COUNT(*) FILTER (WHERE has_followup_chat = true)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2)
FROM inquiry_users
UNION ALL
SELECT 
  '成为VIP' as stage,
  COUNT(*) FILTER (WHERE is_vip = true),
  ROUND(COUNT(*) FILTER (WHERE is_vip = true)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2)
FROM inquiry_users
ORDER BY 
  CASE stage 
    WHEN '提交询盘' THEN 1
    WHEN '被回复' THEN 2
    WHEN '后续有对话' THEN 3
    WHEN '成为VIP' THEN 4
  END;

COMMENT ON VIEW public.v_inquiry_conversion_funnel IS '询盘用户后续转化漏斗';

-- =====================
-- Dashboard 4 刷新函数
-- =====================
CREATE OR REPLACE FUNCTION public.refresh_dashboard_4()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_inquiry_stats;
END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_4() IS '刷新Dashboard 4所有物化视图';

-- =============================================================================
-- Dashboard 4 常用查询示例
-- =============================================================================

-- D4-1: 近7天询盘趋势
-- SELECT * FROM mv_daily_inquiry_stats 
-- WHERE date_cst >= CURRENT_DATE - INTERVAL '7 days'
-- ORDER BY date_cst;

-- D4-2: 询盘处理时效
-- SELECT * FROM v_inquiry_response_time 
-- WHERE date_cst >= CURRENT_DATE - INTERVAL '14 days';

-- D4-3: 热门询盘商品Top 10
-- SELECT * FROM v_popular_inquiry_products LIMIT 10;

-- D4-4: 询盘用户地区分布
-- SELECT * FROM v_whatsapp_geo_distribution;

-- D4-5: 需求关键词云数据
-- SELECT * FROM v_demand_keyword_analysis LIMIT 50;

-- D4-6: 询盘转化率漏斗
-- SELECT * FROM v_inquiry_conversion_funnel;

-- =============================================================================
-- 统一刷新函数（刷新所有Dashboard）
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_all_dashboards()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Dashboard 1
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_user_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_auth_provider_distribution;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_hourly_active_users;
  
  -- Dashboard 2
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_conversation_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_weekly_hourly_heatmap;
  
  -- Dashboard 3
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_share_stats;
  
  -- Dashboard 4
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_inquiry_stats;
END;
$$;

COMMENT ON FUNCTION public.refresh_all_dashboards() IS '刷新所有管理后台Dashboard物化视图';

-- 权限设置
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_3() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_4() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_dashboards() TO authenticated;

-- =============================================================================
-- 执行提示
-- =============================================================================
-- 1. 在 Supabase Dashboard → SQL Editor 中执行本文件
-- 2. 物化视图创建后，可设置定时任务（如每小时）执行：SELECT refresh_all_dashboards();
-- 3. 或者在 Supabase 中使用 pg_cron 插件设置自动刷新
-- 4. 所有查询可直接在 Table Editor 或 SQL Editor 中查看
-- =============================================================================
