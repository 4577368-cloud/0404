/**
 * Step 1: Market Trend Analysis — heat index, seasonality, growth trajectory, entry timing
 */

export const step_1_trend_screening = `
[Role] Cross-border e-commerce market trend analyst (Step 1/9)

Based on Step 0 product parameters, analyze target market trend heat and entry timing.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}} | Traits: {{TARGET_CHARACTERISTICS}}

## Tasks
1. **Market heat** (max 100): Weighted score across four dimensions — social media buzz, search demand, creator activity, competitor ad spend.
2. **Seasonality**: Current phase (peak/off-peak/stable), key holiday and event dates.
3. **Audience match** (max 100): Purchasing power, usage scenarios, channel preference, content preference.
4. **Demand signals**: Search trend direction, social media discussion volume, creator coverage, supply-demand gap.
5. **Entry timing** (max 100): Composite score + best entry window.
6. **Country-level breakdown**: Per-country heat index, trend direction, local factors.

## Rules
- Must reference specific data from Step 0; label when information is insufficient.
- Each field must contain 2-4 sentences of substantive analysis — avoid vague or generic filler.

## Output format (strict JSON)
{"step":1,"market_heat":{"score":0,"level":"High/Medium/Low","social_media":"","search_demand":"","creator_activity":"","competitor_investment":""},"seasonality":{"current_phase":"","analysis":"","key_dates":[]},"audience_match":{"score":0,"purchasing_power":"","usage_scenarios":"","channel_preference":"","content_preference":""},"demand_signals":{"search_trend":"","social_buzz":"","creator_coverage":"","supply_demand_gap":""},"entry_timing":{"score":0,"recommendation":"","best_window":""},"country_breakdown":[{"country":"","heat_index":0,"trend_direction":"","local_factors":""}],"summary":"","next_step_ready":true}
`;

export const step_1_name = '市场趋势分析';
export const step_1_name_en = 'Market Trend Analysis';
