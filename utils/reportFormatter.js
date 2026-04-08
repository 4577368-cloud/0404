/**
 * AI Report Markdown Generator
 * Converts workflow step outputs to readable Markdown — professional report style
 */

import { STEP_NAMES_ZH, STEP_NAMES_EN } from './diagnosisSteps/index.js';
import { translateCategory } from './aiReports.js';

// ─── Public API ────────────────────────────────────────────

export function generateMarkdownReport(report, uiLang = 'zh', targetStep = null) {
  if (!report) return '';

  if (report.kind === 'analysis' && typeof report.analysisMarkdown === 'string') {
    return report.analysisMarkdown;
  }

  const stepNames = uiLang === 'zh' ? STEP_NAMES_ZH : STEP_NAMES_EN;
  const stepOutputs = report.stepOutputs || [];

  if (targetStep !== null && targetStep !== 9) {
    const targetOutput = stepOutputs.find(s => s.step === targetStep);
    return targetOutput ? generateStepMarkdown(targetOutput, stepNames, uiLang) : '';
  }

  const executiveSummary = generateExecutiveSummary(report, uiLang);
  const allStepsContent = stepOutputs
    .filter(o => o.step >= 0 && o.step <= 8)
    .sort((a, b) => a.step - b.step)
    .map(o => generateStepMarkdown(o, stepNames, uiLang))
    .join('\n\n---\n\n');

  const detailTitle = uiLang === 'zh' ? '详细分析报告' : 'Detailed Analysis Report';
  return `${executiveSummary}\n\n---\n\n# ${detailTitle}\n\n${allStepsContent}`;
}

/**
 * Tangbuy supply-chain URLs (aligned with knowledge base; all shipments from China).
 */
const TANGBUY_PRODUCT_POOL = 'https://dropshipping.tangbuy.com/en-US/productPool';
const TANGBUY_SOURCING = 'https://dropshipping.tangbuy.com/en-US/source/inProgress';
const TANGBUY_ESTIMATOR = 'https://shop.tangbuy.com/estimation';

/**
 * Build supply_chain_backbone for Step 9 when aggregating without an LLM — ties diagnosis to Tangbuy fulfillment.
 * @param {string} uiLang
 * @param {{ productName?: string, category?: string, targetCountries?: string, executionPlanSummary?: string }} ctx
 */
export function buildAggregatedSupplyChainBackbone(uiLang, ctx = {}) {
  const zh = uiLang === 'zh';
  const {
    productName,
    targetCountries,
    executionPlanSummary,
  } = ctx;
  const prod = (productName && String(productName).trim()) || (zh ? '本品' : 'this product');
  const market = (targetCountries && String(targetCountries).trim()) || (zh ? '目标市场' : 'target market(s)');
  const execRaw = executionPlanSummary && String(executionPlanSummary).trim();
  const execHint = execRaw
    ? (execRaw.length > 240 ? `${execRaw.slice(0, 240)}…` : execRaw)
    : '';

  const integration_summary = zh
    ? `前文从市场、竞争、机会与执行节奏对「${prod}」在 ${market} 的路径做了拆解。**供应链与履约**是把策略变成稳定交付的关键支撑：产能、质检、时效与售后波动会直接影响转化与口碑。Tangbuy Dropshipping 作为一站式后端，可在寻源采购、入库质检、云仓组货、打包发货与售后协同上与您的路线图衔接，降低「有增长假设、无稳定履约」的断层风险。${execHint ? `与当前执行计划要点呼应：${execHint}` : ''}`
    : `The sections above decompose how **${prod}** can win in **${market}**. **Supply chain and fulfillment** are the backbone that turns strategy into reliable delivery—capacity, QC, lead times, and after-sales volatility directly affect conversion and reputation. **Tangbuy Dropshipping** provides an integrated backend (sourcing, inbound QC, cloud warehousing, packing and shipping, and coordinated after-sales) aligned with your roadmap, reducing the gap between growth assumptions and dependable fulfillment.${execHint ? ` This connects to your execution plan: ${execHint}` : ''}`;

  const tangbuy_support_points = zh
    ? [
        '**寻源与采购**：连接工厂侧资源，支持多 SKU、组合发货与阶梯采购等思路落地（具体报价/MOQ 以账户与客户经理确认为准）。',
        '**质检与云仓**：入库与发货前质检、物流轨迹可视化，便于好评沉淀与售后举证。',
        '**履约协同**：订单流可与店铺侧衔接，缩短从「策略共识」到「可发货」的路径。（商品均从中国仓发运，无美/欧本地仓表述。）',
      ]
    : [
        '**Sourcing & procurement:** Factory-side matching; multi-SKU and bundled fulfillment patterns (confirm MOQ/pricing in your account / with your manager).',
        '**QC & cloud warehouse:** Inbound and pre-shipment checks with trackable logistics evidence for reviews and disputes.',
        '**Fulfillment alignment:** Order flow can align with your storefront to shorten strategy-to-shippable cycles. (Shipments originate from China—do not claim overseas warehouses.)',
      ];

  const seller_next_steps = zh
    ? [
        `在产品池中按类目或关键词筛选可履约 SKU：[Tangbuy 产品池](${TANGBUY_PRODUCT_POOL})`,
        `需要定向寻源时提交采购需求，便于对齐交期与报价：[提交寻源](${TANGBUY_SOURCING})`,
        `发货前用运费估算核对目的国线路与费用口径：[运费估算](${TANGBUY_ESTIMATOR})`,
      ]
    : [
        `Browse shoppable SKUs: [Tangbuy product pool](${TANGBUY_PRODUCT_POOL})`,
        `Submit a sourcing request for a tailored match: [Sourcing](${TANGBUY_SOURCING})`,
        `Validate lanes and shipping cost assumptions: [Estimator](${TANGBUY_ESTIMATOR})`,
      ];

  return {
    integration_summary,
    tangbuy_support_points,
    seller_next_steps,
  };
}

/**
 * Markdown for supply_chain_backbone object (Step 9 / executive summary).
 */
export function formatSupplyChainBackboneMarkdown(backbone, uiLang) {
  const zh = uiLang === 'zh';
  if (!backbone || typeof backbone !== 'object') return '';
  let md = '';
  if (backbone.integration_summary) md += `${para(backbone.integration_summary)}\n\n`;
  if (backbone.tangbuy_support_points?.length) {
    md += `**${zh ? 'Tangbuy 可承接的能力面' : 'What Tangbuy covers'}：**\n\n`;
    md += `${bullets(backbone.tangbuy_support_points.map((x) => String(x)))}\n\n`;
  }
  if (backbone.seller_next_steps?.length) {
    md += `**${zh ? '建议下一步（与上文策略衔接）' : 'Suggested next steps (aligned with the plan above)'}：**\n\n`;
    md += `${numberedList(backbone.seller_next_steps.map((x) => String(x)))}\n\n`;
  }
  return md.trim();
}

export default { generateMarkdownReport, buildAggregatedSupplyChainBackbone, formatSupplyChainBackboneMarkdown };

// ─── Helpers ────────────────────────────────────────────

function val(...candidates) {
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return c;
  }
  return undefined;
}

/** 解码 JSON 中误带的 HTML 实体，避免 &#39;、#39 等漏出 */
export function decodeHtmlEntities(str) {
  if (str == null || typeof str !== 'string') return str;
  let out = str;
  // 多轮解码：应对 &amp;#39; (双重编码) 和 &#39; (单重) 等
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    out = out
      .replace(/&amp;/g, '&')
      .replace(/&#(\d{1,6});/g, (_, n) => {
        const code = parseInt(n, 10);
        return code > 0 && code < 0x110000 ? String.fromCharCode(code) : _;
      })
      .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h) => {
        const code = parseInt(h, 16);
        return code > 0 && code < 0x110000 ? String.fromCharCode(code) : _;
      })
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&ldquo;/g, '\u201c')
      .replace(/&rdquo;/g, '\u201d')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    if (out === before) break;
  }
  // 缺分号的十进制/十六进制实体（如 &#39护肤、&#x27x）
  out = out.replace(/&#0*39(?![0-9a-fA-F;])/gi, "'");
  out = out.replace(/&#x0*27(?![0-9a-fA-F;])/gi, "'");
  out = out.replace(/&#0*34(?![0-9a-fA-F;])/gi, '"');
  out = out.replace(/&#x0*22(?![0-9a-fA-F;])/gi, '"');
  // 模型或截断产生的残缺实体
  out = out.replace(/\b#39\b/g, "'").replace(/\b#34\b/g, '"');
  return out;
}

/** 递归清洗对象/数组内所有字符串值的 HTML 实体 */
export function deepDecodeEntities(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'string') return decodeHtmlEntities(obj);
  if (Array.isArray(obj)) return obj.map(deepDecodeEntities);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepDecodeEntities(v);
    }
    return out;
  }
  return obj;
}

function s(...candidates) {
  const v = val(...candidates);
  if (v === undefined || v === null) return '-';
  if (Array.isArray(v)) return decodeHtmlEntities(v.join(', ')) || '-';
  if (typeof v === 'object') return decodeHtmlEntities(flatObj(v));
  return decodeHtmlEntities(String(v));
}

function flatObj(obj) {
  if (!obj || typeof obj !== 'object') return String(obj ?? '-');
  if (Array.isArray(obj)) return obj.map(i => typeof i === 'string' ? i : flatObj(i)).join(', ');
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      const label = humanLabel(k);
      const value = typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : flatObj(v)) : String(v);
      return `${label}: ${value}`;
    })
    .join(' · ');
}

function humanLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function bullets(arr, extractor) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(item => {
    if (typeof item === 'string') return `- ${item}`;
    const text = extractor ? extractor(item) : (item.description || item.name || item.text || item.action || item.pattern || item.point || flatObj(item));
    return `- ${text}`;
  }).join('\n');
}

function numberedList(arr, extractor) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map((item, i) => {
    if (typeof item === 'string') return `${i + 1}. ${item}`;
    const text = extractor ? extractor(item) : (item.description || item.name || item.text || flatObj(item));
    return `${i + 1}. ${text}`;
  }).join('\n');
}

function section(title, content) {
  if (!content || (typeof content === 'string' && !content.trim())) return '';
  return `### ${title}\n\n${content}`;
}

function para(text) {
  if (!text || text === '-') return '';
  return String(text).trim();
}

/** 将「风险1：…风险2：…」或长分号串拆成多条 Markdown 列表，避免挤在一行 */
function formatDenseRiskOrList(text) {
  if (!text || typeof text !== 'string') return text;
  const t = text.trim();
  if (t.length < 40) return t;
  const byRisk = t.split(/(?=风险\s*\d+[：:])|(?=Risk\s+\d+[：:])/gi).map((x) => x.trim()).filter(Boolean);
  if (byRisk.length > 1) return byRisk.map((p) => `- ${p}`).join('\n\n');
  const bySemicolon = t.split(/；|;(?=\s*(?:风险|应对|Risk|Response|Mitigation|应对：))/i);
  if (bySemicolon.length > 2) return bySemicolon.map((c) => `- ${c.trim()}`).join('\n\n');
  return t;
}

function kvBlock(pairs) {
  return pairs
    .filter(([, v]) => v && v !== '-')
    .map(([label, value]) => `- **${label}：** ${s(value)}`)
    .join('\n');
}

/**
 * 将「Week 1：1)…2)… Week 2：…」类密集文本拆成 ##### 周标题 + 子列表（亦支持「第 N 周」）
 */
function formatDenseWeekBlocks(text) {
  const t = decodeHtmlEntities(String(text || '')).trim();
  if (!t || t.length < 24) return t;
  if (!/Week\s*\d+|第\s*\d+\s*周/i.test(t)) return t;

  const chunks = t.includes('Week')
    ? t.split(/(?=Week\s*\d+\s*[：:])/i).map((x) => x.trim()).filter(Boolean)
    : t.split(/(?=第\s*\d+\s*周)/).map((x) => x.trim()).filter(Boolean);

  if (chunks.length <= 1) return t;

  return chunks
    .map((chunk) => {
      const hm = chunk.match(/^(Week\s*\d+|第\s*\d+\s*周)\s*[：:]\s*([\s\S]*)$/i);
      if (!hm) return `- ${chunk}`;
      const title = hm[1].trim();
      let body = (hm[2] || '').trim();
      const deliverMatch = body.match(/[（(](?:Deliverable|交付物)\s*[:：]\s*([^）)]+)[）)]\s*$/);
      let deliverNote = '';
      if (deliverMatch) {
        deliverNote = deliverMatch[1].trim();
        body = body.slice(0, deliverMatch.index).trim();
      }
      const items = body
        .split(/(?=\d+[)）]\s*)/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^\d+[)）]\s*/, '').trim())
        .filter(Boolean);
      let out = `##### ${title}\n\n`;
      out += items.length ? items.map((it) => `- ${it}`).join('\n') : body;
      if (deliverNote) out += `\n\n*Deliverable · ${deliverNote}*`;
      return out;
    })
    .join('\n\n');
}

function formatDate(dateString, uiLang) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return uiLang === 'zh' ? `${y}年${m}月${day}日` : `${y}-${m}-${day}`;
}

// ─── Step Router ────────────────────────────────────────────

function generateStepMarkdown(output, stepNames, uiLang) {
  if (!output) return '';
  const data = deepDecodeEntities(output.data || {});
  const stepName = stepNames[output.step] || `Step ${output.step}`;
  const renderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7, renderStep8, renderStep9];
  const renderer = renderers[output.step];
  return renderer ? renderer(data, stepName, uiLang) : renderGeneric(data, stepName, uiLang);
}

// ─── Generic Fallback ────────────────────────────────────────────

function renderGeneric(data, stepName, uiLang) {
  const skip = new Set(['step', 'step_number', 'next_step_ready', 'timestamp']);
  const sections = [];

  for (const [key, value] of Object.entries(data)) {
    if (skip.has(key) || value === null || value === undefined) continue;
    const title = humanLabel(key);

    if (typeof value === 'string') {
      sections.push(`### ${title}\n\n${decodeHtmlEntities(value)}`);
    } else if (Array.isArray(value)) {
      const rendered = bullets(value);
      if (rendered) sections.push(`### ${title}\n\n${rendered}`);
    } else if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined);
      if (!entries.length) continue;
      const allSimple = entries.every(([, v]) => typeof v !== 'object');
      if (allSimple) {
        sections.push(`### ${title}\n\n${kvBlock(entries.map(([k, v]) => [humanLabel(k), String(v)]))}`);
      } else {
        const sub = entries.map(([k, v]) => {
          const label = humanLabel(k);
          if (typeof v === 'string' || typeof v === 'number') return `- **${label}：** ${v}`;
          if (Array.isArray(v)) return `- **${label}：** ${v.join(', ')}`;
          return `- **${label}：** ${flatObj(v)}`;
        }).join('\n');
        sections.push(`### ${title}\n\n${sub}`);
      }
    }
  }

  return `## Step ${data.step ?? '?'}: ${stepName}\n\n${sections.join('\n\n')}`;
}

// ─── Step 0: 任务调度 ────────────────────────────────────────────

function renderStep0(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const pb = data.product_basics || {};
  const tm = data.target_market || {};
  const af = data.audience_fit_score || {};

  let md = `## Step 0: ${stepName}\n\n`;

  const rawCategory0 = val(pb.category, data.category);
  const category0 =
    rawCategory0 == null || rawCategory0 === ''
      ? '-'
      : translateCategory(String(rawCategory0), 'en');

  md += section(zh ? '商品基础信息' : 'Product Overview', kvBlock([
    [zh ? '商品名称' : 'Product', s(pb.name, data.product_name)],
    [zh ? '类目' : 'Category', category0],
    [zh ? '价格 (USD)' : 'Price (USD)', s(pb.price_usd, data.price_usd)],
    [zh ? '价格 (RMB)' : 'Price (RMB)', s(pb.price_rmb, data.price_rmb)],
    [zh ? '月销量' : 'Monthly Sales', s(pb.monthly_sales, data.monthly_sales)],
    [zh ? '评分' : 'Rating', s(pb.rating, data.rating)],
    [zh ? '平台' : 'Platform', s(pb.platform, data.platform)],
  ]));

  if (pb.key_features?.length) {
    md += '\n\n' + section(zh ? '核心卖点' : 'Key Features', bullets(pb.key_features));
  }

  md += '\n\n' + section(zh ? '目标市场' : 'Target Market', kvBlock([
    [zh ? '市场区域' : 'Region', s(tm.region, data.market_region)],
    [zh ? '目标国家' : 'Countries', s(tm.countries)],
    [zh ? '年龄段' : 'Age Groups', s(tm.age_groups)],
    [zh ? '人群特征' : 'Characteristics', s(tm.characteristics)],
  ]));

  const fitTotal = typeof af === 'number' ? af : af.total;
  if (fitTotal) {
    const fitDetails = typeof af === 'object' ? kvBlock([
      [zh ? '年龄匹配' : 'Age Match', s(af.age_match)],
      [zh ? '特征匹配' : 'Trait Match', s(af.trait_match)],
      [zh ? '价格匹配' : 'Price Match', s(af.price_match)],
      [zh ? '渠道匹配' : 'Channel Match', s(af.channel_match)],
    ]) : '';
    md += '\n\n' + section(`${zh ? '人群匹配度' : 'Audience Fit'}: ${fitTotal}/100`,
      fitDetails + (af.explanation ? `\n\n${af.explanation}` : ''));
  }

  md += '\n\n' + section(zh ? '分析结论' : 'Analysis Conclusions', kvBlock([
    [zh ? '评估模块' : 'Module', s(data.module_to_load)],
    [zh ? '主推渠道' : 'Primary Channel', s(data.primary_channel)],
    [zh ? '生命周期' : 'Lifecycle', s(data.lifecycle_stage)],
  ]));

  if (data.channel_breakdown) {
    md += '\n\n' + section(zh ? '渠道分布' : 'Channel Breakdown', para(data.channel_breakdown));
  }
  if (data.key_observations) {
    md += '\n\n' + section(zh ? '核心发现' : 'Key Observations', para(data.key_observations));
  }
  if (data.workflow_plan) {
    md += '\n\n' + section(zh ? '后续执行计划' : 'Workflow Plan', para(data.workflow_plan));
  }

  return md;
}

// ─── Step 1: 市场趋势分析 ────────────────────────────────────────────

function renderStep1(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const heat = data.market_heat || {};
  const season = data.seasonality || {};
  const audience = data.audience_match || {};
  const demand = data.demand_signals || {};
  const timing = data.entry_timing || {};

  let md = `## Step 1: ${stepName}\n\n`;

  const heatScore = heat.score || heat.total;
  if (heatScore) {
    md += section(`${zh ? '市场热度' : 'Market Heat'}: ${heatScore}/100（${s(heat.level)}）`, kvBlock([
      [zh ? '社媒讨论' : 'Social Media', s(heat.social_media)],
      [zh ? '搜索需求' : 'Search Demand', s(heat.search_demand)],
      [zh ? '达人活跃度' : 'Creator Activity', s(heat.creator_activity)],
      [zh ? '竞品投放' : 'Competitor Investment', s(heat.competitor_investment)],
    ]));
  }

  if (season.current_phase || season.analysis) {
    md += '\n\n' + section(`${zh ? '季节性分析' : 'Seasonality'}：${s(season.current_phase)}`,
      para(season.analysis) + (season.key_dates?.length ? `\n\n${zh ? '关键节点' : 'Key Dates'}：${season.key_dates.join('、')}` : ''));
  }

  if (audience.score || audience.purchasing_power) {
    md += '\n\n' + section(`${zh ? '人群匹配度' : 'Audience Match'}${audience.score ? ': ' + audience.score + '/100' : ''}`, kvBlock([
      [zh ? '购买力' : 'Purchasing Power', s(audience.purchasing_power)],
      [zh ? '使用场景' : 'Usage Scenarios', s(audience.usage_scenarios)],
      [zh ? '渠道偏好' : 'Channel Preference', s(audience.channel_preference)],
      [zh ? '内容偏好' : 'Content Preference', s(audience.content_preference)],
    ]));
  }

  if (demand.search_trend || demand.supply_demand_gap) {
    md += '\n\n' + section(zh ? '需求信号' : 'Demand Signals', kvBlock([
      [zh ? '搜索趋势' : 'Search Trend', s(demand.search_trend)],
      [zh ? '社媒讨论' : 'Social Buzz', s(demand.social_buzz)],
      [zh ? '达人覆盖' : 'Creator Coverage', s(demand.creator_coverage)],
      [zh ? '供需缺口' : 'Supply-Demand Gap', s(demand.supply_demand_gap)],
    ]));
  }

  if (timing.score || timing.recommendation) {
    md += '\n\n' + section(`${zh ? '入场时机' : 'Entry Timing'}${timing.score ? ': ' + timing.score + '/100' : ''}`,
      para(timing.recommendation) + (timing.best_window ? `\n\n**${zh ? '最佳窗口' : 'Best Window'}：** ${timing.best_window}` : ''));
  }

  if (data.country_breakdown?.length) {
    md += '\n\n### ' + (zh ? '逐国分析' : 'Country Breakdown') + '\n\n';
    md += `| ${zh ? '国家' : 'Country'} | ${zh ? '热度' : 'Heat'} | ${zh ? '趋势' : 'Trend'} | ${zh ? '本地因素' : 'Local Factors'} |\n`;
    md += '|---|---|---|---|\n';
    md += data.country_breakdown.map(c =>
      `| ${s(c.country)} | ${s(c.heat_index)} | ${s(c.trend_direction)} | ${s(c.local_factors)} |`
    ).join('\n');
  }

  if (data.summary) md += '\n\n' + section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 2: 竞品对标分析 ────────────────────────────────────────────

function renderStep2(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const competitors = data.competitors || [];
  const gaps = data.gaps || [];
  const gapScore = data.competition_gap_score || {};

  let md = `## Step 2: ${stepName}\n\n`;

  if (competitors.length) {
    md += `### ${zh ? '竞品对标' : 'Competitor Landscape'}\n\n`;
    competitors.forEach((c, i) => {
      md += `**${i + 1}. ${s(c.name)}**（${s(c.type)}，${zh ? '威胁' : 'Threat'}: ${s(c.threat_level)}）\n\n`;
      md += kvBlock([
        [zh ? '价格区间' : 'Price Range', s(c.price_range)],
        [zh ? '预估销量' : 'Est. Sales', s(c.estimated_sales)],
        [zh ? '评分' : 'Rating', s(c.rating)],
        [zh ? '核心优势' : 'Strengths', s(c.strengths)],
        [zh ? '短板' : 'Weaknesses', s(c.weaknesses)],
        [zh ? '差异化点' : 'Differentiation', s(c.differentiation)],
        [zh ? '受众重叠' : 'Audience Overlap', s(c.audience_overlap)],
        [zh ? '内容策略' : 'Content Strategy', s(c.content_strategy)],
        [zh ? '达人合作' : 'Creator Collab', s(c.creator_collaboration)],
      ]);
      md += '\n\n';
    });
  }

  if (gaps.length) {
    md += section(zh ? '竞争空白' : 'Competitive Gaps',
      gaps.map((g, i) => `${i + 1}. **${s(g.type)}** — ${s(g.description)}${g.opportunity_size ? `（${zh ? '机会规模' : 'Opportunity'}: ${g.opportunity_size}）` : ''}`).join('\n'));
    md += '\n\n';
  }

  const gTotal = typeof gapScore === 'number' ? gapScore : gapScore.total;
  if (gTotal) {
    md += section(`${zh ? '竞争空白评分' : 'Gap Score'}: ${gTotal}/100`, typeof gapScore === 'object' ? kvBlock([
      [zh ? '价格' : 'Price', s(gapScore.price)],
      [zh ? '功能' : 'Feature', s(gapScore.feature)],
      [zh ? '受众' : 'Audience', s(gapScore.audience)],
      [zh ? '内容' : 'Content', s(gapScore.content)],
      [zh ? '渠道' : 'Channel', s(gapScore.channel)],
    ]) : '');
    md += '\n\n';
  }

  if (data.price_band_analysis) md += section(zh ? '价格带分析' : 'Price Band Analysis', para(data.price_band_analysis)) + '\n\n';
  if (data.recommended_positioning) md += section(zh ? '初步定位建议' : 'Positioning Recommendation', para(data.recommended_positioning)) + '\n\n';
  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 3: 深度拆解分析 ────────────────────────────────────────────

function renderStep3(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const sf = data.success_formula || {};
  const cs = data.content_strategy || {};
  const up = data.user_psychology || {};
  const cp = data.channel_performance || {};

  let md = `## Step 3: ${stepName}\n\n`;

  if (data.benchmark_target) {
    md += section(zh ? '拆解对象' : 'Benchmark Target', para(data.benchmark_target)) + '\n\n';
  }

  if (typeof sf === 'object' && Object.keys(sf).length) {
    md += section(zh ? '成功公式' : 'Success Formula', kvBlock([
      [zh ? '核心人群' : 'Core Audience', s(sf.core_audience)],
      [zh ? '差异化价值' : 'Differentiated Value', s(sf.differentiated_value)],
      [zh ? '信任背书' : 'Trust Endorsement', s(sf.trust_endorsement)],
      [zh ? '渠道策略' : 'Channel Strategy', s(sf.channel_strategy)],
      [zh ? '销售结果' : 'Result', s(sf.result)],
    ])) + '\n\n';
  } else if (typeof sf === 'string') {
    md += section(zh ? '成功公式' : 'Success Formula', para(sf)) + '\n\n';
  }

  if (data.selling_points?.length) {
    md += `### ${zh ? '卖点拆解' : 'Selling Points'}\n\n`;
    md += data.selling_points.map(sp =>
      `- **[${s(sp.type)}]** ${s(sp.point)}（${zh ? '渠道' : 'Channel'}: ${s(sp.channel)}，${zh ? '有效性' : 'Effectiveness'}: ${s(sp.effectiveness)}）`
    ).join('\n') + '\n\n';
  }

  if (Object.values(cs).some(v => v && v !== '-')) {
    md += section(zh ? '内容策略' : 'Content Strategy', kvBlock([
      [zh ? '内容支柱' : 'Pillars', s(cs.pillars)],
      [zh ? '爆款要素' : 'Viral Elements', s(cs.viral_elements)],
      [zh ? '发布规律' : 'Posting Pattern', s(cs.posting_pattern)],
      [zh ? '社群运营' : 'Community', s(cs.community)],
      [zh ? '达人合作' : 'Creator Model', s(cs.creator_model)],
    ])) + '\n\n';
  }

  if (Object.values(up).some(v => v && v !== '-')) {
    md += section(zh ? '用户心理洞察' : 'User Psychology', kvBlock([
      [zh ? '核心痛点' : 'Pain Points', s(up.pain_points)],
      [zh ? '情感触发器' : 'Emotional Triggers', s(up.emotional_triggers)],
      [zh ? '购买障碍' : 'Purchase Barriers', s(up.purchase_barriers)],
      [zh ? '决策旅程' : 'Decision Journey', s(up.decision_journey)],
    ])) + '\n\n';
  }

  if (Object.values(cp).some(v => v && v !== '-')) {
    md += section(zh ? '渠道表现' : 'Channel Performance', kvBlock([
      [zh ? '短视频' : 'Short Video', s(cp.short_video)],
      [zh ? '直播' : 'Live Stream', s(cp.live_stream)],
      [zh ? '货架电商' : 'Shelf E-commerce', s(cp.shelf_ecommerce)],
    ])) + '\n\n';
  }

  if (data.replicable_patterns?.length) {
    md += `### ${zh ? '可复制模式' : 'Replicable Patterns'}\n\n`;
    md += data.replicable_patterns.map(p =>
      `- **${s(p.pattern)}**（${zh ? '适用性' : 'Fit'}: ${s(p.applicability)}，${zh ? '难度' : 'Difficulty'}: ${s(p.difficulty)}${p.reference ? `，${zh ? '参考' : 'Ref'}: ${p.reference}` : ''}）`
    ).join('\n') + '\n\n';
  }

  if (data.failure_traps?.length) {
    md += `### ${zh ? '失败陷阱预警' : 'Failure Traps'}\n\n`;
    md += data.failure_traps.map(t =>
      `- **${s(t.trap)}**\n  ${zh ? '预警信号' : 'Warning'}: ${s(t.warning_signals)}\n  ${zh ? '预防策略' : 'Prevention'}: ${s(t.prevention)}`
    ).join('\n') + '\n\n';
  }

  if (data.actionable_recommendations?.length) {
    md += `### ${zh ? '可执行建议' : 'Actionable Recommendations'}\n\n`;
    md += data.actionable_recommendations.map(r =>
      `- **[${s(r.priority)}]** ${s(r.action)}${r.reference ? `（${zh ? '参考' : 'Ref'}: ${r.reference}）` : ''}${r.expected_impact ? `\n  → ${s(r.expected_impact)}` : ''}`
    ).join('\n') + '\n\n';
  }

  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 4: 机会地图 ────────────────────────────────────────────

function renderStep4(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const diff = data.differentiation || {};
  const entry = data.entry_recommendation || {};
  const comp = data.competition_strategy || {};
  const conf = data.confidence_level || {};

  let md = `## Step 4: ${stepName}\n\n`;

  if (data.opportunities?.length) {
    md += `### ${zh ? '蓝海机会' : 'Blue Ocean Opportunities'}\n\n`;
    data.opportunities.forEach((o, i) => {
      const scoreLabel = o.score != null && o.score !== '' ? `**${o.score}/100**` : '';
      md += `#### ${i + 1}. ${s(o.type)}${scoreLabel ? ` · ${zh ? '评分' : 'Score'} ${scoreLabel}` : ''}\n\n`;
      if (o.description) md += `${s(o.description)}\n\n`;
      const dimRows = [
        [zh ? '市场规模' : 'Market size', o.market_size],
        [zh ? '竞争强度' : 'Competition', o.competition],
        [zh ? '进入难度' : 'Entry difficulty', o.entry_difficulty],
        [zh ? '时间窗口' : 'Time window', o.time_window],
        [zh ? '投资回报潜力' : 'ROI potential', o.roi_potential],
      ].filter(([, v]) => v != null && String(v).trim() !== '');
      if (dimRows.length) {
        md += dimRows.map(([k, v]) => `- **${k}：** ${s(v)}`).join('\n');
        md += '\n\n';
      }
      md += '---\n\n';
    });
  }

  if (Object.values(diff).some(v => v && v !== '-')) {
    md += section(zh ? '差异化角度' : 'Differentiation Angles', kvBlock([
      [zh ? '产品维度' : 'Product', s(diff.product_angle)],
      [zh ? '价格维度' : 'Price', s(diff.price_angle)],
      [zh ? '渠道维度' : 'Channel', s(diff.channel_angle)],
      [zh ? '营销维度' : 'Marketing', s(diff.marketing_angle)],
      [zh ? '人群维度' : 'Audience', s(diff.audience_angle)],
    ]));
    if (diff.recommended_combination) {
      md += `\n\n**${zh ? '推荐组合' : 'Recommended Combination'}：** ${diff.recommended_combination}`;
    }
    md += '\n\n';
  }

  if (data.positioning_options?.length) {
    md += `### ${zh ? '定位选项' : 'Positioning Options'}\n\n`;
    md += data.positioning_options.map(p =>
      `- **${s(p.type)}** — ${s(p.fit_analysis)}\n  ${zh ? '策略' : 'Strategy'}: ${s(p.strategy)}，${zh ? '风险' : 'Risk'}: ${s(p.risk)}`
    ).join('\n') + '\n\n';
  }

  if (data.positioning_recommendation) {
    md += `**${zh ? '推荐定位' : 'Recommended Positioning'}：** ${data.positioning_recommendation}\n\n`;
  }

  if (Object.values(entry).some(v => v && v !== '-')) {
    md += section(zh ? '市场进入建议' : 'Entry Recommendation', kvBlock([
      [zh ? '首选机会' : 'Primary Opportunity', s(entry.primary_opportunity)],
      [zh ? '进入模式' : 'Entry Mode', s(entry.entry_mode)],
      [zh ? '国家优先级' : 'Country Priority', s(entry.country_priority)],
      [zh ? '时机策略' : 'Timing Strategy', s(entry.timing_strategy)],
      [zh ? '投资节奏' : 'Investment Pace', s(entry.investment_pace)],
    ])) + '\n\n';
  }

  if (Object.values(comp).some(v => v && v !== '-')) {
    md += section(zh ? '竞争策略' : 'Competition Strategy', kvBlock([
      [zh ? '主要对标' : 'Primary Rival', s(comp.primary_rival)],
      [zh ? '制胜策略' : 'Winning Strategy', s(comp.winning_strategy)],
      [zh ? '关键战场' : 'Key Battleground', s(comp.key_battleground)],
      [zh ? '具体战术' : 'Tactics', s(comp.tactics)],
    ])) + '\n\n';
  }

  if (conf.level || conf.key_assumptions) {
    md += section(`${zh ? '信心评估' : 'Confidence Level'}: ${s(conf.level)}`,
      (conf.key_assumptions?.length ? `**${zh ? '关键假设' : 'Key Assumptions'}：**\n${bullets(conf.key_assumptions)}\n\n` : '') +
      (conf.validation_needed?.length ? `**${zh ? '需验证' : 'Needs Validation'}：**\n${bullets(conf.validation_needed)}` : ''));
    md += '\n\n';
  }

  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 5: 概念方案生成 ────────────────────────────────────────────

function renderStep5(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const concepts = data.concepts || [];
  const rec = data.recommended_concept || {};

  let md = `## Step 5: ${stepName}\n\n`;

  concepts.forEach((c, i) => {
    md += `### ${zh ? '概念' : 'Concept'} ${c.id || (i + 1)}: ${s(c.name)}（${s(c.route)}）\n\n`;

    if (c.target_persona) md += `**${zh ? '目标人群' : 'Target Persona'}：** ${c.target_persona}\n\n`;

    const vp = c.value_proposition;
    if (vp) {
      if (typeof vp === 'string') {
        md += `**${zh ? '价值主张' : 'Value Proposition'}：** ${vp}\n\n`;
      } else {
        md += kvBlock([
          [zh ? '一句话承诺' : 'One-liner', s(vp.one_liner)],
          [zh ? '利益优先级' : 'Benefits', s(vp.benefits_priority)],
          [zh ? '情感诉求' : 'Emotional Appeal', s(vp.emotional_appeal)],
          [zh ? '功能诉求' : 'Functional Appeal', s(vp.functional_appeal)],
        ]) + '\n\n';
      }
    }

    if (c.product_config) md += `**${zh ? '产品配置' : 'Product Config'}：** ${c.product_config}\n\n`;

    const ch = c.channel_strategy;
    if (ch && typeof ch === 'object') {
      md += kvBlock([
        [zh ? '主渠道' : 'Primary Channel', s(ch.primary_channel)],
        [zh ? '渠道比例' : 'Channel Mix', s(ch.channel_mix)],
        [zh ? '内容形式' : 'Content Formats', s(ch.content_formats)],
        [zh ? '达人计划' : 'Creator Plan', s(ch.creator_plan)],
        [zh ? '发布频率' : 'Frequency', s(ch.posting_frequency)],
        [zh ? '启动顺序' : 'Launch Sequence', s(ch.launch_sequence)],
      ]) + '\n\n';
    } else if (ch) {
      md += `**${zh ? '渠道策略' : 'Channel Strategy'}：** ${ch}\n\n`;
    }

    if (c.messaging_framework) md += `**${zh ? '信息框架' : 'Messaging'}：** ${c.messaging_framework}\n\n`;

    const sm = c.success_metrics;
    if (sm && typeof sm === 'object') {
      md += kvBlock([
        [zh ? '目标 ROI' : 'Target ROI', s(sm.target_roi)],
        [zh ? '目标 CAC' : 'Target CAC', s(sm.target_cac)],
        [zh ? '目标转化率' : 'Target Conversion', s(sm.target_conversion)],
        [zh ? '首月销售' : 'Month 1 Sales', s(sm.month1_sales_target)],
        [zh ? '互动率' : 'Engagement', s(sm.engagement_target)],
      ]) + '\n\n';
    }

    if (c.risks_and_mitigation) md += `**${zh ? '风险与应对' : 'Risks'}：** ${c.risks_and_mitigation}\n\n`;

    const budget = c.budget;
    if (budget && typeof budget === 'object') {
      md += kvBlock([
        [zh ? '内容制作' : 'Content Production', s(budget.content_production)],
        [zh ? '达人合作' : 'Creator Collab', s(budget.creator_collaboration)],
        [zh ? '付费广告' : 'Paid Ads', s(budget.paid_ads)],
        [zh ? '应急储备' : 'Contingency', s(budget.contingency)],
        [zh ? '总预算' : 'Total', s(budget.total)],
      ]) + '\n\n';
    }

    md += '---\n\n';
  });

  if (data.comparison) {
    md += section(zh ? '概念对比' : 'Comparison', para(data.comparison)) + '\n\n';
  }

  if (rec.rationale || rec.id) {
    md += `### ${zh ? '推荐方案' : 'Recommended Concept'}\n\n`;
    if (rec.id) {
      const chosen = concepts.find(c => c.id === rec.id);
      md += `**${chosen?.name || `${zh ? '概念' : 'Concept'} ${rec.id}`}**\n\n`;
    }
    if (rec.rationale) md += para(rec.rationale) + '\n\n';
    if (rec.immediate_next_steps) md += `**${zh ? '下一步行动' : 'Next Steps'}：** ${rec.immediate_next_steps}\n\n`;
  }

  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 6: 视觉创意提示 ────────────────────────────────────────────

function renderStep6(data, stepName, uiLang) {
  const zh = uiLang === 'zh';

  let md = `## Step 6: ${stepName}\n\n`;

  if (data.hero_prompts?.length) {
    md += `### ${zh ? '主图提示词' : 'Hero Image Prompts'}\n\n`;
    md += data.hero_prompts.map((p, i) =>
      `**${i + 1}. ${s(p.usage)}**\n\n> ${s(p.prompt)}${p.style_notes ? `\n\n*${p.style_notes}*` : ''}`
    ).join('\n\n') + '\n\n';
  }

  if (data.video_hooks?.length) {
    md += `### ${zh ? '视频钩子' : 'Video Hooks'}\n\n`;
    md += data.video_hooks.map((h, i) => {
      let block = `**${i + 1}. ${s(h.hook_type)}**\n\n`;
      block += kvBlock([
        [zh ? '视觉方向' : 'Visual Direction', s(h.visual_direction)],
        [zh ? '开头画面' : 'Opening', s(h.opening_scene)],
        [zh ? '中间展开' : 'Middle', s(h.middle)],
        [zh ? '行动号召' : 'CTA', s(h.cta)],
        [zh ? '音乐氛围' : 'Music', s(h.music_mood)],
        [zh ? '文字叠加' : 'Text Overlay', s(h.text_overlay)],
      ]);
      return block;
    }).join('\n\n') + '\n\n';
  }

  if (data.lifestyle_scenes?.length) {
    md += `### ${zh ? '生活场景' : 'Lifestyle Scenes'}\n\n`;
    md += data.lifestyle_scenes.map((sc, i) =>
      `**${i + 1}. ${s(sc.scene)}**\n\n> ${s(sc.prompt)}${sc.authenticity_notes ? `\n\n*${sc.authenticity_notes}*` : ''}`
    ).join('\n\n') + '\n\n';
  }

  if (data.detail_prompts?.length) {
    md += `### ${zh ? '产品细节' : 'Product Details'}\n\n`;
    md += data.detail_prompts.map((d, i) =>
      `**${i + 1}. ${s(d.focus)}**\n\n> ${s(d.prompt)}`
    ).join('\n\n') + '\n\n';
  }

  const cs = data.color_scheme;
  if (cs && typeof cs === 'object') {
    md += section(zh ? '色彩方案' : 'Color Scheme', kvBlock([
      [zh ? '主色' : 'Primary', s(cs.primary)],
      [zh ? '辅色' : 'Secondary', s(cs.secondary)],
      [zh ? '点缀色' : 'Accent', s(cs.accent)],
      [zh ? '选色理由' : 'Rationale', s(cs.rationale)],
    ])) + '\n\n';
  }

  if (data.model_reference) {
    md += section(zh ? '模特参考' : 'Model Reference', para(data.model_reference)) + '\n\n';
  }

  const ps = data.platform_specs;
  if (ps && typeof ps === 'object') {
    md += `### ${zh ? '平台视觉规范' : 'Platform Specs'}\n\n`;
    if (ps.tiktok) md += `**TikTok：** ${ps.tiktok}\n\n`;
    if (ps.amazon) md += `**Amazon：** ${ps.amazon}\n\n`;
    if (ps.instagram) md += `**Instagram：** ${ps.instagram}\n\n`;
  }

  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 7: 广告文案套件 ────────────────────────────────────────────

function renderStep7(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const cm = data.core_message || {};

  let md = `## Step 7: ${stepName}\n\n`;

  if (cm.big_idea || cm.core_promise) {
    md += section(zh ? '核心信息' : 'Core Message', kvBlock([
      [zh ? '大创意' : 'Big Idea', s(cm.big_idea)],
      [zh ? '核心承诺' : 'Core Promise', s(cm.core_promise)],
      [zh ? '支撑证据' : 'Proof Points', s(cm.proof_points)],
    ])) + '\n\n';
  }

  if (data.headlines?.length) {
    md += `### ${zh ? '标题文案' : 'Headlines'}\n\n`;
    md += data.headlines.map(h =>
      `- **[${s(h.type)}]** ${s(h.text)}${h.use_case ? `\n  ${zh ? '场景' : 'Use'}: ${h.use_case}` : ''}${h.target_emotion ? ` · ${zh ? '情绪' : 'Emotion'}: ${h.target_emotion}` : ''}`
    ).join('\n') + '\n\n';
  }

  if (data.body_copy?.length) {
    md += `### ${zh ? '正文文案' : 'Body Copy'}\n\n`;
    data.body_copy.forEach(bc => {
      md += `**${s(bc.length)}（${s(bc.structure)}）**\n\n`;
      md += `${s(bc.text)}\n\n`;
      const meta = [
        bc.pain_point && `${zh ? '针对痛点' : 'Pain Point'}: ${bc.pain_point}`,
        bc.benefit && `${zh ? '强调利益' : 'Benefit'}: ${bc.benefit}`,
      ].filter(Boolean);
      if (meta.length) md += `*${meta.join(' · ')}*\n\n`;
    });
  }

  if (data.ctas?.length) {
    md += `### ${zh ? '行动号召' : 'CTAs'}\n\n`;
    md += data.ctas.map(c =>
      `- **${s(c.text)}**${c.button_style ? ` — ${c.button_style}` : ''}`
    ).join('\n') + '\n\n';
  }

  const ht = data.hashtags;
  if (ht && typeof ht === 'object') {
    md += `### ${zh ? '话题标签' : 'Hashtags'}\n\n`;
    const groups = [
      [zh ? '品牌' : 'Brand', ht.brand],
      [zh ? '类目' : 'Category', ht.category],
      [zh ? '趋势' : 'Trending', ht.trending],
      [zh ? '社群' : 'Community', ht.community],
      [zh ? '活动' : 'Campaign', ht.campaign],
    ];
    const categoryLabel = zh ? '类目' : 'Category';
    groups.forEach(([label, tags]) => {
      if (!tags?.length) return;
      const out =
        label === categoryLabel
          ? tags.map((t) => translateCategory(String(t), 'en'))
          : tags;
      md += `**${label}：** ${out.join(' ')}\n\n`;
    });
  }

  const pc = data.platform_copy;
  if (pc && typeof pc === 'object') {
    md += `### ${zh ? '平台适配文案' : 'Platform Copy'}\n\n`;
    for (const [platform, copy] of Object.entries(pc)) {
      if (!copy) continue;
      md += `**${platform.charAt(0).toUpperCase() + platform.slice(1)}**\n\n`;
      if (typeof copy === 'string') {
        md += `${copy}\n\n`;
      } else {
        md += Object.entries(copy)
          .filter(([, v]) => v && v !== '-')
          .map(([k, v]) => `- **${humanLabel(k)}：** ${typeof v === 'string' ? v : s(v)}`)
          .join('\n') + '\n\n';
      }
    }
  }

  if (data.ab_test_plan?.length) {
    md += `### ${zh ? 'A/B 测试计划' : 'A/B Test Plan'}\n\n`;
    md += data.ab_test_plan.map((t, i) =>
      `${i + 1}. **${s(t.test_name)}**（${zh ? '优先级' : 'Priority'}: ${s(t.priority)}）\n   ${zh ? '变量' : 'Variable'}: ${s(t.variable)} · ${zh ? '对照' : 'Control'}: ${s(t.control)} · ${zh ? '成功指标' : 'Metric'}: ${s(t.success_metric)}`
    ).join('\n') + '\n\n';
  }

  const cg = data.copy_guidelines;
  if (cg && typeof cg === 'object') {
    md += section(zh ? '文案指南' : 'Copy Guidelines', kvBlock([
      [zh ? '品牌声音' : 'Brand Voice', s(cg.brand_voice)],
      [zh ? '语言风格' : 'Style', s(cg.style)],
      [zh ? '文化适配' : 'Cultural Notes', s(cg.cultural_notes)],
      [zh ? '禁用词' : 'Forbidden Words', s(cg.forbidden_words)],
    ])) + '\n\n';
  }

  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 8: 执行路线图 ────────────────────────────────────────────

function renderStep8(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const rm = data.roadmap || {};
  const fp = data.financial_plan || {};

  let md = `## Step 8: ${stepName}\n\n`;

  const phases = [rm.phase_1, rm.phase_2, rm.phase_3].filter(Boolean);
  if (phases.length) {
    md += `### ${zh ? '90 天路线图' : '90-Day Roadmap'}\n\n`;
    phases.forEach(p => {
      md += `**${s(p.name)}（${s(p.period)}）** — ${s(p.focus)}\n\n`;
      md += kvBlock([
        [zh ? '预算占比' : 'Budget', s(p.budget_pct)],
        [zh ? '出口标准' : 'Exit Criteria', s(p.exit_criteria)],
      ]);
      if (p.weekly_tasks?.length) {
        md += `\n\n#### ${zh ? '周任务分解' : 'Weekly breakdown'}\n\n`;
        p.weekly_tasks.forEach((w) => {
          const period = `${zh ? '第' : 'Week '}${s(w.week)}${zh ? '周' : ''}`;
          const taskStr = s(w.tasks);
          const formatted =
            taskStr.length > 100 && (/Week\s*\d+[：:]/i.test(taskStr) || /第\s*\d+\s*周/.test(taskStr))
              ? formatDenseWeekBlocks(taskStr)
              : taskStr;
          md += `**${period}**\n\n${formatted}\n\n`;
          if (w.deliverables) {
            md += `*${zh ? '交付物' : 'Deliverable'}：* ${s(w.deliverables)}\n\n`;
          }
        });
      }
      if (p.test_plan) md += `\n\n${zh ? '测试方案' : 'Test Plan'}：${p.test_plan}`;
      if (p.decision_criteria) md += `\n${zh ? '决策标准' : 'Decision Criteria'}：${p.decision_criteria}`;
      if (p.expansion_path) md += `\n${zh ? '扩张路径' : 'Expansion Path'}：${p.expansion_path}`;
      md += '\n\n---\n\n';
    });
  }

  if (data.resources) {
    const res = data.resources;
    md += `### ${zh ? '资源配置' : 'Resources'}\n\n`;
    if (res.team?.length) {
      md += `**${zh ? '团队' : 'Team'}：**\n`;
      md += res.team.map(t => `- **${s(t.role)}** — ${s(t.responsibility)}${t.cost ? `（${t.cost}）` : ''}`).join('\n') + '\n\n';
    }
    if (res.tools?.length) md += `**${zh ? '工具' : 'Tools'}：** ${res.tools.join(', ')}\n\n`;
    if (res.creator_plan) md += `**${zh ? '达人计划' : 'Creator Plan'}：** ${res.creator_plan}\n\n`;
  }

  if (Object.keys(fp).length) {
    md += section(zh ? '财务计划' : 'Financial Plan', kvBlock([
      [zh ? '总预算' : 'Total Budget', s(fp.total_budget)],
      [zh ? '月度现金流' : 'Monthly Cashflow', s(fp.monthly_cashflow)],
      [zh ? '盈亏平衡' : 'Break-even', s(fp.break_even_timeline)],
    ]));
    const ue = fp.unit_economics;
    if (ue && typeof ue === 'object') {
      md += '\n\n' + kvBlock([
        ['CAC', s(ue.cac)],
        ['LTV', s(ue.ltv)],
        [zh ? '客单价' : 'AOV', s(ue.aov)],
        [zh ? '毛利率' : 'Gross Margin', s(ue.gross_margin)],
      ]);
    }
    md += '\n\n';
  }

  if (data.risk_management?.length) {
    md += `### ${zh ? '风险管理' : 'Risk Management'}\n\n`;
    md += `| ${zh ? '风险' : 'Risk'} | ${zh ? '概率' : 'Prob.'} | ${zh ? '影响' : 'Impact'} | ${zh ? '应对策略' : 'Mitigation'} |\n`;
    md += '|---|---|---|---|\n';
    md += data.risk_management.map(r =>
      `| ${s(r.risk)} | ${s(r.probability)} | ${s(r.impact)} | ${s(r.mitigation)} |`
    ).join('\n') + '\n\n';
  }

  const kpi = data.kpi_dashboard;
  if (kpi && typeof kpi === 'object') {
    md += `### ${zh ? 'KPI 看板' : 'KPI Dashboard'}\n\n`;
    if (kpi.daily?.length) md += `**${zh ? '日监控' : 'Daily'}：** ${kpi.daily.join(' · ')}\n\n`;
    if (kpi.weekly?.length) md += `**${zh ? '周监控' : 'Weekly'}：** ${kpi.weekly.join(' · ')}\n\n`;
    if (kpi.monthly?.length) md += `**${zh ? '月监控' : 'Monthly'}：** ${kpi.monthly.join(' · ')}\n\n`;
  }

  if (data.immediate_actions?.length) {
    md += `### ${zh ? '即时行动清单' : 'Immediate Actions'}\n\n`;
    md += `| ${zh ? '事项' : 'Action'} | ${zh ? '负责人' : 'Owner'} | ${zh ? '截止' : 'Deadline'} | ${zh ? '交付物' : 'Deliverable'} |\n`;
    md += '|---|---|---|---|\n';
    md += data.immediate_actions.map(a =>
      `| ${s(a.action)} | ${s(a.owner)} | ${s(a.deadline)} | ${s(a.deliverable)} |`
    ).join('\n') + '\n\n';
  }

  if (data.monthly_milestones?.length) {
    md += section(zh ? '月度里程碑' : 'Monthly Milestones', numberedList(data.monthly_milestones)) + '\n\n';
  }

  if (data.summary) md += section(zh ? '本步小结' : 'Summary', para(data.summary));

  return md;
}

// ─── Step 9: 最终报告整合 ────────────────────────────────────────────

function renderStep9(data, stepName, uiLang) {
  const zh = uiLang === 'zh';
  const es = data.executive_summary || {};
  const so = data.strategic_overview || {};
  const ss = data.strategy_summary || {};
  const ff = data.financial_forecast || {};
  const ra = data.risk_assessment || {};
  const impl = data.implementation || {};

  let md = `## Step 9: ${stepName}\n\n`;

  if (data.markdown_summary && typeof data.markdown_summary === 'string' && data.markdown_summary.length > 50) {
    md += data.markdown_summary + '\n\n---\n\n';
    md += `### ${zh ? '结构化数据补充' : 'Structured Data Supplement'}\n\n`;
  }

  if (es.opportunity_score || es.recommended_action) {
    md += `### ${zh ? '执行摘要' : 'Executive Summary'}\n\n`;
    md += kvBlock([
      [zh ? '机会评分' : 'Opportunity Score', es.opportunity_score ? `${es.opportunity_score}/100` : '-'],
      [zh ? '评分理由' : 'Score Rationale', s(es.score_rationale)],
      [zh ? '信心水平' : 'Confidence', s(es.confidence_level)],
      [zh ? '推荐行动' : 'Recommended Action', s(es.recommended_action)],
      [zh ? '决策理由' : 'Action Rationale', s(es.action_rationale)],
    ]) + '\n\n';
    if (es.investment_thesis) md += `**${zh ? '投资论点' : 'Investment Thesis'}：** ${es.investment_thesis}\n\n`;
    if (es.key_insight) md += `**${zh ? '核心洞察' : 'Key Insight'}：** ${es.key_insight}\n\n`;
    if (es.critical_success_factors?.length) {
      md += `**${zh ? '关键成功因素' : 'Critical Success Factors'}：**\n${bullets(es.critical_success_factors)}\n\n`;
    }
    if (es.major_risks?.length) {
      md += `**${zh ? '主要风险' : 'Major Risks'}：**\n${bullets(es.major_risks)}\n\n`;
    }
  }

  if (Object.values(so).some(v => v && v !== '-')) {
    md += section(zh ? '战略概览' : 'Strategic Overview', kvBlock([
      [zh ? '产品' : 'Product', s(so.product)],
      [zh ? '目标市场' : 'Target Market', s(so.target_market)],
      [zh ? '目标人群' : 'Target Audience', s(so.target_audience)],
      [zh ? '推荐定位' : 'Positioning', s(so.positioning)],
      [zh ? '差异化策略' : 'Differentiation', s(so.differentiation)],
      [zh ? '竞争优势' : 'Competitive Advantage', s(so.competitive_advantage)],
    ])) + '\n\n';
  }

  if (Object.values(ss).some(v => v && v !== '-')) {
    md += `### ${zh ? '完整策略总结' : 'Strategy Summary'}\n\n`;
    if (ss.market_analysis) md += `**${zh ? '市场分析' : 'Market Analysis'}：** ${s(ss.market_analysis)}\n\n`;
    if (ss.competitive_landscape) md += `**${zh ? '竞争格局' : 'Competitive Landscape'}：** ${s(ss.competitive_landscape)}\n\n`;
    if (ss.opportunity_selection) md += `**${zh ? '机会选择' : 'Opportunity Selection'}：** ${s(ss.opportunity_selection)}\n\n`;
    if (ss.marketing_plan) md += `**${zh ? '营销方案' : 'Marketing Plan'}：** ${s(ss.marketing_plan)}\n\n`;
    if (ss.execution_plan) {
      const ex = s(ss.execution_plan);
      const exFmt =
        ex.length > 120 && (/Week\s*\d+[：:]/i.test(ex) || /第\s*\d+\s*周/.test(ex))
          ? formatDenseWeekBlocks(ex)
          : ex;
      md += `**${zh ? '执行计划' : 'Execution Plan'}：**\n\n${exFmt}\n\n`;
    }
  }

  if (Object.values(ff).some(v => v && v !== '-')) {
    md += section(zh ? '财务预测' : 'Financial Forecast', kvBlock([
      [zh ? '月度预测' : 'Monthly Projection', s(ff.monthly_projection)],
      [zh ? '单位经济' : 'Unit Economics', s(ff.unit_economics)],
      [zh ? '盈亏平衡' : 'Break-even', s(ff.break_even)],
      [zh ? '首年 ROI' : 'Year 1 ROI', s(ff.year1_roi)],
    ])) + '\n\n';
  }

  if (ra.risk_matrix || ra.contingency_plans) {
    md += `### ${zh ? '风险评估' : 'Risk Assessment'}\n\n`;
    if (ra.risk_matrix) md += `${formatDenseRiskOrList(para(ra.risk_matrix))}\n\n`;
    if (ra.contingency_plans) {
      md += `**${zh ? '应急预案' : 'Contingency'}：**\n\n${formatDenseRiskOrList(para(ra.contingency_plans))}\n\n`;
    }
  }

  if (Object.values(impl).some(v => v && v !== '-')) {
    md += `### ${zh ? '实施路线' : 'Implementation'}\n\n`;
    if (impl.immediate_actions) md += `**${zh ? '即时行动' : 'Immediate Actions'}：**\n\n${formatDenseRiskOrList(para(impl.immediate_actions))}\n\n`;
    if (impl.this_week) md += `**${zh ? '本周事项' : 'This Week'}：**\n\n${formatDenseRiskOrList(para(impl.this_week))}\n\n`;
    if (impl.monthly_milestones) md += `**${zh ? '月度里程碑' : 'Monthly Milestones'}：**\n\n${formatDenseRiskOrList(para(impl.monthly_milestones))}\n\n`;
    if (impl.success_checklist) md += `**${zh ? '成功检查清单' : 'Success Checklist'}：** ${impl.success_checklist}\n\n`;
  }

  const sc = data.supply_chain_backbone;
  if (sc && typeof sc === 'object' && (sc.integration_summary || (sc.tangbuy_support_points && sc.tangbuy_support_points.length))) {
    md += `### ${zh ? '供应链保障与履约支撑（Tangbuy）' : 'Supply chain & fulfillment backbone (Tangbuy)'}\n\n`;
    md += `${formatSupplyChainBackboneMarkdown(sc, uiLang)}\n\n`;
  }

  return md;
}

// ─── Executive Summary (report-level overview) ────────────────────────────────────────────

function generateExecutiveSummary(report, uiLang) {
  const zh = uiLang === 'zh';
  const step9 = deepDecodeEntities(report.stepOutputs?.find(s => s.step === 9)?.data || {});
  const step8 = deepDecodeEntities(report.stepOutputs?.find(s => s.step === 8)?.data || {});
  const es = step9.executive_summary || {};

  const score = val(es.opportunity_score, step8.financial_plan?.total_budget ? 70 : 0) || '-';
  const confidence = s(es.confidence_level, step9.confidence_level, zh ? '中' : 'Medium');
  const action = s(es.recommended_action, zh ? '待评估' : 'TBD');
  const thesis = val(es.investment_thesis, step9.investment_thesis);
  const insight = val(es.key_insight, step9.key_insight);

  const prodName = report.productData?.name || '-';
  const category = translateCategory(report.productData?.category || '-', 'en');
  const countries = report.targetMarket?.countries || '-';
  const ages = report.targetMarket?.ages || '-';
  const date = formatDate(report.createdAt, uiLang);

  // 不在正文顶部重复「AI 诊断报告」大标题，由页面/报告头展示
  let md = `## ${zh ? '执行摘要' : 'Executive Summary'}\n\n`;
  md += `### ${zh ? '机会评分' : 'Opportunity Score'}: ${score}/100\n\n`;
  md += kvBlock([
    [zh ? '信心水平' : 'Confidence', confidence],
    [zh ? '推荐行动' : 'Action', action],
  ]);
  if (thesis) md += `\n\n**${zh ? '投资论点' : 'Investment Thesis'}：** ${thesis}`;
  if (insight) md += `\n\n**${zh ? '核心洞察' : 'Key Insight'}：** ${insight}`;

  md += `\n\n---\n\n### ${zh ? '概览' : 'Overview'}\n\n`;
  md += `| ${zh ? '指标' : 'Metric'} | ${zh ? '数值' : 'Value'} |\n`;
  md += '|---|---|\n';
  md += `| ${zh ? '产品名称' : 'Product'} | ${prodName} |\n`;
  md += `| ${zh ? '类目' : 'Category'} | ${category} |\n`;
  md += `| ${zh ? '目标市场' : 'Market'} | ${countries} |\n`;
  md += `| ${zh ? '目标人群' : 'Audience'} | ${ages} |\n`;
  md += `| ${zh ? '分析日期' : 'Date'} | ${date} |\n`;

  md += `\n---\n\n### ${zh ? '核心亮点' : 'Key Highlights'}\n\n`;
  md += generateHighlights(report, uiLang);

  md += `\n\n---\n\n### ${zh ? '风险概要' : 'Risk Summary'}\n\n`;
  md += generateRiskSummary(report, uiLang);

  const step9Sc = step9.supply_chain_backbone;
  const scBackbone =
    step9Sc && typeof step9Sc === 'object' && (step9Sc.integration_summary || (step9Sc.tangbuy_support_points && step9Sc.tangbuy_support_points.length))
      ? step9Sc
      : buildAggregatedSupplyChainBackbone(uiLang, {
          productName: report.productData?.name,
          targetCountries: Array.isArray(report.targetMarket?.countries)
            ? report.targetMarket.countries.join(zh ? '、' : ', ')
            : (report.targetMarket?.countries || ''),
          executionPlanSummary: step8?.summary || step9?.strategy_summary?.execution_plan,
        });
  md += `\n\n---\n\n### ${zh ? '供应链保障支撑（Tangbuy）' : 'Supply chain backbone (Tangbuy)'}\n\n`;
  md += formatSupplyChainBackboneMarkdown(scBackbone, uiLang) || (zh ? '（供应链衔接说明见 Tangbuy Dropshipping 产品池与寻源入口。）' : '(Use the Tangbuy product pool and sourcing request to align fulfillment with the plan above.)');

  md += `\n\n---\n\n### ${zh ? '下一步行动' : 'Next Steps'}\n\n`;
  md += generateNextSteps(report, uiLang);

  return md;
}

// ─── Summary Helpers ────────────────────────────────────────────

function generateHighlights(report, uiLang) {
  const zh = uiLang === 'zh';
  const items = [];

  const s1 = report.stepOutputs?.find(s => s.step === 1)?.data;
  const s2 = report.stepOutputs?.find(s => s.step === 2)?.data;
  const s4 = report.stepOutputs?.find(s => s.step === 4)?.data;

  const heatScore = s1?.market_heat?.score;
  if (heatScore >= 70) items.push(zh ? '市场热度较高，入场信号积极' : 'High market heat — positive entry signal');
  const audienceScore = s1?.audience_match?.score;
  if (audienceScore >= 80) items.push(zh ? '目标人群匹配度优秀' : 'Excellent audience match');
  if (s2?.gaps?.length > 0) items.push(zh ? '发现明确的竞争空白' : 'Clear competitive gaps identified');
  if (s4?.opportunities?.length > 0) items.push(zh ? '蓝海机会已识别' : 'Blue ocean opportunities identified');
  if (s1?.entry_timing?.score >= 70) items.push(zh ? '入场时机良好' : 'Good entry timing');

  return items.length
    ? items.map(i => `- ${i}`).join('\n')
    : (zh ? '分析完成，详见各步骤详情' : 'Analysis complete — see step details');
}

function generateRiskSummary(report, uiLang) {
  const zh = uiLang === 'zh';
  const risks = [];

  const s3 = report.stepOutputs?.find(s => s.step === 3)?.data;
  const s8 = report.stepOutputs?.find(s => s.step === 8)?.data;
  const s9 = report.stepOutputs?.find(s => s.step === 9)?.data;

  (s3?.failure_traps || []).slice(0, 2).forEach(t => {
    const text = typeof t === 'string' ? t : (t.trap || t.description || flatObj(t));
    risks.push(text);
  });
  (s8?.risk_management || []).slice(0, 2).forEach(r => {
    const text = typeof r === 'string' ? r : (r.risk || r.description || flatObj(r));
    risks.push(text);
  });
  (s9?.executive_summary?.major_risks || []).slice(0, 2).forEach(r => {
    risks.push(typeof r === 'string' ? r : flatObj(r));
  });

  if (!risks.length) return zh ? '未发现重大风险' : 'No major risks identified';
  const unique = [...new Set(risks)];
  return unique.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join('\n');
}

function generateNextSteps(report, uiLang) {
  const zh = uiLang === 'zh';
  const s8 = report.stepOutputs?.find(s => s.step === 8)?.data;
  const rm = s8?.roadmap || {};

  const p1 = rm.phase_1 || {};
  const p2 = rm.phase_2 || {};
  const p3 = rm.phase_3 || {};

  if (p1.focus || p2.focus || p3.focus) {
    return `1. **${s(p1.name, zh ? '准备期' : 'Prep')}（${s(p1.period, 'Day 1-30')}）：** ${s(p1.focus, zh ? '内容与库存准备' : 'Content & inventory prep')}
2. **${s(p2.name, zh ? '启动期' : 'Launch')}（${s(p2.period, 'Day 31-60')}）：** ${s(p2.focus, zh ? '测试验证' : 'Test & validate')}
3. **${s(p3.name, zh ? '放量期' : 'Scale')}（${s(p3.period, 'Day 61-90')}）：** ${s(p3.focus, zh ? '规模化扩张' : 'Scale up')}`;
  }

  if (s8?.immediate_actions?.length) {
    return s8.immediate_actions.slice(0, 3).map((a, i) =>
      `${i + 1}. ${typeof a === 'string' ? a : (a.action || flatObj(a))}`
    ).join('\n');
  }

  return zh ? '1. 查看执行计划详情\n2. 准备启动 Phase 1' : '1. Review execution plan\n2. Prepare Phase 1';
}
