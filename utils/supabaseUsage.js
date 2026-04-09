import { MAX_FREE_QUOTA, MAX_GUEST_QUOTA } from './quota.js';

/** @param {import('@supabase/supabase-js').SupabaseClient | null} client */
export async function fetchUserStats(client) {
  if (!client) return null;
  const { data, error } = await client.from('user_stats').select('*').maybeSingle();
  if (error) {
    console.warn('[user_stats]', error.message);
    return null;
  }
  return data;
}

/**
 * Display remaining free credits (VIP still returns a number for bar math; Header hides when is_vip).
 * @param {boolean} [isAnonymous] Supabase 匿名用户为 true，额度上限为 MAX_GUEST_QUOTA；OAuth 为 false，上限 MAX_FREE_QUOTA。
 */
export function remainingFromStats(row, isAnonymous = false) {
  if (row?.is_vip) return MAX_FREE_QUOTA;
  const cap = isAnonymous ? MAX_GUEST_QUOTA : MAX_FREE_QUOTA;
  if (!row) return cap;
  return Math.max(0, cap - (row.free_quota_used ?? 0));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ conversationId: string, content: string, extractedUrls?: string[] }} p
 */
export async function consumeChatTurn(client, { conversationId, content, extractedUrls = [] }) {
  const urls = Array.isArray(extractedUrls) ? extractedUrls : [];
  const { data, error } = await client.rpc('consume_chat_turn', {
    p_conversation_id: conversationId ?? '',
    p_content: content ?? '',
    p_extracted_urls: urls,
  });
  if (error) {
    console.warn('[consume_chat_turn]', error.message);
    return { allowed: false, reason: 'rpc_error', error };
  }
  return data && typeof data === 'object' ? data : {};
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} code
 */
export async function claimVipRemote(client, code) {
  const { data, error } = await client.rpc('claim_vip', { p_code: code ?? '' });
  if (error) {
    console.warn('[claim_vip]', error.message);
    return { ok: false, error: 'rpc_error' };
  }
  return data && typeof data === 'object' ? data : { ok: false };
}

/**
 * Fire-and-forget Tangbuy click analytics (no-op if not signed in or URL not tangbuy-related server-side).
 * @param {import('@supabase/supabase-js').SupabaseClient | null} client
 */
export async function logTangbuyClick(client, eventKind, targetUrl, meta = {}) {
  if (!client || !targetUrl) return;
  try {
    await client.rpc('log_tangbuy_click', {
      p_event_kind: eventKind || 'link',
      p_target_url: String(targetUrl),
      p_meta: meta && typeof meta === 'object' ? meta : {},
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Log which model generated the current assistant reply.
 * @param {import('@supabase/supabase-js').SupabaseClient | null} client
 * @param {{ conversationId?: string, modelId?: string, modelRoute?: 'primary'|'secondary'|string, hasImage?: boolean }} p
 */
export async function logAiModelReply(client, { conversationId = '', modelId = '', modelRoute = 'primary', hasImage = false } = {}) {
  if (!client) return;
  if (!modelId) return;
  try {
    await client.rpc('log_ai_model_reply', {
      p_conversation_id: conversationId ?? '',
      p_model_id: String(modelId || ''),
      p_model_route: String(modelRoute || 'primary'),
      p_has_image: !!hasImage,
    });
  } catch (_) {
    /* ignore */
  }
}
