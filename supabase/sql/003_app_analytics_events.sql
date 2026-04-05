-- =============================================================================
-- 前端行为埋点：经 RPC 写入（客户端不直接 INSERT）
-- 依赖 001_user_analytics.sql；在 Supabase SQL Editor 执行本文件
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_analytics_user_time
  ON public.app_analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_analytics_event_time
  ON public.app_analytics_events (event_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_app_event(
  p_event_name TEXT,
  p_properties JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  ev TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;
  ev := trim(coalesce(p_event_name, ''));
  IF length(ev) < 1 THEN
    RETURN;
  END IF;
  INSERT INTO public.app_analytics_events (user_id, event_name, properties)
  VALUES (uid, left(ev, 160), coalesce(p_properties, '{}'::jsonb));
END;
$$;

ALTER TABLE public.app_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_analytics_select_own" ON public.app_analytics_events;
CREATE POLICY "app_analytics_select_own" ON public.app_analytics_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.app_analytics_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_app_event(TEXT, JSONB) TO authenticated;
