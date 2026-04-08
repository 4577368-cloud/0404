import React from 'react';
import { supabase } from '../utils/supabaseClient.js';
import { logTangbuyClick } from '../utils/supabaseUsage.js';
import { fmtUsd, listPriceUsdForCard } from '../utils/catalogPriceDisplay.js';
import { tangbuySearchUrlForTrendCategory } from '../utils/tangbuyKnowledge.js';
import { CompactRetailProductCard } from './CompactRetailProductCard.jsx';

const TREND_LABELS = {
  zh: {
    category: '类目', rating: '评分', avgSellingPrice: '平均售价',
    amount: '成交金额', amountGrowth: '金额增长率', videoSales: '视频成交金额',
    cardAmount: '商品卡成交金额', influencerCount: '带货达人数', influencerOrderRate: '达人出单率',
  },
  en: {
    category: 'Category', rating: 'Rating', avgSellingPrice: 'Avg price',
    amount: 'Total sales', amountGrowth: 'Growth rate', videoSales: 'Video sales',
    cardAmount: 'Product-card sales', influencerCount: 'Creators', influencerOrderRate: 'Creator conversion',
  },
};

export function ProductCard({
  product,
  uiLang,
  t,
  onAskAi,
  onSendInquiry,
  onPublish,
  guestFeatureLocked,
  onRequireLogin,
  trendActions = 'ai_publish',
  onAddToList,
  knowledgeStyle = false,
}) {
  const p = product;

  const skipImageProxy =
    p.platform === 'TikTok' || p.platform === 'Trend' || p.platform === 'MonthlyTop' ||
    p.variant === 'trend' || p.variant === 'bestseller';
  const useProxy = p.image?.startsWith('http') && !skipImageProxy;
  const displayUrl = useProxy
    ? `https://wsrv.nl/?url=${encodeURIComponent(p.image)}&w=400&h=400&fit=cover&q=80&output=webp`
    : p.image;

  const isTrendLayout = p.variant === 'trend' || p.variant === 'bestseller' || !!p.dateRangeCn;

  if (isTrendLayout && !knowledgeStyle) {
    const trendFooter = trendActions === 'view_addlist' ? 'view_addlist' : 'view_ai';
    return (
      <CompactRetailProductCard
        product={p}
        uiLang={uiLang}
        retailVariant="trend"
        trendFooter={trendFooter}
        onAskAi={onAskAi}
        guestFeatureLocked={guestFeatureLocked}
        onRequireLogin={onRequireLogin}
        onAddToList={onAddToList}
      />
    );
  }

  if (isTrendLayout && knowledgeStyle) {
    return (
      <ChatTrendWideCard
        p={p} uiLang={uiLang} displayUrl={displayUrl}
        onAskAi={onAskAi}
        onSendInquiry={onSendInquiry}
        guestFeatureLocked={guestFeatureLocked}
        onRequireLogin={onRequireLogin}
      />
    );
  }

  // Classic narrow card (carousel / legacy)
  const pr = Number(p.priceRmb);
  const tr = Number(p.tangbuyPriceRmb);
  let savePctText = null;
  if (Number.isFinite(pr) && pr > 0 && Number.isFinite(tr) && tr > 0) {
    const pct = Math.max(0, (1 - tr / pr) * 100);
    if (pct > 0) savePctText = `-${Math.round(pct)}%`;
  }
  const hasPrice = Number.isFinite(pr) && pr > 0;
  const validSavePct = savePctText && !savePctText.includes('100%') && !savePctText.includes('-0%');

  return (
    <div className="group w-36 sm:w-40 flex-shrink-0 rounded-lg overflow-hidden transition-[transform,box-shadow] duration-300 hover:shadow-lg border border-gray-100 shadow-sm bg-white">
      <div className="relative h-28 overflow-hidden">
        <img src={displayUrl} alt={p.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300?text=No+Image'; }} />
        {validSavePct && <span className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-red-500 text-white text-[7px] font-bold">{savePctText}</span>}
      </div>
      <div className="p-2.5">
        <h4 className="text-[10px] font-medium truncate mb-1.5 leading-tight" style={{ color: 'var(--theme-text)' }} title={p.name}>{p.name}</h4>
        {hasPrice && <div className="text-sm font-bold text-gray-900 mb-1.5">{fmtUsd(listPriceUsdForCard(p))}</div>}
        <div className="flex gap-1">
          <a href={p.tangbuyUrl || p.url} target="_blank" rel="noreferrer"
            onClick={() => logTangbuyClick(supabase, 'chat_carousel_view', p.tangbuyUrl || p.url, { productId: p.id, name: p.name })}
            className="flex-1 text-[8px] text-center py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors duration-200">
            {uiLang === 'zh' ? '查看' : 'View'}
          </a>
          <button type="button" onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onAskAi?.(p))}
            className="flex-1 text-[8px] text-center py-1 rounded bg-gray-100 text-red-600 font-semibold hover:bg-gray-200 transition-colors duration-200">
            {uiLang === 'zh' ? 'AI诊断' : 'AI Diagnose'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatTrendWideCard({ p, uiLang, displayUrl, onAskAi, onSendInquiry, guestFeatureLocked, onRequireLogin }) {
  const trendT = (k) => TREND_LABELS[uiLang === 'zh' ? 'zh' : 'en'][k] || k;
  const trendBadge = p.variant === 'bestseller' ? (uiLang === 'zh' ? '月销千榜' : 'Top 1000') : (uiLang === 'zh' ? '趋势' : 'Trend');

  const categoryDisplay = uiLang === 'zh'
    ? p.categoryCn || 'N/A'
    : p.categoryEn || p.categoryCn || 'N/A';

  const ratingVal = Number(p.rating);
  const ratingText = Number.isFinite(ratingVal) ? ratingVal.toFixed(1).replace(/\.0$/, '') : 'N/A';

  const tangbuyCategorySearchHref = tangbuySearchUrlForTrendCategory(p);

  const metricCell = (label, value) => {
    const v = String(value ?? '');
    const isNA = v === 'N/A' || v === '' || v === '—';
    return (
      <div className="min-w-0 px-0.5 py-0">
        <div className="text-[9px] font-medium leading-snug line-clamp-2" style={{ color: 'var(--theme-text-secondary)' }} title={label}>{label}</div>
        <div className="text-[11px] font-bold leading-snug truncate mt-0.5" style={{ color: isNA ? 'var(--theme-text-muted)' : 'var(--brand-primary-fixed)' }} title={v}>{value}</div>
      </div>
    );
  };

  return (
    <div className="w-full rounded-xl overflow-hidden" style={{ background: 'var(--theme-card-bg)', border: '1px solid color-mix(in srgb, var(--theme-border) 82%, transparent)' }}>
      <div className="p-2.5 sm:p-3">
        <div className="flex gap-2 items-stretch">
          <div className="w-[172px] sm:w-[188px] flex-shrink-0 self-stretch rounded-lg overflow-hidden" style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
            <div className="relative h-full min-h-[100px] w-full">
              <img src={displayUrl} alt={p.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer"
                onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300?text=No+Image'; }} />
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[8px] font-semibold text-white/95" style={{ background: 'rgba(229,57,53,0.92)' }}>{trendBadge}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1 min-h-0">
            <div className="text-[13px] sm:text-[14px] leading-snug font-semibold line-clamp-2 tracking-tight" style={{ color: 'var(--theme-text)' }} title={p.name}>{p.name || 'N/A'}</div>
            <div className="text-[9px] leading-tight line-clamp-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <span className="font-medium">{trendT('category')}:</span>{' '}
              <span style={{ color: 'var(--theme-text)' }}>{categoryDisplay}</span>
            </div>
            <div className="grid grid-cols-5 gap-x-0.5 gap-y-0.5 flex-1 content-start">
              {metricCell(uiLang === 'zh' ? '价格' : 'Price', fmtUsd(p.priceRmb))}
              {metricCell(trendT('rating'), ratingText)}
              {metricCell(uiLang === 'zh' ? '销量' : 'Sold', p.sold ?? 'N/A')}
              {metricCell(trendT('avgSellingPrice'), fmtUsd(p.avgSellingPriceUsd))}
              {metricCell(trendT('amount'), fmtUsd(p.amountUsd))}
              {metricCell(trendT('amountGrowth'), p.amountGrowth || 'N/A')}
              {metricCell(trendT('videoSales'), fmtUsd(p.videoSalesUsd))}
              {metricCell(trendT('cardAmount'), fmtUsd(p.cardAmountUsd))}
              {metricCell(trendT('influencerCount'), Number.isFinite(Number(p.influencerCount)) ? p.influencerCount : 'N/A')}
              {metricCell(trendT('influencerOrderRate'), p.influencerOrderRate || 'N/A')}
            </div>
            <div className="flex gap-1.5 mt-1 shrink-0">
              <a href={tangbuyCategorySearchHref} target="_blank" rel="noreferrer"
                onClick={() => logTangbuyClick(supabase, 'chat_trend_tangbuy_category', tangbuyCategorySearchHref, { productId: p.id, name: p.name })}
                className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-opacity duration-150 font-semibold flex items-center justify-center gap-1 hover:opacity-90"
                style={{ background: '#ef6b66', color: '#fff', border: '1px solid rgba(239,107,102,0.75)', boxShadow: '0 6px 14px rgba(239,107,102,0.20)' }}>
                <span className="icon-external-link text-[10px]" />
                {uiLang === 'zh' ? '找同款' : 'Find Similar'}
              </a>
              <button type="button"
                onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onAskAi?.(p))}
                className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-opacity duration-150 font-semibold hover:opacity-90 flex items-center justify-center gap-1"
                style={{
                  background: 'rgba(37,99,235,0.12)',
                  color: '#1d4ed8',
                  border: '1px solid rgba(37,99,235,0.35)',
                }}>
                <span className="icon-activity text-[10px]" />
                {uiLang === 'zh' ? 'AI诊断' : 'AI Diagnose'}
              </button>
              <button
                type="button"
                onClick={() => (guestFeatureLocked ? onRequireLogin?.() : onSendInquiry?.(p))}
                className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-opacity duration-150 font-semibold hover:opacity-90 flex items-center justify-center gap-1"
                style={{
                  background: 'rgba(22,163,74,0.12)',
                  color: '#15803d',
                  border: '1px solid rgba(22,163,74,0.35)',
                }}
              >
                <span className="icon-inbox text-[10px]" />
                {uiLang === 'zh' ? '询盘' : 'Inquiry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ProductCard);
