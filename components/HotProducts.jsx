import React from 'react';
import {
  tryFetchJson,
  inferHotCatalogPlatform,
  normalizeCatalogItem,
  prioritizeDirectTangbuyUrl,
  pickField,
  ensureJsonArray,
  getDataJsonFetchPaths,
} from '../utils/productSearch.js';
import { CompactRetailProductCard } from './CompactRetailProductCard.jsx';

const PAGE_SIZE = 20;

// ── Category prioritization ──

const PRIORITY_KEYWORDS = [
  /women|女装|女士|女性|dress|blouse|skirt/i,
  /men|男装|男士|男性|shirt|polo/i,
  /cosmetic|makeup|beauty|美妆|彩妆|化妆/i,
  /sport|outdoor|运动|户外|fitness|gym/i,
  /skincare|护肤|个护|personal care/i,
  /3c|digital|电子|数码|phone|earphone|keyboard|mouse|tablet/i,
  /shoe|sneaker|boot|鞋/i,
  /bag|handbag|backpack|包/i,
  /jewelry|necklace|earring|饰品/i,
];

const DEPRIORITY_KEYWORDS = [
  /药品|medicine|pharma|drug|处方|prescription/i,
  /食品|food|饮料|beverage|snack|supplement|vitamin|protein|保健|冲调|饮品/i,
];

function categoryPriorityScore(p) {
  const blob = `${p.name || ''} ${p.categoryCn || ''} ${p.categoryEn || ''} ${p.categorySearchEn || ''}`.toLowerCase();
  for (const re of DEPRIORITY_KEYWORDS) {
    if (re.test(blob)) return 2;
  }
  for (let i = 0; i < PRIORITY_KEYWORDS.length; i++) {
    if (PRIORITY_KEYWORDS[i].test(blob)) return 0;
  }
  return 1;
}

function seededShuffle(arr, seed) {
  const out = [...arr];
  let s = seed;
  const next = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffleWithCategoryPriority(arr, seed) {
  const shuffled = seededShuffle(arr, seed);
  shuffled.sort((a, b) => categoryPriorityScore(a) - categoryPriorityScore(b));
  return shuffled;
}

function interleaveArrays(arrays, seed) {
  const pools = arrays.map((a) => seededShuffle(a, seed));
  const out = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const pool of pools) {
      if (round < pool.length) {
        out.push(pool[round]);
        added = true;
      }
    }
    round++;
  }
  return out;
}

// ── Month extraction from date range ──

function extractMonth(dateRange) {
  const m = String(dateRange || '').match(/(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function monthLabel(ym) {
  const [y, m] = String(ym).split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mi = parseInt(m, 10) - 1;
  return `${monthNames[mi] || m} ${y}`;
}

function getAvailableMonths(rows) {
  const set = new Set();
  for (const r of rows) {
    const ym = extractMonth(r.dateRangeCn);
    if (ym) set.add(ym);
  }
  return [...set].sort().reverse();
}

// ── Filters ──

function matchesKeyword(p, kw) {
  if (!kw) return true;
  const lower = kw.toLowerCase();
  const blob = `${p.name || ''} ${p.categoryCn || ''} ${p.categoryEn || ''} ${p.categorySearchEn || ''}`.toLowerCase();
  return blob.includes(lower);
}

function matchesNumRange(val, min, max) {
  const v = Number(val);
  if (!Number.isFinite(v)) return true;
  if (Number.isFinite(min) && v < min) return false;
  if (Number.isFinite(max) && v > max) return false;
  return true;
}

function parseRate(s) {
  const m = String(s || '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

function isTrendOrBestsellerCard(p) {
  return p?.variant === 'trend' || p?.variant === 'bestseller';
}

function tabLabel(key, uiLang) {
  if (key === 'all') return uiLang === 'zh' ? '全部' : 'All';
  if (key === 'tangbuy') return uiLang === 'zh' ? 'Tangbuy同款' : 'Tangbuy picks';
  if (key === 'monthly') return 'Monthly Top 1000';
  if (key === 'trend') return uiLang === 'zh' ? '趋势' : 'Trend';
  return key;
}

// ── Filter bar ──

function FilterBar({ uiLang, filters, onChange, showMonthSelect, months, selectedMonth, onMonthChange }) {
  const lbl = (zh, en) => (uiLang === 'zh' ? zh : en);
  const inputStyle = {
    width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 8,
    background: 'var(--theme-surface)', color: 'var(--theme-text)',
    border: '1px solid var(--theme-border)', outline: 'none',
  };
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <div className="min-w-[160px] flex-1">
        <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          {lbl('关键词', 'Keyword')}
        </label>
        <input
          type="text"
          value={filters.keyword}
          onChange={(e) => onChange({ ...filters, keyword: e.target.value })}
          placeholder={lbl('搜索商品名/类目…', 'Search name / category…')}
          style={inputStyle}
        />
      </div>
      <div className="w-[100px]">
        <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          {lbl('最低价($)', 'Min price')}
        </label>
        <input type="number" min="0" step="0.01" value={filters.priceMin} onChange={(e) => onChange({ ...filters, priceMin: e.target.value })} style={inputStyle} />
      </div>
      <div className="w-[100px]">
        <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          {lbl('最高价($)', 'Max price')}
        </label>
        <input type="number" min="0" step="0.01" value={filters.priceMax} onChange={(e) => onChange({ ...filters, priceMax: e.target.value })} style={inputStyle} />
      </div>
      <div className="w-[90px]">
        <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          {lbl('最低销量', 'Min sold')}
        </label>
        <input type="number" min="0" value={filters.soldMin} onChange={(e) => onChange({ ...filters, soldMin: e.target.value })} style={inputStyle} />
      </div>
      <div className="w-[100px]">
        <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          {lbl('最少达人', 'Min creators')}
        </label>
        <input type="number" min="0" value={filters.creatorsMin} onChange={(e) => onChange({ ...filters, creatorsMin: e.target.value })} style={inputStyle} />
      </div>
      <div className="w-[110px]">
        <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          {lbl('出单率 ≥ %', 'Conv. ≥ %')}
        </label>
        <input type="number" min="0" max="100" step="0.1" value={filters.convRateMin} onChange={(e) => onChange({ ...filters, convRateMin: e.target.value })} style={inputStyle} />
      </div>
      {showMonthSelect && months.length > 0 && (
        <div className="w-[130px]">
          <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: 'var(--theme-text-muted)' }}>
            {lbl('月份', 'Month')}
          </label>
          <select value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            {months.map((ym) => (
              <option key={ym} value={ym}>{monthLabel(ym)}</option>
            ))}
          </select>
        </div>
      )}
      <button type="button" onClick={() => onChange({ keyword: '', priceMin: '', priceMax: '', soldMin: '', creatorsMin: '', convRateMin: '' })}
        className="text-[10px] px-3 py-[7px] rounded-lg font-semibold"
        style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
        {lbl('重置', 'Reset')}
      </button>
    </div>
  );
}

function applyFilters(rows, filters, usdPriceAccessor) {
  const kw = filters.keyword?.trim() || '';
  const pMin = filters.priceMin !== '' ? Number(filters.priceMin) : undefined;
  const pMax = filters.priceMax !== '' ? Number(filters.priceMax) : undefined;
  const sMin = filters.soldMin !== '' ? Number(filters.soldMin) : undefined;
  const cMin = filters.creatorsMin !== '' ? Number(filters.creatorsMin) : undefined;
  const rMin = filters.convRateMin !== '' ? Number(filters.convRateMin) : undefined;

  return rows.filter((p) => {
    if (!matchesKeyword(p, kw)) return false;
    const usdPrice = usdPriceAccessor(p);
    if (Number.isFinite(pMin) && (!Number.isFinite(usdPrice) || usdPrice < pMin)) return false;
    if (Number.isFinite(pMax) && Number.isFinite(usdPrice) && usdPrice > pMax) return false;
    const sold = Number(p.monthSoldNum ?? p.sold);
    if (Number.isFinite(sMin) && (!Number.isFinite(sold) || sold < sMin)) return false;
    const creators = Number(p.influencerCount);
    if (Number.isFinite(cMin) && (!Number.isFinite(creators) || creators < cMin)) return false;
    const rate = parseRate(p.influencerOrderRate);
    if (Number.isFinite(rMin) && (!Number.isFinite(rate) || rate < rMin)) return false;
    return true;
  });
}

// ── Main ──

export default function HotProducts({
  viewNonce = 0,
  uiLang,
  t: _t,
  guestFeatureLocked = false,
  onRequireOAuth,
  onProductDiagnosis,
  onPublish: _onPublish,
  onAddToMyList,
}) {
  const [tangbuyRows, setTangbuyRows] = React.useState([]);
  const [bestRows, setBestRows] = React.useState([]);
  const [trendRows, setTrendRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState('all');
  const [listHint, setListHint] = React.useState('');

  const [shuffleSeed, setShuffleSeed] = React.useState(() => Math.floor(Math.random() * 2147483646) + 1);
  React.useEffect(() => {
    setShuffleSeed(Math.floor(Math.random() * 2147483646) + 1);
  }, [viewNonce]);

  const [filters, setFilters] = React.useState({ keyword: '', priceMin: '', priceMax: '', soldMin: '', creatorsMin: '', convRateMin: '' });

  const [bestMonths, setBestMonths] = React.useState([]);
  const [selectedBestMonth, setSelectedBestMonth] = React.useState('');
  const [trendMonths, setTrendMonths] = React.useState([]);
  const [selectedTrendMonth, setSelectedTrendMonth] = React.useState('');

  React.useEffect(() => {
    if (!listHint) return undefined;
    const timer = window.setTimeout(() => setListHint(''), 1800);
    return () => window.clearTimeout(timer);
  }, [listHint]);

  const showAddedToList = React.useCallback((product) => {
    onAddToMyList?.(product);
    setListHint(uiLang === 'zh' ? '✓ 已加入我的列表' : '✓ Added to My Lists');
  }, [uiLang, onAddToMyList]);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      tryFetchJson(getDataJsonFetchPaths('tangbuy-product.json')),
      tryFetchJson(getDataJsonFetchPaths('Best-selling.json')),
      tryFetchJson(getDataJsonFetchPaths('Product.json')),
    ]).then(([mergedRaw, bestRaw, trendRaw]) => {
      const merged = ensureJsonArray(mergedRaw);
      const bestArr = ensureJsonArray(bestRaw);
      const trendArr = ensureJsonArray(trendRaw);
      if (!merged.length) {
        console.warn('[HotProducts] tangbuy-product.json: 0 rows after fetch.');
      }
      const tb = merged.map((x, i) =>
        normalizeCatalogItem(x, i, inferHotCatalogPlatform(pickField(x, ['product_url', 'url', 'link'])))
      );
      const tr = trendArr.map((x, i) => normalizeCatalogItem(x, i, 'Trend'));
      const br = bestArr.map((x, i) => {
        const row = normalizeCatalogItem(x, i, 'Trend');
        const safeId = `best_${i}_${String(row.name || '').slice(0, 40)}`.replace(/\s+/g, '_');
        return { ...row, id: safeId, variant: 'bestseller', platform: 'MonthlyTop' };
      });
      setTangbuyRows(tb);
      setBestRows(br);
      setTrendRows(tr);

      const bm = getAvailableMonths(br);
      setBestMonths(bm);
      if (bm.length) setSelectedBestMonth(bm[0]);

      const tm = getAvailableMonths(tr);
      setTrendMonths(tm);
      if (tm.length) setSelectedTrendMonth(tm[0]);

      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const usdPrice = React.useCallback((p) => {
    const v = Number(p?.priceRmb);
    if (!Number.isFinite(v) || v <= 0) return NaN;
    if (p?.variant === 'trend' || p?.variant === 'bestseller' || p?.platform === 'Trend' || p?.platform === 'MonthlyTop') return v;
    return v / 7.2;
  }, []);

  const filtered = React.useMemo(() => {
    let base;
    if (filter === 'tangbuy') {
      base = tangbuyRows;
    } else if (filter === 'monthly') {
      base = selectedBestMonth
        ? bestRows.filter((r) => extractMonth(r.dateRangeCn) === selectedBestMonth)
        : bestRows;
    } else if (filter === 'trend') {
      base = selectedTrendMonth
        ? trendRows.filter((r) => extractMonth(r.dateRangeCn) === selectedTrendMonth)
        : trendRows;
    } else {
      base = interleaveArrays([tangbuyRows, bestRows, trendRows], shuffleSeed);
    }

    const showFilterBar = filter === 'trend' || filter === 'monthly';
    const afterFilters = showFilterBar ? applyFilters(base, filters, usdPrice) : base;

    if (filter === 'all') {
      return prioritizeDirectTangbuyUrl(shuffleWithCategoryPriority(afterFilters, shuffleSeed));
    }
    if (filter === 'tangbuy') {
      return prioritizeDirectTangbuyUrl(seededShuffle(afterFilters, shuffleSeed));
    }
    // monthly / trend: randomize on each view entry, then keep URL-available items in front.
    return prioritizeDirectTangbuyUrl(seededShuffle(afterFilters, shuffleSeed));
  }, [filter, tangbuyRows, bestRows, trendRows, shuffleSeed, filters, selectedBestMonth, selectedTrendMonth, usdPrice]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  React.useEffect(() => { setPage(1); }, [filter, filters, selectedBestMonth, selectedTrendMonth]);

  const filterKeys = ['all', 'tangbuy', 'monthly', 'trend'];

  const pageTitle = uiLang === 'zh' ? '商品搜索' : 'Product Search';
  const pageSubtitle = uiLang === 'zh'
    ? 'Tangbuy 同款、月销榜单与趋势数据一站浏览'
    : 'Tangbuy picks, monthly bestsellers, and trend data in one place';

  const showFilterBar = filter === 'trend' || filter === 'monthly';

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--theme-chat-bg, #ffffff)' }}>
      <div style={{ flexShrink: 0, padding: '16px 24px 12px', borderBottom: '1px solid var(--theme-border)', background: 'var(--theme-chat-bg, #ffffff)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="text-[20px] md:text-[24px] font-bold" style={{ color: 'var(--theme-text)', margin: 0 }}>
              <span className="icon-search-check text-[var(--brand-primary-fixed)] mr-2" />
              {pageTitle}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--theme-text-secondary)', margin: 0 }}>{pageSubtitle}</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filterKeys.map((key) => (
              <button key={key} type="button" onClick={() => setFilter(key)}
                className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: filter === key ? 'var(--brand-primary-fixed)' : 'var(--theme-surface)',
                  color: filter === key ? '#fff' : 'var(--theme-text-secondary)',
                  border: filter === key ? '1px solid var(--brand-primary-fixed)' : '1px solid var(--theme-border)',
                }}>
                {tabLabel(key, uiLang)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {listHint && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, pointerEvents: 'none' }}>
          <div className="text-[12px] font-semibold px-4 py-2 rounded-full shadow-lg"
            style={{ background: 'var(--theme-text)', color: 'var(--theme-chat-bg, #fff)', whiteSpace: 'nowrap' }}
            role="status" aria-live="polite">
            {listHint}
          </div>
        </div>
      )}

      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px 24px', position: 'relative' }}>

        {showFilterBar && (
          <FilterBar
            uiLang={uiLang}
            filters={filters}
            onChange={setFilters}
            showMonthSelect={filter === 'monthly' || filter === 'trend'}
            months={filter === 'monthly' ? bestMonths : trendMonths}
            selectedMonth={filter === 'monthly' ? selectedBestMonth : selectedTrendMonth}
            onMonthChange={filter === 'monthly' ? setSelectedBestMonth : setSelectedTrendMonth}
          />
        )}

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
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {pageItems.map((p) => (
              <CompactRetailProductCard
                key={p.id}
                product={p}
                uiLang={uiLang}
                retailVariant={isTrendOrBestsellerCard(p) ? 'trend' : 'hot'}
                trendFooter="view_addlist"
                onAskAi={onProductDiagnosis}
                guestFeatureLocked={guestFeatureLocked}
                onRequireLogin={onRequireOAuth}
                onAddToList={showAddedToList}
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ flexShrink: 0, padding: '12px 24px', borderTop: '1px solid var(--theme-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button type="button" onClick={() => setPage((pg) => Math.max(1, pg - 1))} disabled={currentPage <= 1}
            className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{ background: 'var(--theme-surface)', color: currentPage <= 1 ? 'var(--theme-text-muted)' : 'var(--theme-text)', border: '1px solid var(--theme-border)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.5 : 1 }}>
            <span className="icon-chevron-left text-[12px]" />
          </button>
          {(() => {
            const pages = [];
            const start = Math.max(1, currentPage - 2);
            const end = Math.min(totalPages, currentPage + 2);
            if (start > 1) {
              pages.push(<button key={1} type="button" onClick={() => setPage(1)} className="text-[12px] w-8 h-8 rounded-lg font-medium transition-all" style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>1</button>);
              if (start > 2) pages.push(<span key="s1" className="text-[12px]" style={{ color: 'var(--theme-text-muted)' }}>…</span>);
            }
            for (let pg = start; pg <= end; pg++) {
              pages.push(
                <button key={pg} type="button" onClick={() => setPage(pg)} className="text-[12px] w-8 h-8 rounded-lg font-medium transition-all"
                  style={{ background: pg === currentPage ? 'var(--brand-primary-fixed)' : 'var(--theme-surface)', color: pg === currentPage ? '#fff' : 'var(--theme-text-secondary)', border: pg === currentPage ? '1px solid var(--brand-primary-fixed)' : '1px solid var(--theme-border)' }}>
                  {pg}
                </button>
              );
            }
            if (end < totalPages) {
              if (end < totalPages - 1) pages.push(<span key="s2" className="text-[12px]" style={{ color: 'var(--theme-text-muted)' }}>…</span>);
              pages.push(<button key={totalPages} type="button" onClick={() => setPage(totalPages)} className="text-[12px] w-8 h-8 rounded-lg font-medium transition-all" style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>{totalPages}</button>);
            }
            return pages;
          })()}
          <button type="button" onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))} disabled={currentPage >= totalPages}
            className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{ background: 'var(--theme-surface)', color: currentPage >= totalPages ? 'var(--theme-text-muted)' : 'var(--theme-text)', border: '1px solid var(--theme-border)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.5 : 1 }}>
            <span className="icon-chevron-right text-[12px]" />
          </button>
          <span className="text-[11px] ml-2" style={{ color: 'var(--theme-text-muted)' }}>{currentPage} / {totalPages}</span>
        </div>
      )}
    </div>
  );
}
