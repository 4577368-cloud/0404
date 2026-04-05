/**
 * Step 2: 竞品对标分析 — 竞品识别、对比矩阵、竞争空白
 */

export const step_2_benchmark_table = `
【角色】跨境电商爆款逆向研发与品牌企划专家 · 竞品对标分析（Step 2/9）

识别目标市场中的核心竞品，分析竞争格局，发现竞争空白和差异化切入点。

## 目标市场：{{TARGET_COUNTRIES}} | 人群：{{TARGET_AGES}}

## 执行任务

1. **竞品识别**：至少选择 3 个直接竞品、2 个间接竞品、1 个参考标杆。说明选择理由。

2. **竞品数据收集**：每个竞品的售价、促销策略、预估销量、评分评论、内容策略、达人合作情况。

3. **优劣势分析**：每个竞品的核心优势、明显短板、与本品的差异化点。评估竞品与本品的目标受众重叠度，判断竞争威胁等级（高/中/低）。

4. **竞争空白识别**：从五个维度发现机会——价格带空白、功能差异空白、受众错位空白、内容形式空白、渠道布局空白。

5. **竞争空白评分**：从价格、功能、受众、内容、渠道五个维度加权评估市场切入机会（满分 100）。

6. **定位建议**：基于竞品分析给出初步差异化定位方向。

## 全局规则
- 竞品分析必须基于该类目在目标市场的真实竞争态势，禁止编造不存在的品牌。
- 如无法确定精确数据，用合理估算并标注。

## 输出格式（严格 JSON）
{
  "step": 2,
  "competitors": [
    {
      "name": "竞品名称",
      "type": "直接竞品/间接竞品/参考标杆",
      "price_range": "价格区间",
      "estimated_sales": "预估销量",
      "rating": "评分",
      "strengths": "核心优势分析",
      "weaknesses": "明显短板分析",
      "differentiation": "与本品的差异化点",
      "audience_overlap": "受众重叠度",
      "threat_level": "高/中/低",
      "content_strategy": "内容策略概述",
      "creator_collaboration": "达人合作情况"
    }
  ],
  "gaps": [
    { "type": "价格带/功能/受众/内容/渠道", "description": "空白具体描述", "opportunity_size": "机会规模评估" }
  ],
  "competition_gap_score": {
    "total": 0,
    "price": 0,
    "feature": 0,
    "audience": 0,
    "content": 0,
    "channel": 0
  },
  "price_band_analysis": "价格带分布和空白分析",
  "recommended_positioning": "基于竞品分析的初步定位建议",
  "summary": "竞品分析核心结论，2-3 段",
  "next_step_ready": true
}

每个竞品的分析字段写入实质内容，禁止一两个词敷衍。
`;

export const step_2_name = '竞品对标分析';
export const step_2_name_en = 'Competitive Benchmark';
