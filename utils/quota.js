const MAX_FREE_QUOTA = 30;
/** 未 OAuth 登录（含匿名 session）时的免费对话上限 */
const MAX_GUEST_QUOTA = 10;
const QUOTA_KEY = 'tangbuy_chat_used';

export function getUsedCount() {
  try {
    return Math.max(0, parseInt(localStorage.getItem(QUOTA_KEY) || '0', 10) || 0);
  } catch (_) {
    return 0;
  }
}

export function incrementQuota() {
  const next = getUsedCount() + 1;
  try { localStorage.setItem(QUOTA_KEY, String(next)); } catch (_) {}
  return next;
}

/**
 * @param {number} [maxTotal=MAX_FREE_QUOTA] 当前身份对应的总额度（匿名/无 Supabase 用 MAX_GUEST_QUOTA）
 */
export function getRemainingQuota(maxTotal = MAX_FREE_QUOTA) {
  return Math.max(0, maxTotal - getUsedCount());
}

export { MAX_FREE_QUOTA, MAX_GUEST_QUOTA };
