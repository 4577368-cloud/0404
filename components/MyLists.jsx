import React from 'react';
import { CompactRetailProductCard } from './CompactRetailProductCard.jsx';
import { fmtUsd, listPriceUsdForCard } from '../utils/catalogPriceDisplay.js';
import { tangbuySearchUrlForTrendCategory } from '../utils/tangbuyKnowledge.js';

function isTrendOrBestsellerCard(p) {
  return p?.variant === 'trend' || p?.variant === 'bestseller';
}

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

function TrendMetricPill({ label, value }) {
  const isNA = !value || value === 'N/A' || value === '—';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]"
      style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
      <span style={{ color: 'var(--theme-text-muted)' }}>{label}</span>
      <span className="font-bold" style={{ color: isNA ? 'var(--theme-text-muted)' : 'var(--theme-text)' }}>{value || '—'}</span>
    </span>
  );
}

function ListRow({ p, uiLang, expanded, onToggle, onPublish, onRemove, onAskAi, guestFeatureLocked, onRequireLogin }) {
  const listUsd = listPriceUsdForCard(p);
  const imgSrc = p.image?.startsWith('http') ? p.image : 'https://via.placeholder.com/80?text=No+Image';
  const isTrend = isTrendOrBestsellerCard(p);
  const trendT = (k) => TREND_LABELS[uiLang === 'zh' ? 'zh' : 'en'][k] || k;
  const ratingVal = Number(p.rating);
  const ratingText = Number.isFinite(ratingVal) ? ratingVal.toFixed(1).replace(/\.0$/, '') : 'N/A';
  const viewHref = isTrend ? (tangbuySearchUrlForTrendCategory(p) || p.url) : (p.tangbuyUrl || p.url);

  return (
    <div className="rounded-xl overflow-hidden transition-all" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)' }}>
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={isTrend ? onToggle : undefined} style={isTrend ? { cursor: 'pointer' } : { cursor: 'default' }}>
        <img src={imgSrc} alt={p.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" loading="lazy" referrerPolicy="no-referrer"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/80?text=No+Image'; }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--theme-text)' }} title={p.name}>{p.name}</div>
          <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
            <span>{p.platform}</span>
            <span>·</span>
            <span className="font-semibold" style={{ color: 'var(--theme-text)' }}>{fmtUsd(listUsd)}</span>
            <span>·</span>
            <span>{uiLang === 'zh' ? '月销' : 'Sold'}: {p.sold ?? '—'}</span>
            {isTrend && (
              <>
                <span>·</span>
                <span>{trendT('rating')}: {ratingText}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 items-center">
          {viewHref && viewHref !== '#' && (
            <a href={viewHref} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="text-[10px] px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--brand-primary-fixed)', color: '#fff' }}>
              View
            </a>
          )}
          {isTrend && (
            <button type="button" onClick={(e) => { e.stopPropagation(); guestFeatureLocked ? onRequireLogin?.() : onAskAi?.(p); }}
              className="text-[10px] px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}>
              <span className="icon-activity mr-0.5" />AI
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onPublish(); }}
            className="text-[10px] px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}>
            Publish
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-[10px] px-2 py-1.5 rounded-lg font-semibold"
            style={{ background: 'transparent', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}
            title={uiLang === 'zh' ? '移除' : 'Remove'}>
            <span className="icon-trash-2" />
          </button>
          {isTrend && (
            <span className="text-[12px] transition-transform" style={{ color: 'var(--theme-text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <span className="icon-chevron-down" />
            </span>
          )}
        </div>
      </div>
      {isTrend && expanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="border-t pt-2 flex flex-wrap gap-1.5" style={{ borderColor: 'var(--theme-border)' }}>
            {p.categoryCn && <TrendMetricPill label={trendT('category')} value={uiLang === 'zh' ? p.categoryCn : (p.categoryEn || p.categoryCn)} />}
            <TrendMetricPill label={trendT('avgSellingPrice')} value={fmtUsd(p.avgSellingPriceUsd)} />
            <TrendMetricPill label={trendT('amount')} value={fmtUsd(p.amountUsd)} />
            <TrendMetricPill label={trendT('amountGrowth')} value={p.amountGrowth || '—'} />
            <TrendMetricPill label={trendT('videoSales')} value={fmtUsd(p.videoSalesUsd)} />
            <TrendMetricPill label={trendT('cardAmount')} value={fmtUsd(p.cardAmountUsd)} />
            <TrendMetricPill label={trendT('influencerCount')} value={Number.isFinite(Number(p.influencerCount)) ? String(p.influencerCount) : '—'} />
            <TrendMetricPill label={trendT('influencerOrderRate')} value={p.influencerOrderRate || '—'} />
            {p.dateRangeCn && <TrendMetricPill label={uiLang === 'zh' ? '日期' : 'Period'} value={p.dateRangeCn} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyLists({ uiLang, items, onRemove, onProductDiagnosis, guestFeatureLocked, onRequireLogin }) {
  const [view, setView] = React.useState('card');
  const [publishHint, setPublishHint] = React.useState('');
  const [expandedKeys, setExpandedKeys] = React.useState(new Set());

  React.useEffect(() => {
    if (!publishHint) return undefined;
    const t = window.setTimeout(() => setPublishHint(''), 1800);
    return () => window.clearTimeout(t);
  }, [publishHint]);

  const handlePublish = () => {
    setPublishHint(uiLang === 'zh' ? 'Publish 功能待接通' : 'Publish coming soon');
  };

  const toggleExpand = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const title = uiLang === 'zh' ? '我的列表' : 'My Lists';
  const subtitle = uiLang === 'zh' ? '从商品搜索页加入的商品在这里管理' : 'Products added from Product Search are managed here';
  const emptyText = uiLang === 'zh' ? '列表为空，前往商品搜索加入商品' : 'List is empty — add products from Product Search';

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--theme-chat-bg, #ffffff)' }}>
      <div style={{ flexShrink: 0, padding: '16px 24px 12px', borderBottom: '1px solid var(--theme-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="text-[20px] md:text-[24px] font-bold" style={{ color: 'var(--theme-text)', margin: 0 }}>
              <span className="icon-bookmark text-[var(--brand-primary-fixed)] mr-2" />
              {title}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--theme-text-secondary)', margin: 0 }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setView('card')}
              className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: view === 'card' ? 'var(--brand-primary-fixed)' : 'var(--theme-surface)',
                color: view === 'card' ? '#fff' : 'var(--theme-text-secondary)',
                border: view === 'card' ? '1px solid var(--brand-primary-fixed)' : '1px solid var(--theme-border)',
              }}>
              <span className="icon-grid mr-1" />{uiLang === 'zh' ? '卡片' : 'Cards'}
            </button>
            <button type="button" onClick={() => setView('list')}
              className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: view === 'list' ? 'var(--brand-primary-fixed)' : 'var(--theme-surface)',
                color: view === 'list' ? '#fff' : 'var(--theme-text-secondary)',
                border: view === 'list' ? '1px solid var(--brand-primary-fixed)' : '1px solid var(--theme-border)',
              }}>
              <span className="icon-list mr-1" />{uiLang === 'zh' ? '列表' : 'List'}
            </button>
          </div>
        </div>
      </div>

      {publishHint && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, pointerEvents: 'none' }}>
          <div className="text-[12px] font-semibold px-4 py-2 rounded-full shadow-lg"
            style={{ background: 'var(--theme-text)', color: 'var(--theme-chat-bg, #fff)', whiteSpace: 'nowrap' }}
            role="status" aria-live="polite">
            {publishHint}
          </div>
        </div>
      )}

      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '16px 24px' }}>
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{emptyText}</div>
          </div>
        ) : view === 'card' ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {items.map((p) => (
              <CompactRetailProductCard
                key={p._listKey || p.id}
                product={p}
                uiLang={uiLang}
                retailVariant={isTrendOrBestsellerCard(p) ? 'trend' : 'hot'}
                trendFooter="view_publish"
                onPublishPlaceholder={handlePublish}
                onRemoveFromList={() => onRemove?.(p._listKey || p.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((p) => {
              const key = p._listKey || p.id;
              return (
                <ListRow
                  key={key}
                  p={p}
                  uiLang={uiLang}
                  expanded={expandedKeys.has(key)}
                  onToggle={() => toggleExpand(key)}
                  onPublish={handlePublish}
                  onRemove={() => onRemove?.(key)}
                  onAskAi={onProductDiagnosis}
                  guestFeatureLocked={guestFeatureLocked}
                  onRequireLogin={onRequireLogin}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
