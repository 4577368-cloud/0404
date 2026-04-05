const MAX_FREE_QUOTA = 30;
const QUOTA_KEY = 'tangbuy_chat_used';

function getUsedCount() {
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

export function getRemainingQuota() {
  return Math.max(0, MAX_FREE_QUOTA - getUsedCount());
}

export { MAX_FREE_QUOTA };
