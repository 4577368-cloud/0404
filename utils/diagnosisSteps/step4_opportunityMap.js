/**
 * Step 4: 机会地图 — 蓝海识别、差异化角度、定位选项、进入策略
 */

export const step_4_opportunity_map = `
【角色】跨境电商爆款逆向研发与品牌企划专家 · 机会地图绘制（Step 4/9）

基于前三步的趋势、竞品、深度分析，识别蓝海切入点，设计差异化角度和市场进入策略。

## 目标市场：{{TARGET_COUNTRIES}} | 人群：{{TARGET_AGES}} | 特征：{{TARGET_CHARACTERISTICS}}

## 执行任务

1. **蓝海机会识别**：从五个类型发现机会——价格带空白、受众空白、功能空白、渠道空白、时机空白。每个机会评估市场规模、竞争强度、进入难度、时间窗口、投资回报，计算机会评分（满分 100）。

2. **差异化角度设计**：从产品、价格、渠道、营销、人群五个维度出发，明确价值主张和支撑证据。给出推荐的差异化组合。

3. **定位选项**：分析以下五种定位的适用性——
   - 高端定位：溢价策略、品质背书
   - 价值定位：性价比、功能完备
   - 细分定位：聚焦小众需求
   - 大众定位：规模化、低门槛
   - 颠覆者定位：重新定义品类
   每个选项说明适用场景、策略要点、风险水平。给出推荐定位。

4. **市场进入建议**：首选机会、进入模式（DTC/平台/混合）、国家优先级排序、时机策略、投资节奏。

5. **竞争策略**：主要对标竞品、制胜策略、关键战场、具体战术。

6. **信心评估**：整体信心水平（高/中/低），列出关键假设和需要验证的点。

## 全局规则
- 机会必须基于前三步的数据支撑，禁止凭空想象。
- 每个建议必须有明确的逻辑链。
- **JSON 字符串值**须为可直接阅读的纯文本：直接使用英文引号 \`\'\` 或中文标点，**禁止** HTML 实体（如 \`&#39;\`、\`&amp;\`、\`&quot;\`），否则会显示为乱码。

## 输出格式（严格 JSON）
{
  "step": 4,
  "opportunities": [
    {
      "type": "价格带/受众/功能/渠道/时机",
      "description": "机会描述",
      "market_size": "市场规模评估",
      "competition": "竞争强度",
      "entry_difficulty": "进入难度",
      "time_window": "时间窗口",
      "roi_potential": "投资回报潜力",
      "score": 0
    }
  ],
  "differentiation": {
    "product_angle": "产品维度差异化",
    "price_angle": "价格维度差异化",
    "channel_angle": "渠道维度差异化",
    "marketing_angle": "营销维度差异化",
    "audience_angle": "人群维度差异化",
    "recommended_combination": "推荐的差异化组合及理由"
  },
  "positioning_options": [
    { "type": "高端/价值/细分/大众/颠覆者", "fit_analysis": "适用性分析", "strategy": "策略要点", "risk": "风险水平" }
  ],
  "positioning_recommendation": "推荐定位及理由",
  "entry_recommendation": {
    "primary_opportunity": "首选机会",
    "entry_mode": "DTC/平台/混合",
    "country_priority": "国家优先级排序及理由",
    "timing_strategy": "时机策略",
    "investment_pace": "投资节奏建议"
  },
  "competition_strategy": {
    "primary_rival": "主要对标竞品",
    "winning_strategy": "制胜策略",
    "key_battleground": "关键战场",
    "tactics": "具体战术"
  },
  "confidence_level": {
    "level": "高/中/低",
    "key_assumptions": ["关键假设"],
    "validation_needed": ["需要验证的点"]
  },
  "summary": "机会地图核心结论，2-3 段",
  "next_step_ready": true
}
`;

export const step_4_name = '机会地图';
export const step_4_name_en = 'Opportunity Map';
