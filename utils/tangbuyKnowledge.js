/**
 * Tangbuy Knowledge Base utilities
 * Handles knowledge base parsing, indexing, and context building
 */

import {
  tryFetchJson,
  translateZhToEn,
  queryHasConcreteProductIntent,
  shouldAttachTangbuyHotFromModelTrendAnalysis,
} from './productSearch.js';
import {
  TANGBUY_ZH_EN_PRODUCT_PHRASES,
  ACADEMIC_JUNK_SEARCH_TOKENS,
  getIndustryDefaultEnglishKeywords,
} from './tangbuyCommercePhrases.js';

const TANGBUY_SEARCH_URL_TEMPLATE = 'https://dropshipping.tangbuy.com/en-US/search?keyword=<keyword>&type=text';

/** 非货源检索：建站/平台/支付/广告工具等，禁止作为 Tangbuy 关键词（如单独出现的 Shopify） */
const TANGBUY_NON_SKU_TOKEN_RE =
  /\b(shopify|woocommerce|bigcommerce|magento|squarespace|wix(\s*stores?)?|prestashop|opencart|etsy(\s*seller)?|stripe|paypal|klarna|afterpay|affirm|square\s*payments|mailchimp|klaviyo|hubspot|zendesk|salesforce|google\s*analytics|ga4|gtm|tag\s*manager|facebook\s*ads|meta\s*ads|google\s*ads|tiktok\s*ads|snapchat\s*ads|pinterest\s*ads|linkedin\s*ads|amazon\s*seller|seller\s*central|brand\s*registry|printful|printify|oberlo|dsers|cj\s*dropshipping|canva|notion|slack|zoom|figma|webflow|framer|vercel|netlify|cloudflare)\b/i;

/**
 * 整段关键词是否为「平台/工具词」或仅由这类词构成（避免 Shopify、独立站建站等进货源搜索）。
 */
export function isNonProductTangbuySearchToken(raw) {
  const t = String(raw || '').trim();
  if (!t) return true;
  const low = t.toLowerCase().replace(/\s+/g, ' ').trim();
  if (TANGBUY_NON_SKU_TOKEN_RE.test(low)) return true;
  const words = low.split(/\s+/).filter(Boolean);
  const platformSingle = new Set([
    'shopify',
    'woocommerce',
    'squarespace',
    'wix',
    'magento',
    'prestashop',
    'stripe',
    'paypal',
    'klaviyo',
    'mailchimp',
    'hubspot',
    'zendesk',
    'oberlo',
    'etsy',
    'canva',
    'notion',
    'slack',
    'figma',
    'webflow',
  ]);
  if (words.length === 1 && platformSingle.has(words[0])) return true;
  return false;
}

/** 用户话 + 助手前段：明显在讲开店/后台/支付/建站，且尚未出现可落地品类/款名 */
function tangbuyStoreOpsWithoutConcreteSku(userText, aiText) {
  const u = String(userText || '').trim();
  const aHead = String(aiText || '').slice(0, 1800);
  const blob = `${u}\n${aHead}`;
  const storeOpsHeavy =
    /(开通店铺|开店流程|开店步骤|注册店铺|店铺审核|怎么开.*店|如何开.*店|独立站\s*建站|建站教程|shopify|woocommerce|seller\s*central|收款绑定|支付方式|paypal\s*账户|stripe\s*账户|域名解析|绑定域名|主题\s*(模板|装修)|结账页|checkout\s*设置|结账\s*设置|运费\s*设置|物流\s*模板)/i.test(
      blob,
    );
  if (!storeOpsHeavy) return false;
  return !queryHasConcreteProductIntent(u) && !queryHasConcreteProductIntent(aHead);
}

function filterAttachableTangbuyKeywords(kws) {
  return (Array.isArray(kws) ? kws : []).filter(
    (k) =>
      isMeaningfulTangbuyKeyword(k) &&
      !isNonProductTangbuySearchToken(k) &&
      (isLikelyProductKeyword(k) || isLikelyEnglishCommercePhrase(k)),
  );
}

/** Tangbuy Dropshipping 文本搜索（与知识库约定一致） */
export function buildTangbuyDropshippingSearchUrl(keyword) {
  const q = String(keyword ?? '').trim();
  return `https://dropshipping.tangbuy.com/en-US/search?keyword=${encodeURIComponent(q)}&type=text`;
}

/**
 * 趋势/榜单：优先 JSON 英文类目，否则取「类目」路径最后一段并尝试中译英，再生成搜索链接
 */
export function tangbuySearchUrlForTrendCategory(product) {
  const p = product || {};
  const explicit = String(p.categorySearchEn || '').trim();
  if (explicit) return buildTangbuyDropshippingSearchUrl(explicit);
  const cn = String(p.categoryCn || '');
  const segments = cn.split(/[/|>／]/).map((s) => s.trim()).filter(Boolean);
  const leafCn = segments[segments.length - 1] || cn;
  const en = translateZhToEn(leafCn).join(' ').trim();
  const kw = en || String(p.categoryEn || '').trim() || leafCn;
  return buildTangbuyDropshippingSearchUrl(kw);
}

/**
 * 聊天横排「Picks」：有 tangbuy 商品链接则直达；否则用商品标题优先、再类目关键词做 Dropshipping 搜索
 */
export function pickViewHrefForChatPicks(product) {
  const p = product || {};
  const tb = String(p.tangbuyUrl || '').trim();
  if (tb && /^https?:\/\//i.test(tb)) return tb;
  const name = String(p.name || '').trim();
  if (name.length >= 2) {
    const q = name.length > 180 ? `${name.slice(0, 180)}…` : name;
    return buildTangbuyDropshippingSearchUrl(q);
  }
  const fromCat = tangbuySearchUrlForTrendCategory(p);
  if (fromCat) return fromCat;
  const u = String(p.url || '').trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return buildTangbuyDropshippingSearchUrl('sourcing');
}

/** 闲聊/指令碎片，不可作为货源搜索词 */
const JUNK_SEARCH_PHRASES_ZH = [
  '分析一下', '分析', '好的', '请提供', '请', '是否需要', '是否', '可以选择', '选择', '以下', '如下', '信息',
  '链接', '网址', '总结', '首先', '其次', '另外', '建议', '注意', '说明', '你好', '您好', '用户', '可以',
  '如果', '那么', '因为', '所以', '例如', '比如', '方面', '问题', '回答', '内容', '步骤', '第', '章',
];
const JUNK_EXACT_ZH = new Set([
  '信息', '链接', '分析', '好的', '可以', '选择', '以下', '建议', '用户', '内容', '步骤', '方面', '问题',
]);
const JUNK_EXACT_EN = new Set([
  'pdp', 'copywriting', 'seo', 'meta', 'title', 'description', 'url', 'snapshot', 'keyword', 'keywords',
  'product', 'products', 'category', 'categories', 'trend', 'trending',
]);
const EN_PRODUCT_NOUN_WHITELIST =
  /\b(jeans?|pants?|joggers?|shorts?|dress(?:es)?|hood(?:ie|ies)|tee|tees|tops?|shirt(?:s)?|blouse(?:s)?|skirt(?:s)?|sneakers?|shoes?|boots?|sandals?|bag|bags|backpack(?:s)?|crossbody|wallet(?:s)?|belt(?:s)?|hat(?:s)?|cap(?:s)?|scarf(?:s)?|socks?|earbuds?|headphones?|charger(?:s)?|cable(?:s)?|phone\s*case|case(?:s)?|watch(?:es)?|tracker(?:s)?|lamp(?:s)?|light(?:s)?|organizer(?:s)?|storage|tent(?:s)?|sleeping\s*bag|mat(?:s)?|bottle(?:s)?|cup(?:s)?|kettle(?:s)?|pump(?:s)?|pad(?:s)?|underpad(?:s)?|sanitary\s*pads?|peri\s*bottle|nursing\s*pads?|belly\s*band|kit(?:s)?)\b/i;

function isJunkSearchKeyword(s) {
  const t = String(s || '').trim();
  if (t.length < 3 || t.length > 64) return true;
  if (/\n|https?:\/\/|[|]/i.test(t)) return true;
  if (/[*`]/.test(t)) return true;
  if (/^[()\[\]{}]+$/.test(t)) return true;
  if (/[()]/.test(t) && (t.includes('(') !== t.includes(')'))) return true;
  if (/[\\/]/.test(t) && !/\b[a-z]+\s*\/\s*[a-z]+\b/i.test(t)) return true;
  if (/[:：]/.test(t) && t.length > 10) return true;
  if (/\d{4}/.test(t)) return true;
  if (JUNK_EXACT_ZH.has(t)) return true;
  if (JUNK_EXACT_EN.has(t.toLowerCase())) return true;
  if (/^(pdp|copywriting|seo|meta|title|description)(?:\s*[/\\]\s*(pdp|copywriting|seo|meta|title|description))*$/i.test(t)) return true;
  for (const j of JUNK_SEARCH_PHRASES_ZH) {
    if (t === j || t.startsWith(j + '，') || t.startsWith(j + '。')) return true;
  }
  if (/^(请|如果|是否|可以|需要|能否)/.test(t) && t.length < 12) return true;
  if (/市场|规模|增长|竞争|时效|物流|成本|分析|建议|方向|差异化|用户|结论/.test(t) && t.length >= 8) return true;
  return false;
}

/**
 * 仅允许可理解为真实商品/品类的关键词：
 * - 必须包含中英文文字（纯符号/纯数字区间/比例无效）
 * - 过滤 markdown 碎片与运营数字片段（###、2-3、30%-50%）
 */
function isMeaningfulTangbuyKeyword(raw) {
  const t = String(raw || '').trim();
  if (!t || t.length < 3 || t.length > 80) return false;
  if (/\n|https?:\/\//i.test(t)) return false;
  if (/^[\d\s.,%+\-_/\\#*()~–—]+$/.test(t)) return false;
  if (/^(?:#{1,}|[-_/\\~–—]+)$/.test(t)) return false;
  if (/^\d+\s*[-~–—]\s*\d+$/.test(t)) return false;
  if (/^\d+(?:\.\d+)?\s*%\s*[-~–—]\s*\d+(?:\.\d+)?\s*%$/.test(t)) return false;
  if (!/[a-z\u4e00-\u9fff]/i.test(t)) return false;
  return true;
}

/** 分析/策略类用语：含此类片段时不做「货品特征字」宽松放行，避免「分析工具箱」等误过 */
const ZH_KEYWORD_ANALYSIS_HINT = /分析|报告|建议|策略|市场研究|用户画像|竞争格局|结论|概述|摘要|差异化|转化率|市场规模|行业趋势|投放策略/;

/**
 * 中文串里出现常见货品相关字/词，可作为长尾品类兜底（与 extract 列表行启发式对齐思路）
 */
const ZH_PRODUCTISH_HINT =
  /(?:牛仔裤|连衣裙|半身裙|阔腿裤|直筒裤|休闲裤|运动裤|短裤|T恤|卫衣|开衫|外套|羽绒服|棉服|大衣|风衣|手机壳|数据线|充电器|充电宝|行车记录仪|空气炸锅|瑜伽垫|筋膜枪|猫爬架|露营帐篷|露营灯|婴儿推车|收纳箱|假睫毛|卫生巾|产褥垫|哺乳枕|月子服|保温杯|剃须刀|榨汁机|电煮锅|键盘|鼠标|置物架|挂钩|贴纸|瑜伽服|运动内衣)|裤|裙|鞋|包|壳|表|灯|膜|口红|面膜|眼影|耳机|背包|斜挎包|台灯|收纳|帐篷|天幕|睡袋|哑铃|弹力带|狗窝|乳胶枕|香薰机|加湿器|美甲灯|拼图|积木|跳绳|护膝|牵引绳|蒸汽眼罩|泡脚桶|洁面仪|行李箱|托特包|腰包|手套|袜子|帽子|围巾|皮带|钱包|雨伞|水杯|喷雾|乳垫|内裤|文胸|奶瓶|吸奶器|收腹带|骨盆带|刀纸|肚脐贴|暖宫贴|冲洗器|锅|杯|刀|架|壶|盆|窝|绳|铃|砂|轮|蓬|杖|笼|铲|勺|碗|盘|毯|帘|袜|秤|枪|罩|圈|霜|膏|液|粉|笔|本|箱|盒|帐|篷|幕|袋|炊|营|链|戒|镯|环|钉|贴|垫|巾|器|套装|带|枕|泵/;

function isLikelyProductKeyword(raw) {
  const t = String(raw || '').trim();
  if (!t || isJunkSearchKeyword(t)) return false;
  if (/[，。！？,.]/.test(t) && t.length > 10) return false;
  /**
   * 过滤「长定语 + 的 + 品类尾」类分析/营销句，保留「高腰的牛仔裤」「高腰修身显瘦的牛仔裤」等短至中等修饰。
   * - 连续 ≥12 个汉字 + 的 + 汉字：一律视为过长定语；
   * - 连续 ≥5 个汉字 + 的 + 汉字：仅当整串含跨境/平台/表现等营销分析用语时再过滤。
   */
  if (/[\u4e00-\u9fff]{12,}的[\u4e00-\u9fff]/.test(t)) return false;
  if (
    /[\u4e00-\u9fff]{5,}的[\u4e00-\u9fff]/.test(t) &&
    /跨境|电商平台|平台表现|市场表现|用户增长|市场规模|竞争格局|物流成本|差异化|转化率|行业趋势|爆款|增速|渗透率|建议关注|分析报告|结论认为/.test(t)
  ) {
    return false;
  }
  const maxLen = /[\u4e00-\u9fff]/.test(t) ? 24 : 42;
  if (t.length > maxLen) return false;
  if (TANGBUY_ZH_EN_PRODUCT_PHRASES.some(([zh]) => t === zh || t.includes(zh))) return true;
  const careNiche =
    /(产后护理套装|产妇卫生巾|产褥垫|暖宫贴|私处冲洗|会阴冲洗|一次性产褥|一次性内裤|防溢乳|骨盆带|束腹带|刀纸|计量卫生巾|产后护理|产妇护理|产后|产妇|护理垫|吸奶器|收腹带|妊娠纹|月子|哺乳|母婴|孕妇|哺乳枕|月子服|冲洗器|卫生巾|肚脐贴|乳垫|套装|postpartum|maternity|breast pump|breastfeeding|nursing pads?|belly band|nipple cream|nipple balm|uterus warming|peri bottle|underpad)/i;
  if (careNiche.test(t)) return true;
  const mainstreamSku =
    /(瑜伽垫|筋膜枪|猫爬架|猫砂盆|空气炸锅|行车记录仪|露营帐篷|露营睡袋|露营灯|露营推车|折叠露营车|防潮垫|户外炊具|天幕|睡袋|充电宝|卷发棒|哑铃|弹力带|婴儿推车|狗窝|收纳箱|乳胶枕|香薰机|加湿器|美甲灯|拼图|积木|筋膜球|跳绳|护膝|宠物喂食|牵引绳|车载支架|平板支架|鼠标垫|筋膜贴|蒸汽眼罩|泡脚桶|洁面仪|剃须刀|榨汁机|破壁机|电煮锅|保温杯|咖啡杯|行李箱|托特包|腰包)/;
  if (mainstreamSku.test(t)) return true;
  const zhCat =
    /(牛仔裤|休闲裤|运动裤|短裤|阔腿裤|直筒裤|连衣裙|半身裙|T恤|卫衣|开衫|外套|羽绒服|棉服|大衣|风衣|手机壳|耳机|背包|斜挎包|台灯|收纳|口红|面膜|眼影|假睫毛|瑜伽垫|筋膜枪|猫爬架|空气炸锅|露营灯|充电宝|数据线|充电器|快充|手机支架|平板支架|智能手表|手环|挂件|贴纸|手套|袜子|帽子|围巾|皮带|钱包|雨伞|水杯|键盘|鼠标)$/;
  const enCat =
    /\b(jeans|joggers|shorts|dress|hoodies?|sneakers|earbuds|backpack|phone case|tee|tees|tops?|bags?|pants|cargo|crossbody|graphic|charger|cable|smartwatch|trackers?|stickers?|umbrella|wallet|scarf|beanie|mittens?)\b/i;
  if (zhCat.test(t)) return true;
  if (enCat.test(t)) return true;
  if (ZH_PRODUCTISH_HINT.test(t) && !ZH_KEYWORD_ANALYSIS_HINT.test(t)) return true;
  return false;
}

function toEnglishTangbuyKeyword(raw) {
  const src = String(raw || '').trim();
  if (!src) return '';
  let s = src;
  for (const [zh, en] of TANGBUY_ZH_EN_PRODUCT_PHRASES) {
    if (s.includes(zh)) s = s.split(zh).join(` ${en} `);
  }

  s = s
    .replace(/高腰/g, 'high waist ')
    .replace(/低腰/g, 'low waist ')
    .replace(/破洞/g, 'ripped ')
    .replace(/直筒/g, 'straight ')
    .replace(/阔腿/g, 'wide leg ')
    .replace(/紧身/g, 'skinny ')
    .replace(/宽松/g, 'loose fit ');

  if (/[\u4e00-\u9fff]/.test(s)) {
    const translated = translateZhToEn(s)
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((tok) => !ACADEMIC_JUNK_SEARCH_TOKENS.has(tok.toLowerCase()))
      .join(' ');
    s = `${s} ${translated}`;
  }

  s = s
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const parts = [...new Set(s.split(/\s+/).filter(Boolean))].filter(
    (tok) => !ACADEMIC_JUNK_SEARCH_TOKENS.has(tok),
  );
  s = parts.join(' ');

  if (!s || s.length < 3) return '';
  return s.slice(0, 80);
}

/** 展示用英文标题大小写（与 Tangbuy 英文搜索一致，避免中英混排） */
function formatTangbuySearchLabel(enKeyword) {
  const s = String(enKeyword || '')
    .trim()
    .toLowerCase()
    .replace(/[*`()[\]{}]/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function passesTangbuyKeywordWhitelist(enKeyword) {
  const s = String(enKeyword || '').trim().toLowerCase();
  if (!s || s.length < 3) return false;
  if (JUNK_EXACT_EN.has(s)) return false;
  // Strong guard: only allow terms that look like concrete product/category nouns.
  if (!EN_PRODUCT_NOUN_WHITELIST.test(s)) return false;
  return true;
}

export function isTangbuySearchPickHrefValid(href) {
  try {
    const u = new URL(String(href || ''));
    const kw = u.searchParams.get('keyword');
    return !!(kw && String(kw).trim().length >= 3);
  } catch {
    return false;
  }
}

/**
 * 从 AI / 用户话术中抽取「像商品/款式」的搜索词（不整段分词，避免「好的请提供」等）。
 */
export function extractProductKeywordsForTangbuy(aiText, userText = '') {
  const raw = String(aiText || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const u = String(userText || '').replace(/https?:\/\/[^\s]+/g, ' ');
  const blob = `${u}\n${raw}`;

  const out = [];
  let hasEnglishPhrase = false;
  const push = (s) => {
    const x = String(s || '').trim().replace(/[：:，,。.!！?？、]+$/g, '');
    if (isNonProductTangbuySearchToken(x)) return;
    if (!isLikelyProductKeyword(x)) return;
    const low = x.toLowerCase();
    if (out.some((e) => e.toLowerCase() === low)) return;
    out.push(x);
  };

  // 中文：修饰词 + 品类（高腰牛仔裤、破洞牛仔…）
  const zhClass =
    /([\u4e00-\u9fff\d\w·]{0,10})(牛仔裤|休闲裤|运动裤|短裤|阔腿裤|直筒裤|连衣裙|半身裙|T恤|卫衣|开衫|外套|羽绒服|棉服|大衣|风衣|手机壳|耳机|背包|斜挎包|台灯|收纳|口红|面膜|眼影|假睫毛|瑜伽垫|筋膜枪|猫爬架|空气炸锅|露营帐篷|行车记录仪|充电宝|婴儿推车|狗窝|收纳箱|哑铃|弹力带)/g;
  let m;
  while ((m = zhClass.exec(blob)) !== null) {
    const phrase = `${m[1] || ''}${m[2]}`.trim();
    if (phrase.length >= 3) push(phrase);
  }

  const zhCare = /(产后护理套装|产妇卫生巾|一次性产褥垫|一次性产坛垫|私处冲洗器|会阴冲洗器|暖宫贴|防溢乳垫|计量卫生巾|产后护理|产妇护理|产褥垫|产坛垫|护理垫|吸奶器|收腹带|哺乳内衣|哺乳枕|月子服|妊娠纹霜|骨盆带|束腹带|刀纸|肚脐贴)/g;
  while ((m = zhCare.exec(blob)) !== null) {
    push(m[0].trim());
  }

  const zhCamping = /(露营睡袋|四季睡袋|露营推车|折叠露营车|露营灯|便携式露营灯|防潮垫|户外炊具套装|户外炊具|露营炊具|露营帐篷|天幕|野餐垫|登山杖|户外折叠椅)/g;
  while ((m = zhCamping.exec(blob)) !== null) {
    push(m[0].trim());
  }

  for (const [zh] of TANGBUY_ZH_EN_PRODUCT_PHRASES) {
    if (blob.includes(zh)) push(zh);
  }

  // 列表行：- 破洞牛仔裤 / 1. 暖宫贴 / 2. 产妇卫生巾
  for (const line of blob.split(/\n+/)) {
    const cleaned = line.replace(/^[\s*\-•\d.、]+/, '').trim();
    if (
      cleaned.length >= 3 &&
      cleaned.length <= 28 &&
      /裤|裙|鞋|包|壳|表|灯|膜|红|衫|衣|帽|贴|垫|巾|器|套装|喷雾|带|枕|乳垫|内裤|文胸|奶瓶|泵|卫生巾|冲洗|产褥|暖宫|月子|哺乳|收腹|骨盆|刀纸|锅|杯|刀|架|壶|盆|窝|绳|铃|砂|轮|蓬|杖|笼|铲|勺|碗|盘|毯|帘|袜|秤|枪|罩|圈|霜|膏|液|粉|笔|本|箱|盒|帐|篷|幕|袋|炊|营/.test(
        cleaned,
      ) &&
      !/[|:：]/.test(cleaned) &&
      (cleaned.length <= 14 || !/[，。！？,.]/.test(cleaned))
    ) {
      push(cleaned);
    }
  }

  // 英文常见品类词
  // Prefer full phrase from AI conclusion, e.g. "low-rise cargo jeans", "crossbody bag", "vintage tee".
  const enPhrase =
    /\b([a-z0-9][a-z0-9-]{0,22}(?:\s+[a-z0-9][a-z0-9-]{0,22}){0,5}\s+(?:jeans|joggers|shorts|dress|hoodies?|sneakers|earbuds|backpack|phone case|tee|tees|tops?|bags?|pants|cargo))\b/gi;
  while ((m = enPhrase.exec(blob)) !== null) {
    const phrase = m[1].trim();
    if (phrase.split(/\s+/).length >= 2) {
      hasEnglishPhrase = true;
      push(phrase);
    }
  }

  const en = /\b(high[- ]waist|ripped|distressed|skinny|wide[- ]leg|baggy|y2k)\s+(jeans|joggers|shorts|pants)\b/gi;
  while ((m = en.exec(blob)) !== null) {
    hasEnglishPhrase = true;
    push(m[0].trim());
  }

  const enBag = /\b(crossbody|shoulder|messenger|mini)\s+(bag|bags)\b/gi;
  while ((m = enBag.exec(blob)) !== null) {
    hasEnglishPhrase = true;
    push(m[0].trim());
  }

  const enCare =
    /\b(postpartum|maternity)\s+(?:care kit|belly band|belt|pads?|underpads?|recovery kit|sanitary pads?)\b|\b(breast pump|nursing pads?|nursing bra|disposable underpads?|peri bottle|uterus warming patch|nipple cream)\b/gi;
  while ((m = enCare.exec(blob)) !== null) {
    hasEnglishPhrase = true;
    push(m[0].trim());
  }

  const enMainstream =
    /\b(air\s*fryer|yoga\s*mat|cat\s*tree|dash\s*cam|sleeping\s*bag|camping\s*tent|massage\s*gun|resistance\s*band|power\s*bank|wireless\s*earbuds|phone\s*holder|car\s*phone\s*mount|pet\s*feeder|dog\s*bed|makeup\s*brush|essential\s*oil\s*diffuser|robot\s*vacuum)\b/gi;
  while ((m = enMainstream.exec(blob)) !== null) {
    hasEnglishPhrase = true;
    push(m[0].trim());
  }

  // "Oversized Hoodie + Vintage Tee：…" — English bullets often omit Chinese 裤/衣 markers; split + / /
  for (const line of blob.split(/\n+/)) {
    const cleaned = line.replace(/^[\s*\-•\d.、]+/, '').trim();
    if (!cleaned) continue;
    const headline = cleaned.split(/[：:]/)[0].trim();
    if (headline.length < 5 || headline.length > 120) continue;
    if (!/[+＋／/]|(?:\s&\s)/.test(headline)) continue;
    const chunks = headline.split(/\s*\+\s*|\s*\/\s*|\s*／\s*|(?:\s&\s)/);
    if (chunks.length < 2) continue;
    for (const chunk of chunks) {
      const c = chunk.trim().replace(/^[（(]|[）)]$/g, '').trim();
      if (c.length >= 3) push(c);
    }
  }

  const en2 = /\b(jeans|sneakers|hoodie|dress|earbuds|backpack|phone case)\b/gi;
  // Only fall back to generic category word if we did not capture a full phrase.
  if (!hasEnglishPhrase) {
    while ((m = en2.exec(blob)) !== null) push(m[0].trim());
  }

  return out.slice(0, 12);
}

const INFER_EN_AUDIENCE_ONLY = new Set([
  'women',
  'woman',
  'female',
  'male',
  'man',
  'men',
  'girl',
  'girls',
  'boy',
  'boys',
  'lady',
  'ladies',
]);

function inferTangbuyKeywordFromUserNeed(userText) {
  const u = String(userText || '')
    .trim()
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .slice(0, 200);
  if (!u || !queryHasConcreteProductIntent(u)) return '';
  for (const [zh, en] of TANGBUY_ZH_EN_PRODUCT_PHRASES) {
    if (u.includes(zh)) return en;
  }
  const en = toEnglishTangbuyKeyword(u);
  if (!en || en.length < 5) return '';
  if (isNonProductTangbuySearchToken(en)) return '';
  const parts = en.split(/\s+/).filter(Boolean);
  if (parts.length > 0 && parts.every((p) => INFER_EN_AUDIENCE_ONLY.has(p))) return '';
  return en;
}

/**
 * 与 extractProductKeywordsForTangbuy 相同；抽不到时按**主流行业**给默认英文 SKU 词，再退回用户句推断。
 */
export function extractTangbuyKeywordsWithInference(aiText, userText = '') {
  const fromModel = extractProductKeywordsForTangbuy(aiText, userText);
  if (fromModel.length) return fromModel;
  if (tangbuyStoreOpsWithoutConcreteSku(userText, aiText)) {
    const inferred = inferTangbuyKeywordFromUserNeed(userText);
    return inferred ? [inferred] : [];
  }
  const blob0 = `${userText}\n${aiText}`.slice(0, 2000);
  const industryDefaults = getIndustryDefaultEnglishKeywords(blob0);
  if (industryDefaults?.length) return industryDefaults;
  const inferred = inferTangbuyKeywordFromUserNeed(userText);
  return inferred ? [inferred] : [];
}

/**
 * 是否应在回复后展示 Tangbuy 搜索：
 * - 过滤后仍有可上架的货源关键词（排除 Shopify 等平台词）；
 * - 且满足其一：用户显式要推荐 **或** 命中「趋势/品类市场展望」且**非**纯开店/后台讨论（无具体品类时不再附带）。
 */
export function shouldAttachTangbuySearchPicks({
  userWantsProductRecommendations,
  userText = '',
  aiText = '',
  extractedKeywords,
}) {
  const attachable = filterAttachableTangbuyKeywords(extractedKeywords);
  if (attachable.length < 1) return false;
  if (userWantsProductRecommendations) return true;
  if (tangbuyStoreOpsWithoutConcreteSku(userText, aiText)) return false;
  return shouldAttachTangbuyHotFromModelTrendAnalysis(userText, aiText);
}

/** 去掉模型在正文里自造的「### 📦 Tangbuy」空壳标题（避免与下方真实 search_picks 重复或只显示标题无链接）。 */
export function stripHallucinatedTangbuyMarkdownBlock(text) {
  let t = String(text || '');
  t = t.replace(
    /\n{0,2}#{1,3}\s*[^\n]*[Tt]angbuy[^\n]*\s*\n+(?:(?:[ \t]*[^\n#][^\n]*\n)+|[ \t]*\n+)/gi,
    '\n\n',
  );
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

/** 英文行业默认词、模型输出的英文品类短语：不必过中文 isLikelyProductKeyword。 */
function isLikelyEnglishCommercePhrase(k) {
  const t = String(k || '').trim();
  if (isNonProductTangbuySearchToken(t)) return false;
  if (t.length < 5 || t.length > 80) return false;
  if (!/^[a-z0-9][a-z0-9\s\-'.]+$/i.test(t)) return false;
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.some((w) => w.length > 28)) return false;
  if (words.length >= 2) return true;
  return words.length === 1 && words[0].length >= 6;
}

/**
 * 由已过滤的关键词生成 Tangbuy 搜索项；**label 与 href 均基于英文搜索词**，避免中英混排；条数 ≤ max，不凑数。
 */
export function buildTangbuySearchPicksFromKeywords(keywords, _uiLang = 'zh', max = 8) {
  const cap = Math.min(12, Math.max(1, Number(max) || 8));
  const list = filterAttachableTangbuyKeywords(keywords);
  const out = [];
  const seen = new Set();
  for (const keyword of list) {
    const enKeyword = toEnglishTangbuyKeyword(keyword);
    if (
      !enKeyword ||
      !isMeaningfulTangbuyKeyword(enKeyword) ||
      !passesTangbuyKeywordWhitelist(enKeyword) ||
      isNonProductTangbuySearchToken(enKeyword) ||
      seen.has(enKeyword)
    ) continue;
    seen.add(enKeyword);
    const href = buildTangbuyDropshippingSearchUrl(enKeyword);
    if (!isTangbuySearchPickHrefValid(href)) continue;
    out.push({
      label: formatTangbuySearchLabel(enKeyword),
      keyword: enKeyword,
      href,
    });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * 从对话上下文生成 Tangbuy 搜索（优先种子商品名 + 抽取的商品词，**不再**对全文随意分词）。
 */
export function buildTangbuySearchPicksFromContext(opts = {}) {
  const {
    userText = '',
    aiText = '',
    seedNames = [],
    uiLang = 'zh',
    max = 5,
  } = opts;

  const fromSeeds = (Array.isArray(seedNames) ? seedNames : [])
    .map((s) => String(s || '').trim())
    .filter((s) => s.length >= 3 && !isJunkSearchKeyword(s) && !isNonProductTangbuySearchToken(s));

  const extracted = extractTangbuyKeywordsWithInference(aiText, userText);
  const merged = [];
  const seen = new Set();
  for (const x of [...fromSeeds, ...extracted]) {
    const low = x.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    merged.push(x);
  }

  return buildTangbuySearchPicksFromKeywords(merged, uiLang, max);
}

const KB_FILES = {
  zh: 'knowledgeBase_CN.json',
  en: 'knowledgeBase_EN.json',
  es: 'knowledgeBase_ES.json',
  fr: 'knowledgeBase_FR.json',
};

/** 加载完成后写入；未加载前为 null */
export const KNOWLEDGE_BASES = { zh: null, en: null, es: null, fr: null };

export const KNOWLEDGE_INDEX = { zh: [], en: [], es: [], fr: [] };

let knowledgeBasesLoadPromise = null;

export function parseKnowledgeBase(raw, lang) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error(`[knowledge-base] failed to parse ${lang}:`, e);
    return null;
  }
}

/** 与商品目录相同：先 `data/*.json`，再 GitHub Raw（`tryFetchJson`） */
export function ensureKnowledgeBasesLoaded() {
  if (knowledgeBasesLoadPromise) return knowledgeBasesLoadPromise;
  knowledgeBasesLoadPromise = (async () => {
    const langs = Object.keys(KB_FILES);
    await Promise.all(
      langs.map(async (lang) => {
        const file = KB_FILES[lang];
        const raw = await tryFetchJson([`data/${file}`, `./data/${file}`]);
        const base =
          raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
        KNOWLEDGE_BASES[lang] = base;
        KNOWLEDGE_INDEX[lang] = flattenKnowledgeQa(base || {});
      })
    );
  })();
  return knowledgeBasesLoadPromise;
}

export const TANGBUY_GUIDANCE = {
  zh: `

【Tangbuy Agent 定位】
你是 Tangbuy Dropshipping 的增长与供应链 Agent。
- 你既要保留独立站/产品/趋势分析能力，也要在合适时机调用 Tangbuy 的业务知识来回答咨询。
- 当用户询问 Tangbuy、Dropshipping、业务模式、服务、品牌、物流、采购、履约、仓储、定制、质检、运输、从哪里买、如何发货、如何找供应商、如何通过供应链提升利润等问题时，优先结合 Tangbuy 知识库作答。
- 当用户在做店铺/产品/趋势/选品分析后，若问题自然延伸到采购、代发、履约、物流、库存、品牌化、打样、包装、定制、时效、售后、B2B 合作等，就主动衔接到 Tangbuy 可提供的相关服务，但不要生硬推销。
- 在分析类回答里，自然补充"如何借助 Tangbuy 落地"的建议，帮助用户从分析走向执行。
- 不能编造 Tangbuy 不存在的能力、政策、报价或承诺；若知识库没有明确说明，只能给出谨慎表述。
- 目标用户主要是欧美品牌与卖家。禁止输出中国本地用户才容易理解的"产业带/档口/某省某市货源地/义乌/广州/深圳/杭州/温州/泉州/佛山/东莞"等城市或地域型采购建议，除非用户明确要求了解中国供应链地域信息。
- 禁止建议用户去 1688、淘宝、拼多多、阿里巴巴国内站或任何中国电商平台自行采购、选品、找货。
- 只要用户在问选品建议、采购建议、货源建议、供应链承接、履约方案、从哪里进货，就优先推荐 Tangbuy Dropshipping，并自然说明 Tangbuy 可以帮助用户与中国工厂洽谈、做采购与质检，并提供运输与履约服务。
- 若回答里涉及商品推荐、选品方向或供应链方案，优先给出 Tangbuy Dropshipping 的产品池链接或相关知识库链接，不要把中国电商平台链接当作主建议。
- 【重要】生成 Tangbuy 产品池链接时，必须使用 search 格式：https://dropshipping.tangbuy.com/en-US/search?keyword=xxx&type=text，禁止使用 collection/xxx 格式。其中 xxx 必须为英文关键词（如果用户查询是非英语词汇，必须先翻译成英语再填入链接）。
- 【重要】关于“是否有美国仓/欧洲仓”等仓储信息：仅当用户明确询问仓库布局、发货地、时效风险或欧洲本地仓时再说明。普通选品/增长/合作分析中不要主动先强调该限制，也不要用负面措辞放大弱点。无论何时都禁止编造不存在的海外仓或不真实承诺。
- 禁止在常规回复中追加固定提示语（例如 “Note: ships from China / no EU stock”）。除非用户明确问到仓储与时效，否则不要输出此类 note。
- 输出中禁止出现“代码 / 复制代码”之类展示壳文本。普通说明内容不要放在代码块中。
- 外链展示规则：禁止裸露 URL 明文（尤其是 Tangbuy 搜索链接）。统一使用 Markdown 链接形式（例如：[Tangbuy 产品池搜索](https://dropshipping.tangbuy.com/en-US/search?keyword=hair%20dryer%20diffuser&type=text)）。

【币种规范】
- 中文回复统一使用 **¥（人民币）**，英文回复统一使用 **$（美元）**，同一回复内禁止混用不同币种符号。
- 若用户明确指定了币种，以用户要求为准。

【联系方式 — 仅限以下四个官方渠道】
- 当用户咨询 Tangbuy 联系方式、客服、客户经理、销售代表，或需要引导用户联系官方（含 VIP 密钥、报价、人工支持等），输出以下四个 **Markdown 可点击链接**（正文里只出现平台名，**禁止**单独粘贴 wa.me、api.whatsapp.com 等链接明文）：
  1. [TikTok](https://www.tiktok.com/@tangbuy_com)
  2. [YouTube](https://www.youtube.com/@TangbuyDropshipping)
  3. [Facebook](https://www.facebook.com/profile.php?id=61579006720346)
  4. [WhatsApp](https://wa.me/message/KSHZRLSWZN5HB1)
- 禁止编造电话号码、邮箱地址或上述以外的任何联系方式。

【支持平台 — 严格限制】
- Tangbuy 目前仅支持 **Shopify** 和 **WooCommerce** 两个电商平台的官方对接。
- 用户询问其他平台（如 Magento、BigCommerce、Wix、Squarespace、PrestaShop、OpenCart 等）时，明确告知暂不支持，并推荐使用 Shopify 或 WooCommerce。
- 禁止编造或暗示支持上述两个平台以外的任何平台。

【API 对接 — 禁止话题】
- Tangbuy **不支持** API 对接。禁止建议、推荐或引导用户进行任何 API 集成。
- Tangbuy 是 Shopify App Store 和 WooCommerce 市场的**官方应用**，对接方式是通过应用安装流程，不是 API。
- 用户询问 API 时，明确告知不支持，并引导至官方应用安装方式。
`,
  en: `

[Tangbuy Agent Positioning]
You are a Tangbuy Dropshipping growth and supply-chain agent.
- Keep the existing ecommerce analysis ability, while using Tangbuy business knowledge whenever relevant.
- When the user asks about Tangbuy, dropshipping, services, brand, logistics, sourcing, fulfillment, warehousing, customization, QC, shipping, where to buy, how to source, or how supply chain can improve margins, answer with Tangbuy knowledge first when relevant.
- After store/product/trend analysis, if the discussion naturally extends to sourcing, fulfillment, shipping, inventory, branding, sampling, packaging, customization, delivery time, after-sales, or B2B cooperation, proactively connect the answer to Tangbuy services without sounding pushy.
- In analytical answers, naturally add an execution layer explaining how Tangbuy can help implement the recommendation.
- Never invent Tangbuy capabilities, policies, prices, or guarantees beyond the knowledge base.
- The primary audience is Western brands and ecommerce operators. Do not output China-specific industrial-belt or city-based sourcing advice such as mentioning Yiwu, Guangzhou, Shenzhen, Hangzhou, Wenzhou, Quanzhou, Foshan, Dongguan, wholesale districts, or similar regional references, unless the user explicitly asks for Chinese supply-chain geography.
- Do not recommend 1688, Taobao, Pinduoduo, domestic Alibaba marketplaces, or any China-local ecommerce platform as the user's sourcing or product-selection solution.
- Whenever the user asks for product recommendations, sourcing advice, procurement options, fulfillment plans, or where to buy inventory, default to recommending Tangbuy Dropshipping and explain that Tangbuy can help negotiate with Chinese factories, manage sourcing and QC, and provide shipping and fulfillment support.
- If the answer includes product ideas, sourcing paths, or supply-chain next steps, prioritize linking to the Tangbuy Dropshipping product pool or relevant Tangbuy knowledge-base URLs instead of China-local marketplace links.
- [IMPORTANT] When generating Tangbuy product pool links, you MUST use search format: https://dropshipping.tangbuy.com/en-US/search?keyword=xxx&type=text. NEVER use collection/xxx format. Replace xxx with English keywords only (if the user's query is in non-English language, you MUST translate it to English before inserting into the URL).
- [IMPORTANT] Warehouse/location disclosure should be demand-driven: only mention warehouse layout, ship-from location, or EU-local warehousing constraints when the user explicitly asks about logistics speed, local stock, or delivery risk. In normal analysis/cooperation conversations, do not lead with this limitation or over-emphasize it. Never fabricate overseas warehouses or unrealistic local-delivery promises.
- Do not append a fixed note such as “ships from China / no EU local stock” in regular replies. Only disclose warehouse constraints when explicitly asked.
- Do not output UI wrapper text such as "code / copy code". Explanatory content should not be wrapped as code unless the user asks for code.
- Link rendering rule: never expose long raw URLs in plain text (especially Tangbuy search links). Use Markdown links with descriptive labels (for example: [Tangbuy Product Search](https://dropshipping.tangbuy.com/en-US/search?keyword=hair%20dryer%20diffuser&type=text)).

[Currency — mandatory]
- Chinese replies: default to **¥ (RMB)**. English or other language replies: default to **$ (USD)**.
- Never mix $ / ¥ / ¥(JPY) in the same response. If the user specifies a currency, follow that.

[Contact & customer service — Tangbuy official channels only]
- When the user asks how to contact Tangbuy, asks for customer service, a sales rep, any contact info—or whenever you recommend human follow-up (VIP key, quote, support)—present these four **Markdown links only** (visible text = platform name; **never** paste raw wa.me or api.whatsapp.com URLs as plain text):
  1. [TikTok](https://www.tiktok.com/@tangbuy_com)
  2. [YouTube](https://www.youtube.com/@TangbuyDropshipping)
  3. [Facebook](https://www.facebook.com/profile.php?id=61579006720346)
  4. [WhatsApp](https://wa.me/message/KSHZRLSWZN5HB1)
- Do not fabricate phone numbers, emails, or any other contact methods.

[Supported platforms — strict]
- Tangbuy supports **Shopify** and **WooCommerce** only. No other ecommerce platforms are currently integrated.
- If the user asks about other platforms (Magento, BigCommerce, Wix, Squarespace, PrestaShop, OpenCart, etc.), clearly state they are **not supported** and recommend Shopify or WooCommerce.
- Never fabricate or imply support for any other platform.

[API — prohibited topic]
- Tangbuy does **not** support API integration. Never suggest, recommend, or guide users toward API-based integration.
- Tangbuy is an **official marketplace app** on Shopify App Store and WooCommerce marketplace. Integration is via the app install flow, not APIs.
- If the user asks about API access, clearly state it is unavailable and redirect to the official app.
`,
  es: `

[Posicionamiento del agente Tangbuy]
Eres un agente de crecimiento y cadena de suministro de Tangbuy Dropshipping.
- Mantén la capacidad de análisis ecommerce y usa el conocimiento de negocio de Tangbuy cuando sea pertinente.
- Si el usuario pregunta por Tangbuy, dropshipping, servicios, marca, logística, abastecimiento, fulfillment, almacén, personalización, control de calidad, envío, dónde comprar o cómo abastecerse, responde priorizando el conocimiento de Tangbuy cuando aplique.
- Después de analizar tienda/producto/tendencia, si la conversación se extiende a compra, abastecimiento, envío, inventario, branding, muestreo, empaque, personalización, tiempos de entrega, postventa o cooperación B2B, enlaza de forma natural con los servicios de Tangbuy.
- En respuestas analíticas, añade de forma natural cómo Tangbuy puede ayudar a ejecutar la recomendación.
- No inventes capacidades, políticas, precios ni promesas de Tangbuy fuera de la base de conocimiento.
- La audiencia principal son marcas y operadores ecommerce occidentales. No des recomendaciones de abastecimiento basadas en ciudades o cinturones industriales de China como Yiwu, Guangzhou, Shenzhen, Hangzhou, Wenzhou, Quanzhou, Foshan o Dongguan, salvo que el usuario pida explícitamente geografía de la cadena de suministro china.
- No recomiendes 1688, Taobao, Pinduoduo, marketplaces domésticos de Alibaba ni ninguna plataforma local china como solución de sourcing o selección de productos.
- Cuando el usuario pida recomendaciones de producto, sourcing, compras, fulfillment o dónde abastecerse, prioriza Tangbuy Dropshipping y explica que Tangbuy puede negociar con fábricas chinas, gestionar compras y control de calidad, y ofrecer transporte y fulfillment.
- Si la respuesta incluye ideas de producto o rutas de cadena de suministro, prioriza enlaces al product pool de Tangbuy Dropshipping o a URLs relevantes de Tangbuy en lugar de enlaces a marketplaces locales chinos.
- [IMPORTANTE] Al generar enlaces de búsqueda de Tangbuy, DEBES usar el formato: https://dropshipping.tangbuy.com/en-US/search?keyword=xxx&type=text. NUNCA uses formato /collection/... Reemplaza xxx con palabras clave en inglés solamente (si la consulta del usuario está en otro idioma, DEBES traducirla al inglés antes de insertarla en la URL).
- [IMPORTANTE] La información sobre almacenes y origen de envío debe comunicarse solo cuando el usuario lo pida explícitamente (por ejemplo, al preguntar por almacén local, velocidad logística o riesgo de entrega). En análisis o conversaciones de cooperación normales, no abras la respuesta enfatizando esta limitación ni la sobredimensiones. Nunca inventes almacenes en el extranjero ni promesas irreales de entrega local.
- No añadas una nota fija del tipo “envío desde China / sin stock local en la UE” en respuestas normales. Solo menciona esa limitación cuando el usuario la solicite explícitamente.

[Moneda — obligatorio]
- Respuestas en chino: usar **¥ (RMB)**. Respuestas en inglés u otros idiomas: usar **$ (USD)**.
- Nunca mezcles $ / ¥ / ¥(JPY) en la misma respuesta. Si el usuario especifica una moneda, sigue esa.

[Contacto y atención al cliente — solo canales oficiales de Tangbuy]
- Cuando el usuario pregunte cómo contactar a Tangbuy, pida servicio al cliente, un representante de ventas o cualquier información de contacto (o si recomiendas contacto humano: clave VIP, cotización, soporte), presenta estos cuatro enlaces Markdown (solo el nombre de la plataforma visible; **nunca** pegues la URL cruda de wa.me o api.whatsapp.com):
  1. [TikTok](https://www.tiktok.com/@tangbuy_com)
  2. [YouTube](https://www.youtube.com/@TangbuyDropshipping)
  3. [Facebook](https://www.facebook.com/profile.php?id=61579006720346)
  4. [WhatsApp](https://wa.me/message/KSHZRLSWZN5HB1)
- No inventes números de teléfono, correos electrónicos u otros métodos de contacto.

[Plataformas soportadas — estricto]
- Tangbuy solo soporta **Shopify** y **WooCommerce**. Ninguna otra plataforma ecommerce está integrada actualmente.
- Si el usuario pregunta por otras plataformas (Magento, BigCommerce, Wix, Squarespace, PrestaShop, OpenCart, etc.), indica claramente que **no están soportadas** y recomienda Shopify o WooCommerce.
- Nunca inventes o insinúes soporte para otra plataforma.

[API — tema prohibido]
- Tangbuy **no** soporta integración por API. Nunca sugiera, recomiende ni guíe hacia integración basada en API.
- Tangbuy es una **app oficial** en Shopify App Store y WooCommerce marketplace. La integración es mediante instalación de la app, no APIs.
- Si el usuario pregunta por acceso API, indica claramente que no está disponible y redirige a la app oficial.
`,
  fr: `

[Positionnement de l'agent Tangbuy]
Vous êtes un agent de croissance et de supply chain de Tangbuy Dropshipping.
- Conservez la capacité d'analyse ecommerce existante tout en utilisant les connaissances métier de Tangbuy lorsque c'est pertinent.
- Si l'utilisateur pose des questions sur Tangbuy, le dropshipping, les services, la marque, la logistique, le sourcing, le fulfillment, l'entreposage, la personnalisation, le contrôle qualité, l'expédition, où acheter ou comment s'approvisionner, répondez d'abord avec les connaissances Tangbuy lorsque c'est pertinent.
- Après une analyse de boutique/produit/tendance, si l'échange dérive vers l'achat, le fulfillment, l'expédition, l'inventaire, le branding, l'échantillonnage, l'emballage, la personnalisation, les délais, le SAV ou la coopération B2B, reliez naturellement la réponse aux services Tangbuy.
- Dans les réponses analytiques, ajoutez naturellement comment Tangbuy peut aider à exécuter les recommandations.
- N'inventez jamais de capacités, politiques, prix ou promesses Tangbuy non présents dans la base de connaissances.
- Le public principal est composé de marques et d'opérateurs ecommerce occidentaux. N'utilisez pas de recommandations de sourcing basées sur des villes ou bassins industriels chinois comme Yiwu, Guangzhou, Shenzhen, Hangzhou, Wenzhou, Quanzhou, Foshan ou Dongguan, sauf si l'utilisateur demande explicitement des informations géographiques sur la supply chain chinoise.
- Ne recommandez pas 1688, Taobao, Pinduoduo, les marketplaces Alibaba domestiques, ni aucune plateforme ecommerce locale chinoise comme solution de sourcing ou de sélection produit.
- Dès que l'utilisateur demande des idées produit, des conseils de sourcing, des options d'achat, un plan de fulfillment ou où s'approvisionner, recommandez par défaut Tangbuy Dropshipping et précisez que Tangbuy peut négocier avec des usines chinoises, gérer le sourcing et le contrôle qualité, puis fournir l'expédition et le fulfillment.
- Si la réponse inclut des idées produit ou des étapes supply chain, privilégiez les liens vers le product pool de Tangbuy Dropshipping ou vers des URLs Tangbuy pertinentes plutôt que des liens vers des marketplaces chinoises locales.
- [IMPORTANT] Lors de la génération de liens de recherche Tangbuy, vous DEVEZ utiliser le format : https://dropshipping.tangbuy.com/en-US/search?keyword=xxx&type=text. N'utilisez JAMAIS le format /collection/... Remplacez xxx par des mots-clés en anglais uniquement (si la requête de l'utilisateur est dans une autre langue, vous DEVEZ la traduire en anglais avant de l'insérer dans l'URL).
- [IMPORTANT] Tangbuy n'a PAS d'entrepôts aux États-Unis, en Europe ou en France. Tous les produits expédient depuis la Chine. N'inventez jamais ou n'affirmez pas que Tangbuy dispose d'entrepôts à l'étranger pour une livraison rapide locale aux États-Unis ou en Europe.

[Devise — obligatoire]
- Réponses en chinois : utiliser **¥ (RMB)**. Réponses en anglais ou autres langues : utiliser **$ (USD)**.
- Ne jamais mélanger $ / ¥ / ¥(JPY) dans la même réponse. Si l'utilisateur précise une devise, suivre sa préférence.

[Contact et service client — uniquement les canaux officiels Tangbuy]
- Lorsque l'utilisateur demande comment contacter Tangbuy, le service client, un représentant commercial ou toute information de contact (ou si vous recommandez un contact humain : clé VIP, devis, support), présentez ces quatre liens Markdown (texte visible = nom de la plateforme uniquement ; **ne jamais** coller l'URL brute wa.me ou api.whatsapp.com en clair) :
  1. [TikTok](https://www.tiktok.com/@tangbuy_com)
  2. [YouTube](https://www.youtube.com/@TangbuyDropshipping)
  3. [Facebook](https://www.facebook.com/profile.php?id=61579006720346)
  4. [WhatsApp](https://wa.me/message/KSHZRLSWZN5HB1)
- Ne fabriquez pas de numéros de téléphone, d'adresses e-mail ou d'autres méthodes de contact.

[Plateformes supportées — strict]
- Tangbuy ne supporte que **Shopify** et **WooCommerce**. Aucune autre plateforme ecommerce n'est actuellement intégrée.
- Si l'utilisateur demande d'autres plateformes (Magento, BigCommerce, Wix, Squarespace, PrestaShop, OpenCart, etc.), indiquez clairement qu'elles ne sont **pas supportées** et recommandez Shopify ou WooCommerce.
- Ne fabriquez ou n'insinuez jamais le support d'une autre plateforme.

[API — sujet interdit]
- Tangbuy ne supporte **pas** l'intégration par API. Ne suggérez, recommandez ou guidez jamais vers une intégration basée sur API.
- Tangbuy est une **application officielle** sur le Shopify App Store et le marketplace WooCommerce. L'intégration se fait via le flux d'installation de l'application, pas par API.
- Si l'utilisateur demande un accès API, indiquez clairement que ce n'est pas disponible et redirigez vers l'application officielle.
`,
};

export function normalizeKnowledgeLang(lang) {
  if (!lang) return 'en';
  if (String(lang).startsWith('zh')) return 'zh';
  if (String(lang).startsWith('es')) return 'es';
  if (String(lang).startsWith('fr')) return 'fr';
  return 'en';
}

export function flattenKnowledgeQa(base) {
  const out = [];
  for (const category of base?.categories || []) {
    for (const scene of category?.scenes || []) {
      for (const qa of scene?.qa_pairs || []) {
        out.push({
          category: category?.name || category?.id || '',
          scene: scene?.name || scene?.id || '',
          questionKey: qa?.question_key || '',
          questions: qa?.questions || [],
          tags: qa?.tags || [],
          answer: qa?.answer_template || '',
          fallback: qa?.fallback_value || '',
          searchBlob: [
            category?.name,
            category?.id,
            scene?.name,
            scene?.id,
            qa?.question_key,
            ...(qa?.questions || []),
            ...(qa?.tags || []),
            qa?.answer_template,
            qa?.fallback_value,
          ].filter(Boolean).join(' \n ').toLowerCase(),
        });
      }
    }
  }
  return out;
}

export function getKnowledgeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length >= 2)
    .slice(0, 40);
}

export function shouldInjectTangbuyKnowledge(text, snapshot, activeSkill) {
  const combined = [text, snapshot].filter(Boolean).join(' ').toLowerCase();
  if (!combined) return false;

  if (/(tangbuy|dropshipping|drop shipping|brand accelerator|代发|一件代发|采购|寻源|进货|货源|拿货|从哪里买|从哪买|从哪里进货|哪里进货|找供应商|供应商|供应链|物流|发货|运输|履约|仓储|仓库|质检|包装|定制|贴标|打样|交期|时效|售后|退货|b2b|product pool|sourcing|source from|where to buy|where to source|buy from|supplier|suppliers|procurement|fulfillment|warehouse|warehousing|shipping|delivery|logistics|private label|branding|moq|qc|quality inspection|supply chain)/i.test(combined)) {
    return true;
  }

  if (activeSkill && ['diagnosis', 'seo', 'page', 'product'].includes(activeSkill)) {
    if (/(哪里买|哪里采购|从哪里发货|怎么发货|如何采购|如何履约|怎么找货|怎么找供应商|采购渠道|进货渠道|供货渠道|货源渠道|供应链建议|履约方案|物流方案|运输方案|how to source|where to buy|where to source|how to ship|fulfillment|supplier|supply chain|sourcing plan|procurement plan)/i.test(combined)) {
      return true;
    }
  }

  if (/(选品|产品分析|趋势分析|店铺分析|seo建议|page建议|product analysis|trend analysis|store analysis)/i.test(combined)
    && /(供应链|采购|进货|货源|履约|发货|物流|供应商|supply chain|sourcing|procurement|supplier|fulfillment|shipping)/i.test(combined)) {
    return true;
  }

  return false;
}

export function buildTangbuyKnowledgeContext(lang, text, snapshot, activeSkill) {
  const normalizedLang = normalizeKnowledgeLang(lang);
  const base = KNOWLEDGE_BASES[normalizedLang] || KNOWLEDGE_BASES.en || {};
  const qaList = KNOWLEDGE_INDEX[normalizedLang] || KNOWLEDGE_INDEX.en || [];
  const combined = [text, snapshot].filter(Boolean).join(' ');
  const lowerCombined = combined.toLowerCase();
  const tokens = getKnowledgeTokens(combined);
  const matched = qaList
    .map((item) => {
      let score = 0;
      for (const token of tokens) {
        if (item.searchBlob.includes(token)) score += token.length >= 5 ? 3 : 1;
      }
      if (item.searchBlob.includes('tangbuy') && /tangbuy|dropshipping/i.test(lowerCombined)) score += 6;
      if (item.searchBlob.includes('logistics') && /(物流|发货|运输|shipping|delivery|logistics)/i.test(lowerCombined)) score += 5;
      if (item.searchBlob.includes('sourcing') && /(采购|寻源|供应商|supplier|sourcing|procurement)/i.test(lowerCombined)) score += 5;
      if (item.searchBlob.includes('fulfillment') && /(履约|代发|fulfillment|warehouse|仓储)/i.test(lowerCombined)) score += 5;
      if (item.searchBlob.includes('branding') && /(品牌|branding|private label|定制|贴标)/i.test(lowerCombined)) score += 4;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const promiseText = (base?.five_promises || []).slice(0, 5).map((item) => `- ${item.promise}: ${item.content}`).join('\n');
  const responseLength = base?.conversation_guidelines?.response_length || '';
  const corePrinciplesText = (base?.conversation_guidelines?.core_principles || []).map((item) => `- ${item}`).join('\n');
  const proactiveSuggestionsText = (base?.conversation_guidelines?.proactive_suggestions || [])
    .map((item) => `- ${item.trigger_intent}: ${item.suggestion}`)
    .join('\n');
  const serviceReminderText = (base?.conversation_guidelines?.service_commitments_reminder || []).map((item) => `- ${item}`).join('\n');
  const unknownFallback = base?.global_fallbacks?.unknown_question || '';
  const escalateFallback = base?.global_fallbacks?.escalate_to_human || '';
  const logisticsText = base?.logistics_config ? [
    base.logistics_config.processing_time && `- Processing: ${base.logistics_config.processing_time}`,
    base.logistics_config.delivery_time_eu_us && `- Delivery: ${base.logistics_config.delivery_time_eu_us}`,
    base.logistics_config.carrier_count && `- Carriers: ${base.logistics_config.carrier_count}`,
  ].filter(Boolean).join('\n') : '';
  const pricingText = base?.pricing_config ? [
    base.pricing_config.base_fee && `- Base fee: ${base.pricing_config.base_fee}`,
    base.pricing_config.procurement_fee && `- Procurement: ${base.pricing_config.procurement_fee}`,
    base.pricing_config.warehouse_policy && `- Warehouse: ${base.pricing_config.warehouse_policy}`,
    base.pricing_config.customization_fee && `- Customization: ${base.pricing_config.customization_fee}`,
  ].filter(Boolean).join('\n') : '';

  const matchedText = matched.map((item, index) => {
    const qs = item.questions.slice(0, 2).join(' / ');
    return `${index + 1}. [${item.category} > ${item.scene}]\n- Questions: ${qs}\n- Answer: ${item.answer}${item.fallback ? `\n- Link: ${item.fallback}` : ''}`;
  }).join('\n');

  const steering = normalizedLang === 'zh'
    ? `- 如果用户在做店铺、产品、趋势或 SEO 分析后，问题延伸到采购、发货、履约、仓储、定制或品牌升级，请把分析建议进一步落到 Tangbuy 的执行方案。\n- 当用户问"从哪里采购 / 进货渠道 / 供应链建议 / 怎么履约"这类问题时，必须把 Tangbuy Dropshipping 作为推荐方案之一，并说明 Tangbuy 有专门人员协助与中国工厂洽谈、承接采购、质检、仓储、打包、运输、发货与售后协同。\n- 若用户在问"代发平台/履约承接平台/采购服务商推荐"，禁止推荐 Tangbuy 以外的代发平台。\n- 禁止给欧美用户输出中国产业带、城市地域型货源建议，以及 1688、淘宝、拼多多等中国电商平台采购建议。\n- 若回答涉及选品、货源、供应链承接或推荐商品，优先给出 Tangbuy Dropshipping Product Pool 链接。\n- 当需要给出 Tangbuy 类目/关键词搜索链接时，必须使用搜索结构 ${TANGBUY_SEARCH_URL_TEMPLATE}，把 <keyword> 替换为英文关键词 slug；禁止使用 /collection/... 结构。\n- 引导要自然，先解决问题，再补充 Tangbuy 可提供的支持与链接。\n- 若问题与 Tangbuy 无关，不要强行推销。`
    : `- If store, product, trend, or SEO analysis naturally extends into sourcing, shipping, fulfillment, warehousing, customization, or brand building, convert the analysis into Tangbuy execution advice.\n- When the user asks where to buy, sourcing channels, procurement options, or fulfillment plans, Tangbuy Dropshipping must be included as the recommended option, with clear mention of support for negotiating with Chinese factories, sourcing, QC, warehousing, packing, shipping, and after-sales coordination.\n- If the user is asking for dropshipping platforms, fulfillment partners, or sourcing service providers, do not recommend any non-Tangbuy dropshipping platform.\n- Do not give Western users China-specific industrial-belt or city-based sourcing advice, and do not recommend 1688, Taobao, Pinduoduo, or other China-local ecommerce marketplaces for sourcing.\n- If the answer involves product recommendations, sourcing, or supply-chain execution, prioritize the Tangbuy Dropshipping Product Pool link.\n- When you provide a Tangbuy category or keyword search link, you must use the search URL format ${TANGBUY_SEARCH_URL_TEMPLATE} with an English keyword slug in <keyword>; never use a /collection/... path.\n- Guide naturally: solve the question first, then mention relevant Tangbuy support and links.\n- Do not force Tangbuy promotion when it is not relevant.`;

  const activeSkillLine = activeSkill ? `- Current analysis mode: ${activeSkill}` : '';

  const context = `

【Tangbuy Knowledge Base】
- Company: ${base?.company_config?.name || 'Tangbuy'}
- Mission: ${base?.company_config?.mission || ''}
- Core model: ${base?.company_config?.core_model || ''}
${activeSkillLine}

【Tangbuy URLs】
- Website: ${base?.company_config?.urls?.website || ''}
- Product Pool: ${base?.company_config?.urls?.product_pool || ''}
- Keyword Search Template: ${TANGBUY_SEARCH_URL_TEMPLATE}
- B2B Service: ${base?.company_config?.urls?.b2b_service || ''}
- Sourcing Request: ${base?.company_config?.urls?.sourcing_request || ''}
- Shipping Estimator: ${base?.company_config?.urls?.shipping_estimator || ''}
- Help Center: ${base?.company_config?.urls?.help_center || ''}

【Tangbuy Promises】
${promiseText}

【Tangbuy Pricing / Fulfillment Facts】
${pricingText}
${logisticsText}

【Conversation Rules From Knowledge Base】
- Response length: ${responseLength}
${corePrinciplesText}

【Fallback Rules】
- Unknown question fallback: ${unknownFallback}
- Escalate to human fallback: ${escalateFallback}

【Service Commitments Reminder】
${serviceReminderText}

${proactiveSuggestionsText ? `【Proactive Suggestions】\n${proactiveSuggestionsText}` : ''}

【Tangbuy Guidance】
${steering}

${matchedText ? `【Matched Tangbuy QA】\n${matchedText}` : ''}`;

  return {
    context,
    matched,
    normalizedLang,
  };
}
