-- =============================================================================
-- 用户总览仪表盘视图（管理员在 Supabase SQL Editor 中以 postgres 角色执行）
-- 依赖：001 ~ 005 已执行
-- 所有时间统一转为 Asia/Shanghai (UTC+8)
-- =============================================================================

-- =====================
-- A) 时区辅助：将 timestamptz 转为北京时间文本，方便在 Table Editor 中直接看
-- =====================
CREATE OR REPLACE FUNCTION public.to_cst(ts TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(ts AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
$$;

-- =====================
-- B) 核心视图：用户总览（每用户一行，汇聚所有关键指标）
-- =====================
CREATE OR REPLACE VIEW public.v_user_overview AS
SELECT
  -- ── 身份信息 ──
  u.id                                              AS user_id,
  COALESCE(u.email, '')                             AS email,
  COALESCE(u.raw_app_meta_data->>'provider', 'unknown') AS auth_provider,
  CASE
    WHEN (u.raw_app_meta_data->>'provider') = 'anonymous'
      OR COALESCE((u.raw_app_meta_data->>'is_anonymous')::boolean, false)
    THEN true ELSE false
  END                                               AS is_anonymous,

  -- ── VIP / 额度 ──
  COALESCE(us.is_vip, false)                        AS is_vip,
  to_cst(us.vip_unlocked_at)                        AS vip_unlocked_at_cst,
  COALESCE(us.free_quota_used, 0)                   AS free_quota_used,
  COALESCE(us.total_prompts, 0)                     AS total_prompts,

  -- ── 对话明细 ──
  COALESCE(conv.distinct_conversations, 0)          AS distinct_conversations,
  to_cst(conv.first_prompt_at)                      AS first_prompt_cst,
  to_cst(conv.last_prompt_at)                       AS last_prompt_cst,

  -- ── Tangbuy 点击 ──
  COALESCE(tc.tangbuy_clicks, 0)                    AS tangbuy_clicks,
  COALESCE(tc.distinct_tangbuy_urls, 0)             AS distinct_tangbuy_urls,

  -- ── 行为埋点 ──
  COALESCE(ae.analytics_events, 0)                  AS analytics_events,

  -- ── 分享链接 ──
  sl.short_code                                     AS share_short_code,
  COALESCE(sv.total_share_clicks, 0)                AS total_share_clicks,
  COALESCE(sv.unique_share_visitors, 0)             AS unique_share_visitors,
  COALESCE(oa.oauth_attributed_users, 0)            AS oauth_attributed_users,
  COALESCE(oa.attributed_emails, '')                AS attributed_user_emails,

  -- ── 被谁分享邀请来的（作为访客） ──
  COALESCE(inv.invited_by_code, '')                 AS invited_by_share_code,
  COALESCE(inv.invited_by_email, '')                AS invited_by_email,

  -- ── 注册 / 活跃时间 ──
  to_cst(u.created_at)                              AS registered_at_cst,
  to_cst(u.last_sign_in_at)                         AS last_sign_in_cst,
  to_cst(us.updated_at)                             AS last_active_cst

FROM auth.users u

-- 用户统计
LEFT JOIN public.user_stats us ON us.user_id = u.id

-- 对话统计（聚合 user_prompt_logs）
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT pl.conversation_id) AS distinct_conversations,
    MIN(pl.created_at)                 AS first_prompt_at,
    MAX(pl.created_at)                 AS last_prompt_at
  FROM public.user_prompt_logs pl
  WHERE pl.user_id = u.id
) conv ON true

-- Tangbuy 点击统计
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                 AS tangbuy_clicks,
    COUNT(DISTINCT target_url) AS distinct_tangbuy_urls
  FROM public.tangbuy_click_events tce
  WHERE tce.user_id = u.id
) tc ON true

-- 行为埋点数
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS analytics_events
  FROM public.app_analytics_events aae
  WHERE aae.user_id = u.id
) ae ON true

-- 该用户的分享链接
LEFT JOIN public.share_links sl ON sl.owner_user_id = u.id

-- 该用户分享带来的点击 / 访客
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                        AS total_share_clicks,
    COUNT(DISTINCT v.visitor_user_id) AS unique_share_visitors
  FROM public.share_link_visits v
  WHERE v.share_link_id = sl.id
) sv ON sl.id IS NOT NULL

-- 该用户分享带来的 OAuth 归因用户
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                          AS oauth_attributed_users,
    string_agg(DISTINCT a.visitor_email, ', ' ORDER BY a.visitor_email) AS attributed_emails
  FROM public.share_link_oauth_attributions a
  WHERE a.share_link_id = sl.id
) oa ON sl.id IS NOT NULL

-- 该用户自己是被谁邀请来的
LEFT JOIN LATERAL (
  SELECT
    sl2.short_code  AS invited_by_code,
    COALESCE(sl2.owner_email, sl2.owner_user_id::text) AS invited_by_email
  FROM public.share_link_visits v2
  JOIN public.share_links sl2 ON sl2.id = v2.share_link_id
  WHERE v2.visitor_user_id = u.id
  ORDER BY v2.created_at ASC
  LIMIT 1
) inv ON true

ORDER BY us.total_prompts DESC NULLS LAST, u.created_at DESC;

COMMENT ON VIEW public.v_user_overview IS '管理员总览：每用户一行，汇聚身份、额度、对话、分享、归因、Tangbuy 点击等全部关键指标（北京时间）';

-- =====================
-- C) 分享明细视图（带北京时间）：每次点击一行
-- =====================
CREATE OR REPLACE VIEW public.v_share_visits_detail AS
SELECT
  sl.short_code,
  COALESCE(sl.owner_email, sl.owner_user_id::text) AS sharer,
  to_cst(v.created_at)                              AS clicked_at_cst,
  v.visitor_user_id,
  COALESCE(v.visitor_email, '')                     AS visitor_email,
  v.visitor_is_anonymous,
  COALESCE(v.visitor_provider, '')                  AS visitor_provider,
  -- 该访客是否后续完成了 OAuth 归因
  EXISTS (
    SELECT 1 FROM public.share_link_oauth_attributions a
    WHERE a.share_link_id = v.share_link_id AND a.attributed_user_id = v.visitor_user_id
  )                                                 AS has_oauth_attribution
FROM public.share_link_visits v
JOIN public.share_links sl ON sl.id = v.share_link_id
ORDER BY v.created_at DESC;

COMMENT ON VIEW public.v_share_visits_detail IS '分享点击明细（北京时间），含访客是否已完成 OAuth 归因';

-- =====================
-- D) OAuth 归因明细视图（带北京时间）
-- =====================
CREATE OR REPLACE VIEW public.v_share_oauth_attributions_detail AS
SELECT
  a.short_code,
  COALESCE(a.sharer_email, a.sharer_user_id::text) AS sharer,
  a.visitor_email                                   AS attributed_email,
  COALESCE(a.oauth_provider, '')                    AS oauth_provider,
  to_cst(a.created_at)                              AS attributed_at_cst,
  -- 被归因用户当前 VIP 状态
  COALESCE(us.is_vip, false)                        AS user_is_vip,
  COALESCE(us.total_prompts, 0)                     AS user_total_prompts
FROM public.share_link_oauth_attributions a
LEFT JOIN public.user_stats us ON us.user_id = a.attributed_user_id
ORDER BY a.created_at DESC;

COMMENT ON VIEW public.v_share_oauth_attributions_detail IS '分享 OAuth 归因明细（北京时间），含被归因用户 VIP / 对话数';

-- =====================
-- E) 对话日志视图（带北京时间），便于直接在 Table Editor 中查看
-- =====================
CREATE OR REPLACE VIEW public.v_prompt_logs_cst AS
SELECT
  pl.id,
  pl.user_id,
  COALESCE(u.email, '')                              AS email,
  CASE
    WHEN (u.raw_app_meta_data->>'provider') = 'anonymous' THEN true ELSE false
  END                                                AS is_anonymous,
  pl.conversation_id,
  pl.content_preview,
  pl.extracted_urls,
  to_cst(pl.created_at)                              AS created_at_cst
FROM public.user_prompt_logs pl
JOIN auth.users u ON u.id = pl.user_id
ORDER BY pl.created_at DESC;

COMMENT ON VIEW public.v_prompt_logs_cst IS '对话日志（北京时间）';

-- =====================
-- F) 常用快捷查询（注释块，复制执行即可）
-- =====================

-- F1) 用户总览：所有用户一览
-- SELECT * FROM v_user_overview;

-- F2) 仅看真实用户（非匿名）
-- SELECT * FROM v_user_overview WHERE is_anonymous = false;

-- F3) 按分享带来客户数排序
-- SELECT user_id, email, share_short_code, total_share_clicks, unique_share_visitors, oauth_attributed_users, attributed_user_emails
-- FROM v_user_overview
-- WHERE share_short_code IS NOT NULL
-- ORDER BY oauth_attributed_users DESC;

-- F4) 某个分享码的所有点击
-- SELECT * FROM v_share_visits_detail WHERE short_code = 'xxxxxxxxxx';

-- F5) 所有 OAuth 归因（谁通过谁的分享注册了）
-- SELECT * FROM v_share_oauth_attributions_detail;

-- F6) 某用户的对话记录（北京时间）
-- SELECT * FROM v_prompt_logs_cst WHERE user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- F7) 今日活跃用户（北京时间）
-- SELECT * FROM v_user_overview WHERE last_active_cst >= to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD');
