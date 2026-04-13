import React from 'react';
import OverlayModal from './OverlayModal.jsx';
import { supabase } from '../utils/supabaseClient.js';
import { submitProductInquiry, productToInquirySnapshot } from '../utils/productInquiries.js';
import { logTangbuyClick } from '../utils/supabaseUsage.js';

function validateWhatsapp(s) {
  const t = String(s || '').trim();
  if (t.length < 8) return false;
  return /^[\d+\s().-]{8,}$/.test(t);
}

export default function ProductInquiryModal({
  show,
  onClose,
  product,
  uiLang,
  authUser,
  guestFeatureLocked,
  onRequireLogin,
  onSubmitted,
}) {
  const [wa, setWa] = React.useState('');
  const [demand, setDemand] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [submitDone, setSubmitDone] = React.useState(false);

  React.useEffect(() => {
    if (!show) return;
    setErr('');
    setSending(false);
    setSubmitDone(false);
  }, [show, product?.id]);

  const snap = product ? productToInquirySnapshot(product) : null;
  const title = uiLang === 'zh' ? '发送询盘' : 'Send inquiry';
  const hint =
    uiLang === 'zh'
      ? '将同步保存商品信息与您的联系方式，便于客户经理跟进。'
      : 'We’ll save this product and your contact details for our team to follow up.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (guestFeatureLocked) {
      onRequireLogin?.();
      return;
    }
    if (!supabase || !authUser?.id) {
      setErr(uiLang === 'zh' ? '请先登录。' : 'Please sign in.');
      return;
    }
    if (!validateWhatsapp(wa)) {
      setErr(uiLang === 'zh' ? '请填写有效的 WhatsApp 号码（含区号）。' : 'Enter a valid WhatsApp number (with country code).');
      return;
    }
    if (String(demand).trim().length < 4) {
      setErr(uiLang === 'zh' ? '请简要描述需求（至少几个字）。' : 'Please describe your request briefly.');
      return;
    }
    setSending(true);
    setErr('');
    try {
      logTangbuyClick(supabase, 'product_inquiry_submit', 'modal', { productId: product?.id, name: product?.name });
      const res = await submitProductInquiry(supabase, {
        product,
        whatsapp: wa.trim(),
        demand: demand.trim(),
        userEmail: authUser.email || null,
        userId: authUser.id,
      });
      if (!res.ok) {
        if (res.missingTable) {
          setErr(
            uiLang === 'zh'
              ? '数据库里还没有询盘表。请在 Supabase SQL Editor 执行 supabase/sql/007_product_inquiries.sql 后重试。'
              : 'The product_inquiries table is missing. Run supabase/sql/007_product_inquiries.sql in Supabase SQL Editor, then try again.',
          );
        } else {
          setErr(res.error || 'Error');
        }
        setSending(false);
        return;
      }
      onSubmitted?.({
        inquiryId: res.id || null,
        product: snap,
        whatsapp: wa.trim(),
        demand: demand.trim(),
      });
      setSubmitDone(true);
      window.setTimeout(() => onClose?.(), 900);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    } finally {
      setSending(false);
    }
  };

  if (!show || !product) return null;

  return (
    <OverlayModal show={show} onClose={onClose} width="min(440px, 94vw)" glass={false} solid>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--theme-text)', margin: '0 0 6px 0' }}>{title}</h2>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--theme-text-secondary)', margin: 0 }}>{hint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            borderRadius: 99,
            border: 'none',
            background: 'var(--theme-surface)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--theme-text-secondary)',
            flexShrink: 0,
          }}
          aria-label="Close"
        >
          <span className="icon-x text-[16px]" />
        </button>
      </div>

      <div
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          marginBottom: 16,
          background: 'color-mix(in srgb, var(--theme-surface) 90%, transparent)',
          border: '1px solid var(--theme-border)',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--theme-text-muted)', marginBottom: 6 }}>
          {uiLang === 'zh' ? '目标商品' : 'Product'}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {snap?.image ? (
            <img
              src={String(snap.image).startsWith('http') ? snap.image : ''}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: 'var(--theme-surface)' }}
            />
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text)', lineHeight: 1.35 }} className="line-clamp-2">
              {snap?.name || '—'}
            </div>
            {snap?.platform ? (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 4 }}>{snap.platform}</div>
            ) : null}
          </div>
        </div>
      </div>

      {submitDone ? (
        <div style={{ padding: '12px 2px 4px' }}>
          <div
            style={{
              borderRadius: 12,
              padding: '14px 14px',
              border: '1px solid color-mix(in srgb, var(--brand-primary-fixed) 24%, transparent)',
              background: 'color-mix(in srgb, var(--brand-primary-fixed) 8%, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="icon-send" style={{ color: 'var(--brand-primary-fixed)', fontSize: 16, animation: 'tbInquiryPulse 0.9s ease-out 1' }} />
              <div style={{ fontSize: 13, color: 'var(--theme-text)', fontWeight: 700 }}>
                {uiLang === 'zh' ? '询盘已发送到 Messages' : 'Inquiry sent to Messages'}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-secondary)', lineHeight: 1.55, marginTop: 8 }}>
              {uiLang === 'zh'
                ? '官方客服回复后，可在左侧「Messages / 询盘消息」里查看。'
                : 'After official reply, you can view it in Messages.'}
            </div>
          </div>
          <style>{`@keyframes tbInquiryPulse {0%{transform:translateX(-8px) scale(.9);opacity:.2;} 50%{transform:translateX(2px) scale(1.06);opacity:1;} 100%{transform:translateX(0) scale(1);opacity:1;}}`}</style>
        </div>
      ) : (
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 6 }}>
          WhatsApp {uiLang === 'zh' ? '（发起人）' : '(yours)'}
        </label>
        <input
          type="tel"
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          placeholder={uiLang === 'zh' ? '例：+86 138xxxx 或区号+号码' : 'e.g. +1 234 567 8900'}
          autoComplete="tel"
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 12,
            fontSize: 14,
            marginBottom: 14,
            outline: 'none',
            background: 'var(--theme-input-bg)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text)',
            boxSizing: 'border-box',
          }}
        />

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 6 }}>
          {uiLang === 'zh' ? '需求描述' : 'Request details'}
        </label>
        <textarea
          value={demand}
          onChange={(e) => setDemand(e.target.value)}
          rows={4}
          placeholder={uiLang === 'zh' ? '例：目标价位、包装、数量、交货地区等' : 'MOQ, target price, shipping region, packaging…'}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 12,
            outline: 'none',
            resize: 'vertical',
            minHeight: 96,
            background: 'var(--theme-input-bg)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text)',
            boxSizing: 'border-box',
          }}
        />

        {err ? (
          <div style={{ fontSize: 12, color: 'var(--primary)', marginBottom: 10 }}>{err}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: 'var(--theme-surface)',
              color: 'var(--theme-text-secondary)',
              border: '1px solid var(--theme-border)',
            }}
          >
            {uiLang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={sending}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: sending ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.75 : 1,
              background: 'linear-gradient(135deg, var(--brand-primary-fixed, #ee1d36) 0%, color-mix(in srgb, var(--brand-primary-fixed, #ee1d36) 88%, black 12%) 100%)',
              color: '#fff',
              border: 'none',
              boxShadow: '0 4px 14px rgba(238, 29, 54, 0.22)',
            }}
          >
            {sending ? (uiLang === 'zh' ? '发送中…' : 'Sending…') : uiLang === 'zh' ? '发送' : 'Send'}
          </button>
        </div>
      </form>
      )}
    </OverlayModal>
  );
}
