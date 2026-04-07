-- =============================================================================
-- 专属分享短链：记录分享者、访问次数、访客（依赖 auth.users）
-- 在 Supabase Dashboard → SQL Editor 执行；需在 001_user_analytics.sql 之后
-- =============================================================================

-- 每人一条专属短码（分享链接 ?ref=xxxx）
CREATE TABLE IF NOT EXISTS public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  short_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT share_links_short_code_format CHECK (
    char_length(short_code) >= 6 AND char_length(short_code) <= 16
  )
);

CREATE INDEX IF NOT EXISTS idx_share_links_short_code ON public.share_links (lower(short_code));

-- 每次有效落地一条（刷新会新增一行；去重分析用 COUNT(DISTINCT visitor_user_id)）
CREATE TABLE IF NOT EXISTS public.share_link_visits (
  id BIGSERIAL PRIMARY KEY,
  share_link_id UUID NOT NULL REFERENCES public.share_links (id) ON DELETE CASCADE,
  visitor_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_visits_link_time ON public.share_link_visits (share_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_visits_visitor ON public.share_link_visits (visitor_user_id, created_at DESC);

-- 获取或创建当前用户的专属短码
CREATE OR REPLACE FUNCTION public.get_or_create_share_link()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  existing RECORD;
  new_code TEXT;
  i INT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT id, short_code INTO existing FROM public.share_links WHERE owner_user_id = uid LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'short_code', existing.short_code);
  END IF;

  FOR i IN 1..80 LOOP
    new_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    BEGIN
      INSERT INTO public.share_links (owner_user_id, short_code) VALUES (uid, new_code);
      RETURN jsonb_build_object('ok', true, 'short_code', new_code);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error', 'code_generation_failed');
END;
$$;

-- 落地时记录访问（访客须已登录含匿名）；分享者点自己的链接会跳过插入
CREATE OR REPLACE FUNCTION public.record_share_visit(p_short_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  sl RECORD;
  code TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  code := lower(trim(coalesce(p_short_code, '')));
  IF length(code) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT id, owner_user_id INTO sl FROM public.share_links WHERE short_code = code LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_code');
  END IF;

  IF sl.owner_user_id = uid THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'self');
  END IF;

  INSERT INTO public.share_link_visits (share_link_id, visitor_user_id)
  VALUES (sl.id, uid);

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_link_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_links_select_own" ON public.share_links;
CREATE POLICY "share_links_select_own" ON public.share_links
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "share_visits_select_if_owner" ON public.share_link_visits;
CREATE POLICY "share_visits_select_if_owner" ON public.share_link_visits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.id = share_link_visits.share_link_id AND sl.owner_user_id = auth.uid()
    )
  );

GRANT SELECT ON public.share_links TO authenticated;
GRANT SELECT ON public.share_link_visits TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_share_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_share_visit(TEXT) TO authenticated;

-- =============================================================================
-- 统计示例（在 SQL Editor 中按需运行）
-- =============================================================================
-- 某短链总访问次数：SELECT count(*) FROM share_link_visits v JOIN share_links s ON s.id = v.share_link_id WHERE s.short_code = 'xxxx';
-- 独立访客数：SELECT count(DISTINCT visitor_user_id) FROM share_link_visits v JOIN share_links s ON s.id = v.share_link_id WHERE s.short_code = 'xxxx';
-- 谁分享的：SELECT owner_user_id, short_code FROM share_links WHERE short_code = 'xxxx';
-- =============================================================================
