/**
 * Supabase 匿名用户：与 OAuth 用户一样有 auth.uid()，可走同一套 user_stats / RPC。
 * 需在 Dashboard → Authentication → Providers → Anonymous 中开启。
 */
export function isAnonymousUser(user) {
  if (!user) return false;
  if (user.is_anonymous === true) return true;
  const p = user.app_metadata?.provider;
  return p === 'anonymous';
}

const LAST_OAUTH_PROVIDER_KEY = 'tb_oauth_last_provider';
const SOCIAL_PROVIDERS = ['google', 'facebook'];

/**
 * OAuth 登录成功后写入，用于登录弹窗「上次使用」提示。
 */
export function persistLastOAuthProviderIfSocial(user) {
  if (!user || isAnonymousUser(user)) return;
  let p = user.app_metadata?.provider;
  if (!SOCIAL_PROVIDERS.includes(p)) {
    const ident = Array.isArray(user.identities)
      ? user.identities.find((i) => SOCIAL_PROVIDERS.includes(i.provider))
      : null;
    p = ident?.provider;
  }
  if (p && SOCIAL_PROVIDERS.includes(p)) {
    try {
      localStorage.setItem(LAST_OAUTH_PROVIDER_KEY, p);
    } catch (_) {
      /* ignore */
    }
  }
}

/** @returns {'google' | 'facebook' | null} */
export function readLastOAuthProvider() {
  try {
    const v = localStorage.getItem(LAST_OAUTH_PROVIDER_KEY);
    return v === 'google' || v === 'facebook' ? v : null;
  } catch (_) {
    return null;
  }
}

const ANON_SESSION_BACKUP_KEY = 'tb_anon_session_backup';

/**
 * 保存当前匿名 session 的 refresh_token，以便 OAuth 登出后恢复同一匿名身份。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export async function saveAnonymousSessionBeforeOAuth(client) {
  if (!client) return;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    const user = session.user;
    if (!user || !isAnonymousUser(user)) return;
    localStorage.setItem(ANON_SESSION_BACKUP_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_id: user.id, // Store user_id for quota migration on OAuth upgrade
    }));
  } catch (_) { /* ignore */ }
}

/**
 * 获取之前保存的匿名用户 ID（用于 OAuth 升级后的配额迁移）。
 * @returns {string|null} 匿名用户 ID 或 null
 */
export function getSavedAnonymousUserId() {
  try {
    const raw = localStorage.getItem(ANON_SESSION_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user_id || null;
  } catch (_) {
    return null;
  }
}

/**
 * 清除已保存的匿名 session（OAuth 升级成功后调用）。
 */
export function clearAnonymousSessionBackup() {
  try {
    localStorage.removeItem(ANON_SESSION_BACKUP_KEY);
  } catch (_) { /* ignore */ }
}

/**
 * 尝试恢复之前保存的匿名 session（避免创建新匿名用户）。
 * 成功返回 session，失败返回 null（调用方应降级到 signInAnonymously）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
async function restoreAnonymousSession(client) {
  if (!client) return null;
  try {
    const raw = localStorage.getItem(ANON_SESSION_BACKUP_KEY);
    if (!raw) return null;
    const { access_token, refresh_token } = JSON.parse(raw);
    if (!refresh_token) return null;
    const { data, error } = await client.auth.setSession({ access_token, refresh_token });
    if (error) {
      if (import.meta.env?.DEV) console.warn('[auth] restore anon session failed:', error.message);
      localStorage.removeItem(ANON_SESSION_BACKUP_KEY);
      return null;
    }
    return data.session ?? null;
  } catch (_) {
    localStorage.removeItem(ANON_SESSION_BACKUP_KEY);
    return null;
  }
}

/**
 * 已有 session 则返回；否则尝试恢复之前的匿名 session；最后才创建新匿名用户。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export async function ensureAnonymousSession(client) {
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (session) return session;
  // 尝试恢复之前保存的匿名 session
  const restored = await restoreAnonymousSession(client);
  if (restored) {
    if (import.meta.env?.DEV) console.log('[auth] restored previous anonymous session');
    return restored;
  }
  // 创建新匿名用户（最后手段）
  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    console.warn('[auth] Anonymous sign-in failed (enable Anonymous provider in Supabase):', error.message);
    return null;
  }
  const newSession = data.session ?? null;
  // 保存新匿名 session 以备将来恢复
  if (newSession) {
    try {
      localStorage.setItem(ANON_SESSION_BACKUP_KEY, JSON.stringify({
        access_token: newSession.access_token,
        refresh_token: newSession.refresh_token,
      }));
    } catch (_) { /* ignore */ }
  }
  return newSession;
}

const DEVICE_ID_KEY = 'tb_device_id';

/**
 * 获取或生成一个稳定的设备 ID，存储在 localStorage 中。
 * 同一浏览器始终返回相同 ID，不受匿名 session 变化影响。
 */
export function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch (_) {
    return 'unknown';
  }
}
