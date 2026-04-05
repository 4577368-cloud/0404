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
        },
      })
    : null;

export function isSupabaseConfigured() {
  return supabase != null;
}
