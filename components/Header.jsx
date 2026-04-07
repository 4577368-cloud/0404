import React from 'react';
import { createPortal } from 'react-dom';
import { track, AnalyticsEvent } from '../utils/analytics.js';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient.js';
import { openFacebookShareDialog, ensureFacebookSdk } from '../utils/facebookSdk.js';

const DEFAULT_SHARE_TEMPLATE_EN =
  "⚡ Your store's hidden leaks? Tangbuy AI finds them.\n✅ Product diagnosis\n✅ Market gap analysis\n✅ Cross-border optimization tips\n100% free. 30 seconds to insights.\n👉 {{url}}\n#TangbuyDropshipping #EcommerceAI #SmartSelling";

function buildSharePayload(shareUrl, t) {
  const tpl = t?.header?.shareMessageTemplate || DEFAULT_SHARE_TEMPLATE_EN;
  const fullMessage = tpl.replace(/\{\{url\}\}/g, shareUrl).trim();
  const quoteOnly = tpl.replace(/\{\{url\}\}/g, '').replace(/\s+/g, ' ').trim();
  return { fullMessage, quoteOnly };
}

const SHARE_PLATFORMS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    getUrl: ({ shareUrl, fullMessage }) =>
      `https://api.whatsapp.com/send?text=${encodeURIComponent(fullMessage)}`,
  },
  {
    id: 'x',
    label: 'X',
    color: '#000000',
    icon: (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    getUrl: ({ shareUrl, fullMessage }) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullMessage)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    /** 只传 u：quote 参数常被 FB 忽略或导致空白弹窗；文案由点击时复制剪贴板 */
    getUrl: ({ shareUrl }) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    color: '#FF4500',
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 0-.463.327.327 0 0 0-.462 0c-.535.534-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.216-.08z"/>
      </svg>
    ),
    getUrl: ({ shareUrl, quoteOnly }) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(quoteOnly.slice(0, 280))}`,
  },
];

function ShareModal({ isOpen, onClose, t, authUser }) {
  const [copied, setCopied] = React.useState(false);
  const [facebookCopiedHint, setFacebookCopiedHint] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState(() =>
    typeof window !== 'undefined' ? window.location.href : ''
  );
  const [shareUrlLoading, setShareUrlLoading] = React.useState(false);
  const { fullMessage, quoteOnly } = React.useMemo(
    () => buildSharePayload(shareUrl, t),
    [shareUrl, t],
  );
  const h = t?.header || {};

  React.useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setFacebookCopiedHint(false);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const id = import.meta.env.VITE_FACEBOOK_APP_ID?.trim?.();
    if (!id) return;
    ensureFacebookSdk(id).catch(() => {});
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured() || !supabase || !authUser?.id) {
        setShareUrl(window.location.href);
        return;
      }
      setShareUrlLoading(true);
      const { data, error } = await supabase.rpc('get_or_create_share_link');
      if (cancelled) return;
      setShareUrlLoading(false);
      const code = data && typeof data === 'object' && data.ok && data.short_code ? String(data.short_code) : null;
      if (error || !code) {
        if (import.meta.env?.DEV && error) console.warn('[share-link]', error.message);
        setShareUrl(window.location.href);
        return;
      }
      const u = new URL(window.location.href);
      u.searchParams.set('ref', code);
      setShareUrl(u.toString());
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, authUser?.id]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (shareUrlLoading) return;
    try {
      await navigator.clipboard.writeText(fullMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const handleShare = async (platform) => {
    if (shareUrlLoading) return;
    const u = String(shareUrl || '').trim();
    if (!u) return;

    if (platform.id === 'facebook') {
      const fbAppId = import.meta.env.VITE_FACEBOOK_APP_ID?.trim?.() || '';
      if (fbAppId) {
        try {
          await openFacebookShareDialog({
            appId: fbAppId,
            href: u,
            quote: fullMessage,
            hashtag: '#TangbuyDropshipping',
          });
          setFacebookCopiedHint(false);
          return;
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[fb-share]', e);
        }
      }
      try {
        await navigator.clipboard.writeText(fullMessage);
        setFacebookCopiedHint(true);
        setTimeout(() => setFacebookCopiedHint(false), 12000);
      } catch (_) {
        setFacebookCopiedHint(false);
      }
      window.open(platform.getUrl({ shareUrl: u }), '_blank', 'noopener,noreferrer,width=600,height=500');
      return;
    }

    const openUrl = platform.getUrl({ shareUrl: u, fullMessage, quoteOnly });
    window.open(openUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(420px, 90vw)', borderRadius: 16, padding: 24, zIndex: 9999,
        background: 'var(--theme-dropdown-bg)', border: '1px solid var(--theme-border)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme-text)', margin: 0 }}>{h.shareTitle || 'Share'}</h2>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 99, border: 'none', background: 'var(--theme-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-secondary)' }}
          ><span className="icon-x text-[16px]" /></button>
        </div>

        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--theme-text-muted)' }}>{h.sharePreviewLabel || 'Suggested message'}</p>
        <div style={{
          marginBottom: 14,
          borderRadius: 12,
          padding: '12px 14px',
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          maxHeight: 140,
          overflowY: 'auto',
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--theme-text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {fullMessage}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, borderRadius: 12, padding: '10px 14px', background: 'color-mix(in srgb, var(--theme-surface) 85%, transparent)', border: '1px solid var(--theme-border)' }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--theme-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={shareUrl}>
            {shareUrlLoading ? (h.shareLinkLoading || '…') : shareUrl}
          </span>
          <button type="button" onClick={handleCopy} disabled={shareUrlLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
              border: 'none', background: copied ? '#16a34a' : 'var(--theme-text)', color: copied ? '#fff' : 'var(--theme-bg)',
              fontSize: 12, fontWeight: 600, cursor: shareUrlLoading ? 'not-allowed' : 'pointer', opacity: shareUrlLoading ? 0.55 : 1, transition: 'background 0.2s', whiteSpace: 'nowrap',
            }}>
            <span className={copied ? 'icon-check text-[12px]' : 'icon-link text-[12px]'} />
            {copied ? (h.shareCopied || 'Copied!') : (h.shareCopyLink || 'Copy')}
          </button>
        </div>

        {!import.meta.env.VITE_FACEBOOK_APP_ID && (
          <p style={{ margin: '0 0 10px', fontSize: 10, color: 'var(--theme-text-muted)', textAlign: 'center', lineHeight: 1.45 }}>
            {h.facebookShareConfigureHint || ''}
          </p>
        )}

        {facebookCopiedHint && (
          <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--primary)', textAlign: 'center', lineHeight: 1.45 }}>
            {h.facebookShareClipboardHint || ''}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
          {SHARE_PLATFORMS.map((p) => (
            <button key={p.id} type="button" onClick={() => void handleShare(p)} disabled={shareUrlLoading}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: shareUrlLoading ? 'not-allowed' : 'pointer', padding: 8,
                color: p.color, transition: 'transform 0.15s', opacity: shareUrlLoading ? 0.45 : 1,
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {p.icon}
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--theme-text-secondary)' }}>
                {p.label}
              </span>
            </button>
          ))}
        </div>

        <p style={{ marginTop: 16, fontSize: 11, color: 'var(--theme-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
          {h.sharePrivacyNote || ''}
        </p>
      </div>
    </>,
    document.body
  );
}

const CREDITS_HINT_STORAGE = 'tb_credits_hint_autoshown';

export default function Header({
  currentLang, setLang, t, remainingQuota, isVip, theme, onToggleTheme, onMenuClick,
  workflowProgress, onClearWorkflowCompleted, onViewReport,
  maxFreeQuota = 30,
  showCreditsHintForAnonymous = false,
  /** 侧栏未常驻时（欢迎态）在桌面端也显示菜单按钮，用于打开抽屉 */
  showSidebarMenuOnDesktop = false,
  /** 用于生成带 ?ref=短码 的专属分享链接（Supabase 已配置且已建立会话时） */
  authUser = null,
}) {
  const languages = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
  ];

  const { isRunning = false, stepName = '', percent = 0, step = 0, justCompleted = false } = workflowProgress || {};

  const [isLangMenuOpen, setIsLangMenuOpen] = React.useState(false);
  const [isShareOpen, setIsShareOpen] = React.useState(false);
  const [creditsHintOpen, setCreditsHintOpen] = React.useState(false);
  const langRef = React.useRef(null);
  const creditsHintRef = React.useRef(null);
  const creditsBubbleHoverRef = React.useRef(false);
  const creditsCloseTimerRef = React.useRef(null);
  const creditsHintOpenSourceRef = React.useRef('unknown');

  const clearCreditsCloseTimer = React.useCallback(() => {
    if (creditsCloseTimerRef.current) {
      clearTimeout(creditsCloseTimerRef.current);
      creditsCloseTimerRef.current = null;
    }
  }, []);

  const scheduleCreditsBubbleClose = React.useCallback(() => {
    clearCreditsCloseTimer();
    creditsCloseTimerRef.current = setTimeout(() => {
      creditsCloseTimerRef.current = null;
      if (!creditsBubbleHoverRef.current) setCreditsHintOpen(false);
    }, 3000);
  }, [clearCreditsCloseTimer]);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) {
        setIsLangMenuOpen(false);
      }
      if (creditsHintRef.current && !creditsHintRef.current.contains(e.target)) {
        setCreditsHintOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!showCreditsHintForAnonymous) setCreditsHintOpen(false);
  }, [showCreditsHintForAnonymous]);

  /** 仅匿名用户：首次进入自动展开（时长与手动点开一致，见下方统一 3 秒收起） */
  React.useEffect(() => {
    if (!showCreditsHintForAnonymous) return undefined;
    try {
      if (localStorage.getItem(CREDITS_HINT_STORAGE)) return undefined;
      localStorage.setItem(CREDITS_HINT_STORAGE, '1');
    } catch (_) {
      return undefined;
    }
    creditsHintOpenSourceRef.current = 'auto';
    setCreditsHintOpen(true);
  }, [showCreditsHintForAnonymous]);

  React.useEffect(() => {
    if (!creditsHintOpen) return;
    track(AnalyticsEvent.CREDITS_HINT_SHOWN, { source: creditsHintOpenSourceRef.current });
  }, [creditsHintOpen]);

  /** 额度说明展开后：无操作约 3 秒收起；鼠标悬停在气泡上时暂停计时，移出后重新计时 */
  React.useEffect(() => {
    if (!creditsHintOpen) {
      clearCreditsCloseTimer();
      creditsBubbleHoverRef.current = false;
      return undefined;
    }
    scheduleCreditsBubbleClose();
    return () => clearCreditsCloseTimer();
  }, [creditsHintOpen, clearCreditsCloseTimer, scheduleCreditsBubbleClose]);

  React.useEffect(() => {
    if (!creditsHintOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setCreditsHintOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [creditsHintOpen]);

// (VIP quota rendering is handled below in the same Header component)
  const th = t?.header || {};
  const quotaLabel = th.credits || (currentLang === 'zh' ? '额度' : 'Credits');
  const cap = Math.max(1, maxFreeQuota);
  const pct = Math.min(1, (remainingQuota ?? cap) / cap);
  const barColor = pct > 0.5 ? 'bg-emerald-400' : pct > 0.2 ? 'bg-amber-400' : 'bg-red-400';
  const creditsHintText =
    th.creditsHint
    || (currentLang === 'zh'
      ? '未登录（匿名）用户可使用 10 次对话额度。点击左下角使用 Google / Facebook 登录后，额度扩大至 30 次，已使用次数会累计计入。'
      : 'Anonymous users get 10 free credits. Sign in with Google or Facebook (bottom-left) to unlock 30; used credits carry over after login.');
  const creditsAboutLabel = th.creditsAbout || (currentLang === 'zh' ? '额度说明' : 'About credits');
  const vipUnlimitedLabel = th.vipUnlimited || (currentLang === 'zh' ? '无限' : 'Unlimited');
  const workflowMarqueeText =
    th.workflowNoRefreshMarquee
    || (currentLang === 'zh'
      ? '报告生成中，请勿刷新页面，否则将中断分析。'
      : 'Report is generating — do not refresh the page or the analysis will be interrupted.');

  return (
    <div style={{ width: '100%', flexShrink: 0 }}>
    <header style={{
      position: 'relative',
      height: 56, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 20px',
      background: 'transparent',
      transition: 'background 0.3s',
    }}>
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={th.menu || 'Menu'}
          className={`${showSidebarMenuOnDesktop ? 'flex' : 'md:hidden'} w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity`}
          style={{ color: 'var(--brand-primary-fixed)', background: 'transparent', border: 'none' }}
        >
          <div className="icon-menu text-[16px]" />
        </button>
        
        {/* Workflow progress — 透明底、单行 */}
        {isRunning && (
          <div
            className="hidden md:flex items-center gap-2 max-w-[min(92vw,520px)]"
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: '0 8px',
            }}
          >
            <style>{`
              @keyframes tb-wf-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.45; }
              }
            `}</style>
            <span
              className="flex-shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                background: 'var(--primary)',
                animation: 'tb-wf-pulse 1.4s ease-in-out infinite',
              }}
              aria-hidden
            />
            <span
              className="text-[11px] font-bold tabular-nums flex-shrink-0"
              style={{ color: 'var(--primary)' }}
            >
              {step + 1}/10
            </span>
            <span className="flex-shrink-0" style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} aria-hidden>
              ·
            </span>
            <span
              className="text-[11px] sm:text-[12px] font-semibold truncate min-w-0"
              style={{ color: 'var(--theme-text)' }}
              title={stepName}
            >
              {stepName}
            </span>
            <span className="flex-shrink-0" style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} aria-hidden>
              ·
            </span>
            <span
              className="text-[11px] sm:text-[12px] font-medium flex-shrink-0 whitespace-nowrap"
              style={{ color: 'var(--primary)' }}
            >
              {currentLang === 'zh' ? '分析进行中…' : 'Analyzing…'}
            </span>
            <div
              className="flex-shrink-0 rounded-full overflow-hidden"
              style={{
                width: 72,
                height: 3,
                background: 'color-mix(in srgb, var(--theme-text-muted) 12%, transparent)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, percent))}%`,
                  background: 'var(--primary)',
                  borderRadius: 99,
                  transition: 'width 0.45s ease',
                }}
              />
            </div>
            <span
              className="text-[11px] font-semibold tabular-nums flex-shrink-0"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              {Math.min(100, Math.max(0, Math.round(percent)))}%
            </span>
          </div>
        )}

        {/* Workflow completed — 透明底、单行 */}
        {justCompleted && (
          <button
            type="button"
            className="hidden md:flex items-center gap-2 cursor-pointer max-w-[min(92vw,480px)]"
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: '0 8px',
            }}
            onClick={() => { onClearWorkflowCompleted?.(); onViewReport?.(); }}
          >
            <span className="icon-check text-[13px] flex-shrink-0" style={{ color: '#22c55e' }} aria-hidden />
            <span
              className="text-[11px] sm:text-[12px] font-semibold truncate text-left"
              style={{ color: '#22c55e' }}
            >
              {currentLang === 'zh' ? '分析完成' : 'Analysis Complete'}
              <span style={{ color: 'var(--theme-text-muted)', fontWeight: 500 }}>
                {' '}
                · {currentLang === 'zh' ? '点击查看报告' : 'Click to view report'} →
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Share */}
        <button onClick={() => setIsShareOpen(true)}
          style={{ color: '#3B82F6', border: 'none', background: 'transparent' }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
          title={t?.header?.shareTitle || 'Share'}
        >
          <div className="icon-share-2 text-[13px]" />
        </button>

        {/* Theme toggle */}
        <button onClick={onToggleTheme}
          style={{ color: '#F59E0B', border: 'none', background: 'transparent' }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
          title={theme === 'dark' ? 'Light' : 'Dark'}
        >
          <div className={theme === 'dark' ? 'icon-sun text-[13px]' : 'icon-moon text-[13px]'} />
        </button>

        {/* Quota / VIP */}
        {isVip ? (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              border: 'none',
            }}
          >
            <span className="text-[10px] font-extrabold" style={{ color: 'var(--primary)' }}>VIP</span>
            <span
              className="text-[15px] leading-none font-normal select-none"
              style={{ color: 'var(--theme-text-secondary)' }}
              title={vipUnlimitedLabel}
              aria-label={vipUnlimitedLabel}
              role="img"
            >
              ♾️
            </span>
          </div>
        ) : (
          <div
            ref={creditsHintRef}
            className="hidden sm:flex relative items-center gap-1"
            style={{ background: 'transparent', border: 'none', padding: 0 }}
          >
            <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-primary-fixed)' }}>{quotaLabel}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--theme-text)' }}>{remainingQuota ?? cap}</span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--theme-text-secondary)' }}>/ {cap}</span>
            <div className="w-8 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--theme-surface)' }}>
              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct * 100}%` }} />
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center cursor-pointer shrink-0 transition-[opacity,color] duration-150"
              style={{
                color: 'var(--theme-text-muted)',
                opacity: 0.42,
                border: 'none',
                background: 'transparent',
                padding: 1,
                marginLeft: 3,
              }}
              title={creditsAboutLabel}
              aria-label={creditsAboutLabel}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.85';
                e.currentTarget.style.color = 'var(--theme-text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.42';
                e.currentTarget.style.color = 'var(--theme-text-muted)';
              }}
              onClick={(e) => {
                e.stopPropagation();
                setCreditsHintOpen((v) => {
                  if (!v) creditsHintOpenSourceRef.current = 'toggle';
                  return !v;
                });
              }}
            >
              <span className="icon-info text-[11px]" aria-hidden />
            </button>
            {creditsHintOpen && (
              <div
                role="tooltip"
                className="absolute top-full right-0 mt-1 z-[60] text-left"
                style={{
                  width: 'max-content',
                  maxWidth: 'min(420px, calc(100vw - 24px))',
                  minWidth: 'min(300px, calc(100vw - 24px))',
                  padding: '12px 14px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: 'var(--theme-text)',
                  background: 'var(--theme-dropdown-bg)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 10,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                }}
                onMouseEnter={() => {
                  creditsBubbleHoverRef.current = true;
                  clearCreditsCloseTimer();
                }}
                onMouseLeave={() => {
                  creditsBubbleHoverRef.current = false;
                  scheduleCreditsBubbleClose();
                }}
              >
                {creditsHintText}
              </div>
            )}
          </div>
        )}

        {/* Language */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--theme-text-secondary)', border: '1px solid transparent' }}
          >
            <div className="icon-globe text-[12px]" style={{ color: 'var(--theme-text-muted)' }} />
            <span className="uppercase text-[11px]">{currentLang}</span>
          </button>
          {isLangMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-32 rounded-lg overflow-hidden py-1 shadow-2xl z-50"
              style={{ background: 'var(--theme-dropdown-bg)', border: '1px solid var(--theme-border)' }}>
              {languages.map((lang) => (
                <button key={lang.code}
                  onClick={() => { setLang(lang.code); setIsLangMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--primary)] hover:text-white transition-colors"
                  style={{ color: currentLang === lang.code ? 'var(--primary)' : 'var(--theme-text-secondary)', fontWeight: currentLang === lang.code ? 700 : 400 }}
                >{lang.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Join CTA */}
        <a href="https://dropshipping.tangbuy.com" target="_blank" rel="noopener noreferrer"
          onClick={() => setIsLangMenuOpen(false)}
          className="text-white px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-lg hover:brightness-110 transition-all whitespace-nowrap"
          style={{ background: 'linear-gradient(90deg, var(--brand-primary-fixed) 0%, var(--brand-secondary-fixed) 100%)' }}
        >
          <div className="icon-crown text-[11px]" />
          <span className="hidden md:inline">{t.joinBtn}</span>
          <span className="md:hidden">Join</span>
        </a>
      </div>

      <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} t={t} authUser={authUser} />
    </header>

    {isRunning && (
      <div
        aria-live="polite"
        style={{
          overflow: 'hidden',
          width: '100%',
          padding: '0 16px 6px',
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
        }}
      >
        <style>{`
          @keyframes tb-marquee-rtl {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .tb-marquee-rtl-track {
            display: inline-flex;
            width: max-content;
            animation: tb-marquee-rtl 36s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .tb-marquee-rtl-track { animation: none; transform: none; }
          }
        `}</style>
        <div className="tb-marquee-rtl-track">
          <span
            className="whitespace-nowrap"
            style={{
              fontSize: 10,
              lineHeight: 1.35,
              color: 'var(--theme-text-muted)',
              fontWeight: 500,
              paddingRight: 56,
            }}
          >
            {workflowMarqueeText}
          </span>
          <span
            className="whitespace-nowrap"
            style={{
              fontSize: 10,
              lineHeight: 1.35,
              color: 'var(--theme-text-muted)',
              fontWeight: 500,
              paddingRight: 56,
            }}
            aria-hidden
          >
            {workflowMarqueeText}
          </span>
        </div>
      </div>
    )}
    </div>
  );
}
