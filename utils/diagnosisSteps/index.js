/**
 * AI Diagnosis 9-Step Sequential Workflow Prompts
 * 
 * 专业版提示词 - 按步骤拆分的模块化结构
 * 每个步骤包含详细的分析框架和评估维度
 * 
 * @module diagnosisSteps
 */

// Step 0: 任务调度助手 - 数据解析与框架建立
export { step_0_scheduler, step_0_name, step_0_name_en } from './step0_scheduler.js';
export { step_0_scheduler_enhanced } from './step0_scheduler_enhanced.js';

// Step 1: 市场趋势分析师 - 趋势匹配度评估
export { step_1_trend_screening, step_1_name, step_1_name_en } from './step1_trendScreening.js';

// Step 2: 竞品对标分析师 - 竞争格局分析
export { step_2_benchmark_table, step_2_name, step_2_name_en } from './step2_benchmark.js';

// Step 3: 策略分析师 - 成功要素与壁垒分析
export { step_3_deep_analysis, step_3_name, step_3_name_en } from './step3_deepAnalysis.js';

// Step 4: 市场机会发现者 - STP战略制定
export { step_4_opportunity_map, step_4_name, step_4_name_en } from './step4_opportunityMap.js';

// Step 5: 创意策略师 - 营销概念生成
export { step_5_concept_briefs, step_5_name, step_5_name_en } from './step5_conceptBriefs.js';

// Step 6: 视觉创意师 - 视觉方案设计
export { step_6_visual_prompts, step_6_name, step_6_name_en } from './step6_visualPrompts.js';

// Step 7: 广告文案师 - 全平台文案体系
export { step_7_ad_copy, step_7_name, step_7_name_en } from './step7_adCopy.js';

// Step 8: 执行规划师 - 90天路线图
export { step_8_execution_plan, step_8_name, step_8_name_en } from './step8_executionPlan.js';

// Step 9: 战略整合师 - 最终报告
export { step_9_final_report, step_9_name, step_9_name_en } from './step9_finalReport.js';

// 导入所有提示词用于聚合
// 使用增强版调度器（含SEO/GEO Skill Library整合）
import { step_0_scheduler_enhanced as step_0_scheduler } from './step0_scheduler_enhanced.js';
import { step_1_trend_screening } from './step1_trendScreening.js';
import { step_2_benchmark_table } from './step2_benchmark.js';
import { step_3_deep_analysis } from './step3_deepAnalysis.js';
import { step_4_opportunity_map } from './step4_opportunityMap.js';
import { step_5_concept_briefs } from './step5_conceptBriefs.js';
import { step_6_visual_prompts } from './step6_visualPrompts.js';
import { step_7_ad_copy } from './step7_adCopy.js';
import { step_8_execution_plan } from './step8_executionPlan.js';
import { step_9_final_report } from './step9_finalReport.js';

// 步骤名称（中文）
export const STEP_NAMES_ZH = [
  '任务调度',
  '市场趋势分析',
  '竞品对标分析',
  '深度拆解分析',
  '机会地图',
  '概念方案生成',
  '视觉创意提示',
  '广告文案套件',
  '执行路线图',
  '最终报告整合'
];

// 步骤名称（英文）
export const STEP_NAMES_EN = [
  'Task Scheduler',
  'Market Trend Analysis',
  'Competitive Benchmark',
  'Deep Dive Analysis',
  'Opportunity Map',
  'Concept Briefs',
  'Visual Creative Prompts',
  'Ad Copy Kit',
  'Execution Roadmap',
  'Final Report'
];

// 聚合所有提示词（向后兼容）
export const DIAGNOSIS_PROMPTS = {
  step_0_scheduler,
  step_1_trend_screening,
  step_2_benchmark_table,
  step_3_deep_analysis,
  step_4_opportunity_map,
  step_5_concept_briefs,
  step_6_visual_prompts,
  step_7_ad_copy,
  step_8_execution_plan,
  step_9_final_report,
};

// 获取指定步骤的提示词
export function getStepPrompt(stepNumber) {
  const prompts = [
    step_0_scheduler,
    step_1_trend_screening,
    step_2_benchmark_table,
    step_3_deep_analysis,
    step_4_opportunity_map,
    step_5_concept_briefs,
    step_6_visual_prompts,
    step_7_ad_copy,
    step_8_execution_plan,
    step_9_final_report,
  ];
  return prompts[stepNumber] || null;
}

// 获取步骤名称
export function getStepName(stepNumber, lang = 'zh') {
  const names = lang === 'zh' ? STEP_NAMES_ZH : STEP_NAMES_EN;
  return names[stepNumber] || null;
}

// 兼容导出：标准版调度器（如需单独使用可从此处导入）
export { step_0_scheduler as step_0_scheduler_standard } from './step0_scheduler.js';

// 步骤提示词键名后缀（用于 DIAGNOSIS_PROMPTS 查找）
export const STEP_NAMES = [
  'scheduler',
  'trend_screening',
  'benchmark_table',
  'deep_analysis',
  'opportunity_map',
  'concept_briefs',
  'visual_prompts',
  'ad_copy',
  'execution_plan',
  'final_report',
];

// 提示词变量填充函数
export function fillPrompt(promptTemplate, variables) {
  let filled = promptTemplate;
  for (const [key, value] of Object.entries(variables)) {
    // Escape special regex characters in key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const placeholder = new RegExp('{{' + escapedKey + '}}', 'g');
    filled = filled.replace(placeholder, value);
  }
  return filled;
}

// 默认导出
export default {
  DIAGNOSIS_PROMPTS,
  STEP_NAMES,
  STEP_NAMES_ZH,
  STEP_NAMES_EN,
  getStepPrompt,
  getStepName,
  fillPrompt,
};
