-- =============================================================================
-- Tangbuy AI — 对话商品「询盘」记录（用户 WhatsApp + 需求描述 + 商品快照）
-- 在 Supabase Dashboard → SQL Editor 执行；执行后匿名用户仅能通过登录后写入
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_email TEXT,
  product_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  whatsapp TEXT NOT NULL,
  demand TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'replied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_inquiries_user_created
  ON public.product_inquiries (user_id, created_at DESC);

ALTER TABLE public.product_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own inquiries" ON public.product_inquiries;
CREATE POLICY "Users read own inquiries"
  ON public.product_inquiries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own inquiries" ON public.product_inquiries;
CREATE POLICY "Users insert own inquiries"
  ON public.product_inquiries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- status 改为 replied 由后台 / service_role 处理，前端用户无 UPDATE

CREATE OR REPLACE FUNCTION public.set_product_inquiries_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_inquiries_updated ON public.product_inquiries;
CREATE TRIGGER trg_product_inquiries_updated
  BEFORE UPDATE ON public.product_inquiries
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_product_inquiries_updated_at();

COMMENT ON TABLE public.product_inquiries IS 'Chat product inquiry: WhatsApp + demand + product JSON; status submitted|replied';

GRANT SELECT, INSERT ON public.product_inquiries TO authenticated;
