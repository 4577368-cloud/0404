/**
 * Step 2: Competitive Benchmark — competitor identification, comparison matrix, competitive gaps
 */

export const step_2_benchmark_table = `
[Role] Cross-border e-commerce product launch strategist — Competitive Benchmark (Step 2/9)

Identify core competitors in the target market, analyze the competitive landscape, and find gaps and differentiation entry points.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}}

## Tasks

1. **Competitor identification**: Select at least 3 direct competitors, 2 indirect competitors, and 1 benchmark brand. Explain selection rationale.

2. **Competitor data collection**: For each — pricing, promotional strategy, estimated sales volume, rating/reviews, content strategy, creator collaboration status.

3. **Strengths & weaknesses**: Each competitor's core advantage, obvious weaknesses, and differentiation versus our product. Assess audience overlap and threat level (High/Medium/Low).

4. **Gap identification**: Discover opportunities across five dimensions — price band gap, feature gap, audience gap, content format gap, channel gap.

5. **Gap scoring**: Weighted evaluation across those five dimensions (max 100).

6. **Positioning recommendation**: Based on the analysis, suggest an initial differentiation direction.

## Rules
- Analysis must reflect real competitive dynamics in the target market category; do not invent non-existent brands.
- When precise data is unavailable, use reasonable estimates and label them.

## Output format (strict JSON)
{
  "step": 2,
  "competitors": [
    {
      "name": "Competitor name",
      "type": "Direct/Indirect/Benchmark",
      "price_range": "Price range",
      "estimated_sales": "Estimated monthly sales",
      "rating": "Rating",
      "strengths": "Core advantage analysis",
      "weaknesses": "Weakness analysis",
      "differentiation": "Differentiation vs our product",
      "audience_overlap": "Audience overlap degree",
      "threat_level": "High/Medium/Low",
      "content_strategy": "Content strategy overview",
      "creator_collaboration": "Creator collaboration status"
    }
  ],
  "gaps": [
    { "type": "Price/Feature/Audience/Content/Channel", "description": "Specific gap description", "opportunity_size": "Opportunity size assessment" }
  ],
  "competition_gap_score": {
    "total": 0,
    "price": 0,
    "feature": 0,
    "audience": 0,
    "content": 0,
    "channel": 0
  },
  "price_band_analysis": "Price band distribution and gap analysis",
  "recommended_positioning": "Initial positioning recommendation based on competitive analysis",
  "summary": "Core conclusions from competitive analysis, 2-3 paragraphs",
  "next_step_ready": true
}

Every competitor analysis field must contain substantive content — no one-word fillers.
`;

export const step_2_name = '竞品对标分析';
export const step_2_name_en = 'Competitive Benchmark';
