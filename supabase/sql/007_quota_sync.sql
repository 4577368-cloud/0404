-- =============================================================================
-- 配额同步机制：确保 localStorage 与数据库双向一致
-- 依赖 002_guest_oauth_quota.sql 已执行
-- =============================================================================

-- 1. 匿名用户从 localStorage 同步配额到数据库
-- 用于：匿名用户初始化时，将本地已用次数写入数据库，保持一致性
CREATE OR REPLACE FUNCTION public.sync_quota_from_local(
  p_local_used INTEGER DEFAULT 0
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
  effective_used INTEGER;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- 只允许匿名用户调用此函数
  SELECT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = uid AND i.provider = 'anonymous'
  ) INTO is_anon;

  IF NOT is_anon THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_anonymous_user');
  END IF;

  -- 获取匿名用户配额上限
  SELECT (value)::integer INTO max_free FROM public.app_config WHERE key = 'max_free_guest';
  IF max_free IS NULL OR max_free < 1 THEN max_free := 10; END IF;

  -- 确保非负
  effective_used := GREATEST(0, LEAST(p_local_used, max_free));

  -- 获取或创建用户统计记录
  SELECT * INTO row FROM public.user_stats WHERE user_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_stats (user_id, free_quota_used, total_prompts)
    VALUES (uid, effective_used, effective_used)
    RETURNING * INTO row;
    
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'created',
      'synced_used', effective_used,
      'remaining', max_free - effective_used,
      'max_free', max_free
    );
  END IF;

  -- 如果本地计数 > 数据库计数，更新数据库（以较高者为准，防止额度回退）
  IF effective_used > row.free_quota_used THEN
    UPDATE public.user_stats
    SET 
      free_quota_used = effective_used,
      total_prompts = GREATEST(row.total_prompts, effective_used),
      updated_at = now()
    WHERE user_id = uid;
    
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'updated',
      'previous_used', row.free_quota_used,
      'synced_used', effective_used,
      'remaining', max_free - effective_used,
      'max_free', max_free
    );
  END IF;

  -- 数据库计数 >= 本地计数，无需更新
  RETURN jsonb_build_object(
    'ok', true,
    'action', 'no_change',
    'db_used', row.free_quota_used,
    'local_used', effective_used,
    'remaining', max_free - row.free_quota_used,
    'max_free', max_free
  );
END;
$$;

-- 2. 匿名用户转换为 OAuth 用户时迁移配额
-- 将旧匿名用户的已用配额迁移到新 OAuth 用户
CREATE OR REPLACE FUNCTION public.migrate_quota_on_oauth_upgrade(
  p_old_anonymous_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid UUID := auth.uid();
  old_row RECORD;
  new_row RECORD;
  max_free_oauth INTEGER;
  migrated_used INTEGER;
BEGIN
  IF new_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- 获取 OAuth 用户配额上限
  SELECT (value)::integer INTO max_free_oauth FROM public.app_config WHERE key = 'max_free_quota';
  IF max_free_oauth IS NULL OR max_free_oauth < 1 THEN max_free_oauth := 30; END IF;

  -- 获取旧匿名用户的配额记录
  SELECT * INTO old_row FROM public.user_stats WHERE user_id = p_old_anonymous_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'old_user_not_found');
  END IF;

  -- 获取或创建新 OAuth 用户的记录
  SELECT * INTO new_row FROM public.user_stats WHERE user_id = new_uid FOR UPDATE;
  IF NOT FOUND THEN
    -- OAuth 用户是新用户，直接创建并继承匿名用户的已用次数（不超过 OAuth 上限）
    migrated_used := LEAST(old_row.free_quota_used, max_free_oauth);
    
    INSERT INTO public.user_stats (user_id, free_quota_used, total_prompts, is_vip)
    VALUES (new_uid, migrated_used, migrated_used, false)
    RETURNING * INTO new_row;
    
    -- 标记旧记录为已迁移（可选，用于审计）
    UPDATE public.user_stats 
    SET notes = COALESCE(notes, '') || ' [migrated to ' || new_uid::text || ' at ' || now()::text || ']'
    WHERE user_id = p_old_anonymous_user_id;
    
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'created_with_migration',
      'migrated_used', migrated_used,
      'old_user_id', p_old_anonymous_user_id,
      'remaining', max_free_oauth - migrated_used,
      'max_free', max_free_oauth
    );
  END IF;

  -- OAuth 用户已存在，合并配额（取较高者，防止额度回退）
  migrated_used := GREATEST(old_row.free_quota_used, new_row.free_quota_used);
  migrated_used := LEAST(migrated_used, max_free_oauth); -- 不超过上限
  
  IF migrated_used > new_row.free_quota_used THEN
    UPDATE public.user_stats
    SET 
      free_quota_used = migrated_used,
      total_prompts = GREATEST(new_row.total_prompts, migrated_used),
      updated_at = now()
    WHERE user_id = new_uid;
    
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'merged',
      'previous_used', new_row.free_quota_used,
      'migrated_used', migrated_used,
      'old_user_id', p_old_anonymous_user_id,
      'remaining', max_free_oauth - migrated_used,
      'max_free', max_free_oauth
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'no_change',
    'db_used', new_row.free_quota_used,
    'old_user_used', old_row.free_quota_used,
    'remaining', max_free_oauth - new_row.free_quota_used,
    'max_free', max_free_oauth
  );
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.sync_quota_from_local IS 'Sync quota from localStorage to database for anonymous users. Takes higher of local and db values.';
COMMENT ON FUNCTION public.migrate_quota_on_oauth_upgrade IS 'Migrate quota from anonymous user to OAuth user on login. Preserves usage count across identity upgrade.';
