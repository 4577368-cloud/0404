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

/**
 * 已有 session 则返回；否则尝试匿名登录（失败时返回 null，由应用回退到本地额度）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export async function ensureAnonymousSession(client) {
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (session) return session;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    console.warn('[auth] Anonymous sign-in failed (enable Anonymous provider in Supabase):', error.message);
    return null;
  }
  return data.session ?? null;
}
