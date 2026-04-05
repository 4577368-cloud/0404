import { supabase } from './supabaseClient.js';

/** 与后端 / 看板约定的事件名（snake_case） */
export const AnalyticsEvent = {
  AUTH_MODAL_OPEN: 'auth_modal_open',
  AUTH_MODAL_CLOSE: 'auth_modal_close',
  OAUTH_PROVIDER_CLICK: 'oauth_provider_click',
  FEATURE_GATE_BLOCKED: 'feature_gate_blocked',
  CREDITS_HINT_SHOWN: 'credits_hint_shown',
  QUOTA_MODAL_OPEN: 'quota_modal_open',
  QUOTA_MODAL_SIGN_IN_CLICK: 'quota_modal_sign_in_click',
  VIP_CODE_SUBMIT: 'vip_code_submit',
};

/**
 * 异步埋点：无 Supabase 或未登录（无 auth.uid）时自动跳过，不向主流程抛错。
 * @param {string} eventName
 * @param {Record<string, unknown>} [properties]
 */
export function track(eventName, properties = {}) {
  if (!supabase || !eventName) return;
  const props = properties && typeof properties === 'object' && !Array.isArray(properties) ? properties : {};
  supabase.rpc('log_app_event', {
    p_event_name: String(eventName).slice(0, 160),
    p_properties: props,
  }).then(({ error }) => {
    if (error && import.meta.env?.DEV) {
      console.warn('[analytics]', eventName, error.message);
    }
  });
}
