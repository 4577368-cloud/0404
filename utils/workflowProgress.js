/**
 * 10 步诊断（Step 0–9）进度权重：前 9 步各 10%，最后一步（整合报告）20%，合计 100%。
 */
export const WORKFLOW_STEP_WEIGHTS = [10, 10, 10, 10, 10, 10, 10, 10, 10, 20];

const TOTAL_W = WORKFLOW_STEP_WEIGHTS.reduce((a, b) => a + b, 0);

/** 已完成 step 0..completedStepIndex（含）时的累计百分比 */
export function percentAfterCompletingStep(completedStepIndex) {
  if (completedStepIndex < 0) return 0;
  let s = 0;
  for (let i = 0; i <= completedStepIndex && i < WORKFLOW_STEP_WEIGHTS.length; i++) {
    s += WORKFLOW_STEP_WEIGHTS[i];
  }
  return Math.min(100, Math.round((s / TOTAL_W) * 100));
}

/** 正在执行 stepNumber 时尚未完成本步：累计为已完成的前序步 */
export function percentWhileRunningStep(stepNumber) {
  if (stepNumber <= 0) return 0;
  let s = 0;
  for (let i = 0; i < stepNumber && i < WORKFLOW_STEP_WEIGHTS.length; i++) {
    s += WORKFLOW_STEP_WEIGHTS[i];
  }
  return Math.min(100, Math.round((s / TOTAL_W) * 100));
}

export const WORKFLOW_TOTAL_STEPS = 10;
