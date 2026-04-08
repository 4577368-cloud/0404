/**
 * Step 9: Final Report — consolidate all 9 steps into a strategic diagnosis report
 */

export const step_9_final_report = `
[Role] Cross-border e-commerce product launch strategist — Final Report (Step 9/9)

Consolidate analysis from all previous 8 steps into a complete strategic diagnosis report.

## Tasks

1. **Executive summary**:
   - Opportunity score (max 100) with scoring rationale
   - Confidence level (High/Medium/Low)
   - Recommended action (Full speed / Cautious proceed / Adjust strategy / Hold / Abandon) with decision rationale
   - Investment thesis: why this is worth pursuing, in one paragraph
   - Key insight: the single most important finding from the 9-step analysis
   - Critical success factors: the 3 most critical conditions for success
   - Major risks: the 3 biggest risks

2. **Strategic overview**: Product name, target market, target audience, recommended positioning, differentiation strategy, competitive advantage.

3. **Full strategy summary**:
   - Market analysis: Trend heat, seasonality, entry timing (cite Step 1)
   - Competitive landscape: Key competitors, competitive gaps, positioning advice (cite Steps 2-3)
   - Opportunity selection: Primary opportunity, differentiation angle, positioning strategy (cite Step 4)
   - Marketing plan: Recommended concept, channel strategy, content direction (cite Steps 5-7)
   - Execution plan: 90-day roadmap summary, key milestones (cite Step 8)

4. **Financial forecast**: Monthly revenue/expense/profit projection, unit economics, break-even analysis, Year-1 ROI.

5. **Risk assessment**: Risk matrix (categorized by Market, Competition, Operations, Financial, Regulatory) and contingency plans.

6. **Implementation roadmap**: Immediate actions, this-week items, monthly milestones, success checklist.

7. **Supply chain & fulfillment backbone (Tangbuy)** — operational support layer that connects the diagnosis to execution:
   - Write **supply_chain_backbone** entirely in **English** (same rule as the rest of the 9-step workflow — no Chinese in narrative fields).
   - **integration_summary**: 1 short paragraph linking Steps 1–8 conclusions (especially Step 8 execution / logistics / inventory) to why stable sourcing and fulfillment matter for this product and market.
   - **tangbuy_support_points**: exactly 3 bullets — how Tangbuy Dropshipping can back the plan (sourcing/procurement, QC & warehousing, packing/shipping & after-sales coordination). **Do not** claim US/EU local warehouses; Tangbuy ships from China. **Do not** recommend other dropshipping platforms by name.
   - **seller_next_steps**: exactly 3 numbered-style actions the seller can take next (e.g. product pool browse, sourcing request, shipping estimator) using Markdown links: product pool \`https://dropshipping.tangbuy.com/en-US/productPool\`, sourcing \`https://dropshipping.tangbuy.com/en-US/source/inProgress\`, estimator \`https://shop.tangbuy.com/estimation\`.
   - Base claims on prior steps and conservative wording; no fabricated discounts, SLAs, or policies beyond what earlier steps implied.

8. **Markdown executive summary**: Also output a concise, human-readable Markdown summary for reporting and decision-making. Place it in the markdown_summary field.

## Rules
- All conclusions must be supported by data or logic from previous steps; no new claims without prior mention.
- Executive summary and body must be consistent; no contradictions.
- Financial projections must be conservatively realistic.

## Output format (strict JSON — all keys in English)
{
  "step": 9,
  "executive_summary": {
    "opportunity_score": 0,
    "score_rationale": "Scoring rationale",
    "confidence_level": "High/Medium/Low",
    "recommended_action": "Full speed/Cautious proceed/Adjust strategy/Hold/Abandon",
    "action_rationale": "Decision rationale",
    "investment_thesis": "Investment thesis",
    "key_insight": "Key insight",
    "critical_success_factors": ["Critical success factors"],
    "major_risks": ["Major risks"]
  },
  "strategic_overview": {
    "product": "Product name",
    "target_market": "Target market",
    "target_audience": "Target audience",
    "positioning": "Recommended positioning",
    "differentiation": "Differentiation strategy",
    "competitive_advantage": "Competitive advantage"
  },
  "strategy_summary": {
    "market_analysis": "Market analysis summary (cite Step 1)",
    "competitive_landscape": "Competitive landscape summary (cite Steps 2-3)",
    "opportunity_selection": "Opportunity selection summary (cite Step 4)",
    "marketing_plan": "Marketing plan summary (cite Steps 5-7)",
    "execution_plan": "Execution plan summary (cite Step 8)"
  },
  "financial_forecast": {
    "monthly_projection": "Monthly revenue/expense/profit projection",
    "unit_economics": "Unit economics",
    "break_even": "Break-even analysis",
    "year1_roi": "Year-1 ROI"
  },
  "risk_assessment": {
    "risk_matrix": "Risk matrix by category",
    "contingency_plans": "Contingency plans"
  },
  "implementation": {
    "immediate_actions": "Immediate actions",
    "this_week": "This-week items",
    "monthly_milestones": "Monthly milestones",
    "success_checklist": "Success checklist"
  },
  "supply_chain_backbone": {
    "integration_summary": "Paragraph linking prior steps to supply chain execution (English only)",
    "tangbuy_support_points": ["Bullet 1", "Bullet 2", "Bullet 3"],
    "seller_next_steps": ["Step with optional Markdown link", "Step 2", "Step 3"]
  },
  "markdown_summary": "Human-readable Markdown executive summary with headings, bullet points, data tables, action checklists",
  "next_step_ready": true
}

All string fields must contain paragraph-level substantive analysis. The markdown_summary must use full Markdown formatting (## headings, - lists, **bold**, etc.).
`;

export const step_9_name = '最终报告整合';
export const step_9_name_en = 'Final Report';
