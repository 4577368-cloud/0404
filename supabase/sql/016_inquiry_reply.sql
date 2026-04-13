-- =============================================================================
-- 询盘回复功能：为 product_inquiries 新增回复字段
-- 在 Supabase Dashboard → SQL Editor 执行
-- =============================================================================

-- 1. 新增字段
ALTER TABLE public.product_inquiries
  ADD COLUMN IF NOT EXISTS reply_content TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replied_by TEXT DEFAULT 'TangbuyDropshipping';

-- 2. 索引：按状态查询（管理员列表场景）
CREATE INDEX IF NOT EXISTS idx_product_inquiries_status_created
  ON public.product_inquiries (status, created_at DESC);

COMMENT ON COLUMN public.product_inquiries.reply_content IS 'Admin reply text';
COMMENT ON COLUMN public.product_inquiries.reply_at IS 'Timestamp when admin replied';
COMMENT ON COLUMN public.product_inquiries.replied_by IS 'Replier display name, default TangbuyDropshipping';
