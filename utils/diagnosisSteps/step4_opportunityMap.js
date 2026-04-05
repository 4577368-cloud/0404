/**
 * Step 4: Opportunity Map — blue-ocean identification, differentiation angles, positioning options, entry strategy
 */

export const step_4_opportunity_map = `
[Role] Cross-border e-commerce product launch strategist — Opportunity Map (Step 4/9)

Based on trend, competitive, and deep-dive analyses from Steps 1-3, identify blue-ocean entry points, design differentiation angles, and formulate a market entry strategy.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}} | Traits: {{TARGET_CHARACTERISTICS}}

## Tasks

1. **Blue-ocean opportunities**: Identify across five types — price gap, audience gap, feature gap, channel gap, timing gap. For each, assess market size, competition intensity, entry difficulty, time window, ROI potential, and calculate an opportunity score (max 100).

2. **Differentiation angles**: From product, price, channel, marketing, and audience dimensions. State value proposition and supporting evidence. Provide a recommended combination.

3. **Positioning options**: Evaluate five positioning types — Premium, Value, Niche, Mass-market, Disruptor. For each state fit analysis, strategy highlights, and risk level. Give a recommended positioning.

4. **Entry recommendation**: Primary opportunity, entry mode (DTC/Marketplace/Hybrid), country priority ranking, timing strategy, investment pacing.

5. **Competition strategy**: Primary rival, winning strategy, key battleground, specific tactics.

6. **Confidence assessment**: Overall confidence (High/Medium/Low), key assumptions, and points needing validation.

## Rules
- Opportunities must be supported by data from Steps 1-3; no speculation without basis.
- Each recommendation must have a clear logic chain.
- JSON string values must be plain readable text: use straight quotes or local punctuation. Do NOT use HTML entities (e.g. &#39;, &amp;, &quot;).

## Output format (strict JSON)
{
  "step": 4,
  "opportunities": [
    {
      "type": "Price/Audience/Feature/Channel/Timing",
      "description": "Opportunity description",
      "market_size": "Market size assessment",
      "competition": "Competition intensity",
      "entry_difficulty": "Entry difficulty",
      "time_window": "Time window",
      "roi_potential": "ROI potential",
      "score": 0
    }
  ],
  "differentiation": {
    "product_angle": "Product dimension",
    "price_angle": "Price dimension",
    "channel_angle": "Channel dimension",
    "marketing_angle": "Marketing dimension",
    "audience_angle": "Audience dimension",
    "recommended_combination": "Recommended differentiation combination and rationale"
  },
  "positioning_options": [
    { "type": "Premium/Value/Niche/Mass/Disruptor", "fit_analysis": "Fit analysis", "strategy": "Strategy highlights", "risk": "Risk level" }
  ],
  "positioning_recommendation": "Recommended positioning and rationale",
  "entry_recommendation": {
    "primary_opportunity": "Primary opportunity",
    "entry_mode": "DTC/Marketplace/Hybrid",
    "country_priority": "Country priority ranking and rationale",
    "timing_strategy": "Timing strategy",
    "investment_pace": "Investment pacing recommendation"
  },
  "competition_strategy": {
    "primary_rival": "Primary rival",
    "winning_strategy": "Winning strategy",
    "key_battleground": "Key battleground",
    "tactics": "Specific tactics"
  },
  "confidence_level": {
    "level": "High/Medium/Low",
    "key_assumptions": ["Key assumptions"],
    "validation_needed": ["Points needing validation"]
  },
  "summary": "Opportunity map core conclusions, 2-3 paragraphs",
  "next_step_ready": true
}
`;

export const step_4_name = '机会地图';
export const step_4_name_en = 'Opportunity Map';
