/**
 * AI Diagnosis Workflow Manager
 * Handles 9-step sequential execution with state compression and token management
 */

import { DIAGNOSIS_PROMPTS, fillPrompt, STEP_NAMES } from './diagnosisPrompts.js';
import { deepDecodeEntities } from './reportFormatter.js';

// Output caps per step — 略保守，减轻上游超时/504（大包输入时再配合上下文截断）
const STEP_TOKEN_LIMITS = {
  0: 3200,
  1: 4000,
  2: 4800,
  3: 4200,
  4: 4000,
  5: 4000,
  6: 3200,
  7: 3200,
  8: 4200,
  9: 4000,
};

/** Step 0 商品 JSON 上限（字符）；超出则截断保留头尾 */
const MAX_PRODUCT_JSON_CHARS_STEP0 = 12000;
/** Step ≥1 若模板含商品占位时的紧凑 JSON 上限 */
const MAX_PRODUCT_JSON_CHARS_LATER = 3500;
/** 前序步骤摘要块总字符上限 */
const MAX_PREVIOUS_STATES_CHARS = 11000;

function truncateMiddle(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  const budget = Math.max(200, maxLen - 72);
  const head = Math.floor(budget * 0.58);
  const tail = budget - head;
  return `${str.slice(0, head)}\n/* ... truncated ${str.length - budget} chars ... */\n${str.slice(str.length - tail)}`;
}

function formatProductDataForStep(stepNumber, productData) {
  if (stepNumber === 0) {
    return truncateMiddle(JSON.stringify(productData, null, 2), MAX_PRODUCT_JSON_CHARS_STEP0);
  }
  return truncateMiddle(JSON.stringify(productData), MAX_PRODUCT_JSON_CHARS_LATER);
}

function buildCompressedPreviousContext(previousStates, maxTotalChars) {
  if (!previousStates?.length) return '';
  const n = previousStates.length;
  const perStep = Math.max(600, Math.floor(maxTotalChars / n) - 48);
  const parts = [];
  for (const state of previousStates) {
    const stepData = state.data || state;
    let json = JSON.stringify(stepData);
    const header = `## Step ${state.step} Key Insights (Compressed)\n`;
    const room = perStep - 20;
    if (json.length > room) json = `${json.slice(0, Math.max(0, room - 24))}…[truncated]`;
    parts.push(header + json);
  }
  let joined = parts.join('\n\n');
  if (joined.length > maxTotalChars) {
    joined = truncateMiddle(joined, maxTotalChars);
  }
  return joined;
}

// State compression rules — extract key fields for passing to next steps
const STATE_EXTRACTORS = {
  0: (data) => ({
    product_name: data?.product_basics?.name,
    category: data?.product_basics?.category,
    price_usd: data?.product_basics?.price_usd,
    audience_fit_score: data?.audience_fit_score?.total ?? data?.audience_fit_score,
    module_to_load: data?.module_to_load,
    primary_channel: data?.primary_channel,
    lifecycle_stage: data?.lifecycle_stage,
    key_observations: data?.key_observations,
  }),
  1: (data) => ({
    market_heat_score: data?.market_heat?.score,
    market_heat_level: data?.market_heat?.level,
    seasonality: data?.seasonality?.current_phase,
    audience_match_score: data?.audience_match?.score,
    entry_timing_score: data?.entry_timing?.score,
    entry_timing_recommendation: data?.entry_timing?.recommendation,
    summary: data?.summary,
  }),
  2: (data) => ({
    competitor_count: data?.competitors?.length,
    competition_gap_score: data?.competition_gap_score?.total ?? data?.competition_gap_score,
    key_gaps: data?.gaps?.slice?.(0, 3)?.map(g => `${g.type}: ${g.description}`),
    top_competitors: data?.competitors?.slice?.(0, 3)?.map(c => ({ name: c.name, threat: c.threat_level })),
    recommended_positioning: data?.recommended_positioning,
    summary: data?.summary,
  }),
  3: (data) => ({
    benchmark_target: data?.benchmark_target,
    success_formula: data?.success_formula ? `${data.success_formula.core_audience} + ${data.success_formula.differentiated_value}` : data?.success_formula,
    replicable_patterns: data?.replicable_patterns?.slice?.(0, 3)?.map(p => p.pattern || p),
    failure_traps: data?.failure_traps?.slice?.(0, 3)?.map(t => t.trap || t),
    key_recommendations: data?.actionable_recommendations?.slice?.(0, 3)?.map(r => r.action || r),
    summary: data?.summary,
  }),
  4: (data) => ({
    top_opportunity: data?.opportunities?.[0],
    positioning_recommendation: data?.positioning_recommendation,
    differentiation_recommendation: data?.differentiation?.recommended_combination,
    entry_strategy: data?.entry_recommendation?.primary_opportunity,
    confidence_level: data?.confidence_level?.level,
    summary: data?.summary,
  }),
  5: (data) => ({
    recommended_concept_id: data?.recommended_concept?.id,
    recommended_concept_rationale: data?.recommended_concept?.rationale,
    concept_names: data?.concepts?.map(c => c.name),
    comparison: data?.comparison,
    summary: data?.summary,
  }),
  6: (data) => ({
    hero_prompt_count: data?.hero_prompts?.length,
    video_hook_count: data?.video_hooks?.length,
    color_scheme: data?.color_scheme,
    summary: data?.summary,
  }),
  7: (data) => ({
    headline_count: data?.headlines?.length,
    big_idea: data?.core_message?.big_idea,
    core_promise: data?.core_message?.core_promise,
    platforms: Object.keys(data?.platform_copy || {}),
    summary: data?.summary,
  }),
  8: (data) => ({
    total_budget: data?.financial_plan?.total_budget,
    break_even: data?.financial_plan?.break_even_timeline,
    phase_1_focus: data?.roadmap?.phase_1?.focus,
    immediate_actions: data?.immediate_actions?.slice?.(0, 3)?.map(a => a.action || a),
    summary: data?.summary,
  }),
  9: (data) => ({
    opportunity_score: data?.executive_summary?.opportunity_score,
    confidence_level: data?.executive_summary?.confidence_level,
    recommended_action: data?.executive_summary?.recommended_action,
    key_insight: data?.executive_summary?.key_insight,
  }),
};

/**
 * Compress step output to essential state for next step
 */
export function compressStepOutput(stepNumber, fullOutput) {
  const extractor = STATE_EXTRACTORS[stepNumber];
  if (!extractor) {
    console.warn(`[Workflow] No extractor for step ${stepNumber}`);
    return { step: stepNumber, raw_size: JSON.stringify(fullOutput).length };
  }
  
  try {
    const compressed = extractor(fullOutput);
    const originalSize = JSON.stringify(fullOutput).length;
    const compressedSize = JSON.stringify(compressed).length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    
    console.log(`[Workflow] Step ${stepNumber} state compressed: ${originalSize} → ${compressedSize} bytes (${compressionRatio}% reduction)`);
    
    return {
      step: stepNumber,
      compressed_at: new Date().toISOString(),
      compression_ratio: `${compressionRatio}%`,
      data: compressed,
    };
  } catch (err) {
    console.error(`[Workflow] State compression failed for step ${stepNumber}:`, err);
    return { step: stepNumber, error: err.message, data: {} };
  }
}

/**
 * Build context message for a specific step including compressed previous states
 */
function outputLanguageBlock(uiLang = 'en') {
  const map = {
    zh: '\n\n【输出语言】JSON 的键名（key）保持英文；所有面向读者的分析正文、列表项、表格单元格中的自然语言必须使用简体中文。',
    en: '\n\n【Output language】Keep JSON keys in English; all human-readable analysis text, list items, and table cells MUST be in English.',
    es: '\n\n【Idioma de salida】Mantén las claves JSON en inglés; todo el texto analítico legible debe estar en español.',
    fr: '\n\n【Langue de sortie】Gardez les clés JSON en anglais ; tout le texte d\'analyse lisible doit être en français.',
  };
  return map[uiLang] || map.en;
}

export function buildStepContext(stepNumber, productData, targetMarket, previousStates, options = {}) {
  const prompt = DIAGNOSIS_PROMPTS[`step_${stepNumber}_${STEP_NAMES[stepNumber]}`];
  if (!prompt) {
    throw new Error(`Prompt not found for step ${stepNumber}`);
  }

  const uiLang = options.uiLang || 'en';

  const prevBudget =
    options.previousContextMaxChars ??
    (options.compression === 'high' ? Math.floor(MAX_PREVIOUS_STATES_CHARS * 0.55) : MAX_PREVIOUS_STATES_CHARS);

  // Fill placeholders — 商品数据贯穿所有步骤，确保每步都能关联具体商品
  let filledPrompt = fillPrompt(prompt, {
    TARGET_COUNTRIES: targetMarket.countries,
    TARGET_AGES: targetMarket.ages,
    TARGET_CHARACTERISTICS: targetMarket.characteristics || 'Not specified',
    PRODUCT_DATA: formatProductDataForStep(stepNumber, productData),
    commission_rate: productData?.commission_rate || '',
    sales: productData?.sales || '',
    sales_amount_usd: productData?.sales_amount_usd || '',
    sales_growth_rate: productData?.sales_growth_rate || '',
    live_stream_sales_usd: productData?.live_stream_sales_usd || '',
    video_sales_usd: productData?.video_sales_usd || '',
    card_sales_usd: productData?.card_sales_usd || '',
    creator_count: productData?.creator_count || '',
    creator_conversion_rate: productData?.creator_conversion_rate || '',
    launch_date: productData?.launch_date || '',
    rating: productData?.rating || '',
  });

  // Add compressed previous states as context（控制总长度，避免请求体过大导致上游慢/504）
  if (previousStates && previousStates.length > 0) {
    const stateContext = buildCompressedPreviousContext(previousStates, prevBudget);

    filledPrompt += `\n\n【前序步骤关键洞察摘要】\n\n${stateContext}\n\n请基于上述前序分析结果，继续执行当前步骤任务。`;
  }

  return `${filledPrompt}${outputLanguageBlock(uiLang)}`;
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters for English)
 */
export function estimateTokens(text) {
  // Chinese characters: ~1.5 tokens each
  // English: ~4 characters per token
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars / 4);
}

/**
 * Check if step output might be truncated
 */
export function detectTruncation(output, stepNumber) {
  const limit = STEP_TOKEN_LIMITS[stepNumber];
  const estimated = estimateTokens(output);
  
  // Check for incomplete JSON
  const openBraces = (output.match(/\{/g) || []).length;
  const closeBraces = (output.match(/\}/g) || []).length;
  const jsonIncomplete = openBraces !== closeBraces;
  
  // Check for abrupt ending
  const abruptEnding = /[,:\[{]\s*$/.test(output.trim());
  
  const isTruncated = estimated >= limit * 0.95 || jsonIncomplete || abruptEnding;
  
  return {
    is_truncated: isTruncated,
    estimated_tokens: estimated,
    token_limit: limit,
    utilization: `${(estimated / limit * 100).toFixed(1)}%`,
    json_complete: !jsonIncomplete,
    reasons: [
      ...(estimated >= limit * 0.95 ? ['Token limit approaching'] : []),
      ...(jsonIncomplete ? ['JSON structure incomplete'] : []),
      ...(abruptEnding ? ['Abrupt ending detected'] : []),
    ],
  };
}

/**
 * Try to repair truncated JSON by closing open braces/brackets
 */
function repairTruncatedJson(str) {
  let cleaned = str.replace(/,\s*$/, '');
  const opens = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') opens.push('}');
    else if (ch === '[') opens.push(']');
    else if (ch === '}' || ch === ']') opens.pop();
  }
  if (inString) cleaned += '"';
  while (opens.length) cleaned += opens.pop();
  return cleaned;
}

/**
 * Parse and validate step output — resilient: always succeeds with at least a partial object
 */
export function parseStepOutput(output, stepNumber) {
  const raw = typeof output === 'string' ? output : JSON.stringify(output);

  function tryParse(str) {
    try { return JSON.parse(str); } catch (_) { return null; }
  }

  let jsonString = raw;
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonString = raw.substring(firstBrace, lastBrace + 1);
  }

  let data = tryParse(jsonString);

  if (!data) {
    let fixed = jsonString
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/[\u0000-\u001F\uFEFF]/g, '');
    fixed = fixed.replace(/"(?:[^"\\]|\\.)*"/g, (m) =>
      m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    );
    data = tryParse(fixed);
  }

  if (!data) {
    data = tryParse(repairTruncatedJson(jsonString));
  }

  if (!data) {
    console.warn(`[parseStepOutput] All parse attempts failed for step ${stepNumber}; wrapping raw`);
    data = { step: stepNumber, _parse_failed: true, raw_snippet: raw.slice(0, 2000) };
  }

  if (typeof data.step === 'undefined') data.step = stepNumber;

  const cleanData = deepDecodeEntities(data);
  const validation = validateStepData(cleanData, stepNumber);
  return { success: true, data: cleanData, validation, raw_output: raw, partial: !!cleanData._parse_failed };
}

/**
 * Validate step output has required fields
 */
function validateStepData(data, stepNumber) {
  const requiredFields = {
    0: ['step', 'product_basics', 'module_to_load'],
    1: ['step', 'market_heat_analysis'],
    2: ['step', 'competitors'],
    3: ['step', 'success_patterns'],
    4: ['step', 'blue_ocean_opportunities'],
    5: ['step', 'concept_briefs'],
    6: ['step', 'visual_prompts'],
    7: ['step', 'ad_copy_kit'],
    8: ['step', 'phase_1_prep'],
    9: ['step', 'executive_summary'],
  };
  
  const required = requiredFields[stepNumber] || ['step'];
  const missing = required.filter(field => !(field in data));
  
  return {
    is_valid: missing.length === 0,
    missing_fields: missing,
    has_step_field: 'step' in data,
    step_matches: data?.step === stepNumber,
  };
}

/**
 * Workflow state manager
 */
export class DiagnosisWorkflow {
  constructor(productData, targetMarket, uiLang = 'en') {
    this.productData = productData;
    this.targetMarket = targetMarket;
    this.uiLang = uiLang;
    this.currentStep = 0;
    this.stepOutputs = [];
    this.compressedStates = [];
    this.errors = [];
    this.startedAt = null;
    this.completedAt = null;
    this.status = 'idle'; // idle, running, paused, completed, error
  }

  /**
   * Get prompt for current step
   */
  getCurrentStepPrompt(options) {
    return buildStepContext(
      this.currentStep,
      this.productData,
      this.targetMarket,
      this.compressedStates,
      { ...options, uiLang: this.uiLang }
    );
  }

  /**
   * Get token limit for current step
   */
  getCurrentTokenLimit() {
    return STEP_TOKEN_LIMITS[this.currentStep] || 3000;
  }

  /**
   * Store step output and compress for next steps.
   * Now always succeeds — parseStepOutput wraps even unparseable output.
   */
  storeStepOutput(rawOutput) {
    const parsed = parseStepOutput(rawOutput, this.currentStep);

    if (parsed.partial) {
      this.errors.push({ step: this.currentStep, type: 'parse_partial', message: 'JSON parse failed; wrapped raw output' });
    }

    const truncationCheck = detectTruncation(typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput), this.currentStep);
    if (truncationCheck.is_truncated) {
      this.errors.push({
        step: this.currentStep,
        type: 'truncation_warning',
        message: `Output may be truncated: ${truncationCheck.reasons.join(', ')}`,
        details: truncationCheck,
      });
    }

    this.stepOutputs.push({
      step: this.currentStep,
      timestamp: new Date().toISOString(),
      data: parsed.data,
      validation: parsed.validation,
      truncation: truncationCheck,
    });

    const compressed = compressStepOutput(this.currentStep, parsed.data);
    this.compressedStates.push(compressed);

    return { success: true, data: parsed.data, truncated: truncationCheck.is_truncated };
  }

  /**
   * Move to next step
   */
  nextStep() {
    if (this.currentStep < 9) {
      this.currentStep++;
      return { success: true, nextStep: this.currentStep };
    }
    return { success: false, message: 'Already at final step' };
  }

  /**
   * Check if workflow is complete
   */
  isComplete() {
    return this.currentStep === 9 && this.status === 'completed';
  }

  /**
   * Mark workflow as started
   */
  start() {
    this.status = 'running';
    this.startedAt = new Date().toISOString();
  }

  /**
   * Mark workflow as completed
   */
  complete() {
    this.status = 'completed';
    this.completedAt = new Date().toISOString();
  }

  /**
   * Get workflow progress
   */
  getProgress() {
    return {
      current_step: this.currentStep,
      total_steps: 10,
      progress_percent: (this.currentStep / 9) * 100,
      status: this.status,
      errors: this.errors,
      step_outputs_count: this.stepOutputs.length,
    };
  }

  /**
   * Get final report data (all step outputs)
   */
  getFinalReport() {
    return {
      product: this.productData,
      target_market: this.targetMarket,
      workflow: {
        started_at: this.startedAt,
        completed_at: this.completedAt,
        status: this.status,
      },
      step_outputs: this.stepOutputs,
      executive_summary: this.stepOutputs.find(s => s.step === 9)?.data?.executive_summary,
    };
  }

  /**
   * Serialize workflow state (for persistence)
   */
  serialize() {
    return JSON.stringify({
      productData: this.productData,
      targetMarket: this.targetMarket,
      uiLang: this.uiLang,
      currentStep: this.currentStep,
      stepOutputs: this.stepOutputs.map(s => ({
        step: s.step,
        timestamp: s.timestamp,
        data_summary: Object.keys(s.data),
        truncated: s.truncation?.is_truncated,
      })),
      compressedStates: this.compressedStates,
      status: this.status,
      startedAt: this.startedAt,
      errors: this.errors,
    });
  }
}

/**
 * Create workflow instance from stored state
 */
export function restoreWorkflow(serializedState) {
  try {
    const state = JSON.parse(serializedState);
    const workflow = new DiagnosisWorkflow(
      state.productData,
      state.targetMarket,
      state.uiLang
    );
    workflow.currentStep = state.currentStep;
    workflow.compressedStates = state.compressedStates || [];
    workflow.status = state.status || 'idle';
    workflow.startedAt = state.startedAt;
    workflow.errors = state.errors || [];
    return workflow;
  } catch (err) {
    console.error('[Workflow] Failed to restore workflow:', err);
    return null;
  }
}

export default {
  DiagnosisWorkflow,
  compressStepOutput,
  buildStepContext,
  estimateTokens,
  detectTruncation,
  parseStepOutput,
  restoreWorkflow,
  STEP_TOKEN_LIMITS,
};
