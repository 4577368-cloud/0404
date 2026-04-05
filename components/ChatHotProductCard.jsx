import React from 'react';
import { supabase } from '../utils/supabaseClient.js';
import { logTangbuyClick } from '../utils/supabaseUsage.js';
import { fmtUsd, listPriceUsdForCard, tangbuyUsdForCard } from '../utils/catalogPriceDisplay.js';

const PLACEHOLDER = 'https://via.placeholder.com/300?text=No+Image';

function wsrvEncode(u) {
  const s = String(u || '').trim();
  if (!s.startsWith('http')) return PLACEHOLDER;
  return `https://wsrv.nl/?url=${encodeURIComponent(s)}&w=400&h=400&fit=cover&q=80&output=webp`;
}

function productImageDisplayUrl(p) {
  const raw = String(p?.image || '').trim();
  if (!raw.startsWith('http')) return raw || PLACEHOLDER;
  const direct =
    p.platform === 'TikTok' ||
    p.platform === 'Trend' ||
    p.variant === 'trend' ||
    /media-amazon|ssl-images-amazon|images-amazon|m\.media-amazon/i.test(raw) ||
    /alicdn\.com|aliyuncs\.com|tiktokcdn/i.test(raw);
  if (direct) return raw;
  return wsrvEncode(raw);
}

/** 按序尝试：主图直连 → 主图代理 → 备用图直连 → 备用图代理 → 占位 */
function pickImageUrlForStage(p, stage) {
  const main = String(p?.image || '').trim();
  const fb = String(p?.imageFallback || '').trim();
  const hasMain = main.startsWith('http');
  const hasFb = fb.startsWith('http') && fb !== main;

  if (!hasMain) {
    if (hasFb) {
      if (stage === 0) return productImageDisplayUrl({ ...p, image: fb });
      if (stage === 1) return wsrvEncode(fb);
    }
    return PLACEHOLDER;
  }
  if (stage === 0) return productImageDisplayUrl(p);
  if (stage === 1) return wsrvEncode(main);
  if (hasFb) {
    if (stage === 2) return productImageDisplayUrl({ ...p, image: fb });
    if (stage === 3) return wsrvEncode(fb);
  }
  return PLACEHOLDER;
}

const MAX_STAGE = 4;

/** 与「热销商品」页 Amazon/TikTok 卡片一致的样式（含 Tangbuy 价与跳转） */
export default function ChatHotProductCard({ p, uiLang, onAskAi, guestFeatureLocked, onRequireLogin }) {
  const [stage, setStage] = React.useState(0);

  React.useEffect(() => {
    setStage(0);
  }, [p.id, p.image, p.imageFallback]);

  const imgSrc = stage >= MAX_STAGE ? PLACEHOLDER : pickImageUrlForStage(p, stage);

  const pr = Number(p.priceRmb);
  const tr = Number(p.tangbuyPriceRmb);
  let savePctText = null;
  if (Number.isFinite(pr) && pr > 0 && Number.isFinite(tr) && tr > 0) {
    const pct = Math.max(0, (1 - tr / pr) * 100);
    if (pct > 0) savePctText = `-${Math.round(pct)}%`;
  }
  const listUsd = listPriceUsdForCard(p);
  const tangbuyUsd = tangbuyUsdForCard(p);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg h-full flex flex-col"
      style={{ background: 'var(--theme-card-bg)', border: '1px solid color-mix(in srgb, var(--theme-border) 82%, transparent)' }}
    >
      <div className="relative aspect-[4/3] overflow-hidden flex-shrink-0" style={{ background: 'var(--theme-surface)' }}>
        <img
          key={`${p.id}-${stage}`}
          src={imgSrc}
          alt={p.name}
          className="w-full h-full object-cover"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => {
            setStage((s) => (s < MAX_STAGE ? s + 1 : s));
          }}
        />
        {savePctText && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/45 border border-white/10 backdrop-blur text-[10px] font-bold text-lime-300">
            {savePctText}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
        <h4 className="text-[12px] leading-snug font-medium line-clamp-2 min-h-[2.5em]" style={{ color: 'var(--theme-text)' }} title={p.name}>
          {p.name}
        </h4>
        <div className="flex items-center gap-3 px-0.5 flex-wrap">
          <div>
            <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>
              {uiLang === 'zh' ? '售价' : 'Price'}
            </div>
            <div className="text-[12px] font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>
              {fmtUsd(listUsd)}
            </div>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--theme-border)' }} />
          <div>
            <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>
              {uiLang === 'zh' ? '月销' : 'Sold'}
            </div>
            <div className="text-[12px] font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>
              {p.sold}
            </div>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--theme-border)' }} />
          {Number.isFinite(p.tangbuyPriceRmb) && p.tangbuyPriceRmb > 0 ? (
            <div>
              <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>
                Tangbuy
              </div>
              <div className="text-[12px] font-bold text-[var(--secondary)] leading-tight">{fmtUsd(tangbuyUsd)}</div>
            </div>
          ) : (
            <div>
              <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>
                {uiLang === 'zh' ? '平台' : 'Source'}
              </div>
              <div className="text-[12px] font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>
                {p.platform}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 mt-auto pt-0.5">
          {p.tangbuyUrl ? (
            <a
              href={p.tangbuyUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => logTangbuyClick(supabase, 'chat_hot_tangbuy', p.tangbuyUrl, { productId: p.id, name: p.name })}
              className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
              style={{
                background: 'var(--brand-primary-fixed)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 6px 14px rgba(255,59,48,0.14)',
              }}
            >
              <span className="icon-external-link text-[10px]" />
              {uiLang === 'zh' ? 'Tangbuy' : 'Tangbuy'}
            </a>
          ) : p.url && p.url !== '#' ? (
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => logTangbuyClick(supabase, 'chat_hot_source', p.url, { productId: p.id, name: p.name })}
              className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
              style={{
                background: 'var(--brand-primary-fixed)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 6px 14px rgba(255,59,48,0.14)',
              }}
            >
              <span className="icon-external-link text-[10px]" />
              {uiLang === 'zh' ? '查看' : 'View'}
            </a>
          ) : (
            <div className="flex-1" />
          )}
          <button
            type="button"
            className="text-[10px] text-center py-1.5 px-2 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
            style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}
            onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onAskAi?.(p))}
          >
            <span className="icon-activity text-[10px]" />
            {uiLang === 'zh' ? 'AI诊断' : 'AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
