# SEO/GEO Skill Library 与 9-Step 诊断工作流整合指南

## 概述

本文档说明如何在9步产品诊断工作流中充分应用 SEO/GEO Skill Library 的方法论，确保每个步骤都能产出高质量的 SEO/GEO 优化建议。

## 技能库架构

### 4-Phase 方法论

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEO/GEO Skill Library                        │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: RESEARCH    │  Phase 2: BUILD                        │
│  ├─ SERP Analysis     │  ├─ On-Page SEO Strategy               │
│  ├─ Keyword Research  │  ├─ EEAT Optimization                  │
│  ├─ Competitor Audit  │  ├─ Content Strategy                   │
│  └─ Entity Mapping    │  └─ Schema Planning                    │
├───────────────────────┴─────────────────────────────────────────┤
│  Phase 3: OPTIMIZE  │  Phase 4: MONITOR                        │
│  ├─ Multimodal SEO  │  ├─ GEO Monitoring                       │
│  ├─ Conversion Copy │  ├─ Citation Tracking                    │
│  ├─ Technical SEO   │  ├─ AI Share of Voice                    │
│  └─ Internal Linking│  └─ Cross-Platform Strategy              │
└─────────────────────────────────────────────────────────────────┘
```

## 9-Step 诊断流程的技能映射

### Step 0: 任务调度 (Task Scheduler)
**角色**: 工作流编排器
**集成方式**: 
- 使用增强版 `step0_scheduler_enhanced.js`
- 为每个后续步骤明确指定要应用的 SEO/GEO 技能
- 建立技能继承机制，确保上下文传递

**输出要求**:
```json
{
  "seo_geo_skills_applied": ["SERP Analysis", "Keyword Research"],
  "next_step_seo_context": {...}
}
```

---

### Step 1: 市场趋势分析师 (Market Trend Screening)
**核心技能**:
- **SERP Analysis**: 分析目标市场的搜索结果特征
- **Keyword Research**: 识别趋势关键词和搜索量
- **Query Intent Classification**: 区分信息型/商业型/交易型搜索意图

**应用方式**:
```
输入: 产品品类 + 目标市场
↓
应用 SERP Analysis → 识别该品类在 Google/Bing 的搜索结果特征
应用 Keyword Research → 发现高潜力趋势关键词
应用 Query Intent → 理解用户搜索该品类的真实意图
↓
输出: 带有关键词数据、SERP特征、搜索意图的趋势报告
```

**输出增强**:
```json
{
  "trend_analysis": {
    "serp_features": ["featured_snippet", "shopping_ads", "paa"],
    "trend_keywords": [...],
    "query_intent": "commercial_investigation",
    "seasonality": "Q4 peak"
  }
}
```

---

### Step 2: 竞品对标分析师 (Competitor Benchmark)
**核心技能**:
- **Competitor SEO Audit**: 逆向工程竞品SEO策略
- **Content Gap Analysis**: 识别内容空白点
- **Entity Mapping**: 竞品在知识图谱中的实体关系

**应用方式**:
```
输入: Top 3 竞品店铺/产品链接
↓
应用 Competitor SEO Audit → 分析竞品标题、描述、URL结构
应用 Content Gap → 对比我们的内容缺失
应用 Entity Mapping → 识别竞品的品牌实体信号
↓
输出: 带SEO策略分解的竞品对标表
```

**输出增强**:
```json
{
  "competitor_seo_audit": {
    "competitor_a": {
      "title_optimization": "brand + keyword + value prop",
      "meta_description": "cta + benefit + urgency",
      "schema_markup": ["Product", "AggregateRating"],
      "backlight_signals": ["high authority backlinks"]
    }
  }
}
```

---

### Step 3: 深度拆解分析师 (Deep Analysis)
**核心技能**:
- **On-Page SEO Strategy**: 页面级SEO优化策略
- **EEAT Optimization**: 专业性、权威性、可信度优化
- **Content Strategy**: 内容架构和信息层级

**应用方式**:
```
输入: Step 1-2 的研究结果 + 产品页面URL
↓
应用 On-Page SEO → 诊断标题、描述、H1-H6、图片ALT
应用 EEAT → 评估页面可信度信号（评价、证书、作者信息）
应用 Content Strategy → 优化内容结构和内部链接
↓
输出: 详细的SEO优化路线图
```

**关键检查点**:
- Title Tag: 50-60字符，关键词前置
- Meta Description: 150-160字符，包含CTA
- Heading Hierarchy: 单一H1，逻辑H2-H6
- Image Alt Text: 描述性文字，包含关键词变体
- Schema Markup: Product, Offer, AggregateRating

---

### Step 4: 市场机会地图 (Opportunity Map)
**核心技能**:
- **Keyword Clustering**: 关键词聚类分析
- **STP Positioning**: 基于关键词的市场定位
- **Opportunity Sizing**: SEO机会量化评估

**应用方式**:
```
输入: 市场规模数据 + 关键词研究
↓
应用 Keyword Clustering → 将关键词分组为话题簇
应用 STP Positioning → 在关键词空间中定位产品
应用 Opportunity Sizing → 计算SEO潜在流量价值
↓
输出: 带SEO关键词矩阵的机会地图
```

**输出增强**:
```json
{
  "seo_opportunity_matrix": {
    "high_volume_low_competition": [...],
    "long_tail_keywords": [...],
    "featured_snippet_opportunities": [...],
    "estimated_monthly_seo_traffic": 5000
  }
}
```

---

### Step 5: 概念方案生成 (Concept Briefs)
**核心技能**:
- **Content Brief Development**: SEO内容简报开发
- **Schema Markup Planning**: 结构化数据规划
- **FAQ Architecture**: 面向AI搜索的FAQ架构

**应用方式**:
```
输入: 概念方向 + 目标关键词
↓
应用 Content Brief → 制定SEO友好的内容大纲
应用 Schema Planning → 规划Product/FAQ/HowTo schema
应用 FAQ Architecture → 设计5-10个GEO优化的问题答案
↓
输出: 可直接执行的SEO内容方案
```

**FAQ GEO优化**:
- 问题用自然语言（非关键词堆砌）
- 答案2-4句话，可被AI直接引用
- 包含具体数据、对比、操作建议
- 格式: 问题 → 简短答案 → 详细解释

---

### Step 6: 视觉创意提示 (Visual Prompts)
**核心技能**:
- **Multimodal SEO**: 图片/视频SEO优化
- **Image SEO**: Alt-text, 文件名, 结构化数据
- **Visual Entity Signals**: 视觉实体识别优化

**应用方式**:
```
输入: 视觉创意概念
↓
应用 Multimodal SEO → 确保视觉内容可被搜索引擎理解
应用 Image SEO → 每张图片优化alt-text和文件名
应用 Visual Entity → 使用Google可识别的视觉实体
↓
输出: 带SEO元数据的视觉创意方案
```

**图片SEO检查表**:
- 文件名: 描述性，包含关键词（非IMG_1234.jpg）
- Alt Text: 描述图片内容，<125字符
- 压缩: <100KB，使用WebP格式
- Schema: ImageObject schema标记
- 懒加载: 实现loading="lazy"

---

### Step 7: 广告文案 (Ad Copy)
**核心技能**:
- **Conversion Copywriting**: 转化导向文案
- **Zero-Click Optimization**: 零点击优化（Featured Snippet）
- **CTA Optimization**: 行动召唤优化

**应用方式**:
```
输入: 文案方向 + 目标受众
↓
应用 Conversion Copy → 撰写高转化标题和描述
应用 Zero-Click → 优化Featured Snippet展示
应用 CTA Optimization → 设计多平台CTA
↓
输出: 多平台SEO优化文案套件
```

**零点击内容格式**:
```
H2: 什么是[产品类别]？
段落: 2-3句话定义，包含核心关键词
列表/表格: 关键特性对比（易于Featured Snippet）
```

---

### Step 8: 执行路线图 (Execution Plan)
**核心技能**:
- **Technical SEO Implementation**: 技术SEO实施
- **Internal Linking Strategy**: 内部链接策略
- **Execution Roadmap**: 分阶段执行计划

**应用方式**:
```
输入: 所有Step 1-7的输出
↓
应用 Technical SEO → 制定Core Web Vitals优化计划
应用 Internal Linking → 设计站内链接架构
应用 Roadmap → 按优先级排序执行步骤
↓
输出: 90天SEO执行路线图
```

**优先级分级**:
- **P0 (立即执行)**: 索引性问题、关键页面缺失
- **P1 (高影响)**: 标题优化、内容更新、Schema添加
- **P2 (战略性)**: 内容扩展、链接建设、技术优化

---

### Step 9: 战略整合报告 (Final Report)
**核心技能**:
- **GEO Monitoring**: GEO性能监控
- **AI Share of Voice**: AI平台品牌声量追踪
- **Citation Tracking**: AI引用追踪
- **Cross-Platform Strategy**: 跨平台统一策略

**应用方式**:
```
输入: 前8步的所有输出
↓
应用 GEO Monitoring → 设定AI可见性KPI
应用 Share of Voice → 追踪Perplexity/ChatGPT品牌提及
应用 Citation Tracking → 监控品牌在AI答案中的引用
应用 Cross-Platform → 统一SEO和GEO策略
↓
输出: 整合战略报告 + 监控仪表板
```

**监控仪表板指标**:
- AI平台提及次数（Perplexity, ChatGPT, Gemini）
- Featured Snippet占有率
- 自然搜索流量变化
- 关键词排名分布
- Schema富媒体结果展示率

---

## 跨步骤技能传递

### 上下文继承机制

```
Step 1 (SERP Analysis)
    ↓
    serp_features → Step 3 (On-Page优化时考虑这些特征)
    trend_keywords → Step 4 (Keyword Clustering)
    
Step 2 (Competitor SEO Audit)
    ↓
    competitor_schema → Step 5 (Schema Planning参考)
    content_gaps → Step 4 (Opportunity Sizing)
    
Step 3 (On-Page Strategy)
    ↓
    technical_issues → Step 8 (Technical SEO优先处理)
    content_structure → Step 5 (Content Brief输入)
    
Step 4 (Opportunity Map)
    ↓
    keyword_clusters → Step 5 (Content Brief主题)
    opportunity_matrix → Step 8 (Execution优先级)
    
Step 5-7 (Content/Visual/Copy)
    ↓
    all_outputs → Step 8 (整合到执行计划)
    
Step 8 (Execution Plan)
    ↓
    roadmap → Step 9 (监控基准)
```

---

## 实施建议

### 1. 使用增强版 Step 0
在诊断开始时，使用 `step0_scheduler_enhanced.js` 替代标准版，确保每个步骤都明确知道要应用哪些SEO/GEO技能。

### 2. 验证输出完整性
每个步骤的输出应包含以下字段:
```json
{
  "seo_geo_skills_applied": ["Skill 1", "Skill 2"],
  "seo_insights": {...},
  "next_step_seo_context": {...}
}
```

### 3. 技能参考文档
在每个步骤的提示词中引用相关技能的详细方法:
- Step 3 引用 `On-Page SEO Strategy` 的80点检查清单
- Step 5 引用 `Schema Markup Planning` 的实施指南
- Step 9 引用 `GEO Monitoring` 的追踪方法

### 4. 人工审核点
在关键步骤设置SEO专家审核:
- Step 3: 技术SEO审核
- Step 5: Schema标记验证
- Step 9: 整体策略一致性检查

---

## 技术实施

### 在代码中使用

```javascript
import { 
  getStepPrompt, 
  getStepName 
} from './diagnosisSteps/index.js';

// 使用增强版调度器
const step0Prompt = getStepPrompt(0); // 返回增强版内容

// 为每个步骤传递SEO上下文
const step3Prompt = fillPrompt(getStepPrompt(3), {
  SEO_CONTEXT_FROM_STEP_1: serpAnalysisResults,
  SEO_CONTEXT_FROM_STEP_2: competitorAuditResults
});
```

### 监控集成

在 Step 9 输出中，生成可导入SEO监控工具的格式:
- Google Search Console 验证文件
- Schema.org JSON-LD 代码块
- 关键词追踪列表 (CSV)
- 技术SEO审计清单 (Markdown)

---

## 总结

通过将 SEO/GEO Skill Library 的系统方法论嵌入9步诊断流程，可以确保:

1. **每一步都有明确的SEO目标**: 不再是不知不觉地做SEO，而是有意识的技能应用
2. **上下文在步骤间传递**: 前序步骤的SEO发现自动传递给后续步骤
3. **输出可直接执行**: 不是建议，而是带技术细节的实施方案
4. **跨平台优化**: 同时优化传统搜索和AI平台可见性

这种整合使9步诊断不仅能产出商业策略，还能产出完整的SEO/GEO实施路线图。
