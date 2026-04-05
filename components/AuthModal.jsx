import React from 'react';
import { createPortal } from 'react-dom';
import { GoogleGIcon, FacebookIcon } from './BrandSocialIcons.jsx';
import { readLastOAuthProvider } from '../utils/supabaseAuth.js';
import { TRANSLATIONS } from '../utils/translations.js';

/** 按钮右上角斜向「上次使用」角标 */
function LastUsedRibbon({ label, variant }) {
  const isGoogle = variant === 'google';
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 11,
        right: -30,
        padding: '5px 44px',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: 1,
        transform: 'rotate(42deg)',
        transformOrigin: 'center',
        pointerEvents: 'none',
        zIndex: 1,
        ...(isGoogle
          ? {
              background: 'rgba(238, 29, 54, 0.16)',
              color: 'var(--brand-primary-fixed, #ee1d36)',
            }
          : {
              background: 'rgba(255, 255, 255, 0.95)',
              color: '#1877F2',
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            }),
      }}
    >
      {label}
    </span>
  );
}

/**
 * 登录弹窗：Google / Facebook（经 Supabase OAuth，无需嵌入 Facebook JS SDK）
 */
export default function AuthModal({
  open,
  onClose,
  uiLang: _uiLang,
  t,
  /** `feature_gate`：因使用需登录功能而打开，默认聚焦 Google、不显示「上次使用」角标 */
  openReason = 'default',
  onGoogleSignIn,
  onFacebookSignIn,
  supabaseReady,
}) {
  const googleBtnRef = React.useRef(null);
  const isFeatureGate = openReason === 'feature_gate';

  React.useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => {
      googleBtnRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open, openReason]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const auth = (t && t.auth) ? t.auth : TRANSLATIONS.en.auth;
  const lastUsed = readLastOAuthProvider();
  const lastLabel = auth.lastUsed || 'Last used';

  return createPortal(
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 200,
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tb-auth-modal-title"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: 'min(400px, calc(100vw - 32px))',
          borderRadius: 16,
          padding: 28,
          background: 'var(--theme-dropdown-bg, #fff)',
          border: '1px solid var(--theme-border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h2 id="tb-auth-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--theme-text)' }}>
            {auth.modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: 'var(--theme-surface)',
              cursor: 'pointer',
              color: 'var(--theme-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="icon-x text-[16px]" />
          </button>
        </div>
        {isFeatureGate && (auth.featureGateNotice || auth.modalSubtitle) ? (
          <div
            role="status"
            style={{
              margin: '0 0 16px',
              padding: '12px 14px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.55,
              fontWeight: 600,
              color: 'var(--theme-text)',
              background: 'color-mix(in srgb, var(--brand-primary-fixed, #ee1d36) 10%, var(--theme-surface))',
              border: '1px solid color-mix(in srgb, var(--brand-primary-fixed, #ee1d36) 28%, var(--theme-border))',
            }}
          >
            {auth.featureGateNotice || auth.modalSubtitle}
          </div>
        ) : (
          <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--theme-text-secondary)' }}>
            {auth.modalSubtitle}
          </p>
        )}
        <p style={{ margin: '0 0 20px', fontSize: 11, lineHeight: 1.45, color: 'var(--theme-text-muted)' }}>
          {auth.modalLegal}
        </p>
        {!supabaseReady && (
          <p style={{ fontSize: 12, color: '#b45309', marginBottom: 12 }}>
            {auth.supabaseMissing}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            ref={googleBtnRef}
            type="button"
            disabled={!supabaseReady}
            onClick={() => { onGoogleSignIn?.(); }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--theme-border)',
              background: '#fff',
              color: 'var(--theme-text)',
              fontSize: 14,
              fontWeight: 600,
              cursor: supabaseReady ? 'pointer' : 'not-allowed',
              opacity: supabaseReady ? 1 : 0.5,
            }}
          >
            {!isFeatureGate && lastUsed === 'google' && <LastUsedRibbon label={lastLabel} variant="google" />}
            <GoogleGIcon size={18} />
            {auth.signInGoogle || auth.continueGoogle}
          </button>
          <button
            type="button"
            disabled={!supabaseReady}
            onClick={() => { onFacebookSignIn?.(); }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--theme-border)',
              background: '#fff',
              color: 'var(--theme-text)',
              fontSize: 14,
              fontWeight: 600,
              cursor: supabaseReady ? 'pointer' : 'not-allowed',
              opacity: supabaseReady ? 1 : 0.5,
            }}
          >
            {!isFeatureGate && lastUsed === 'facebook' && <LastUsedRibbon label={lastLabel} variant="facebook" />}
            <FacebookIcon size={18} />
            {auth.signInFacebook || auth.continueFacebook}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
