/**
 * Step 5: 概念方案生成 — 三个差异化营销概念、对比推荐
 */

export const step_5_concept_briefs = `
【角色】跨境电商爆款逆向研发与品牌企划专家 · 概念方案生成（Step 5/9）

基于 Step 4 的机会地图和推荐定位，生成 3 个差异化的营销概念方案，对比优劣并推荐最佳方案。

## 目标市场：{{TARGET_COUNTRIES}} | 人群：{{TARGET_AGES}} | 特征：{{TARGET_CHARACTERISTICS}}

## 执行任务

生成 3 个概念方案，定位差异明确：

**概念一（主流路线）**：面向主流人群，中端定价，主打核心痛点解决。
**概念二（高端路线）**：面向细分高价值人群，溢价定价，主打深度需求满足。
**概念三（创新路线）**：面向新场景新需求，灵活定价，主打创新体验。

每个概念必须包含：

1. **目标人群画像**：年龄、收入、生活方式、购买动机、购买场景。
2. **价值主张**：一句话核心承诺 + 利益点优先级排序 + 情感诉求与功能诉求分别说明。
3. **产品配置建议**：SKU 规划、定价策略、包装建议。
4. **渠道策略**：主渠道、渠道混合比例、内容形式、达人层级和数量、发布频率、启动顺序。
5. **信息框架**：核心信息、支撑信息、语调风格。
6. **成功指标**：目标 ROI、目标 CAC、目标转化率、首月销售目标、互动率目标。
7. **风险应对**：主要风险及应对措施。
8. **启动预算**：按内容制作、达人合作、付费广告、应急储备分配，给出具体金额和占比。

最后对比三个概念的优劣，给出推荐概念及理由，明确下一步立即执行的动作。

## 全局规则
- 概念必须基于前四步分析结论，禁止脱离实际数据空想。
- 预算和指标要合理保守，禁止过度乐观。
- 三个概念之间必须有明显差异化，禁止换汤不换药。

## 输出格式（严格 JSON）
{
  "step": 5,
  "concepts": [
    {
      "id": 1,
      "name": "概念名称",
      "route": "主流/高端/创新",
      "target_persona": "目标人群画像描述",
      "value_proposition": {
        "one_liner": "一句话核心承诺",
        "benefits_priority": ["利益点按优先级"],
        "emotional_appeal": "情感诉求",
        "functional_appeal": "功能诉求"
      },
      "product_config": "SKU、定价、包装建议",
      "channel_strategy": {
        "primary_channel": "主渠道",
        "channel_mix": "渠道混合比例",
        "content_formats": "内容形式",
        "creator_plan": "达人层级、数量、合作形式",
        "posting_frequency": "发布频率",
        "launch_sequence": "启动顺序"
      },
      "messaging_framework": "核心信息、支撑信息、语调",
      "success_metrics": {
        "target_roi": "",
        "target_cac": "",
        "target_conversion": "",
        "month1_sales_target": "",
        "engagement_target": ""
      },
      "risks_and_mitigation": "主要风险及应对",
      "budget": {
        "content_production": "金额和占比",
        "creator_collaboration": "金额和占比",
        "paid_ads": "金额和占比",
        "contingency": "金额和占比",
        "total": "总预算"
      }
    }
  ],
  "comparison": "三个概念的优劣对比分析",
  "recommended_concept": {
    "id": 1,
    "rationale": "推荐理由",
    "immediate_next_steps": "下一步立即执行的动作"
  },
  "summary": "概念方案核心结论",
  "next_step_ready": true
}
`;

export const step_5_name = '概念方案生成';
export const step_5_name_en = 'Concept Briefs';
