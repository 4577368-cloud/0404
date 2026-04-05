/**
 * Step 8: Execution Roadmap — 90-day three-phase plan, resources, financials, risks, KPIs
 */

export const step_8_execution_plan = `
[Role] Cross-border e-commerce product launch strategist — Execution Roadmap (Step 8/9)

Based on the selected concept, build a 90-day execution plan covering three phases, resource allocation, financials, risk management, and KPI dashboard.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}} | Traits: {{TARGET_CHARACTERISTICS}}

## Tasks

1. **90-day roadmap** in three phases:

   **Preparation (Day 1-30)**: Content library build, inventory prep, team training, tooling setup. Budget share 20-30%. Exit criteria: content ready, inventory in place, team staffed. Break down tasks by week.

   **Launch (Day 31-60)**: Soft launch, A/B testing, data collection, rapid optimization. Budget share 30-40%. Exit criteria: ROI on track, conversion model validated. Specify test plans and decision criteria.

   **Scale (Day 61-90)**: Increase ad spend, expand channels, optimize profitability model. Budget share 30-40%. Exit criteria: stable profitability, replicable growth. Specify expansion path.

2. **Resource allocation**: Minimum viable team (roles, responsibilities, cost), recommended tool stack, creator collaboration plan (tiers, count, budget).

3. **Financial plan**: Total budget breakdown, monthly cash flow forecast, unit economics (CAC, LTV, AOV, gross margin), break-even timeline.

4. **Risk management**: 3-5 key risks, each with probability, impact, mitigation strategy, fallback plan, owner. Set monitoring triggers (which metric at what threshold triggers alert) and decision gates (continue/adjust/stop).

5. **KPI dashboard**: Daily (traffic, spend, orders), Weekly (CAC, ROI, conversion rate), Monthly (revenue, profit, LTV) metrics with target values.

6. **Immediate action list**: Must-do items this week with owner, deadline, deliverable. Monthly milestones.

## Rules
- Financial projections must be conservatively realistic; no over-optimism.
- Risk disclosures must be honest; do not hide key risks.
- Action items must specify owner, date, and deliverable.

## Output format (strict JSON)
{
  "step": 8,
  "roadmap": {
    "phase_1": {
      "name": "Preparation",
      "period": "Day 1-30",
      "focus": "Phase focus",
      "weekly_tasks": [{ "week": "1-2", "tasks": "Specific tasks", "deliverables": "Deliverables" }],
      "budget_pct": "20-30%",
      "exit_criteria": "Exit criteria"
    },
    "phase_2": {
      "name": "Launch",
      "period": "Day 31-60",
      "focus": "Phase focus",
      "weekly_tasks": [{ "week": "5-6", "tasks": "Specific tasks", "deliverables": "Deliverables" }],
      "budget_pct": "30-40%",
      "exit_criteria": "Exit criteria",
      "test_plan": "A/B test plan",
      "decision_criteria": "Continue/Adjust/Stop criteria"
    },
    "phase_3": {
      "name": "Scale",
      "period": "Day 61-90",
      "focus": "Phase focus",
      "weekly_tasks": [{ "week": "9-10", "tasks": "Specific tasks", "deliverables": "Deliverables" }],
      "budget_pct": "30-40%",
      "exit_criteria": "Exit criteria",
      "expansion_path": "Expansion path"
    }
  },
  "resources": {
    "team": [{ "role": "Role", "responsibility": "Responsibility", "cost": "Monthly cost" }],
    "tools": ["Recommended tools"],
    "creator_plan": "Creator collaboration plan"
  },
  "financial_plan": {
    "total_budget": "Total budget",
    "monthly_cashflow": "Monthly cash flow forecast",
    "unit_economics": { "cac": "", "ltv": "", "aov": "", "gross_margin": "" },
    "break_even_timeline": "Break-even timeline"
  },
  "risk_management": [
    { "risk": "Risk description", "probability": "High/Medium/Low", "impact": "High/Medium/Low", "mitigation": "Mitigation strategy", "fallback": "Fallback plan", "owner": "Owner", "trigger": "Monitoring trigger" }
  ],
  "kpi_dashboard": {
    "daily": ["Daily metrics and targets"],
    "weekly": ["Weekly metrics and targets"],
    "monthly": ["Monthly metrics and targets"]
  },
  "immediate_actions": [
    { "action": "Specific item", "owner": "Owner", "deadline": "Deadline", "deliverable": "Deliverable" }
  ],
  "monthly_milestones": ["Monthly milestones"],
  "summary": "Execution plan core summary",
  "next_step_ready": true
}
`;

export const step_8_name = '执行路线图';
export const step_8_name_en = 'Execution Roadmap';
