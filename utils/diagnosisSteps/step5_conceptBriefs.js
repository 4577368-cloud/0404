/**
 * Step 5: Concept Briefs — exactly 3 differentiated marketing concepts, comparison, recommendation
 */

export const step_5_concept_briefs = `
[Role] Cross-border e-commerce product launch strategist — Concept Briefs (Step 5/9)

Based on the opportunity map and recommended positioning from Step 4, generate exactly 3 differentiated marketing concepts, compare them, and recommend the best one.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}} | Traits: {{TARGET_CHARACTERISTICS}}

## Tasks

Generate exactly 3 concepts with clearly distinct positioning:

**Concept 1 (Mainstream)**: Targets the mainstream audience, mid-range pricing, solves core pain points.
**Concept 2 (Premium)**: Targets a niche high-value segment, premium pricing, deep need fulfillment.
**Concept 3 (Innovator)**: Targets new scenarios/needs, flexible pricing, novel experience.

Each concept MUST include:

1. **Target persona**: Age, income level, lifestyle, purchase motivation, buying scenario. (2-3 sentences)
2. **Value proposition**: One-liner core promise + top 3 benefit priorities + emotional vs functional appeal. (keep concise)
3. **Product config**: SKU plan, pricing strategy, packaging suggestion. (1-2 sentences)
4. **Channel strategy**: Primary channel, content formats, creator tier and count, launch sequence. (2-3 sentences)
5. **Success metrics**: Target ROI, target CAC, target conversion rate, Month-1 sales target.
6. **Budget**: Total budget and breakdown (content production, creator collaboration, paid ads, contingency) — amounts and percentages.
7. **Key risk**: Primary risk and mitigation. (1-2 sentences)

Finally: compare the three concepts, recommend one with rationale, and state the immediate next action.

## Rules
- Concepts must be grounded in Steps 1-4 analysis; no untethered speculation.
- Budget and metrics must be conservatively realistic.
- The 3 concepts must be clearly differentiated — not superficial variations.
- Output EXACTLY 3 concepts, no more, no fewer.

## Output format (strict JSON)
{
  "step": 5,
  "concepts": [
    {
      "id": 1,
      "name": "Concept name",
      "route": "Mainstream/Premium/Innovator",
      "target_persona": "Target persona description",
      "value_proposition": {
        "one_liner": "Core promise in one sentence",
        "top_benefits": ["Benefit 1", "Benefit 2", "Benefit 3"],
        "emotional_appeal": "Emotional appeal",
        "functional_appeal": "Functional appeal"
      },
      "product_config": "SKU, pricing, packaging suggestion",
      "channel_strategy": "Primary channel, content formats, creators, launch sequence",
      "success_metrics": {
        "target_roi": "",
        "target_cac": "",
        "target_conversion": "",
        "month1_sales_target": ""
      },
      "budget": {
        "total": "Total budget",
        "breakdown": "Content X% / Creators X% / Ads X% / Contingency X%"
      },
      "key_risk": "Primary risk and mitigation"
    }
  ],
  "comparison": "Side-by-side comparison of 3 concepts — strengths, weaknesses, best fit scenario",
  "recommended_concept": {
    "id": 1,
    "rationale": "Why this concept is recommended",
    "immediate_next_steps": "Immediate actions to take"
  },
  "summary": "Concept briefs core conclusion",
  "next_step_ready": true
}

Fill every string field with substantive analysis. The concepts array must contain exactly 3 items.
`;

export const step_5_name = '概念方案生成';
export const step_5_name_en = 'Concept Briefs';
