import React from 'react';
import { createPortal } from 'react-dom';
import { GoogleGIcon, FacebookIcon } from './BrandSocialIcons.jsx';
import { readLastOAuthProvider } from '../utils/supabaseAuth.js';

/** 按钮右上角斜向「上次使用」角标 */
function LastUsedRibbon({ zh, variant }) {
  const label = zh ? '上次使用' : 'Last used';
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
export default function AuthModal({ open, onClose, uiLang, onGoogleSignIn, onFacebookSignIn, supabaseReady }) {
  if (!open) return null;

  const zh = uiLang === 'zh';
  const lastUsed = readLastOAuthProvider();

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
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--theme-text-secondary)' }}>
          {zh
            ? '使用 Google 或 Facebook 登录，以同步你的偏好与后续云端数据。'
            : 'Sign in with Google or Facebook to sync preferences and cloud data.'}
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 11, lineHeight: 1.45, color: 'var(--theme-text-muted)' }}>
          {zh
            ? '授权由 Google / Meta 页面完成；应用名称与隐私政策请在对应开发者后台配置。'
            : 'Consent screens are hosted by Google / Meta; configure app name and policies in each developer console.'}
        </p>
        {!supabaseReady && (
          <p style={{ fontSize: 12, color: '#b45309', marginBottom: 12 }}>
            {zh ? '未配置 Supabase 环境变量（VITE_SUPABASE_URL / ANON_KEY）。' : 'Supabase env vars missing (VITE_SUPABASE_URL / ANON_KEY).'}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
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
            {lastUsed === 'google' && <LastUsedRibbon zh={zh} variant="google" />}
            <GoogleGIcon size={18} />
            {zh ? '使用 Google 继续' : 'Continue with Google'}
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
            {lastUsed === 'facebook' && <LastUsedRibbon zh={zh} variant="facebook" />}
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
            {zh ? '使用 Facebook 继续' : 'Continue with Facebook'}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
