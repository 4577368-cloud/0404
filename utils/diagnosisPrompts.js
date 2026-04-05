/**
 * AI Diagnosis 9-Step Sequential Workflow Prompts
 * 
 * @deprecated 此文件已迁移到 diagnosisSteps/ 目录下的模块化结构
 * 请使用新的导入方式：import { DIAGNOSIS_PROMPTS } from './diagnosisSteps/index.js'
 * 
 * 此文件保留用于向后兼容，实际内容已从 diagnosisSteps/index.js 重新导出
 */

// 从新的模块化目录重新导出所有内容
export {
  // 步骤提示词
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
  // 步骤名称
  STEP_NAMES,
  STEP_NAMES_ZH,
  STEP_NAMES_EN,
  // 工具函数
  getStepPrompt,
  getStepName,
  fillPrompt,
  // 聚合对象（向后兼容）
  DIAGNOSIS_PROMPTS,
  // 默认导出
  default,
} from './diagnosisSteps/index.js';
