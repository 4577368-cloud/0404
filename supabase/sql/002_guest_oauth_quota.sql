-- =============================================================================
-- 匿名用户 10 次 / OAuth 用户 30 次免费对话（在 Supabase SQL Editor 执行）
-- 依赖 001_user_analytics.sql 已执行
-- =============================================================================

INSERT INTO public.app_config (key, value) VALUES ('max_free_guest', '10')
ON CONFLICT (key) DO NOTHING;

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
  is_anon BOOLEAN := false;
  row RECORD;
  preview TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  END IF;

  -- Supabase 匿名登录：identities 中存在 provider = anonymous
  SELECT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = uid AND i.provider = 'anonymous'
  ) INTO is_anon;

  IF is_anon THEN
    SELECT (value)::integer INTO max_free FROM public.app_config WHERE key = 'max_free_guest';
    IF max_free IS NULL OR max_free < 1 THEN max_free := 10; END IF;
  ELSE
    SELECT (value)::integer INTO max_free FROM public.app_config WHERE key = 'max_free_quota';
    IF max_free IS NULL OR max_free < 1 THEN max_free := 30; END IF;
  END IF;

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
