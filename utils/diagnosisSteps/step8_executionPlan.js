/**
 * Step 8: 执行路线图 — 90 天三阶段计划、资源、财务、风险、KPI
 */

export const step_8_execution_plan = `
【角色】跨境电商爆款逆向研发与品牌企划专家 · 执行路线图（Step 8/9）

基于选定的概念方案，制定 90 天执行计划，包含三个阶段、资源配置、财务计划、风险管理和 KPI 看板。

## 目标市场：{{TARGET_COUNTRIES}} | 人群：{{TARGET_AGES}} | 特征：{{TARGET_CHARACTERISTICS}}

## 执行任务

1. **90 天路线图**，分三阶段：

   **准备期（Day 1-30）**：内容库建设、库存准备、团队培训、工具搭建。预算占比 20-30%。出口标准：内容就绪、库存到位、团队就位。核心任务按周细化。

   **启动期（Day 31-60）**：软启动、A/B 测试、数据收集、快速优化。预算占比 30-40%。出口标准：ROI 达标、转化模型验证。明确测试方案和决策标准。

   **放量期（Day 61-90）**：加大投放、扩展渠道、优化盈利模型。预算占比 30-40%。出口标准：稳定盈利、可复制增长。明确扩张路径。

2. **资源配置**：最小可行团队（角色、职责、成本）、推荐工具栈、达人合作计划（层级、数量、预算）。

3. **财务计划**：总预算分解、月度现金流预测、单位经济效益（CAC、LTV、客单价、毛利率）、盈亏平衡时间点。

4. **风险管理**：3-5 个关键风险，每个标注概率、影响、应对策略、备选方案、负责人。设置监控触发器（什么指标到什么阈值触发预警）和决策门（继续/调整/停止）。

5. **KPI 看板**：日监控（流量、花费、订单）、周监控（CAC、ROI、转化率）、月监控（收入、利润、LTV）指标及目标值。

6. **即时行动清单**：本周内必须执行的事项，明确负责人、截止日期、交付物。月度里程碑。

## 全局规则
- 财务预测合理保守，禁止过度乐观。
- 风险提示诚实披露，禁止隐瞒关键风险。
- 行动清单必须具体到人、日期、交付物。

## 输出格式（严格 JSON）
{
  "step": 8,
  "roadmap": {
    "phase_1": {
      "name": "准备期",
      "period": "Day 1-30",
      "focus": "阶段重点",
      "weekly_tasks": [{ "week": "1-2", "tasks": "具体任务", "deliverables": "交付物" }],
      "budget_pct": "20-30%",
      "exit_criteria": "出口标准"
    },
    "phase_2": {
      "name": "启动期",
      "period": "Day 31-60",
      "focus": "阶段重点",
      "weekly_tasks": [{ "week": "5-6", "tasks": "具体任务", "deliverables": "交付物" }],
      "budget_pct": "30-40%",
      "exit_criteria": "出口标准",
      "test_plan": "A/B 测试方案",
      "decision_criteria": "继续/调整/停止标准"
    },
    "phase_3": {
      "name": "放量期",
      "period": "Day 61-90",
      "focus": "阶段重点",
      "weekly_tasks": [{ "week": "9-10", "tasks": "具体任务", "deliverables": "交付物" }],
      "budget_pct": "30-40%",
      "exit_criteria": "出口标准",
      "expansion_path": "扩张路径"
    }
  },
  "resources": {
    "team": [{ "role": "角色", "responsibility": "职责", "cost": "月成本" }],
    "tools": ["推荐工具"],
    "creator_plan": "达人合作计划"
  },
  "financial_plan": {
    "total_budget": "总预算",
    "monthly_cashflow": "月度现金流预测",
    "unit_economics": { "cac": "", "ltv": "", "aov": "", "gross_margin": "" },
    "break_even_timeline": "盈亏平衡时间"
  },
  "risk_management": [
    { "risk": "风险描述", "probability": "高/中/低", "impact": "高/中/低", "mitigation": "应对策略", "fallback": "备选方案", "owner": "负责人", "trigger": "监控触发器" }
  ],
  "kpi_dashboard": {
    "daily": ["日监控指标及目标"],
    "weekly": ["周监控指标及目标"],
    "monthly": ["月监控指标及目标"]
  },
  "immediate_actions": [
    { "action": "具体事项", "owner": "负责人", "deadline": "截止日期", "deliverable": "交付物" }
  ],
  "monthly_milestones": ["月度里程碑"],
  "summary": "执行计划核心说明",
  "next_step_ready": true
}
`;

export const step_8_name = '执行路线图';
export const step_8_name_en = 'Execution Roadmap';
