import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 未配置环境变量时为 null，避免运行时报错 */
export const supabase =
  typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // 会话存在浏览器 localStorage（按 origin），与 Vercel 部署包无关。
          // 换域名 / 清缓存 / 无痕 / 另一浏览器 = 新匿名用户 = 新 user_id = 额度从 0 计。
          // Preview 与 Production 若域名不同，也是不同 localStorage → 不同身份。
        },
      })
    : null;

export function isSupabaseConfigured() {
  return supabase != null;
}
