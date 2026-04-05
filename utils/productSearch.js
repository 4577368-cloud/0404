/**
 * Product search utilities
 * Handles product catalog loading, normalization, and search logic
 */

const TANGBUY_DISPLAY_MULT = 1.7;
const DROPSHIPPING_PREFIX = 'https://dropshipping.tangbuy.com/zh-CN/product/';

function base64EncodeUtf8(str) {
  try { return btoa(unescape(encodeURIComponent(String(str)))); }
  catch (_) { return btoa(String(str)); }
}

function toDropshippingUrl(sourceUrl) {
  if (!sourceUrl) return '';
  const s = String(sourceUrl);
  return s.startsWith(DROPSHIPPING_PREFIX) ? s : DROPSHIPPING_PREFIX + base64EncodeUtf8(s);
}

/** 默认与 `4577368-cloud/agent` 仓库 `main` 根目录 JSON 对齐；可用 `VITE_DATA_REMOTE_BASE` 覆盖，设为空字符串可关闭远程回退 */
const DEFAULT_DATA_REMOTE_BASE = 'https://raw.githubusercontent.com/4577368-cloud/agent/main';

function getDataRemoteBase() {
  const env = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_REMOTE_BASE;
  if (env === '') return '';
  const s = env != null ? String(env).trim() : '';
  if (s !== '') return s.replace(/\/?$/, '');
  return DEFAULT_DATA_REMOTE_BASE;
}

/** `data/foo.json` / `./data/foo.json` / `/data/foo.json` → `foo.json`（与 GitHub 仓库根目录文件名一致） */
function pathToDataFilename(p) {
  return String(p || '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/?data\//i, '');
}

/** 本地优先顺序：带 Vite BASE_URL、相对路径（供 tryFetchJson / 远程回退文件名解析） */
export function getDataJsonFetchPaths(filename) {
  const safe = String(filename || '').replace(/^\/+/, '');
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null ? String(import.meta.env.BASE_URL) : '/';
  const prefix = base.endsWith('/') ? `${base}data/` : `${base}/data/`;
  return [`${prefix}${safe}`, `data/${safe}`, `./data/${safe}`, `/data/${safe}`];
}

function buildTryFetchUrlOrder(paths) {
  const list = Array.isArray(paths) ? paths : [];
  const localOrdered = [];
  const seenLocal = new Set();
  for (const p of list) {
    const u = String(p || '').trim();
    if (!u || seenLocal.has(u)) continue;
    seenLocal.add(u);
    localOrdered.push(u);
  }
  const base = getDataRemoteBase();
  if (!base) return localOrdered;
  const seenRemote = new Set();
  const out = [...localOrdered];
  for (const p of localOrdered) {
    const name = pathToDataFilename(p);
    if (!name || seenRemote.has(name)) continue;
    seenRemote.add(name);
    // 与常见 GitHub 布局一致：仓库根目录 或 仓库下 data/ 子目录
    out.push(`${base}/${name}`);
    out.push(`${base}/data/${name}`);
  }
  return out;
}

function fetchUrlWithBust(u) {
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}cb=${Date.now()}`;
}

// ── Chinese → English translation dictionary for product search ──
export const ZH_EN_DICT = [
  // Gender / audience
  ['女士', 'women'], ['女性', 'women'], ['女装', 'women'], ['女款', 'women'], ['女式', 'women'], ['女孩', 'girl'],
  ['男士', 'men'], ['男性', 'men'], ['男装', 'men'], ['男款', 'men'], ['男式', 'men'], ['男孩', 'boy'],
  // Outerwear
  ['外套', 'coat jacket'], ['夹克', 'jacket'], ['羽绒服', 'puffer down jacket'], ['羽绒', 'puffer down'],
  ['卫衣', 'hoodie sweatshirt'], ['毛衣', 'sweater knit'], ['开衫', 'cardigan'], ['西装', 'blazer suit'],
  ['马甲', 'vest'], ['大衣', 'overcoat coat'], ['风衣', 'trench coat'], ['棉服', 'padded jacket'],
  // Tops
  ['衬衫', 'shirt blouse'], ['上衣', 'top blouse'], ['T恤', 't-shirt tee'], ['背心', 'tank top vest'],
  ['polo衫', 'polo shirt'], ['衬衣', 'shirt'], ['短袖', 'short sleeve'],
  // Bottoms
  ['裤子', 'pants trousers'], ['长裤', 'pants trousers'], ['短裤', 'shorts'], ['牛仔裤', 'jeans denim'],
  ['休闲裤', 'casual pants'], ['运动裤', 'jogger sweatpants'], ['打底裤', 'leggings'], ['阔腿裤', 'wide leg pants'],
  ['西裤', 'dress pants slacks'], ['工装裤', 'cargo pants'], ['半身裙', 'skirt'],
  // Dresses
  ['连衣裙', 'dress'], ['裙子', 'dress skirt'], ['裙', 'dress skirt'], ['长裙', 'maxi dress long skirt'],
  ['短裙', 'mini skirt'], ['吊带裙', 'slip dress'],
  // Shoes
  ['鞋子', 'shoe'], ['鞋', 'shoe'], ['运动鞋', 'sneaker athletic shoe'], ['靴子', 'boot'], ['靴', 'boot'],
  ['凉鞋', 'sandal'], ['拖鞋', 'slipper'], ['高跟鞋', 'high heel'], ['平底鞋', 'flat shoe loafer'],
  ['帆布鞋', 'canvas shoe'], ['皮鞋', 'leather shoe'], ['板鞋', 'sneaker'],
  // Bags
  ['包包', 'bag handbag'], ['包', 'bag'], ['手提包', 'handbag tote'], ['双肩包', 'backpack'],
  ['背包', 'backpack'], ['钱包', 'wallet'], ['斜挎包', 'crossbody bag'], ['单肩包', 'shoulder bag'],
  ['手拿包', 'clutch'], ['行李箱', 'luggage suitcase'],
  // Accessories
  ['手表', 'watch'], ['项链', 'necklace'], ['耳环', 'earring'], ['戒指', 'ring'], ['手链', 'bracelet'],
  ['饰品', 'jewelry accessory'], ['帽子', 'hat cap'], ['围巾', 'scarf'], ['太阳镜', 'sunglasses'],
  ['墨镜', 'sunglasses'], ['腰带', 'belt'], ['领带', 'tie'], ['发饰', 'hair accessory'],
  // Electronics
  ['手机壳', 'phone case'], ['手机', 'phone'], ['耳机', 'headphone earphone earbud'], ['充电器', 'charger'],
  ['数据线', 'cable cord'], ['音箱', 'speaker'], ['数码', 'electronic digital'], ['平板', 'tablet'],
  ['键盘', 'keyboard'], ['鼠标', 'mouse'], ['电脑', 'computer laptop'],
  // Home
  ['家居', 'home decor'], ['厨房', 'kitchen'], ['灯', 'lamp light'], ['枕头', 'pillow'], ['毯子', 'blanket'],
  ['毛巾', 'towel'], ['收纳', 'storage organizer'], ['装饰', 'decor decoration'], ['窗帘', 'curtain'],
  ['地毯', 'rug carpet'], ['花瓶', 'vase'], ['杯子', 'cup mug'], ['餐具', 'tableware cutlery'],
  // Beauty
  ['美妆', 'beauty makeup'], ['护肤', 'skincare'], ['口红', 'lipstick'], ['化妆', 'makeup cosmetic'],
  ['面膜', 'face mask'], ['粉底', 'foundation'], ['眼影', 'eyeshadow'], ['香水', 'perfume'],
  ['假睫毛', 'false eyelash eyelashes'], ['睫毛', 'eyelash lash lashes'],
  ['防晒', 'sunscreen'], ['洗面奶', 'cleanser'], ['精华', 'serum essence'],
  // Health Food
  ['保健食品', 'health food supplement'], ['保健', 'health wellness'], ['营养', 'nutrition nutrient'],
  ['维生素', 'vitamin'], ['补充剂', 'supplement additive'], ['蛋白', 'protein'], ['有机', 'organic'],
  ['天然', 'natural'], ['膳食', 'dietary meal'], ['健康食品', 'health food'], ['养生', 'wellness health'],
  ['滋补', 'nutritional tonic'], ['食品', 'food'], ['食品类', 'food category'],
  // Toys
  ['玩具', 'toy'], ['游戏', 'game'], ['公仔', 'figure doll'], ['积木', 'building block lego'],
  ['模型', 'model figure'], ['毛绒', 'plush stuffed'],
  // Pet
  ['宠物', 'pet'], ['猫', 'cat'], ['狗', 'dog'], ['宠物用品', 'pet supplies'],
  // Sports
  ['运动', 'sport athletic fitness'], ['健身', 'fitness gym workout'], ['瑜伽', 'yoga'],
  ['户外', 'outdoor camping hiking'], ['自行车', 'bicycle bike'], ['跑步', 'running'],
  // Kids / Baby
  ['婴儿', 'baby infant'], ['儿童', 'kid children'], ['宝宝', 'baby toddler'], ['童装', 'kids clothing'],
  // Swimwear / Underwear
  ['泳衣', 'swimsuit swimwear'], ['泳装', 'swimwear'], ['比基尼', 'bikini'],
  ['内衣', 'lingerie underwear'], ['内裤', 'panties underwear briefs'], ['文胸', 'bra'],
  // Material / style modifiers
  ['真皮', 'leather genuine'], ['棉', 'cotton'], ['丝绸', 'silk'], ['羊毛', 'wool'],
  ['复古', 'vintage retro'], ['简约', 'minimalist simple'], ['时尚', 'fashion trendy'],
  ['新款', 'new arrival'], ['爆款', 'best seller hot trending'], ['潮流', 'trendy streetwear'],
];

export function translateZhToEn(text) {
  if (!text || !/[\u4e00-\u9fff]/.test(text)) return [];
  const result = [];
  for (const [zh, en] of ZH_EN_DICT) {
    if (text.includes(zh)) {
      result.push(...en.split(/\s+/));
    }
  }
  return [...new Set(result)];
}

// ── Category keywords for product intent ──
export const CATEGORY_MAP = [
  { keywords: ['coat', 'jacket', 'puffer', 'hoodie', 'sweater', 'cardigan', 'blazer', 'vest', 'overcoat', 'trench', 'padded', '外套', '夹克', '羽绒', '卫衣', '毛衣', '风衣', '棉服', '马甲', '开衫', '大衣'], label: 'outerwear' },
  { keywords: ['dress', 'skirt', 'gown', '裙', '连衣裙', '半身裙', '长裙', '短裙'], label: 'dress' },
  { keywords: ['shirt', 'blouse', 'top', 'tee', 't-shirt', 'tank', 'camisole', 'polo', '衬衫', '上衣', 'T恤', '背心', '短袖', '衬衣'], label: 'tops' },
  { keywords: ['pants', 'trousers', 'jeans', 'leggings', 'shorts', 'jogger', 'sweatpants', 'cargo', 'slacks', 'denim', '裤子', '裤', '牛仔', '长裤', '短裤', '打底裤', '阔腿裤', '运动裤', '西裤', '工装裤', '休闲裤'], label: 'bottoms' },
  { keywords: ['shoe', 'sneaker', 'boot', 'sandal', 'slipper', 'heel', 'loafer', 'flat', 'canvas', '鞋', '靴', '凉鞋', '拖鞋', '高跟鞋', '运动鞋', '帆布鞋', '皮鞋', '平底鞋', '板鞋'], label: 'shoes' },
  { keywords: ['bag', 'handbag', 'backpack', 'purse', 'wallet', 'clutch', 'tote', 'crossbody', 'shoulder bag', 'luggage', '包', '钱包', '背包', '手提包', '斜挎包', '单肩包', '行李箱'], label: 'bags' },
  { keywords: ['watch', 'bracelet', 'necklace', 'earring', 'ring', 'jewelry', 'accessori', 'hat', 'cap', 'scarf', 'sunglasses', 'belt', '手表', '项链', '耳环', '戒指', '饰品', '手链', '帽子', '围巾', '太阳镜', '墨镜', '腰带', '发饰'], label: 'accessories' },
  { keywords: ['phone', 'case', 'charger', 'cable', 'headphone', 'earphone', 'earbud', 'speaker', 'electronic', 'keyboard', 'mouse', 'tablet', 'laptop', '手机', '耳机', '充电', '数码', '键盘', '鼠标', '电脑', '平板', '音箱'], label: 'electronics' },
  { keywords: ['home', 'kitchen', 'lamp', 'pillow', 'blanket', 'towel', 'storage', 'organiz', 'decor', 'curtain', 'rug', 'carpet', 'vase', 'cup', 'mug', '家居', '厨房', '灯', '收纳', '装饰', '窗帘', '地毯', '杯子', '餐具', '枕头', '毯子', '毛巾', '花瓶'], label: 'home' },
  { keywords: ['beauty', 'makeup', 'skincare', 'cream', 'serum', 'lipstick', 'mascara', 'brush', 'perfume', 'foundation', 'eyeshadow', 'cleanser', 'sunscreen', '美妆', '护肤', '口红', '化妆', '面膜', '粉底', '眼影', '香水', '防晒', '洗面奶', '精华', '假睫毛', '睫毛', 'eyelash', 'eyelashes', 'lash', 'lashes'], label: 'beauty' },
  { keywords: ['health', 'food', 'supplement', 'vitamin', 'nutrition', 'protein', 'organic', 'natural', 'dietary', '保健', '保健食品', '营养', '维生素', '补充剂', '蛋白', '有机', '天然', '膳食', '健康食品', '养生', '滋补'], label: 'health_food' },
  { keywords: ['toy', 'game', 'puzzle', 'doll', 'figure', 'plush', 'lego', 'block', 'model', '玩具', '游戏', '公仔', '积木', '模型', '毛绒'], label: 'toys' },
  { keywords: ['pet', 'dog', 'cat', 'collar', 'leash', '宠物', '猫', '狗'], label: 'pet' },
  { keywords: ['sport', 'fitness', 'yoga', 'gym', 'bicycle', 'outdoor', 'camping', 'hiking', 'running', 'workout', 'athletic', '运动', '健身', '瑜伽', '户外', '自行车', '跑步'], label: 'sports' },
  { keywords: ['baby', 'kid', 'children', 'infant', 'toddler', '婴儿', '儿童', '宝宝', '童装'], label: 'kids' },
  { keywords: ['swimsuit', 'bikini', 'swim', 'swimwear', '泳衣', '泳装', '比基尼'], label: 'swimwear' },
  { keywords: ['lingerie', 'underwear', 'bra', 'panties', 'boxers', 'briefs', '内衣', '内裤', '文胸'], label: 'underwear' },
];

export function detectCategories(text) {
  const lower = text.toLowerCase();
  return CATEGORY_MAP.filter((cat) => cat.keywords.some((kw) => lower.includes(kw)));
}

export function parsePriceRange(text) {
  let min = 0, max = Infinity;
  const rmb = /(?:价格|price|预算|budget)[^\d]{0,10}?(\d+)\s*[-~到至]\s*(\d+)/i.exec(text);
  if (rmb) return { min: Number(rmb[1]), max: Number(rmb[2]) };
  const under = /(?:低于|under|below|不超过|最多|max)[^\d]{0,6}?(\d+)/i.exec(text);
  if (under) return { min, max: Number(under[1]) };
  const above = /(?:高于|above|over|至少|最少|min)[^\d]{0,6}?(\d+)/i.exec(text);
  if (above) return { min: Number(above[1]), max };
  const range = /(\d+)\s*[-~到至]\s*(\d+)\s*(?:元|¥|rmb|yuan|块|刀|\$|usd)?/i.exec(text);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return null;
}

export function parseMinSold(text) {
  const m = /(?:月销|销量|sold|sales)[^\d]{0,8}?(\d+)/i.exec(text);
  return m ? Number(m[1]) : null;
}

export function pickField(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

/** JSON 根节点可能是数组或 { items|products|data: [] } */
export function ensureJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.products)) return raw.products;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

/**
 * 合并手工拼接的多个顶层 JSON 数组：`[...]\n[...]`（整文件否则无法 JSON.parse）
 */
export function parseConcatenatedTopLevelJsonArrays(text) {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim().replace(/\bNaN\b/g, 'null');
  if (!trimmed || !/\]\s*\[/.test(trimmed)) return null;
  const parts = trimmed.split(/\]\s*\[/);
  if (parts.length < 2) return null;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    let s = parts[i].trim();
    if (!s.startsWith('[')) s = `[${s}`;
    if (!s.endsWith(']')) s = `${s}]`;
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) out.push(...v);
    } catch {
      return null;
    }
  }
  return out;
}

/** Single row → unified product shape (Amazon / TikTok / Trend `Product.json`). */
export function normalizeCatalogItem(item, i, platform) {
  /** tangbuy-product.json：含 1688/Tangbuy 链接 + 外链，必须与趋势行区分，避免误进 isTrend（趋势分支不读 product_title） */
  const looksLikeTangbuyProductJsonRow =
    item &&
    pickField(item, ['product_url', 'url', 'link']) != null &&
    (pickField(item, ['1688_price', 'tangbuy_price']) != null ||
      pickField(item, ['tangbuy_product_url', 'tangbuy_url']) != null);

  const isTrend =
    item &&
    !looksLikeTangbuyProductJsonRow &&
    (item['日期范围'] !== undefined ||
      item['商品名称'] !== undefined ||
      item['图片链接'] !== undefined ||
      item['类目'] !== undefined);

  if (isTrend) {
    const titleCn = String(
      pickField(item, ['商品名称', 'product_title', 'product_name', 'title', 'title_cn']) || 'Unknown Product'
    );
    const categoryCn = String(pickField(item, ['类目', 'category']) || '');
    const dateRangeCn = String(pickField(item, ['日期范围', 'dateRange']) || '');
    const image = String(
      pickField(item, ['图片链接', 'product_image_url', '图像链接', 'image', 'img']) ||
      'https://via.placeholder.com/300?text=No+Image'
    );
    /** Trend / 榜单：Product.json 多为 $；Best-selling.json 等为 ¥ 口径字段，统一折成美元口径供 fmtUsd */
    const RMB_PER_USD = 7.2;
    const trendPricesAreRmb =
      item['价格(¥)'] !== undefined ||
      item['成交金额(¥)'] !== undefined ||
      item['平均销售价(¥)'] !== undefined;
    const trendMoneyUsd = (yuanKeys, usdKeys) => {
      if (trendPricesAreRmb) {
        const yv = pickField(item, yuanKeys);
        if (yv !== undefined && yv !== null && String(yv).trim() !== '') {
          const n = Number(yv);
          return Number.isFinite(n) ? n / RMB_PER_USD : 0;
        }
      }
      return Number(pickField(item, usdKeys) || 0);
    };
    const priceUsd = trendMoneyUsd(['价格(¥)'], ['价格($)', '价格', 'price']);
    const rating = Number(pickField(item, ['商品评分', '评分', 'rating']) || 0);
    const sold = Number(pickField(item, ['销量', 'sold', 'month_sold']) || 0);
    const avgSellingPriceUsd = trendMoneyUsd(['平均销售价(¥)'], ['平均销售价($)', '平均售价($)', '平均销售价', 'avg_price']);
    const amountUsd = trendMoneyUsd(['成交金额(¥)'], ['成交金额($)', '成交金额', 'amount']);
    const amountGrowth = String(pickField(item, ['成交金额增长率', '金额增长率', 'growth']) || '');
    const videoSalesUsd = trendMoneyUsd(['视频成交金额(¥)'], ['视频成交金额($)', '视频成交金额', 'video_sales']);
    const cardAmountUsd = trendMoneyUsd(['商品卡成交金额'], ['商品卡成交金额', '商品卡成交', 'card_amount']);
    const influencerCount = Number(pickField(item, ['达人数量', '带货达人数', 'influencer_count']) || 0);
    const influencerOrderRate = String(pickField(item, ['达人出单率', '出单率', 'influencer_rate']) || '');
    const tiktokUrl = String(pickField(item, ['TikTok链接', 'tiktok_url', 'product_url']) || '');
    const categoryEnTokens = translateZhToEn(categoryCn).join(' ').trim();
    const categorySearchEn = String(
      pickField(item, ['category_en', 'category_l3_en', '三级类目_en', 'l3_category_en', 'category_l3']) || ''
    ).trim();
    const searchLower = `${titleCn} ${categoryCn} ${categoryEnTokens}`.toLowerCase();
    return {
      id: `trend_${i}_${titleCn}`,
      platform: 'Trend',
      variant: 'trend',
      name: titleCn,
      nameLower: titleCn.toLowerCase(),
      categoryCn,
      categoryEn: categoryEnTokens,
      categorySearchEn,
      searchLower,
      image,
      url: tiktokUrl,
      priceRmb: priceUsd,
      tangbuyPriceRmb: NaN,
      tangbuyUrl: '',
      monthSoldNum: Number.isFinite(sold) ? sold : 0,
      sold: Number.isFinite(sold) ? String(sold) : 'N/A',
      dateRangeCn,
      rating,
      avgSellingPriceUsd,
      amountUsd,
      amountGrowth,
      videoSalesUsd,
      cardAmountUsd,
      influencerCount,
      influencerOrderRate,
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
  const monthSoldNum = Number(monthSold);
  return {
    id: `${platform === 'Amazon' ? 'amz' : 'tt'}_${i}`,
    platform,
    name,
    nameLower: name.toLowerCase(),
    image,
    ...(imageFallback ? { imageFallback } : {}),
    url,
    priceRmb,
    monthSoldNum: Number.isFinite(monthSoldNum) ? monthSoldNum : 0,
    sold: monthSold != null && String(monthSold).trim() !== '' ? String(monthSold) : 'N/A',
    tangbuyPriceRmb: tangbuyDisplayRmb,
    tangbuyUrl: tangbuySourceUrl ? toDropshippingUrl(tangbuySourceUrl) : '',
    searchLower: name.toLowerCase(),
  };
}

/** Amazon / TikTok 热销行合并进 `data/tangbuy-product.json` 后，按 `product_url` 推断平台（供 normalizeCatalogItem 第三参）。 */
export function inferHotCatalogPlatform(productUrl) {
  const u = String(productUrl || '').toLowerCase();
  if (u.includes('tiktok.com')) return 'TikTok';
  return 'Amazon';
}

/** 依次尝试：本地路径（如 `data/*.json`）→ GitHub Raw（`VITE_DATA_REMOTE_BASE` 或默认 agent/main） */
export async function tryFetchJson(paths) {
  const urls = buildTryFetchUrlOrder(paths);
  for (const p of urls) {
    try {
      const res = await fetch(fetchUrlWithBust(p), { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      const trimmed = String(text).replace(/^\uFEFF/, '').trim();
      if (!trimmed) {
        console.warn(
          '[catalog] empty response body:',
          p,
          '— if Product.json shows data only in the editor, save the file to disk (Cmd/Ctrl+S). Vite serves the file on disk, not an unsaved buffer.'
        );
        continue;
      }
      const sanitized = trimmed.replace(/\bNaN\b/g, 'null');
      try {
        return JSON.parse(sanitized);
      } catch {
        const mergedArrays = parseConcatenatedTopLevelJsonArrays(sanitized);
        if (mergedArrays && mergedArrays.length) return mergedArrays;
        throw new Error('invalid JSON');
      }
    } catch (e) {
      console.warn('[catalog] fetch/parse failed', p, e?.message || e);
    }
  }
  return [];
}

/** Load `data/tangbuy-product.json` (Amazon + TikTok 合并热销) + `data/Product.json` (trend). Safe to call multiple times. */
export async function loadProductCatalog() {
  const [mergedRaw, trendRaw] = await Promise.all([
    tryFetchJson(getDataJsonFetchPaths('tangbuy-product.json')),
    tryFetchJson(getDataJsonFetchPaths('Product.json')),
  ]);
  const merged = ensureJsonArray(mergedRaw);
  const trend = ensureJsonArray(trendRaw);
  const nHot = merged.length;
  if (nHot) console.log('[catalog] tangbuy-product.json rows:', nHot);
  else {
    console.warn(
      '[catalog] tangbuy-product.json: no rows loaded. Ensure public/data/tangbuy-product.json exists and is valid JSON, or set VITE_DATA_REMOTE_BASE for Raw fallback.'
    );
  }
  const nTrend = trend.length;
  if (nTrend) console.log('[catalog] Product.json (trend) rows:', nTrend);
  else {
    console.warn(
      '[catalog] Product.json: no rows loaded. Common causes: (1) file on disk is 0 bytes — save Product.json in the editor; (2) invalid/truncated JSON; (3) JSON should live in public/data/ (deployed as /data/*) or on GitHub Raw per VITE_DATA_REMOTE_BASE.'
    );
  }
  return [
    ...merged.map((x, i) =>
      normalizeCatalogItem(x, i, inferHotCatalogPlatform(pickField(x, ['product_url', 'url', 'link'])))
    ),
    ...trend.map((x, i) => normalizeCatalogItem(x, i, 'Trend')),
  ];
}

/** Product.json + Best-selling.json 合并趋势/Top1000 库 */
export async function loadTrendCatalogOnly() {
  const [trendRaw, bestRaw] = await Promise.all([
    tryFetchJson(getDataJsonFetchPaths('Product.json')),
    tryFetchJson(getDataJsonFetchPaths('Best-selling.json')),
  ]);
  const trend = ensureJsonArray(trendRaw);
  const best = ensureJsonArray(bestRaw);
  const trendItems = trend.map((x, i) => normalizeCatalogItem(x, i, 'Trend'));
  const bestItems = best.map((x, i) => {
    const row = normalizeCatalogItem(x, i, 'Trend');
    const safeId = `best_${i}_${String(row.name || '').slice(0, 40)}`.replace(/\s+/g, '_');
    return { ...row, id: safeId, variant: 'bestseller', platform: 'MonthlyTop' };
  });
  return [...trendItems, ...bestItems];
}

export function partitionHotAndTrendMatches(matched) {
  const arr = Array.isArray(matched) ? matched : [];
  const isTrendLike = (p) =>
    p.platform === 'Trend' || p.platform === 'MonthlyTop' || p.variant === 'trend' || p.variant === 'bestseller';
  const hot = arr.filter((p) => p && !isTrendLike(p));
  const trend = arr.filter((p) => p && isTrendLike(p));
  return { hot, trend };
}

/** 用于把 AI 卡片与本地 tangbuy-product（Amazon/TikTok）目录对齐（忽略 query、www、尾斜杠；Amazon 按 ASIN） */
function catalogUrlKey(u) {
  const s = String(u || '').trim();
  if (!s || s === '#') return '';
  try {
    const x = new URL(s, 'https://example.com');
    const host = x.hostname.replace(/^www\./i, '').toLowerCase();
    let path = x.pathname.replace(/\/+$/, '') || '/';
    path = path.toLowerCase();
    const asinM = path.match(/(?:^|\/)(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/|$)/i);
    if ((host.includes('amazon.') || host === 'amazon.com' || host.endsWith('.amazon.com')) && asinM) {
      return `asin:${asinM[1].toUpperCase()}`;
    }
    return `${host}${path}`;
  } catch {
    return s.toLowerCase().replace(/\/+$/, '');
  }
}

function isPlaceholderImageUrl(img) {
  const s = String(img || '').trim();
  if (!s.startsWith('http')) return true;
  return /placeholder\.com|via\.placeholder/i.test(s);
}

/**
 * 用本地热销目录补全 AI 解析出的商品图（模型常省略 product_image_url）。
 * 先按 URL/ASIN 匹配，再按标题小写精确匹配（仅 Amazon/TikTok 行）。
 */
export function enrichHotProductsWithCatalog(products, catalog) {
  if (!Array.isArray(products) || !products.length) return products;
  if (!Array.isArray(catalog) || !catalog.length) return products;
  const byKey = new Map();
  const byName = new Map();
  for (const c of catalog) {
    if (!c || c.platform === 'Trend' || c.variant === 'trend') continue;
    const k = catalogUrlKey(c.url);
    if (k && !byKey.has(k)) byKey.set(k, c);
    const n = String(c.nameLower || c.name || '')
      .toLowerCase()
      .trim();
    if (n && !byName.has(n)) byName.set(n, c);
  }
  return products.map((p) => {
    if (!p || !isPlaceholderImageUrl(p.image)) return p;
    let hit = null;
    const uk = catalogUrlKey(p.url);
    if (uk) hit = byKey.get(uk);
    if (!hit && p.name) {
      const nl = String(p.name).toLowerCase().trim();
      hit = byName.get(nl);
    }
    if (!hit) return p;
    const next = { ...p };
    if (hit.image && !isPlaceholderImageUrl(hit.image)) next.image = hit.image;
    if (hit.imageFallback) next.imageFallback = hit.imageFallback;
    if ((!next.url || next.url === '#') && hit.url) next.url = hit.url;
    if (!next.tangbuyUrl && hit.tangbuyUrl) next.tangbuyUrl = hit.tangbuyUrl;
    return next;
  });
}

export function extractBalancedJsonArray(inner) {
  const s = String(inner || '').trim();
  const i = s.indexOf('[');
  if (i === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\' && inStr) {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

/** AI 输出的 JSON 行：仅识别 Amazon/TikTok 热销结构（非 Trend） */
export function isCatalogProductRowForAi(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (o.variant === 'trend' || o.platform === 'Trend') return false;
  const name = o.name || o.title || o.product_name || o.productTitle || o.product_title;
  if (!name) return false;
  const plat = String(o.platform || '');
  const hasHotPlat = plat === 'Amazon' || plat === 'TikTok';
  const priceKeys = ['priceRmb', 'price_rmb', 'price', 'product_price', 'tangbuyPriceRmb', '1688_price'];
  const hasPrice = priceKeys.some((k) => {
    const v = o[k];
    return v !== undefined && v !== null && v !== '';
  });
  const hasImg = !!(o.image || o.img || o.product_image_url);
  return hasHotPlat || hasPrice || !!(o.tangbuyUrl || o.tangbuy_url || o.tangbuy_product_url) || hasImg;
}

export function normalizeCatalogProductFromAi(raw, idx) {
  const name = raw.name || raw.title || raw.product_name || raw.productTitle || raw.product_title || 'Product';
  const plat = raw.platform === 'TikTok' ? 'TikTok' : 'Amazon';
  const pr = Number(raw.priceRmb ?? raw.price_rmb ?? raw.price ?? 0);
  const raw1688 = Number(raw['1688_price'] ?? raw.tangbuy_price ?? NaN);
  const tangbuySourceUrl = raw.tangbuyUrl || raw.tangbuy_url || raw.tangbuy_product_url;
  let tangbuyDisplayRmb = Number(raw.tangbuyPriceRmb);
  if (!Number.isFinite(tangbuyDisplayRmb) && Number.isFinite(raw1688) && raw1688 > 0) {
    tangbuyDisplayRmb = raw1688 * TANGBUY_DISPLAY_MULT;
  }
  const imgPrimary = pickField(raw, [
    'product_image_url',
    'image',
    'img',
    'productImageUrl',
    'image_url',
    'imageUrl',
    'thumbnail',
    'cover',
  ]);
  const imgAlt = pickField(raw, ['tangbuy_product_image_url']);
  const image =
    String(imgPrimary || imgAlt || '').trim() ||
    'https://via.placeholder.com/300?text=No+Image';
  const imageFallback =
    imgPrimary && imgAlt && String(imgPrimary).trim() !== String(imgAlt).trim()
      ? String(imgAlt).trim()
      : '';
  return {
    id: raw.id || `ai_hot_${idx}_${String(name).slice(0, 20).replace(/\s+/g, '_')}`,
    platform: plat,
    name,
    nameLower: String(name).toLowerCase(),
    image,
    ...(imageFallback ? { imageFallback } : {}),
    url: raw.url || raw.product_url || '#',
    priceRmb: Number.isFinite(pr) ? pr : 0,
    monthSoldNum: 0,
    sold: raw.sold != null && String(raw.sold).trim() !== '' ? String(raw.sold) : 'N/A',
    tangbuyPriceRmb: Number.isFinite(tangbuyDisplayRmb) ? tangbuyDisplayRmb : NaN,
    tangbuyUrl: tangbuySourceUrl ? toDropshippingUrl(tangbuySourceUrl) : '',
    searchLower: String(name).toLowerCase(),
  };
}

/** 粗判：是否像热销目录 JSON 数组（无 markdown 围栏时） */
const CATALOG_JSON_ARRAY_SNIFF =
  /(?:product_title|product_image_url|product_url|"platform"|price_rmb|month_sold|"name"\s*:|"title"\s*:|1688_price|tangbuy_product_url)/i;

/**
 * 流式阶段：从首个疑似商品 JSON 数组的 `[` 起整段截掉（不展示原始 JSON）。
 */
export function stripStreamingLooseCatalogJsonTail(t) {
  const s = String(t || '');
  const idx = s.search(/\[\s*\{/);
  if (idx === -1) return s;
  const sniff = s.slice(idx, idx + 1400);
  if (!CATALOG_JSON_ARRAY_SNIFF.test(sniff)) return s;
  return s.slice(0, idx).replace(/\s+$/, '');
}

function tryParseLooseCatalogProductArray(text) {
  const t = String(text || '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '[') continue;
    const rest = t.slice(i);
    if (!/^\[\s*\{/.test(rest)) continue;
    const sniff = rest.slice(0, Math.min(1400, rest.length));
    if (!CATALOG_JSON_ARRAY_SNIFF.test(sniff)) continue;
    const arrStr = extractBalancedJsonArray(rest);
    if (!arrStr) continue;
    let parsed;
    try {
      parsed = JSON.parse(arrStr);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || !parsed.length) continue;
    const rows = parsed.filter(isCatalogProductRowForAi).map((r, j) => normalizeCatalogProductFromAi(r, j));
    if (!rows.length) continue;
    const strippedText = (t.slice(0, i) + t.slice(i + arrStr.length)).replace(/\n{3,}/g, '\n\n').trim();
    return { products: rows, strippedText };
  }
  return null;
}

/**
 * 从 AI 回复中解析：优先 ```json [...] ```，否则正文内任意位置的 `[{...}]` 热销数组（不含 Trend）。
 * 返回 { products, strippedText } 或 null。
 */
export function parseCatalogProductJsonFromMarkdown(fullText) {
  const text = String(fullText || '');
  if (text.includes('```')) {
    const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    let m;
    while ((m = fenceRe.exec(text)) !== null) {
      const arrStr = extractBalancedJsonArray(m[1]);
      if (!arrStr) continue;
      let parsed;
      try {
        parsed = JSON.parse(arrStr);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed) || !parsed.length) continue;
      const rows = parsed.filter(isCatalogProductRowForAi).map((r, i) => normalizeCatalogProductFromAi(r, i));
      if (!rows.length) continue;
      const strippedText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
      return { products: rows, strippedText };
    }
  }
  return tryParseLooseCatalogProductArray(text);
}

/**
 * 流式：未闭合 ``` 时截断；无围栏但出现疑似商品 JSON 数组时从 `[` 起隐藏。
 */
export function maskStreamingProductJsonBlock(text, _uiLang) {
  let t = String(text || '');
  const parts = t.split('```');
  if (parts.length >= 2 && parts.length % 2 === 0) {
    t = parts.slice(0, -1).join('```');
  }
  return stripStreamingLooseCatalogJsonTail(t);
}

export function shouldRecommendProducts(text, prevMessages, _aiResponse = '') {
  const t = String(text || '').trim();

  // 1) Explicit product / trend request — user actively asks for products
  if (/(推荐商品|推荐产品|给我推荐|帮我选品|帮我找货|帮我找商品|推荐一些|有什么.*商品|有什么.*产品|给我看.*商品|show me products|recommend products|find products|suggest products|give me products|show trending|list products)/i.test(t)) return true;
  if (/(趋势商品|趋势选品|找趋势|热销商品|爆款推荐|热卖推荐|trending products|best sellers|hot products)/i.test(t)) return true;

  // 2) User confirms after AI asked a follow-up about products
  if (isProductConfirmation(t, prevMessages)) return true;

  return false;
}

export function isProductConfirmation(text, prevMessages) {
  const t = String(text || '').trim();
  const isShortConfirm = /^(是的?|好的?|可以|需要|要的?|对|嗯|ok|yes|yeah|yep|sure|please|好呀|要呀|来吧|给我看|show me|go ahead|是啊|当然|没问题)[\s!！.。,，?？]*$/i.test(t);
  if (!isShortConfirm) return false;

  // Check if the last AI message was asking about product recommendations
  if (!prevMessages || !prevMessages.length) return false;
  const lastAiMsg = [...prevMessages].reverse().find((m) => m.role === 'ai' && m.type === 'text' && m.content);
  if (!lastAiMsg) return false;
  const aiText = String(lastAiMsg.content).toLowerCase();
  return /(是否需要.*商品|是否.*推荐.*商品|是否.*趋势|要不要.*推荐|需要.*推荐.*商品|需要.*商品|would you like.*product|want.*recommend|want.*trending|shall i.*product|want me to show|提供.*趋势商品|提供.*商品推荐)/i.test(aiText);
}
