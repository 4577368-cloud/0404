/**
 * 服务端 system message 构建器（仅 api/ 内部使用）
 * 接收前端传来的已解析参数，拼接完整 system prompt
 * 提示词内容不会暴露给前端浏览器
 */
import { PROMPTS } from './_prompts.js';

const ANALYSIS_YEAR = Math.max(2026, new Date().getFullYear());

/**
 * @param {object} params
 * @param {string} params.activeSkill - 已解析的技能模式 (auto|diagnosis|seo|page|product)
 * @param {string} params.uiLang - 界面语言代码 (zh|en|es|fr|ja)
 * @param {string} params.uiLangLabel - 界面语言标签 (中文|English|...)
 * @param {string} [params.knownSite] - 已知站点 origin
 * @param {boolean} [params.hasSnapshot] - 是否有 URL 快照
 * @param {boolean} [params.isGreeting] - 是否为简单问候语
 * @param {boolean} [params.hasProductImage] - 是否包含产品图片分析
 * @param {string} [params.diagnosisPrompt] - 诊断上下文提示
 * @param {string} [params.tangbuyGuidance] - Tangbuy 基础指引（前端已按语言选好）
 * @param {string} [params.tangbuyKnowledgeCtx] - Tangbuy 知识库上下文（前端已构建）
 * @param {string} [params.productImageBrandHint] - 产品图片品牌提示（前端已构建）
 * @returns {{ role: string, content: string }}
 */
export function buildSystemMessage(params) {
  const {
    activeSkill = 'auto',
    uiLang = 'en',
    uiLangLabel = 'English',
    knownSite = '',
    hasSnapshot = false,
    isGreeting = false,
    hasProductImage = false,
    diagnosisPrompt = '',
    tangbuyGuidance = '',
    tangbuyKnowledgeCtx = '',
    productImageBrandHint = '',
  } = params || {};

  // 1. 基础提示词（核心保护对象）
  const activePrompt = PROMPTS[activeSkill] || PROMPTS.auto;

  // 2. 语言约束
  const langConstraint = `\n\n[Reply language — mandatory]\n- Write the **entire** reply in **${uiLangLabel}**, matching the app language selected in the header (top-right).\n- Do not mix languages in one reply unless the user explicitly asks for bilingual output.\n- If the user explicitly demands a specific reply language, follow that request.\n`;

  // 3. 年份约束
  const yearConstraint = `\n\n[Time & year]\n- Treat campaign, seasonal, and holiday planning as **${ANALYSIS_YEAR} and later**.\n- Do not frame 2024 or earlier as "upcoming"; forward-looking advice must sit in ${ANALYSIS_YEAR}+.\n- Past years may appear as historical data; do not keep saying "based on ${ANALYSIS_YEAR}" unless the user asks.\n`;

  // 4. 已知站点上下文
  const siteCtx = knownSite
    ? `\n\n[Known site]\n- Site: ${knownSite}\n- Reuse prior analysis for the same domain; treat a new domain as a fresh model.\n`
    : '';

  // 5. URL 快照分析提示词
  const urlSnapshotCtx = hasSnapshot ? `\n\n[URL Snapshot Analysis — product-focused, MUST display]
The user's message includes a URL snapshot (【URL Snapshot - Jina】 or 【URL Snapshot - Fallback】). The snapshot has been pre-processed to extract product essentials (title, price, rating, trust signals, selling points, description). You MUST follow these rules:

**RULE 1 — Display extracted product info first (mandatory)**
Start your reply with a clear product overview section. Present ALL data extracted from the snapshot in a structured format:
- **Product Name** (exact from snapshot)
- **Price** (exact from snapshot, with currency)
- **Rating & Reviews** (exact from snapshot, e.g. "4.9/5, 47 reviews")
- **Trust Signals** (list guarantees, shipping, badges found)
- **Key Selling Points** (list the main features/benefits found)
- **Brand/Store** (inferred from URL domain or page content)
Use a heading like "### 页面识别信息" or "### Product Overview (from page)" and present this info as a quick-reference block BEFORE your analysis. This shows the user what data you successfully extracted.

**RULE 2 — Use extracted data as evidence in analysis**
When analyzing brand positioning, SEO quality, conversion, or giving recommendations, cite specific values from the snapshot (e.g. "根据页面信息，该产品定价 £29.99，评分 4.9/5（47 条评价），具备较强社交证明").

**RULE 3 — Structured analysis after the overview**
After the product overview, provide your analysis based on the active mode:
- **diagnosis**: Full audit — brand narrative, trust, conversion mechanics, competitive positioning
- **seo**: SEO/copy optimization — title rewrite, meta description, keyword analysis, GEO-readiness
- **product**: Assortment angle — buyer persona, category fit, sourcing opportunity
- **auto**: Balanced overview — top 3 strengths, top 3 improvement areas, quick wins

**RULE 4 — Actionable recommendations**
End with concrete, prioritized improvements (P0/P1/P2). Each recommendation should reference specific data from the snapshot.

**RULE 5 — Never say "I cannot access the URL"**
The snapshot IS the access. If data is sparse, analyze what's available and note what additional info would improve the analysis.
` : '';

  // 6. 诊断上下文
  const diagnosisCtx = diagnosisPrompt
    ? `\n\n[AI diagnosis — target market]\n${diagnosisPrompt}\n\nPrioritize that market's shopper preferences, purchasing power, and competitive landscape.\n`
    : '';

  // 7. Tangbuy 执行提示
  const tangbuyExecutionHint = ['diagnosis', 'seo', 'page'].includes(activeSkill)
    ? `\n\n[Tangbuy execution reminder]\n- Keep the main analysis first.\n- If the answer touches product recommendations, sourcing, fulfillment, shipping/logistics, supplier choice, or inventory risk, add **one concise execution paragraph** on how Tangbuy Dropshipping can implement it (procurement, QC, warehousing, packing, shipping, after-sales coordination).\n- Use natural advisory tone; no hard sell.\n`
    : '';

  // 8. 问候语提示
  const greetingHint = isGreeting
    ? `\n\n[Brief greeting — user has not asked a concrete question yet]\n- Reply warmly in a few sentences. You may use a short bullet list of **what you can help with** (e.g. 独立站诊断、SEO、选品思路).\n- Do **not** ask the user to "provide a product URL / category" or similar intake-style questions. Do **not** use numbered "请提供…" questionnaires.\n- End with a single open line such as: 有具体问题或链接时直接发我即可 — not a list of demands.\n`
    : '';

  // 9. 产品图片品牌提示
  const imgHint = productImageBrandHint ? `\n\n${productImageBrandHint}\n` : '';

  return {
    role: 'system',
    content:
      activePrompt +
      (tangbuyGuidance || '') +
      (tangbuyKnowledgeCtx || '') +
      langConstraint +
      yearConstraint +
      siteCtx +
      urlSnapshotCtx +
      diagnosisCtx +
      tangbuyExecutionHint +
      greetingHint +
      imgHint,
  };
}
