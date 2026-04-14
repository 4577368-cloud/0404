-- =============================================================================
-- 分享短链：补充邮箱、匿名标记、OAuth 归因（便于按邮箱查询）
-- 在 Supabase Dashboard → SQL Editor 执行；依赖 004_share_referral.sql
-- =============================================================================

-- 1) share_links：分享者邮箱（OAuth/邮箱用户有邮箱；纯匿名无邮箱则只依赖 owner_user_id）
ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS owner_is_anonymous BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.share_links.owner_email IS 'Denormalized from auth.users.email at link create/update';
COMMENT ON COLUMN public.share_links.owner_is_anonymous IS 'True if owner was anonymous when link row was written';

-- 2) share_link_visits：访客邮箱 + 是否匿名 + 登录提供方
ALTER TABLE public.share_link_visits
  ADD COLUMN IF NOT EXISTS visitor_email TEXT,
  ADD COLUMN IF NOT EXISTS visitor_is_anonymous BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visitor_provider TEXT;

COMMENT ON COLUMN public.share_link_visits.visitor_email IS 'From auth.users.email at visit time; null for anonymous';
COMMENT ON COLUMN public.share_link_visits.visitor_provider IS 'e.g. anonymous, google, facebook, email';

-- 3) 历史数据回填（从 auth.users）
UPDATE public.share_links sl
SET
  owner_email = u.email,
  owner_is_anonymous = COALESCE(
    (u.raw_app_meta_data->>'provider') = 'anonymous'
    OR COALESCE((u.raw_app_meta_data->>'is_anonymous')::boolean, false),
    false
  )
FROM auth.users u
WHERE u.id = sl.owner_user_id;

-- 3) 历史数据回填（从 auth.users）
-- 匿名用户识别逻辑：检查 raw_app_meta_data、raw_user_meta_data 中的 'anonymous' 标记
UPDATE public.share_link_visits v
SET
  visitor_email = u.email,
  visitor_is_anonymous = CASE
    WHEN u.raw_app_meta_data->>'provider' = 'anonymous' THEN true
    WHEN u.raw_user_meta_data->>'provider' = 'anonymous' THEN true
    WHEN COALESCE((u.raw_app_meta_data->>'is_anonymous')::boolean, false) THEN true
    WHEN COALESCE((u.raw_user_meta_data->>'is_anonymous')::boolean, false) THEN true
    WHEN u.email IS NULL THEN true
    ELSE false
  END,
  visitor_provider = COALESCE(
    u.raw_app_meta_data->>'provider',
    u.raw_user_meta_data->>'provider',
    'unknown'
  )
FROM auth.users u
WHERE u.id = v.visitor_user_id;

-- 4) OAuth/邮箱用户通过带 ref 的落地页完成登录后的归因（与「点击」区分：强调最终用邮箱账号建立关系）
CREATE TABLE IF NOT EXISTS public.share_link_oauth_attributions (
  id BIGSERIAL PRIMARY KEY,
  share_link_id UUID NOT NULL REFERENCES public.share_links (id) ON DELETE CASCADE,
  short_code TEXT NOT NULL,
  sharer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sharer_email TEXT,
  attributed_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  visitor_email TEXT NOT NULL,
  oauth_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT share_oauth_one_per_user_link UNIQUE (share_link_id, attributed_user_id)
);

CREATE INDEX IF NOT EXISTS idx_share_oauth_sharer ON public.share_link_oauth_attributions (sharer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_oauth_code ON public.share_link_oauth_attributions (lower(short_code));
CREATE INDEX IF NOT EXISTS idx_share_oauth_visitor_email ON public.share_link_oauth_attributions (lower(visitor_email));

COMMENT ON TABLE public.share_link_oauth_attributions IS 'Non-anonymous user with email attributed to ref at OAuth sign-in (same session had ref)';

-- 5) 刷新：获取/创建短链时写入 owner 邮箱
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
  v_email TEXT;
  v_anon BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT u.email,
         COALESCE(
           (u.raw_app_meta_data->>'provider') = 'anonymous'
           OR COALESCE((u.raw_app_meta_data->>'is_anonymous')::boolean, false),
           false
         )
  INTO v_email, v_anon
  FROM auth.users u
  WHERE u.id = uid;

  SELECT id, short_code INTO existing FROM public.share_links WHERE owner_user_id = uid LIMIT 1;
  IF FOUND THEN
    UPDATE public.share_links
    SET owner_email = COALESCE(owner_email, v_email),
        owner_is_anonymous = v_anon
    WHERE owner_user_id = uid;
    RETURN jsonb_build_object('ok', true, 'short_code', existing.short_code);
  END IF;

  FOR i IN 1..80 LOOP
    new_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    BEGIN
      INSERT INTO public.share_links (owner_user_id, short_code, owner_email, owner_is_anonymous)
      VALUES (uid, new_code, v_email, v_anon);
      RETURN jsonb_build_object('ok', true, 'short_code', new_code);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error', 'code_generation_failed');
END;
$$;

-- 6) 刷新：落地访问写入访客邮箱
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
  v_email TEXT;
  v_anon BOOLEAN;
  v_provider TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT u.email,
         COALESCE(
           (u.raw_app_meta_data->>'provider') = 'anonymous'
           OR COALESCE((u.raw_app_meta_data->>'is_anonymous')::boolean, false),
           false
         ),
         COALESCE(u.raw_app_meta_data->>'provider', 'unknown')
  INTO v_email, v_anon, v_provider
  FROM auth.users u
  WHERE u.id = uid;

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

  INSERT INTO public.share_link_visits (share_link_id, visitor_user_id, visitor_email, visitor_is_anonymous, visitor_provider)
  VALUES (sl.id, uid, v_email, v_anon, v_provider);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7) OAuth 登录成功后由前端调用：当前用户非匿名且有邮箱，且 URL/session 中有 ref
CREATE OR REPLACE FUNCTION public.record_share_ref_oauth_attribution(p_short_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  code TEXT;
  sl_id UUID;
  sl_owner UUID;
  sl_code TEXT;
  sl_owner_email TEXT;
  v_email TEXT;
  v_anon BOOLEAN;
  v_provider TEXT;
  sharer_mail TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT u.email,
         COALESCE(
           (u.raw_app_meta_data->>'provider') = 'anonymous'
           OR COALESCE((u.raw_app_meta_data->>'is_anonymous')::boolean, false),
           false
         ),
         COALESCE(u.raw_app_meta_data->>'provider', 'unknown')
  INTO v_email, v_anon, v_provider
  FROM auth.users u
  WHERE u.id = uid;

  IF v_anon OR v_email IS NULL OR length(trim(v_email)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'anonymous_or_no_email');
  END IF;

  code := lower(trim(coalesce(p_short_code, '')));
  IF length(code) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT sl.id, sl.owner_user_id, sl.short_code, sl.owner_email
  INTO sl_id, sl_owner, sl_code, sl_owner_email
  FROM public.share_links sl
  WHERE sl.short_code = code
  LIMIT 1;

  IF sl_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_code');
  END IF;

  IF sl_owner = uid THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'self');
  END IF;

  sharer_mail := COALESCE(sl_owner_email, (SELECT email FROM auth.users WHERE id = sl_owner));

  INSERT INTO public.share_link_oauth_attributions (
    share_link_id, short_code, sharer_user_id, sharer_email, attributed_user_id, visitor_email, oauth_provider
  )
  VALUES (
    sl_id, sl_code, sl_owner, sharer_mail, uid, v_email,
    CASE WHEN v_provider IN ('unknown', 'anonymous') THEN NULL ELSE v_provider END
  )
  ON CONFLICT (share_link_id, attributed_user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER TABLE public.share_link_oauth_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_oauth_no_select" ON public.share_link_oauth_attributions;
CREATE POLICY "share_oauth_no_select" ON public.share_link_oauth_attributions
  FOR SELECT TO authenticated
  USING (false);

REVOKE ALL ON public.share_link_oauth_attributions FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_share_ref_oauth_attribution(TEXT) TO authenticated;

-- get_or_create / record_share_visit 已 GRANT 于 004；此处补 EXECUTE 若需刷新
GRANT EXECUTE ON FUNCTION public.get_or_create_share_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_share_visit(TEXT) TO authenticated;

-- =============================================================================
-- 定期统计用 SQL（在 SQL Editor 以 postgres 角色执行）
-- =============================================================================
-- A) 按分享者邮箱：短链、总点击、独立访客数、OAuth 归因人数（邮箱便于筛）
/*
SELECT
  sl.short_code,
  sl.owner_email AS sharer_email,
  sl.owner_user_id AS sharer_user_id,
  sl.owner_is_anonymous AS sharer_was_anonymous,
  COUNT(v.id) AS total_clicks,
  COUNT(DISTINCT v.visitor_user_id) AS unique_visitors,
  (SELECT COUNT(*) FROM public.share_link_oauth_attributions a WHERE a.share_link_id = sl.id) AS oauth_attributed_users
FROM public.share_links sl
LEFT JOIN public.share_link_visits v ON v.share_link_id = sl.id
GROUP BY sl.id, sl.short_code, sl.owner_email, sl.owner_user_id, sl.owner_is_anonymous
ORDER BY total_clicks DESC NULLS LAST;
*/

-- B) 明细：每次点击（含访客邮箱；匿名则 visitor_email 为空）
/*
SELECT
  sl.short_code,
  sl.owner_email AS sharer_email,
  v.created_at AS clicked_at,
  v.visitor_email,
  v.visitor_is_anonymous,
  v.visitor_provider,
  v.visitor_user_id
FROM public.share_link_visits v
JOIN public.share_links sl ON sl.id = v.share_link_id
ORDER BY v.created_at DESC
LIMIT 500;
*/

-- C) 通过分享链接完成 OAuth/邮箱归因的用户（被分享人侧）
/*
SELECT
  a.created_at,
  a.short_code,
  a.sharer_email,
  a.visitor_email AS oauth_user_email,
  a.oauth_provider,
  a.attributed_user_id
FROM public.share_link_oauth_attributions a
ORDER BY a.created_at DESC;
*/
