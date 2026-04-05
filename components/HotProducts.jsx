import React from 'react';
import { tryFetchJson } from '../utils/productSearch.js';

const PAGE_SIZE = 20;
const TANGBUY_DISPLAY_MULT = 1.7;

function pickField(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

const DROPSHIPPING_PREFIX = 'https://dropshipping.tangbuy.com/zh-CN/product/';

function base64EncodeUtf8(str) {
  try { return btoa(unescape(encodeURIComponent(String(str)))); }
  catch (_) { return btoa(String(str)); }
}

function toDropshippingUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = String(raw);
  return s.startsWith(DROPSHIPPING_PREFIX) ? s : DROPSHIPPING_PREFIX + base64EncodeUtf8(s);
}

function normalizeCatalogItem(item, i, platform) {
  const isTrend =
    item &&
    (item['日期范围'] !== undefined ||
      item['商品名称'] !== undefined ||
      item['图片链接'] !== undefined ||
      item['类目'] !== undefined);

  if (isTrend) {
    const titleCn = String(pickField(item, ['商品名称', 'title', 'title_cn']) || 'Unknown Product');
    const categoryCn = String(pickField(item, ['类目', 'category']) || '');
    const image = String(
      pickField(item, ['图片链接', '图像链接', 'image', 'img', 'product_image_url']) ||
      'https://via.placeholder.com/300?text=No+Image'
    );
    const priceUsd = Number(pickField(item, ['价格($)', '价格', 'price']) || 0);
    const sold = Number(pickField(item, ['销量', 'sold', 'month_sold']) || 0);
    const tiktokUrl = String(pickField(item, ['TikTok链接', 'tiktok_url', 'product_url']) || '');
    return {
      id: `trend_${i}_${titleCn}`,
      platform: 'Trend',
      variant: 'trend',
      name: titleCn,
      categoryCn,
      image,
      url: tiktokUrl,
      priceRmb: priceUsd,
      tangbuyPriceRmb: NaN,
      tangbuyUrl: '',
      sold: Number.isFinite(sold) ? String(sold) : 'N/A',
    };
  }

  const name = String(pickField(item, ['product_title', 'product_name', 'name', 'title', 'productTitle']) || 'Unknown Product');
  const imgPrimary = pickField(item, ['product_image_url', 'image', 'img']);
  const imgAlt = pickField(item, ['tangbuy_product_image_url']);
  const image = String(imgPrimary || imgAlt || '').trim() || 'https://via.placeholder.com/300?text=No+Image';
  const imageFallback =
    imgPrimary && imgAlt && String(imgPrimary).trim() !== String(imgAlt).trim()
      ? String(imgAlt).trim()
      : '';
  const url = String(pickField(item, ['product_url', 'url', 'link']) || '#');
  const monthSold = pickField(item, ['month_sold', 'monthSold', 'sold']);
  const priceRmb = Number(pickField(item, ['price_rmb', 'price']) || 0);
  const raw1688 = Number(pickField(item, ['1688_price', 'tangbuy_price']) || 0);
  const tangbuySourceUrl = pickField(item, ['tangbuy_product_url', 'tangbuyUrl', 'tangbuy_url']);
  const tangbuyDisplayRmb = Number.isFinite(raw1688) && raw1688 > 0 ? raw1688 * TANGBUY_DISPLAY_MULT : NaN;
  return {
    id: `${platform === 'Amazon' ? 'amz' : 'tt'}_${i}`,
    platform,
    name,
    image,
    ...(imageFallback ? { imageFallback } : {}),
    url,
    priceRmb,
    sold: monthSold != null && String(monthSold).trim() !== '' ? String(monthSold) : 'N/A',
    tangbuyPriceRmb: tangbuyDisplayRmb,
    tangbuyUrl: tangbuySourceUrl ? toDropshippingUrl(tangbuySourceUrl) : '',
  };
}

function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `$${v.toFixed(2)}`.replace(/\.00$/, '');
}

function wsrv(u) {
  const s = String(u || '').trim();
  if (!s.startsWith('http')) return 'https://via.placeholder.com/300?text=No+Image';
  return `https://wsrv.nl/?url=${encodeURIComponent(s)}&w=400&h=400&fit=cover&q=80&output=webp`;
}

function directDisplayUrl(p) {
  const raw = String(p?.image || '').trim();
  if (!raw.startsWith('http')) return raw || 'https://via.placeholder.com/300?text=No+Image';
  const skip =
    p.platform === 'TikTok' ||
    p.platform === 'Trend' ||
    p.variant === 'trend' ||
    /media-amazon|ssl-images-amazon|images-amazon|m\.media-amazon/i.test(raw) ||
    /alicdn\.com|aliyuncs\.com|tiktokcdn/i.test(raw);
  if (skip) return raw;
  return wsrv(raw);
}

function pickHotImg(p, stage) {
  const main = String(p?.image || '').trim();
  const fb = String(p?.imageFallback || '').trim();
  const hasMain = main.startsWith('http');
  const hasFb = fb.startsWith('http') && fb !== main;
  if (!hasMain) {
    if (hasFb) {
      if (stage === 0) return directDisplayUrl({ ...p, image: fb });
      if (stage === 1) return wsrv(fb);
    }
    return 'https://via.placeholder.com/300?text=No+Image';
  }
  if (stage === 0) return directDisplayUrl(p);
  if (stage === 1) return wsrv(main);
  if (hasFb) {
    if (stage === 2) return directDisplayUrl({ ...p, image: fb });
    if (stage === 3) return wsrv(fb);
  }
  return 'https://via.placeholder.com/300?text=No+Image';
}

function ProductCard({ p, uiLang }) {
  const [imgStage, setImgStage] = React.useState(0);
  React.useEffect(() => setImgStage(0), [p.id, p.image, p.imageFallback]);
  const displayUrl = imgStage >= 4 ? 'https://via.placeholder.com/300?text=No+Image' : pickHotImg(p, imgStage);

  const pr = Number(p.priceRmb), tr = Number(p.tangbuyPriceRmb);
  let savePctText = null;
  if (Number.isFinite(pr) && pr > 0 && Number.isFinite(tr) && tr > 0) {
    const pct = Math.max(0, (1 - tr / pr) * 100);
    if (pct > 0) savePctText = `-${Math.round(pct)}%`;
  }

  return (
    <div className="rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ background: 'var(--theme-card-bg)', border: '1px solid color-mix(in srgb, var(--theme-border) 82%, transparent)' }}>
      <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--theme-surface)' }}>
        <img
          key={`${p.id}-${imgStage}`}
          src={displayUrl}
          alt={p.name}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setImgStage((s) => (s < 4 ? s + 1 : s))}
        />
        {savePctText && <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/45 border border-white/10 backdrop-blur text-[10px] font-bold text-lime-300">{savePctText}</span>}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <h4 className="text-[12px] leading-snug font-medium line-clamp-2 min-h-[2.5em]" style={{ color: 'var(--theme-text)' }} title={p.name}>{p.name}</h4>
        <div className="flex items-center gap-3 px-0.5">
          <div>
            <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>{uiLang === 'zh' ? '售价' : 'Price'}</div>
            <div className="text-[12px] font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>{fmtPrice(p.priceRmb)}</div>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--theme-border)' }} />
          <div>
            <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>{uiLang === 'zh' ? '月销' : 'Sold'}</div>
            <div className="text-[12px] font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>{p.sold}</div>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--theme-border)' }} />
          {Number.isFinite(p.tangbuyPriceRmb) && p.tangbuyPriceRmb > 0 ? (
            <div>
              <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>Tangbuy</div>
              <div className="text-[12px] font-bold text-[var(--secondary)] leading-tight">{fmtPrice(p.tangbuyPriceRmb)}</div>
            </div>
          ) : (
            <div>
              <div className="text-[8px] font-semibold uppercase" style={{ color: 'var(--theme-text-muted)' }}>{uiLang === 'zh' ? '平台' : 'Source'}</div>
              <div className="text-[12px] font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>{p.platform}</div>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 mt-0.5">
          {p.tangbuyUrl ? (
            <a href={p.tangbuyUrl} target="_blank" rel="noreferrer"
              className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
              style={{ background: 'var(--brand-primary-fixed)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 14px rgba(255,59,48,0.14)' }}>
              <span className="icon-external-link text-[10px]" />
              {uiLang === 'zh' ? '查看' : 'View'}
            </a>
          ) : p.url && p.url !== '#' ? (
            <a href={p.url} target="_blank" rel="noreferrer"
              className="flex-1 text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
              style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>
              <span className="icon-external-link text-[10px]" />
              {uiLang === 'zh' ? '查看' : 'View'}
            </a>
          ) : (
            <div className="flex-1"></div>
          )}
          <button
            className="text-[10px] text-center py-1.5 rounded-lg transition-all font-semibold hover:brightness-105 flex items-center justify-center gap-1"
            style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}
            onClick={() => { /* AI诊断事件稍后定义 */ }}
          >
            <span className="icon-activity text-[10px]" />
            {uiLang === 'zh' ? 'AI诊断' : 'AI Diagnose'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HotProducts({ uiLang }) {
  const [allProducts, setAllProducts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState('all');

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      tryFetchJson(['data/amazon.202512.1k.json', './data/amazon.202512.1k.json']),
      tryFetchJson(['data/tiktok.202512.1k.json', './data/tiktok.202512.1k.json']),
      tryFetchJson(['data/Product.json', './data/Product.json']),
    ]).then(([amz, tt, trend]) => {
      const products = [
        ...(Array.isArray(amz) ? amz.map((x, i) => normalizeCatalogItem(x, i, 'Amazon')) : []),
        ...(Array.isArray(tt) ? tt.map((x, i) => normalizeCatalogItem(x, i, 'TikTok')) : []),
        ...(Array.isArray(trend) ? trend.map((x, i) => normalizeCatalogItem(x, i, 'Trend')) : []),
      ];
      setAllProducts(products);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = React.useMemo(() => {
    if (filter === 'all') return allProducts;
    if (filter === 'trend') return allProducts.filter((p) => p.variant === 'trend' || p.platform === 'Trend');
    return allProducts.filter((p) => p.platform === filter);
  }, [allProducts, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  React.useEffect(() => { setPage(1); }, [filter]);

  const filterButtons = [
    { key: 'all', label: uiLang === 'zh' ? '全部' : 'All' },
    { key: 'Amazon', label: 'Amazon' },
    { key: 'TikTok', label: 'TikTok' },
    { key: 'trend', label: uiLang === 'zh' ? '趋势' : 'Trend' },
  ];

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--theme-chat-bg, #ffffff)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '16px 24px 12px', borderBottom: '1px solid var(--theme-border)', background: 'var(--theme-chat-bg, #ffffff)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="text-[20px] md:text-[24px] font-bold" style={{ color: 'var(--theme-text)', margin: 0 }}>
              <span className="icon-flame text-[var(--brand-primary-fixed)] mr-2" />
              {uiLang === 'zh' ? '爆款商品' : 'Hot Products'}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--theme-text-secondary)', margin: 0 }}>
              {uiLang === 'zh' ? '精选热门爆款，一站式浏览' : 'Curated trending picks, all in one place'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {filterButtons.map((btn) => (
              <button key={btn.key} onClick={() => setFilter(btn.key)}
                className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: filter === btn.key ? 'var(--brand-primary-fixed)' : 'var(--theme-surface)',
                  color: filter === btn.key ? '#fff' : 'var(--theme-text-secondary)',
                  border: filter === btn.key ? '1px solid var(--brand-primary-fixed)' : '1px solid var(--theme-border)',
                }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product grid */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px 24px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm animate-pulse" style={{ color: 'var(--theme-text-muted)' }}>
              {uiLang === 'zh' ? '加载中...' : 'Loading...'}
            </div>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
              {uiLang === 'zh' ? '暂无商品数据' : 'No products found'}
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {pageItems.map((p) => <ProductCard key={p.id} p={p} uiLang={uiLang} />)}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ flexShrink: 0, padding: '12px 24px', borderTop: '1px solid var(--theme-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{
              background: 'var(--theme-surface)',
              color: currentPage <= 1 ? 'var(--theme-text-muted)' : 'var(--theme-text)',
              border: '1px solid var(--theme-border)',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage <= 1 ? 0.5 : 1,
            }}>
            <span className="icon-chevron-left text-[12px]" />
          </button>

          {(() => {
            const pages = [];
            const start = Math.max(1, currentPage - 2);
            const end = Math.min(totalPages, currentPage + 2);
            if (start > 1) {
              pages.push(
                <button key={1} onClick={() => setPage(1)}
                  className="text-[12px] w-8 h-8 rounded-lg font-medium transition-all"
                  style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>1</button>
              );
              if (start > 2) pages.push(<span key="s1" className="text-[12px]" style={{ color: 'var(--theme-text-muted)' }}>…</span>);
            }
            for (let pg = start; pg <= end; pg++) {
              pages.push(
                <button key={pg} onClick={() => setPage(pg)}
                  className="text-[12px] w-8 h-8 rounded-lg font-medium transition-all"
                  style={{
                    background: pg === currentPage ? 'var(--brand-primary-fixed)' : 'var(--theme-surface)',
                    color: pg === currentPage ? '#fff' : 'var(--theme-text-secondary)',
                    border: pg === currentPage ? '1px solid var(--brand-primary-fixed)' : '1px solid var(--theme-border)',
                  }}>{pg}</button>
              );
            }
            if (end < totalPages) {
              if (end < totalPages - 1) pages.push(<span key="s2" className="text-[12px]" style={{ color: 'var(--theme-text-muted)' }}>…</span>);
              pages.push(
                <button key={totalPages} onClick={() => setPage(totalPages)}
                  className="text-[12px] w-8 h-8 rounded-lg font-medium transition-all"
                  style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>{totalPages}</button>
              );
            }
            return pages;
          })()}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{
              background: 'var(--theme-surface)',
              color: currentPage >= totalPages ? 'var(--theme-text-muted)' : 'var(--theme-text)',
              border: '1px solid var(--theme-border)',
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage >= totalPages ? 0.5 : 1,
            }}>
            <span className="icon-chevron-right text-[12px]" />
          </button>

          <span className="text-[11px] ml-2" style={{ color: 'var(--theme-text-muted)' }}>
            {currentPage} / {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
