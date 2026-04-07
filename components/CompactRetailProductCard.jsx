import React from 'react';
import { supabase } from '../utils/supabaseClient.js';
import { logTangbuyClick } from '../utils/supabaseUsage.js';
import { fmtUsd, listPriceUsdForCard, tangbuyUsdForCard } from '../utils/catalogPriceDisplay.js';
import { tangbuySearchUrlForTrendCategory, pickViewHrefForChatPicks } from '../utils/tangbuyKnowledge.js';

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
    p.platform === 'MonthlyTop' ||
    p.variant === 'trend' ||
    p.variant === 'bestseller' ||
    /media-amazon|ssl-images-amazon|images-amazon|m\.media-amazon/i.test(raw) ||
    /alicdn\.com|aliyuncs\.com|tiktokcdn/i.test(raw);
  if (direct) return raw;
  return wsrvEncode(raw);
}

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

/**
 * 竖版商品卡：上图 + 标题 + 三列指标 + 底栏按钮
 * @param {'hot'|'trend'|'knowledge'} retailVariant
 *   hot  = tangbuy-product 同款：PRICE | SOLD | TANGBUY（有折扣角标）
 *   trend / knowledge = 趋势/Top1000/知识：PRICE | SOLD | RATING（无折扣角标）
 * @param {'view_ai'|'view_addlist'|'view_publish'|'view_only'|'view_chat_tray'} trendFooter
 *   view_addlist = View + Add to List（热销页全部 Tab）
 *   view_ai     = View + AI Diagnose（热销页等）
 *   view_only   = 仅 View（聊天横排 Picks：有链接直达，无则按标题/类目搜索）
 *   view_chat_tray = 找同款 + AI诊断 + 询盘（对话横滑商品卡）
 *   view_publish = View + Publish（My Lists 页）
 */
export function CompactRetailProductCard({
  product: p,
  uiLang,
  retailVariant = 'hot',
  trendFooter = 'view_ai',
  onAskAi,
  onSendInquiry,
  guestFeatureLocked,
  onRequireLogin,
  onAddToList,
  onPublishPlaceholder,
  onRemoveFromList,
}) {
  const [stage, setStage] = React.useState(0);
  React.useEffect(() => setStage(0), [p.id, p.image, p.imageFallback]);

  const imgSrc = stage >= MAX_STAGE ? PLACEHOLDER : pickImageUrlForStage(p, stage);

  const pr = Number(p.priceRmb);
  const tr = Number(p.tangbuyPriceRmb);
  let savePctText = null;
  if (retailVariant === 'hot' && Number.isFinite(pr) && pr > 0 && Number.isFinite(tr) && tr > 0) {
    const pct = Math.max(0, (1 - tr / pr) * 100);
    if (pct > 0) savePctText = `-${Math.round(pct)}%`;
  }

  const listUsd = listPriceUsdForCard(p);
  const tangbuyUsd = tangbuyUsdForCard(p);
  const hasTangbuy = Number.isFinite(tr) && tr > 0;

  const ratingVal = Number(p.rating);
  const ratingText = Number.isFinite(ratingVal) ? ratingVal.toFixed(1).replace(/\.0$/, '') : '—';

  const viewHref =
    trendFooter === 'view_only' || trendFooter === 'view_chat_tray'
      ? pickViewHrefForChatPicks(p)
      : retailVariant === 'hot'
        ? p.tangbuyUrl || p.url
        : tangbuySearchUrlForTrendCategory(p) || p.url || p.tangbuyUrl;

  const logView = () => {
    const u = viewHref || '';
    if (trendFooter === 'view_only' || trendFooter === 'view_chat_tray') {
      logTangbuyClick(supabase, p.tangbuyUrl ? 'chat_picks_view_tangbuy' : 'chat_picks_view_search', u, {
        productId: p.id,
        name: p.name,
      });
    } else if (retailVariant === 'hot') {
      logTangbuyClick(supabase, p.tangbuyUrl ? 'compact_hot_tangbuy' : 'compact_hot_source', u, {
        productId: p.id,
        name: p.name,
      });
    } else if (trendFooter === 'view_addlist') {
      logTangbuyClick(supabase, 'product_search_tangbuy_category', u, { productId: p.id, name: p.name });
    } else {
      logTangbuyClick(supabase, 'compact_trend_view', u, { productId: p.id, name: p.name });
    }
  };

  const priceLabel = uiLang === 'zh' ? '售价' : 'Price';
  const soldLabel = uiLang === 'zh' ? '月销' : 'Sold';
  const tangbuyLabel =
    trendFooter === 'view_only' || trendFooter === 'view_chat_tray' ? (uiLang === 'zh' ? '参考价' : 'Ref.') : 'Tangbuy';
  const ratingLabel = uiLang === 'zh' ? '评分' : 'Rating';

  return (
    <div
      className="rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg h-full flex flex-col w-full max-w-[288px] mx-auto"
      style={{
        background: 'var(--theme-card-bg)',
        border: '1px solid color-mix(in srgb, var(--theme-border) 82%, transparent)',
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden flex-shrink-0" style={{ background: 'var(--theme-surface)' }}>
        <img
          key={`${p.id}-${stage}`}
          src={imgSrc}
          alt={p.name}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setStage((s) => (s < MAX_STAGE ? s + 1 : s))}
        />
        {savePctText ? (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/55 border border-white/12 backdrop-blur-sm text-[10px] font-bold text-lime-300">
            {savePctText}
          </span>
        ) : null}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
        <h4
          className="text-[12px] leading-snug font-bold line-clamp-2 min-h-[2.5em]"
          style={{ color: 'var(--theme-text)' }}
          title={p.name}
        >
          {p.name}
        </h4>
        <div className="flex items-stretch justify-between gap-1 px-0.5 text-center">
          <div className="min-w-0 flex-1">
            <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>
              {priceLabel}
            </div>
            <div className="text-[12px] font-bold leading-tight mt-0.5" style={{ color: 'var(--theme-text)' }}>
              {fmtUsd(listUsd)}
            </div>
          </div>
          <div className="w-px shrink-0 self-stretch my-0.5" style={{ background: 'var(--theme-border)' }} />
          <div className="min-w-0 flex-1">
            <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>
              {soldLabel}
            </div>
            <div className="text-[12px] font-bold leading-tight mt-0.5" style={{ color: 'var(--theme-text)' }}>
              {p.sold ?? '—'}
            </div>
          </div>
          <div className="w-px shrink-0 self-stretch my-0.5" style={{ background: 'var(--theme-border)' }} />
          <div className="min-w-0 flex-1">
            {retailVariant === 'hot' ? (
              <>
                <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>
                  {tangbuyLabel}
                </div>
                <div
                  className="text-[12px] font-bold leading-tight mt-0.5"
                  style={{ color: hasTangbuy ? 'var(--secondary)' : 'var(--theme-text-muted)' }}
                >
                  {hasTangbuy ? fmtUsd(tangbuyUsd) : '—'}
                </div>
              </>
            ) : (
              <>
                <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>
                  {ratingLabel}
                </div>
                <div className="text-[12px] font-bold leading-tight mt-0.5" style={{ color: 'var(--theme-text)' }}>
                  {ratingText}
                </div>
              </>
            )}
          </div>
        </div>
        <div
          className={`flex mt-auto pt-0.5 ${trendFooter === 'view_chat_tray' ? 'gap-1 w-full flex-nowrap' : `gap-1.5 ${trendFooter === 'view_only' ? 'w-full' : ''}`}`}
        >
          {trendFooter === 'view_chat_tray' ? (
            <>
              {viewHref && viewHref !== '#' ? (
                <a
                  href={viewHref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={logView}
                  className="flex-1 min-w-0 text-[9px] sm:text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 inline-flex items-center justify-center gap-0.5 px-0.5"
                  style={{
                    background: '#ef6b66',
                    color: '#fff',
                    border: '1px solid rgba(239,107,102,0.75)',
                    boxShadow: '0 6px 14px rgba(239,107,102,0.20)',
                  }}
                  title={uiLang === 'zh' ? '在 Tangbuy 找同款' : 'Find similar on Tangbuy'}
                >
                  <span className="icon-search-check text-[9px] shrink-0" aria-hidden />
                  <span className="truncate">{uiLang === 'zh' ? '找同款' : 'Find Similar'}</span>
                </a>
              ) : (
                <div className="flex-1 min-w-0" />
              )}
              <button
                type="button"
                className="flex-1 min-w-0 text-[9px] sm:text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 inline-flex items-center justify-center gap-0.5 px-0.5"
                style={{
                  background: 'rgba(37,99,235,0.12)',
                  color: '#1d4ed8',
                  border: '1px solid rgba(37,99,235,0.35)',
                }}
                onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onAskAi?.(p))}
                title={uiLang === 'zh' ? 'AI 诊断' : 'AI diagnosis'}
              >
                <span className="icon-activity text-[9px] shrink-0" aria-hidden />
                <span className="truncate">{uiLang === 'zh' ? 'AI诊断' : 'AI'}</span>
              </button>
              <button
                type="button"
                className="flex-1 min-w-0 text-[9px] sm:text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 inline-flex items-center justify-center gap-0.5 px-0.5"
                style={{
                  background: 'rgba(22,163,74,0.12)',
                  color: '#15803d',
                  border: '1px solid rgba(22,163,74,0.35)',
                }}
                onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onSendInquiry?.(p))}
                title={uiLang === 'zh' ? '发送询盘' : 'Send inquiry'}
              >
                <span className="icon-inbox text-[9px] shrink-0" aria-hidden />
                <span className="truncate">{uiLang === 'zh' ? '询盘' : 'Inquiry'}</span>
              </button>
            </>
          ) : viewHref && viewHref !== '#' ? (
            <a
              href={viewHref}
              target="_blank"
              rel="noreferrer"
              onClick={logView}
              className={`text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1 ${trendFooter === 'view_only' ? 'w-full flex-1' : 'flex-1'}`}
              style={{
                background: '#ef6b66',
                color: '#fff',
                border: '1px solid rgba(239,107,102,0.75)',
                boxShadow: '0 6px 14px rgba(239,107,102,0.20)',
              }}
            >
              <span className="icon-external-link text-[10px]" />
              {uiLang === 'zh' ? '找同款' : 'Find Similar'}
            </a>
          ) : (
            <div className="flex-1" />
          )}
          {trendFooter === 'view_only' || trendFooter === 'view_chat_tray' ? null : trendFooter === 'view_addlist' ? (
            <button
              type="button"
              className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
              style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}
              onClick={() => onAddToList?.(p)}
            >
              <span className="icon-plus text-[10px]" />
              {uiLang === 'zh' ? '加入列表' : 'Add to List'}
            </button>
          ) : trendFooter === 'view_publish' ? (
            <div className="flex gap-1 flex-1">
              <button
                type="button"
                className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
                style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}
                onClick={() => onPublishPlaceholder?.()}
              >
                <span className="icon-upload text-[10px]" />
                Publish
              </button>
              {onRemoveFromList && (
                <button
                  type="button"
                  className="text-[10px] px-2 py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center"
                  style={{ background: 'transparent', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}
                  onClick={() => onRemoveFromList?.()}
                  title={uiLang === 'zh' ? '移除' : 'Remove'}
                >
                  <span className="icon-trash-2 text-[10px]" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
              style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}
              onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onAskAi?.(p))}
            >
              <span className="icon-activity text-[10px]" />
              {uiLang === 'zh' ? 'AI诊断' : 'AI Diagnose'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompactRetailProductCard;
