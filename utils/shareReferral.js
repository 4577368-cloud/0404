/**
 * 专属分享短链：URL 查询参数 ref=短码，落地后写入 share_link_visits（需 Supabase 会话）。
 */

import { isAnonymousUser } from './supabaseAuth.js';

export const SHARE_REF_QUERY_KEY = 'ref';
const SESSION_REF_KEY = 'tb_share_ref_pending';

/**
 * @param {string} [search]
 * @returns {string|null}
 */
export function parseRefCodeFromSearch(search) {
  if (typeof window === 'undefined' && search == null) return null;
  const q = search ?? (typeof window !== 'undefined' ? window.location.search : '') ?? '';
  try {
    const params = new URLSearchParams(q.startsWith('?') ? q : `?${q}`);
    const raw = params.get(SHARE_REF_QUERY_KEY) || params.get('s') || params.get('invite');
    const code = raw != null ? String(raw).trim() : '';
    return code.length >= 4 ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * 将当前页 URL 中的 ref 同步到 localStorage（OAuth 回调前可保留）
 */
export function persistRefFromUrlToSession() {
  if (typeof window === 'undefined') return;
  const code = parseRefCodeFromSearch();
  if (code) {
    try {
      localStorage.setItem(SESSION_REF_KEY, code);
    } catch (_) {}
    try {
      sessionStorage.setItem(SESSION_REF_KEY, code);
    } catch (_) {}
  }
}

export function getPendingRefFromSession() {
  if (typeof window === 'undefined') return null;
  try {
    const s = localStorage.getItem(SESSION_REF_KEY) || sessionStorage.getItem(SESSION_REF_KEY);
    return s && s.length >= 4 ? s.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function clearPendingRefSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_REF_KEY);
  } catch (_) {}
  try {
    sessionStorage.removeItem(SESSION_REF_KEY);
  } catch (_) {}
}

/**
 * 构建带 ref 的落地 URL（分享用）
 * @param {string} shortCode
 * @returns {string}
 */
export function buildPersonalizedShareUrl(shortCode) {
  if (typeof window === 'undefined') return '';
  const u = new URL(window.location.href);
  u.searchParams.set(SHARE_REF_QUERY_KEY, String(shortCode).toLowerCase());
  return u.toString();
}

/**
 * 从地址栏去掉 ref（可选，避免重复上报）
 */
export function stripRefFromAddressBar() {
  if (typeof window === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(SHARE_REF_QUERY_KEY)) return;
    u.searchParams.delete(SHARE_REF_QUERY_KEY);
    const next = `${u.pathname}${u.search}${u.hash}`;
    window.history.replaceState({}, '', next);
  } catch (_) {}
}

function sessionRecordedKey(code) {
  return `tb_ref_visit_done_${code}`;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function recordShareVisitIfNeeded(supabase) {
  if (!supabase) return { ok: false, reason: 'no_client' };
  let code = parseRefCodeFromSearch();
  if (!code) code = getPendingRefFromSession();
  if (!code) return { ok: false, reason: 'no_ref' };

  try {
    if (localStorage.getItem(sessionRecordedKey(code)) === '1' || sessionStorage.getItem(sessionRecordedKey(code)) === '1') {
      stripRefFromAddressBar();
      return { ok: true, reason: 'already_recorded_session' };
    }
  } catch (_) {}

  const { data, error } = await supabase.rpc('record_share_visit', {
    p_short_code: code,
  });
  if (error) {
    if (import.meta.env?.DEV) console.warn('[share-ref]', error.message);
    return { ok: false, reason: error.message };
  }
  const payload = data && typeof data === 'object' ? data : {};
  if (payload.error === 'not_authenticated') {
    return { ok: false, reason: 'not_authenticated' };
  }
  if (payload.ok === true || payload.skipped === 'self') {
    try {
      localStorage.setItem(sessionRecordedKey(code), '1');
      localStorage.setItem(SESSION_REF_KEY, code);
    } catch (_) {}
    try {
      sessionStorage.setItem(sessionRecordedKey(code), '1');
    } catch (_) {}
    stripRefFromAddressBar();
  }
  return { ok: !!payload.ok || payload.skipped === 'self' };
}

const OAUTH_ATR_KEY = (code) => `tb_ref_oauth_attr_${code}`;

/**
 * 非匿名且已绑定邮箱的用户（Google/Facebook 等）在仍持有 ref 时记一条 OAuth 归因（需 005_share_referral_emails.sql RPC）。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('@supabase/supabase-js').User | null} authUser
 */
export async function recordShareOAuthAttributionIfNeeded(supabase, authUser) {
  if (!supabase || !authUser) return { ok: false, reason: 'skip' };
  if (isAnonymousUser(authUser)) return { ok: false, reason: 'anonymous' };
  const email = String(authUser.email || '').trim();
  if (!email) return { ok: false, reason: 'no_email' };

  let code = parseRefCodeFromSearch();
  if (!code) code = getPendingRefFromSession();
  if (!code) return { ok: false, reason: 'no_ref' };

  try {
    if (localStorage.getItem(OAUTH_ATR_KEY(code)) === '1' || sessionStorage.getItem(OAUTH_ATR_KEY(code)) === '1') {
      return { ok: true, reason: 'already_recorded' };
    }
  } catch (_) {}

  if (import.meta.env?.DEV) console.log('[share-ref-oauth] calling RPC with code:', code, 'user:', authUser.email);
  const { data, error } = await supabase.rpc('record_share_ref_oauth_attribution', {
    p_short_code: code,
  });
  if (error) {
    if (import.meta.env?.DEV) console.warn('[share-ref-oauth]', error.message);
    return { ok: false, reason: error.message };
  }
  const payload = data && typeof data === 'object' ? data : {};
  if (import.meta.env?.DEV) console.log('[share-ref-oauth] RPC result:', payload);
  if (payload.skipped === 'anonymous_or_no_email' || payload.skipped === 'self') {
    return { ok: true, reason: payload.skipped };
  }
  if (payload.ok === true) {
    try {
      localStorage.setItem(OAUTH_ATR_KEY(code), '1');
    } catch (_) {}
  }
  return { ok: !!payload.ok, reason: payload.error || '' };
}
