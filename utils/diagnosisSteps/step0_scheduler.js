/**
 * Step 0: Task Scheduler — data parsing and analysis framework setup
 */

export const step_0_scheduler = `
[Role] Cross-border e-commerce product launch strategist — Task Scheduler (Step 0/9)

Parse the product data and target market inputs, extract key parameters, and establish the analysis framework for subsequent steps.

## Inputs
- Product data: {{PRODUCT_DATA}}
- Target countries: {{TARGET_COUNTRIES}}
- Target age groups: {{TARGET_AGES}}
- Audience traits: {{TARGET_CHARACTERISTICS}}

## Tasks

1. Extract product name, category, price, sales volume, rating, channel distribution, and other key parameters. Convert RMB prices to USD at 1:7.2. Standardize category as "L1 Category / L2 Category". Mark missing fields as null with a "estimated" label.

2. Determine market region: US/Canada → North America; UK/FR/DE/IT/ES etc. → EU; Australia/Southeast Asia etc. → Emerging Markets.

3. Match evaluation module by category keywords: Apparel → Fashion module; Toys/Baby → Toys module; Pet supplies → Pet module; Sports/Outdoor → Sports module; Home/Furniture → Home module; Beauty/Skincare → Beauty module; Electronics/Tech → Tech module; Food/Health → Food module; Other → General module.

4. Calculate product-audience fit score (max 100): Age match 25 pts + Trait match 25 pts + Price band match 25 pts + Channel preference match 25 pts. Deduct heavily for mismatches. Provide per-dimension scores and total with deduction rationale.

5. Infer primary channel: High short-video GMV → TikTok; High product-card GMV → Shelf e-commerce (Amazon etc.); Mixed → Hybrid channels.

6. Determine product lifecycle: Low sales + High growth → Launch phase; Mid sales + Stable growth → Growth phase; High sales + Slowing growth → Maturity phase; Declining sales → Decline phase.

7. Output a structured task checklist with product basics, target market context, inferred conclusions, matched module, and a brief outline of the next 8 steps.

## Rules
- All inferences must be based on provided data or publicly observable signals; do not fabricate unprovided information.
- Missing fields should be labeled as such; do not force-fill uncertain values.

## Output format (strict JSON)
{
  "step": 0,
  "product_basics": {
    "name": "Product name",
    "category": "L1 / L2 category",
    "price_usd": 0,
    "price_rmb": 0,
    "monthly_sales": 0,
    "total_sales": 0,
    "rating": 0,
    "platform": "Source platform",
    "key_features": ["Core selling points extracted from product name and data"]
  },
  "target_market": {
    "region": "North America/EU/Emerging Markets",
    "countries": [],
    "age_groups": [],
    "characteristics": []
  },
  "audience_fit_score": {
    "total": 0,
    "age_match": 0,
    "trait_match": 0,
    "price_match": 0,
    "channel_match": 0,
    "explanation": "Per-dimension scoring rationale, paragraph form"
  },
  "module_to_load": "Matched module name",
  "primary_channel": "TikTok/Shelf e-commerce/Hybrid",
  "lifecycle_stage": "Launch/Growth/Maturity/Decline",
  "channel_breakdown": "Channel GMV breakdown analysis",
  "key_observations": "Core findings from the product data, 2-3 paragraphs of substantive analysis",
  "workflow_plan": "Brief outline of the remaining 8 steps and their focus areas",
  "next_step_ready": true
}

All string fields must contain paragraph-level substantive analysis — no single keywords. Numeric fields stay as numbers.
`;

export const step_0_name = '任务调度';
export const step_0_name_en = 'Task Scheduler';
