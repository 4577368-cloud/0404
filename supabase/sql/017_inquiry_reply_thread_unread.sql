-- =============================================================================
-- 询盘回复升级：支持多条回复 + 用户未读计数
-- 在 Supabase Dashboard -> SQL Editor 执行
-- =============================================================================

ALTER TABLE public.product_inquiries
  ADD COLUMN IF NOT EXISTS reply_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_seen_reply_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.product_inquiries.reply_messages IS 'Reply thread list; each item: {content, at, by}';
COMMENT ON COLUMN public.product_inquiries.reply_count IS 'Total replies from admin';
COMMENT ON COLUMN public.product_inquiries.user_seen_reply_count IS 'How many replies the user has seen';

-- 兼容历史单条回复字段，回填到线程和计数
UPDATE public.product_inquiries
SET
  reply_messages = CASE
    WHEN coalesce(reply_content, '') <> '' AND coalesce(jsonb_array_length(reply_messages), 0) = 0
      THEN jsonb_build_array(
        jsonb_build_object(
          'content', reply_content,
          'at', coalesce(reply_at, updated_at, created_at),
          'by', coalesce(replied_by, 'TangbuyDropshipping')
        )
      )
    ELSE reply_messages
  END,
  reply_count = CASE
    WHEN coalesce(reply_content, '') <> '' AND coalesce(jsonb_array_length(reply_messages), 0) = 0
      THEN 1
    ELSE greatest(coalesce(reply_count, 0), coalesce(jsonb_array_length(reply_messages), 0))
  END
WHERE true;

CREATE INDEX IF NOT EXISTS idx_product_inquiries_user_unread
  ON public.product_inquiries (user_id, status, reply_count, user_seen_reply_count, updated_at DESC);

-- 用户点击“询盘消息”后，批量标记自己已读
CREATE OR REPLACE FUNCTION public.mark_my_inquiry_replies_seen()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  affected INT := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.product_inquiries
  SET user_seen_reply_count = coalesce(reply_count, 0)
  WHERE user_id = uid
    AND status = 'replied'
    AND coalesce(reply_count, 0) > coalesce(user_seen_reply_count, 0);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_inquiry_replies_seen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_inquiry_replies_seen() TO authenticated;
