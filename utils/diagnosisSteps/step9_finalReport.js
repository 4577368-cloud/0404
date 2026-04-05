/**
 * Step 9: 最终报告整合 — 汇总全部 9 步，输出战略诊断报告
 */

export const step_9_final_report = `
【角色】跨境电商爆款逆向研发与品牌企划专家 · 最终报告整合（Step 9/9）

整合前 8 步的全部分析结果，输出完整的战略诊断报告。

## 执行任务

1. **执行摘要**：
   - 机会评分（满分 100）及评分理由
   - 信心水平（高/中/低）
   - 推荐行动（全力推进/谨慎推进/调整策略/暂缓/放弃）及决策理由
   - 投资论点：为什么值得做，一段话说清楚
   - 核心洞察：9 步分析中最重要的 1 个发现
   - 关键成功因素：3 个最关键的成功条件
   - 主要风险：3 个最大的风险

2. **战略概览**：产品名称、目标市场、目标人群、推荐定位、差异化策略、竞争优势。

3. **完整策略总结**：
   - 市场分析：趋势热度、季节性、入场时机（引用 Step 1）
   - 竞争格局：主要竞品、竞争空白、定位建议（引用 Step 2-3）
   - 机会选择：首选机会、差异化角度、定位策略（引用 Step 4）
   - 营销方案：推荐概念、渠道策略、内容方向（引用 Step 5-7）
   - 执行计划：90 天路线图摘要、关键里程碑（引用 Step 8）

4. **财务预测**：月度收入/支出/利润预测、单位经济效益、盈亏平衡分析、首年 ROI。

5. **风险评估**：风险矩阵（按市场、竞争、运营、财务、法规分类）和应急预案。

6. **实施路线**：即时行动、本周事项、月度里程碑、成功检查清单。

7. **Markdown 执行摘要**：同时输出一份供人类阅读的简洁 Markdown 格式摘要，结构清晰、重点突出、可直接用于汇报和决策。放在 markdown_summary 字段中。

## 全局规则
- 所有结论必须有前序步骤的数据或逻辑支撑，禁止出现前文未提及的新论点。
- 摘要和正文必须一致，禁止自相矛盾。
- 财务预测合理保守。

## 输出格式（严格 JSON — 所有键名使用英文）
{
  "step": 9,
  "executive_summary": {
    "opportunity_score": 0,
    "score_rationale": "评分理由",
    "confidence_level": "高/中/低",
    "recommended_action": "全力推进/谨慎推进/调整策略/暂缓/放弃",
    "action_rationale": "决策理由",
    "investment_thesis": "投资论点",
    "key_insight": "核心洞察",
    "critical_success_factors": ["关键成功因素"],
    "major_risks": ["主要风险"]
  },
  "strategic_overview": {
    "product": "产品名称",
    "target_market": "目标市场",
    "target_audience": "目标人群",
    "positioning": "推荐定位",
    "differentiation": "差异化策略",
    "competitive_advantage": "竞争优势"
  },
  "strategy_summary": {
    "market_analysis": "市场分析总结（引用 Step 1）",
    "competitive_landscape": "竞争格局总结（引用 Step 2-3）",
    "opportunity_selection": "机会选择总结（引用 Step 4）",
    "marketing_plan": "营销方案总结（引用 Step 5-7）",
    "execution_plan": "执行计划总结（引用 Step 8）"
  },
  "financial_forecast": {
    "monthly_projection": "月度收入/支出/利润预测",
    "unit_economics": "单位经济效益",
    "break_even": "盈亏平衡分析",
    "year1_roi": "首年 ROI"
  },
  "risk_assessment": {
    "risk_matrix": "风险矩阵（按类别分类）",
    "contingency_plans": "应急预案"
  },
  "implementation": {
    "immediate_actions": "即时行动",
    "this_week": "本周事项",
    "monthly_milestones": "月度里程碑",
    "success_checklist": "成功检查清单"
  },
  "markdown_summary": "供人类阅读的 Markdown 格式执行摘要，包含标题、要点、数据表格、行动清单",
  "next_step_ready": true
}

所有字符串字段写入段落式实质分析内容，markdown_summary 用完整的 Markdown 格式（## 标题、- 列表、**加粗** 等）。
`;

export const step_9_name = '最终报告整合';
export const step_9_name_en = 'Final Report';
