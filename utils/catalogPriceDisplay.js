/**
 * 商品卡片价格展示：数据源里 price_rmb、1688_price 均为人民币（Tangbuy 展示价 = 1688 × 倍率，见 productSearch TANGBUY_DISPLAY_MULT）
 */
export const RMB_PER_USD = 7.2;

export function rmbToUsd(rmb) {
  const n = Number(rmb);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n / RMB_PER_USD;
}

/**
 * 左侧售价：Amazon/TikTok 的 price_rmb 为人民币；Trend 行里 priceRmb 存的是「价格($)」等美元口径
 */
export function listPriceUsdForCard(p) {
  const v = Number(p?.priceRmb);
  if (!Number.isFinite(v) || v <= 0) return NaN;
  if (p?.variant === 'trend' || p?.variant === 'bestseller' || p?.platform === 'Trend' || p?.platform === 'MonthlyTop') return v;
  return rmbToUsd(v);
}

/** Tangbuy 列：已是 1688×倍率 的人民币（tangbuyPriceRmb）→ 美元 */
export function tangbuyUsdForCard(p) {
  return rmbToUsd(p?.tangbuyPriceRmb);
}

export function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `$${v.toFixed(2)}`.replace(/\.00$/, '');
}
