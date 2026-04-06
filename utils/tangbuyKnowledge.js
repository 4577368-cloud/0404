/**
 * Tangbuy Knowledge Base utilities
 * Handles knowledge base parsing, indexing, and context building
 */

import { tryFetchJson, translateZhToEn } from './productSearch.js';

const TANGBUY_SEARCH_URL_TEMPLATE = 'https://dropshipping.tangbuy.com/en-US/search?keyword=<keyword>&type=text';

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

function isJunkSearchKeyword(s) {
  const t = String(s || '').trim();
  if (t.length < 3 || t.length > 64) return true;
  if (/\n|https?:\/\/|[|]/i.test(t)) return true;
  if (/[:：]/.test(t) && t.length > 10) return true;
  if (/\d{4}/.test(t)) return true;
  if (JUNK_EXACT_ZH.has(t)) return true;
  for (const j of JUNK_SEARCH_PHRASES_ZH) {
    if (t === j || t.startsWith(j + '，') || t.startsWith(j + '。')) return true;
  }
  if (/^(请|如果|是否|可以|需要|能否)/.test(t) && t.length < 12) return true;
  if (/市场|规模|增长|竞争|时效|物流|成本|分析|建议|方向|差异化|用户|结论/.test(t) && t.length >= 8) return true;
  return false;
}

function isLikelyProductKeyword(raw) {
  const t = String(raw || '').trim();
  if (!t || isJunkSearchKeyword(t)) return false;
  if (/[，。！？,.]/.test(t) && t.length > 10) return false;
  if (t.length > 24) return false;
  const zhCat = /(牛仔裤|休闲裤|运动裤|短裤|阔腿裤|直筒裤|连衣裙|半身裙|T恤|卫衣|开衫|外套|羽绒服|棉服|大衣|风衣|手机壳|耳机|背包|斜挎包|台灯|收纳|口红|面膜|眼影|假睫毛)$/;
  const enCat = /\b(jeans|joggers|shorts|dress|hoodie|sneakers|earbuds|backpack|phone case)\b/i;
  if (zhCat.test(t)) return true;
  if (enCat.test(t)) return true;
  return false;
}

function toEnglishTangbuyKeyword(raw) {
  const src = String(raw || '').trim();
  if (!src) return '';
  let s = src
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
      .join(' ');
    s = translated || s;
  }

  s = s
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!s || s.length < 2) return '';
  return s.slice(0, 80);
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
    if (!isLikelyProductKeyword(x)) return;
    const low = x.toLowerCase();
    if (out.some((e) => e.toLowerCase() === low)) return;
    out.push(x);
  };

  // 中文：修饰词 + 品类（高腰牛仔裤、破洞牛仔…）
  const zhClass =
    /([\u4e00-\u9fff\d\w·]{0,10})(牛仔裤|休闲裤|运动裤|短裤|阔腿裤|直筒裤|连衣裙|半身裙|T恤|卫衣|开衫|外套|羽绒服|棉服|大衣|风衣|手机壳|耳机|背包|斜挎包|台灯|收纳|口红|面膜|眼影|假睫毛)/g;
  let m;
  while ((m = zhClass.exec(blob)) !== null) {
    const phrase = `${m[1] || ''}${m[2]}`.trim();
    if (phrase.length >= 3) push(phrase);
  }

  // 列表行：- 破洞牛仔裤 / 1. xxx裤
  for (const line of blob.split(/\n+/)) {
    const cleaned = line.replace(/^[\s*\-•\d.、]+/, '').trim();
    if (cleaned.length >= 3 && cleaned.length <= 24 && /裤|裙|鞋|包|壳|表|灯|膜|红|衫|衣|帽/.test(cleaned) && !/[|:：，。！？,.]/.test(cleaned)) {
      push(cleaned);
    }
  }

  // 英文常见品类词
  // Prefer full phrase from AI conclusion, e.g. "low-rise cargo jeans".
  const enPhrase =
    /\b([a-z][a-z-]{1,20}(?:\s+[a-z][a-z-]{1,20}){0,3}\s+(?:jeans|joggers|shorts|dress|hoodie|sneakers|earbuds|backpack|phone case))\b/gi;
  while ((m = enPhrase.exec(blob)) !== null) {
    const phrase = m[1].trim();
    if (phrase.split(/\s+/).length >= 2) {
      hasEnglishPhrase = true;
      push(phrase);
    }
  }

  const en = /\b(high[- ]waist|ripped|distressed|skinny|wide[- ]leg|baggy)\s+(jeans|joggers|shorts)\b/gi;
  while ((m = en.exec(blob)) !== null) {
    hasEnglishPhrase = true;
    push(m[0].trim());
  }

  const en2 = /\b(jeans|sneakers|hoodie|dress|earbuds|backpack|phone case)\b/gi;
  // Only fall back to generic category word if we did not capture a full phrase.
  if (!hasEnglishPhrase) {
    while ((m = en2.exec(blob)) !== null) push(m[0].trim());
  }

  return out.slice(0, 12);
}

/**
 * 是否应在回复后展示 Tangbuy 搜索：须能抽出至少 2 个有效商品词，且用户显式要推荐或 AI 明显在举款式。
 */
export function shouldAttachTangbuySearchPicks({ userWantsProductRecommendations, aiText, extractedKeywords }) {
  const kws = Array.isArray(extractedKeywords) ? extractedKeywords : [];
  if (kws.length < 2) return false;
  return !!userWantsProductRecommendations;
}

/**
 * 由已过滤的关键词生成 Tangbuy 搜索项；**label 仅展示关键词**（点击跳转，不外露长 URL）。
 */
export function buildTangbuySearchPicksFromKeywords(keywords, uiLang = 'zh', max = 8) {
  const n = Math.min(12, Math.max(1, Number(max) || 5));
  const list = (Array.isArray(keywords) ? keywords : []).filter((k) => isLikelyProductKeyword(k)).slice(0, n);
  const out = [];
  const seen = new Set();
  for (const keyword of list) {
    const enKeyword = toEnglishTangbuyKeyword(keyword);
    if (!enKeyword || seen.has(enKeyword)) continue;
    seen.add(enKeyword);
    out.push({
      label: keyword,
      keyword: enKeyword,
      href: buildTangbuyDropshippingSearchUrl(enKeyword),
    });
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
    .filter((s) => s.length >= 3 && !isJunkSearchKeyword(s));

  const extracted = extractProductKeywordsForTangbuy(aiText, userText);
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
- 【重要】Tangbuy 没有美国仓、欧洲仓或法国仓等海外仓库，所有商品均从中国发货。禁止编造 Tangbuy 有海外仓可以快速送达欧美等地的虚假信息。
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
- [IMPORTANT] Tangbuy does NOT have US warehouses, European warehouses, or French warehouses. All products ship from China. Never hallucinate or claim that Tangbuy has overseas warehouses for fast local delivery in the US or Europe.
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
- [IMPORTANTE] Tangbuy NO tiene almacenes en Estados Unidos, Europa o Francia. Todos los productos se envían desde China. Nunca inventes o afirmes que Tangbuy tiene almacenes en el extranjero para entrega rápida local en EE.UU. o Europa.
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
