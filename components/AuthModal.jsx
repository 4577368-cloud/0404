import React from 'react';
import { createPortal } from 'react-dom';

/**
 * 居中 Google 授权弹窗（未登录时从侧栏唤起）
 */
export default function AuthModal({ open, onClose, uiLang, onGoogleSignIn, supabaseReady }) {
  if (!open) return null;

  const zh = uiLang === 'zh';

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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--theme-text)' }}>
            {zh ? '登录 Tangbuy AI' : 'Sign in to Tangbuy AI'}
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
        <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.5, color: 'var(--theme-text-secondary)' }}>
          {zh
            ? '使用 Google 账号登录，以同步你的偏好与后续云端数据。'
            : 'Sign in with Google to sync preferences and future cloud data.'}
        </p>
        {!supabaseReady && (
          <p style={{ fontSize: 12, color: '#b45309', marginBottom: 12 }}>
            {zh ? '未配置 Supabase 环境变量（VITE_SUPABASE_URL / ANON_KEY）。' : 'Supabase env vars missing (VITE_SUPABASE_URL / ANON_KEY).'}
          </p>
        )}
        <button
          type="button"
          disabled={!supabaseReady}
          onClick={() => { onGoogleSignIn?.(); }}
          style={{
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
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {zh ? '使用 Google 继续' : 'Continue with Google'}
        </button>
      </div>
    </>,
    document.body
  );
}
