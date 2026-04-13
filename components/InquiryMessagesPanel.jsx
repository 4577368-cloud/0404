import React from 'react';
import { supabase } from '../utils/supabaseClient.js';
import { fetchMyProductInquiries, markMyInquiryRepliesSeen } from '../utils/productInquiries.js';
import { isAnonymousUser } from '../utils/supabaseAuth.js';

export default function InquiryMessagesPanel({ uiLang, authUser, refreshKey = 0 }) {
  const [tab, setTab] = React.useState('replied'); // submitted | replied
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [errMissingTable, setErrMissingTable] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!supabase || !authUser?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    setErrMissingTable(false);
    const { rows: data, error, missingTable } = await fetchMyProductInquiries(supabase);
    if (error) {
      setErrMissingTable(Boolean(missingTable));
      setErr(missingTable ? 'TABLE_MISSING' : error);
    }
    setRows(data);
    setLoading(false);
  }, [authUser?.id]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  React.useEffect(() => {
    if (!supabase || !authUser?.id || isAnonymousUser(authUser)) return;
    // Entering message center marks current replies as read.
    void markMyInquiryRepliesSeen(supabase).then(() => load());
  }, [authUser?.id, load]);

  if (!authUser?.id || isAnonymousUser(authUser)) {
    return (
      <div
        style={{
          flex: '1 1 0',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: 'var(--theme-chat-bg, var(--theme-bg))',
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--theme-text-secondary)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
          {uiLang === 'zh'
            ? '请使用 Google 或 Facebook 登录后查看询盘记录。'
            : 'Sign in with Google or Facebook to view your inquiry messages.'}
        </p>
      </div>
    );
  }

  const filtered = rows.filter((r) => r.status === tab);

  const tSubmitted = uiLang === 'zh' ? '已提交' : 'Submitted';
  const tReplied = uiLang === 'zh' ? '已反馈' : 'Replied';
  const tEmpty = uiLang === 'zh' ? '暂无记录' : 'No messages yet';
  const tTitle = uiLang === 'zh' ? '询盘消息' : 'Messages';
  const tLoadErr = uiLang === 'zh' ? '加载失败' : 'Failed to load';
  const tMissingTable =
    uiLang === 'zh'
      ? '数据库里还没有询盘表。请在 Supabase → SQL Editor 执行仓库中 supabase/sql/007_product_inquiries.sql，保存后刷新本页。若仍报错，可在 Project Settings → API 中触发 schema reload。'
      : 'The product_inquiries table is missing. Run supabase/sql/007_product_inquiries.sql in Supabase SQL Editor, then reload this page. If it persists, reload the API schema in Project Settings → API.';

  return (
    <div
      style={{
        flex: '1 1 0',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--theme-chat-bg, var(--theme-bg))',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--theme-border)',
          background: 'var(--theme-card-bg, transparent)',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme-text)', margin: '0 0 12px 0' }}>{tTitle}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setTab('submitted')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--theme-border)',
              cursor: 'pointer',
              background: tab === 'submitted' ? 'color-mix(in srgb, var(--brand-primary-fixed) 12%, transparent)' : 'var(--theme-surface)',
              color: tab === 'submitted' ? 'var(--brand-primary-fixed)' : 'var(--theme-text-secondary)',
            }}
          >
            {tSubmitted}
          </button>
          <button
            type="button"
            onClick={() => setTab('replied')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--theme-border)',
              cursor: 'pointer',
              background: tab === 'replied' ? 'color-mix(in srgb, var(--brand-primary-fixed) 12%, transparent)' : 'var(--theme-surface)',
              color: tab === 'replied' ? 'var(--brand-primary-fixed)' : 'var(--theme-text-secondary)',
            }}
          >
            {tReplied}
          </button>
        </div>
      </div>

      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '12px 16px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: 'var(--theme-text-muted)' }}>
            {uiLang === 'zh' ? '加载中…' : 'Loading…'}
          </div>
        ) : err ? (
          <div
            style={{
              textAlign: 'left',
              padding: '24px 20px',
              fontSize: 13,
              color: errMissingTable ? 'var(--theme-text-secondary)' : 'var(--primary)',
              lineHeight: 1.6,
              maxWidth: 440,
              margin: '0 auto',
            }}
          >
            {errMissingTable ? tMissingTable : `${tLoadErr}: ${err}`}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: 'var(--theme-text-muted)' }}>{tEmpty}</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((row) => {
              const snap = row.product_snapshot || {};
              const name = snap.name || '—';
              const img = snap.image && String(snap.image).startsWith('http') ? snap.image : null;
              const date = row.created_at ? new Date(row.created_at).toLocaleString() : '';
              const replies = Array.isArray(row.reply_messages) && row.reply_messages.length
                ? row.reply_messages
                : (row.reply_content
                  ? [{ content: row.reply_content, at: row.reply_at, by: row.replied_by }]
                  : []);
              return (
                <li
                  key={row.id}
                  style={{
                    borderRadius: 14,
                    padding: '14px 16px',
                    background: 'var(--theme-card-bg)',
                    border: '1px solid var(--theme-border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {img ? (
                      <img src={img} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          flexShrink: 0,
                          background: 'var(--theme-surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: 'var(--theme-text-muted)',
                        }}
                      >
                        SKU
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text)', lineHeight: 1.35 }} className="line-clamp-2">
                        {name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 4 }}>{date}</div>
                      <div style={{ fontSize: 12, color: 'var(--theme-text-secondary)', marginTop: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        <strong style={{ color: 'var(--theme-text)' }}>{uiLang === 'zh' ? '需求：' : 'Request: '}</strong>
                        {row.demand || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 8 }}>
                        WhatsApp: {row.whatsapp || '—'}
                      </div>
                      {row.status === 'replied' && replies.length > 0 && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'color-mix(in srgb, var(--brand-primary-fixed) 8%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--brand-primary-fixed) 18%, transparent)',
                          }}
                        >
                          {replies.map((rp, idx) => (
                            <div key={`${row.id}_${idx}`} style={{ marginTop: idx === 0 ? 0 : 10, paddingTop: idx === 0 ? 0 : 10, borderTop: idx === 0 ? 'none' : '1px dashed color-mix(in srgb, var(--brand-primary-fixed) 28%, transparent)' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary-fixed)', marginBottom: 4 }}>
                                {rp?.by || row.replied_by || 'TangbuyDropshipping'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--theme-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                {String(rp?.content || '')}
                              </div>
                              {rp?.at ? (
                                <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', marginTop: 6 }}>
                                  {new Date(rp.at).toLocaleString()}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
