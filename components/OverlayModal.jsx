import React from 'react';
import { createPortal } from 'react-dom';

const MODAL_PANEL_STYLE_GLASS = {
  borderRadius: 24,
  padding: 28,
  zIndex: 9999,
  background: 'linear-gradient(135deg, color-mix(in srgb, var(--theme-dropdown-bg) 92%, white 8%) 0%, color-mix(in srgb, var(--theme-dropdown-bg) 88%, white 12%) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid color-mix(in srgb, var(--theme-border) 40%, rgba(255,255,255,0.1))',
  boxShadow: '0 32px 64px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.1)',
};

/** 表单类弹窗：高对比、少眩光，便于阅读选项与操作 */
const MODAL_PANEL_STYLE_SOLID = {
  borderRadius: 20,
  padding: 24,
  zIndex: 9999,
  background: 'var(--theme-modal-surface, var(--theme-chat-bg, var(--theme-dropdown-bg)))',
  border: '1px solid var(--theme-border)',
  boxShadow: '0 24px 48px -12px rgba(0,0,0,0.35)',
};

const MODAL_PANEL_STYLE_FLAT = {
  borderRadius: 20,
  padding: 28,
  zIndex: 9999,
  background: 'var(--theme-dropdown-bg)',
  border: '1px solid var(--theme-border)',
  boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)',
};

export function OverlayModal({
  show,
  onClose,
  width = 'min(420px, 92vw)',
  glass = true,
  /** 使用与对话区一致的实心面板，适合国家/人群等多选项表单 */
  solid = false,
  children,
}) {
  React.useEffect(() => {
    if (!show) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) return null;

  const panelStyle = solid ? MODAL_PANEL_STYLE_SOLID : glass ? MODAL_PANEL_STYLE_GLASS : MODAL_PANEL_STYLE_FLAT;

  return createPortal(
    <>
      <div
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 9998,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width,
          maxHeight: 'min(92vh, 720px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          zIndex: 9999,
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

export default OverlayModal;
