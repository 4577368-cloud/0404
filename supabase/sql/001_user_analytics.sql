-- =============================================================================
-- Tangbuy AI — 用户用量、对话日志、Tangbuy 点击（在 Supabase Dashboard → SQL Editor 中整段执行）
-- =============================================================================
-- 执行前：确认当前项目已开启 Email/Google 等登录；执行后：在 Authentication → Policies 无需改 auth.users
-- =============================================================================

-- 1) 配置表（仅服务端函数可读，用于 VIP 密钥；勿把 SELECT 开放给 anon）
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.app_config (key, value) VALUES
  ('max_free_quota', '30'),
  ('vip_unlock_code', 'Tangbuydropshipping2026')
ON CONFLICT (key) DO NOTHING;

-- 2) 每用户一行：免费已用次数、总对话次数、VIP
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  free_quota_used INTEGER NOT NULL DEFAULT 0 CHECK (free_quota_used >= 0),
  total_prompts BIGINT NOT NULL DEFAULT 0 CHECK (total_prompts >= 0),
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  vip_unlocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_stats_updated ON public.user_stats (updated_at DESC);

-- 3) 用户每次发起对话轮次（含 URL 提取结果）
CREATE TABLE IF NOT EXISTS public.user_prompt_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  conversation_id TEXT,
  content_preview TEXT NOT NULL,
  extracted_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_logs_user_time ON public.user_prompt_logs (user_id, created_at DESC);

-- 4) Tangbuy 相关点击（每点一条，便于统计「点过什么、几次」用 SQL 聚合）
CREATE TABLE IF NOT EXISTS public.tangbuy_click_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  target_url TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tangbuy_clicks_user_time ON public.tangbuy_click_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tangbuy_clicks_url ON public.tangbuy_click_events (user_id, target_url);

-- 5) 新用户自动建 stats（需能访问 auth.users；若无权限可把本段改为仅用 RPC ensure_user_stats）
CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_stats ON auth.users;
CREATE TRIGGER on_auth_user_created_stats
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_stats();

-- 6) 已有用户补一行（可选，执行一次即可）
INSERT INTO public.user_stats (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 7) RPC：消费一次对话额度 + 写日志（事务内）
CREATE OR REPLACE FUNCTION public.consume_chat_turn(
  p_conversation_id TEXT,
  p_content TEXT,
  p_extracted_urls JSONB DEFAULT '[]'::jsonb
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
    INSERT INTO public.user_prompt_logs (user_id, conversation_id, content_preview, extracted_urls)
    VALUES (uid, p_conversation_id, preview, coalesce(p_extracted_urls, '[]'::jsonb));
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
  INSERT INTO public.user_prompt_logs (user_id, conversation_id, content_preview, extracted_urls)
  VALUES (uid, p_conversation_id, preview, coalesce(p_extracted_urls, '[]'::jsonb));

  RETURN jsonb_build_object(
    'allowed', true,
    'is_vip', false,
    'remaining_free', max_free - (row.free_quota_used + 1),
    'total_prompts', row.total_prompts + 1,
    'max_free', max_free
  );
END;
$$;

-- 8) RPC：VIP 解锁（密钥存在 app_config，可在表内改字串）
CREATE OR REPLACE FUNCTION public.claim_vip(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  expected TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT value INTO expected FROM public.app_config WHERE key = 'vip_unlock_code';
  IF expected IS NULL THEN expected := 'Tangbuydropshipping2026'; END IF;

  IF trim(coalesce(p_code, '')) IS DISTINCT FROM trim(expected) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  INSERT INTO public.user_stats (user_id, is_vip, vip_unlocked_at)
  VALUES (uid, true, now())
  ON CONFLICT (user_id) DO UPDATE SET
    is_vip = true,
    vip_unlocked_at = COALESCE(user_stats.vip_unlocked_at, now()),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 9) RPC：记录 Tangbuy 链接点击
CREATE OR REPLACE FUNCTION public.log_tangbuy_click(
  p_event_kind TEXT,
  p_target_url TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  IF p_target_url IS NULL OR length(trim(p_target_url)) < 8 THEN RETURN; END IF;
  IF strpos(lower(p_target_url), 'tangbuy') = 0 THEN RETURN; END IF;

  INSERT INTO public.tangbuy_click_events (user_id, event_kind, target_url, meta)
  VALUES (uid, coalesce(nullif(trim(p_event_kind), ''), 'link'), trim(p_target_url), coalesce(p_meta, '{}'::jsonb));
END;
$$;

-- 10) RLS
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_prompt_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tangbuy_click_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_stats_select_own" ON public.user_stats;
CREATE POLICY "user_stats_select_own" ON public.user_stats
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "prompt_logs_select_own" ON public.user_prompt_logs;
CREATE POLICY "prompt_logs_select_own" ON public.user_prompt_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tangbuy_clicks_select_own" ON public.tangbuy_click_events;
CREATE POLICY "tangbuy_clicks_select_own" ON public.tangbuy_click_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- app_config：禁止客户端直接读（仅 SECURITY DEFINER 函数内部可读）
DROP POLICY IF EXISTS "app_config_deny" ON public.app_config;
CREATE POLICY "app_config_deny" ON public.app_config
  FOR ALL TO authenticated
  USING (false);

DROP POLICY IF EXISTS "app_config_deny_anon" ON public.app_config;
CREATE POLICY "app_config_deny_anon" ON public.app_config
  FOR ALL TO anon
  USING (false);

-- 11) 权限
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.user_stats TO authenticated;
GRANT SELECT ON public.user_prompt_logs TO authenticated;
GRANT SELECT ON public.tangbuy_click_events TO authenticated;

GRANT EXECUTE ON FUNCTION public.consume_chat_turn(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vip(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_tangbuy_click(TEXT, TEXT, JSONB) TO authenticated;

-- =============================================================================
-- 常用查询示例（Reports → SQL，按需运行）
-- =============================================================================
-- 某用户总对话次数：SELECT total_prompts, free_quota_used, is_vip FROM user_stats WHERE user_id = '...';
-- 点击次数按 URL：SELECT target_url, count(*) FROM tangbuy_click_events WHERE user_id = '...' GROUP BY 1;
-- =============================================================================
