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
  onGoogleSignIn,
  onFacebookSignIn,
  supabaseReady,
}) {
  const googleBtnRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => {
      googleBtnRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

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
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--theme-text-secondary)' }}>
          {auth.modalSubtitle}
        </p>
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
            {lastUsed === 'google' && <LastUsedRibbon label={lastLabel} variant="google" />}
            <GoogleGIcon size={18} />
            {auth.continueGoogle}
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
              border: '1px solid rgba(24, 119, 242, 0.35)',
              background: '#1877F2',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: supabaseReady ? 'pointer' : 'not-allowed',
              opacity: supabaseReady ? 1 : 0.5,
            }}
          >
            {lastUsed === 'facebook' && <LastUsedRibbon label={lastLabel} variant="facebook" />}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 5,
                background: '#fff',
                flexShrink: 0,
              }}
              aria-hidden
            >
              <FacebookIcon size={14} />
            </span>
            {auth.continueFacebook}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
