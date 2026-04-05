import React from 'react';
import { createPortal } from 'react-dom';
import { MAX_FREE_QUOTA } from '../utils/quota.js';

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
    getUrl: (url, text) => `https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`,
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
    getUrl: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
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
    getUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
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
    getUrl: (url, text) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
];

function ShareModal({ isOpen, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const shareUrl = window.location.href;
  const shareText = 'Tangbuy Dropshipping — AI-Powered Cross-Border E-commerce';

  React.useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const handleShare = (platform) => {
    const url = platform.getUrl(shareUrl, shareText);
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme-text)', margin: 0 }}>Share this conversation</h2>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 99, border: 'none', background: 'var(--theme-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-secondary)' }}
          ><span className="icon-x text-[16px]" /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, borderRadius: 12, padding: '10px 14px', background: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--theme-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareUrl}</span>
          <button onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
              border: 'none', background: copied ? '#16a34a' : 'var(--theme-text)', color: copied ? '#fff' : 'var(--theme-bg)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', whiteSpace: 'nowrap',
            }}>
            <span className={copied ? 'icon-check text-[12px]' : 'icon-link text-[12px]'} />
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
          {SHARE_PLATFORMS.map((p) => (
            <button key={p.id} onClick={() => handleShare(p)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer', padding: 8,
                color: p.color, transition: 'transform 0.15s',
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
          This conversation might include personal details, so double-check it before sharing!
        </p>
      </div>
    </>,
    document.body
  );
}

export default function Header({
  currentLang, setLang, t, remainingQuota, isVip, theme, onToggleTheme, onMenuClick,
  workflowProgress, onClearWorkflowCompleted, onViewReport,
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
  const langRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

// (VIP quota rendering is handled below in the same Header component)
  const quotaLabel = currentLang === 'zh' ? '额度' : 'Credits';
  const pct = Math.min(1, (remainingQuota ?? MAX_FREE_QUOTA) / MAX_FREE_QUOTA);
  const barColor = pct > 0.5 ? 'bg-emerald-400' : pct > 0.2 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <header style={{
      position: 'relative',
      height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 20px',
      background: 'transparent',
      transition: 'background 0.3s',
    }}>
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick}
          className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity"
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
          title="Share"
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
            <span className="text-[10px] font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>
              {currentLang === 'zh' ? '无限' : 'Unlimited'}
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'transparent', border: 'none' }}>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-primary-fixed)' }}>{quotaLabel}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--theme-text)' }}>{remainingQuota ?? MAX_FREE_QUOTA}</span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--theme-text-secondary)' }}>/ {MAX_FREE_QUOTA}</span>
            <div className="w-8 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--theme-surface)' }}>
              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct * 100}%` }} />
            </div>
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

      <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
    </header>
  );
}
