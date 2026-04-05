import React from 'react';

const TREND_LABELS = {
  zh: {
    dateRange: '日期范围',
    category: '类目',
    rating: '评分',
    avgSellingPrice: '平均售价',
    amount: '成交金额',
    amountGrowth: '金额增长率',
    videoSales: '视频成交金额',
    cardAmount: '商品卡成交金额',
    influencerCount: '带货达人数',
    influencerOrderRate: '达人出单率',
  },
  en: {
    dateRange: 'Date range',
    category: 'Category',
    rating: 'Rating',
    avgSellingPrice: 'Avg price',
    amount: 'Total sales',
    amountGrowth: 'Growth rate',
    videoSales: 'Video sales',
    cardAmount: 'Product-card sales',
    influencerCount: 'Creators',
    influencerOrderRate: 'Creator conversion',
  },
};

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'N/A';
  return `$${v.toFixed(2)}`.replace(/\.00$/, '');
}

function fmtPrice(rmb, uiLang) {
  const rates = { zh: { rate: 1, symbol: '¥', decimals: 2 }, en: { rate: 0.14, symbol: '$', decimals: 2 } };
  const cfg = rates[uiLang] || rates.en;
  const n = Number(rmb);
  if (!Number.isFinite(n) || n <= 0) return 'N/A';
  return `${cfg.symbol}${(n * cfg.rate).toFixed(cfg.decimals)}`;
}

function translateZhToEn(text) {
  if (!text || !/[\u4e00-\u9fff]/.test(text)) return [];
  const ZH_EN_DICT = [
    ['女装', 'women clothing dress'], ['男装', 'men clothing'], ['童装', 'kids children clothing'],
    ['手机壳', 'phone case iphone samsung'], ['耳机', 'earbuds headphones headset'],
    ['包包', 'handbag bag purse tote'], ['手表', 'watch wristwatch'], ['饰品', 'jewelry necklace earrings'],
    ['玩具', 'toys kids children'], ['美妆', 'beauty makeup cosmetics'], ['家居', 'home decor houseware'],
    ['运动', 'sports fitness gym'], ['宠物', 'pet dog cat supplies'], ['工具', 'tools hardware'],
  ];
  const result = [];
  for (const [zh, en] of ZH_EN_DICT) {
    if (text.includes(zh)) result.push(...en.split(' '));
  }
  return [...new Set(result)];
}

export function ProductCard({ product, uiLang, t, onAskAi, onPublish }) {
  const p = product;
  const trendT = (k) => TREND_LABELS[uiLang === 'zh' ? 'zh' : 'en'][k] || k;

  const skipImageProxy = p.platform === 'TikTok' || p.platform === 'Trend' || p.variant === 'trend';
  const useProxy = p.image?.startsWith('http') && !skipImageProxy;
  const displayUrl = useProxy
    ? `https://wsrv.nl/?url=${encodeURIComponent(p.image)}&w=400&h=400&fit=cover&q=80&output=webp`
    : p.image;

  const pr = Number(p.priceRmb);
  const tr = Number(p.tangbuyPriceRmb);
  let savePctText = null;
  if (Number.isFinite(pr) && pr > 0 && Number.isFinite(tr) && tr > 0) {
    const pct = Math.max(0, (1 - tr / pr) * 100);
    if (pct > 0) savePctText = `-${Math.round(pct)}%`;
  }

  const isTrend = p.variant === 'trend' || p.dateRangeCn;

  if (isTrend) {
    const categoryDisplay =
      uiLang === 'zh'
        ? p.categoryCn || 'N/A'
        : p.categoryEn || translateZhToEn(p.categoryCn || '').join(' ').trim() || p.categoryCn || 'N/A';

    const ratingVal = Number(p.rating);
    const ratingText = Number.isFinite(ratingVal) ? ratingVal.toFixed(1).replace(/\.0$/, '') : 'N/A';

    const metricCell = (label, value) => {
      const v = String(value ?? '');
      const isNA = v === 'N/A' || v === '';
      return (
        <div className="min-w-0 px-0.5 py-0">
          <div
            className="text-[9px] font-medium leading-snug line-clamp-2"
            style={{ color: 'var(--theme-text-secondary)' }}
            title={label}
          >
            {label}
          </div>
          <div
            className="text-[11px] font-bold leading-snug truncate mt-0.5"
            style={{ color: isNA ? 'var(--theme-text-muted)' : 'var(--brand-primary-fixed)' }}
            title={v}
          >
            {value}
          </div>
        </div>
      );
    };

    return (
      <div
        className="w-full rounded-xl overflow-hidden"
        style={{ background: 'var(--theme-card-bg)', border: '1px solid color-mix(in srgb, var(--theme-border) 82%, transparent)' }}
      >
        <div className="p-2.5 sm:p-3">
          <div className="flex gap-2 items-stretch">
            <div
              className="w-[172px] sm:w-[188px] flex-shrink-0 self-stretch rounded-lg overflow-hidden"
              style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
            >
              <div className="relative h-full min-h-[100px] w-full">
                <img
                  src={displayUrl}
                  alt={p.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/300?text=No+Image';
                  }}
                />
                <span
                  className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[8px] font-semibold text-white/95"
                  style={{ background: 'rgba(229,57,53,0.92)' }}
                >
                  {uiLang === 'zh' ? '趋势' : 'Trend'}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1 min-h-0">
              <div
                className="text-[13px] sm:text-[14px] leading-snug font-semibold line-clamp-2 tracking-tight"
                style={{ color: 'var(--theme-text)' }}
                title={p.name}
              >
                {p.name || 'N/A'}
              </div>
              <div className="text-[9px] leading-tight line-clamp-2" style={{ color: 'var(--theme-text-secondary)' }}>
                <span className="font-medium">{trendT('category')}:</span>{' '}
                <span style={{ color: 'var(--theme-text)' }}>{categoryDisplay}</span>
              </div>

              <div className="grid grid-cols-5 gap-x-0.5 gap-y-0.5 flex-1 content-start">
                {metricCell(t?.finder?.price ?? 'Price', fmtUsd(p.priceRmb))}
                {metricCell(trendT('rating'), ratingText)}
                {metricCell(t?.finder?.sold ?? 'Sold', p.sold ?? 'N/A')}
                {metricCell(trendT('avgSellingPrice'), fmtUsd(p.avgSellingPriceUsd))}
                {metricCell(trendT('amount'), fmtUsd(p.amountUsd))}
                {metricCell(trendT('amountGrowth'), p.amountGrowth || 'N/A')}
                {metricCell(trendT('videoSales'), fmtUsd(p.videoSalesUsd))}
                {metricCell(trendT('cardAmount'), fmtUsd(p.cardAmountUsd))}
                {metricCell(
                  trendT('influencerCount'),
                  Number.isFinite(Number(p.influencerCount)) ? p.influencerCount : 'N/A'
                )}
                {metricCell(trendT('influencerOrderRate'), p.influencerOrderRate || 'N/A')}
              </div>

              <div className="flex gap-1.5 mt-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onAskAi?.(p)}
                  className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold flex items-center justify-center gap-1 hover:brightness-105"
                  style={{
                    background: 'var(--brand-primary-fixed)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 6px 14px rgba(255,59,48,0.14)',
                  }}
                >
                  <span className="icon-message-square-plus text-[10px]" />
                  {uiLang === 'zh' ? 'AI诊断' : 'AI Diagnose'}
                </button>
                {typeof onPublish === 'function' && (
                  <button
                    type="button"
                    onClick={() => onPublish?.(p)}
                    className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105"
                    style={{
                      background: 'color-mix(in srgb, var(--theme-surface) 88%, white 12%)',
                      color: 'var(--theme-text-secondary)',
                      border: '1px solid var(--theme-border)',
                    }}
                  >
                    {t?.finder?.publish ?? 'Publish'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Classic card (non-trend)
  const hasTangbuyPrice = Number.isFinite(tr) && tr > 0;
  const hasSold = p.sold && p.sold !== 'N/A' && p.sold !== '0';
  const hasPrice = Number.isFinite(pr) && pr > 0;
  const validSavePct = savePctText && !savePctText.includes('100%') && !savePctText.includes('-0%');

  return (
    <div
      className="group w-36 sm:w-40 flex-shrink-0 rounded-lg overflow-hidden transition-all duration-300 hover:shadow-lg border border-gray-100 shadow-sm bg-white"
    >
      <div className="relative h-28 overflow-hidden">
        <img
          src={displayUrl}
          alt={p.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = 'https://via.placeholder.com/300?text=No+Image';
          }}
        />
        {validSavePct && (
          <span className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-red-500 text-white text-[7px] font-bold">
            {savePctText}
          </span>
        )}
      </div>

      <div className="p-2.5">
        <h4
          className="text-[10px] font-medium truncate mb-1.5 leading-tight"
          style={{ fontFamily: '"Song", "STSong", "SimSun", serif', color: 'var(--theme-text)' }}
          title={p.name}
        >
          {p.name}
        </h4>

        {hasPrice && (
          <div className="text-sm font-bold text-gray-900 mb-1.5">{fmtPrice(p.priceRmb, uiLang)}</div>
        )}

        <div className="flex gap-1">
          <a
            href={p.tangbuyUrl || p.url}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-[8px] text-center py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors duration-200"
          >
            {uiLang === 'zh' ? '查看' : 'View'}
          </a>
          <button
            type="button"
            onClick={() => onAskAi?.(p)}
            className="flex-1 text-[8px] text-center py-1 rounded bg-gray-100 text-red-600 font-semibold hover:bg-gray-200 transition-colors duration-200"
          >
            {uiLang === 'zh' ? 'AI诊断' : 'AI Diagnose'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ProductCard);
