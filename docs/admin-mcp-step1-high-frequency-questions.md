# Admin MCP Step 1: High-Frequency Questions Inventory

This is the execution baseline for Step 1 ("identify top NLQ questions and cluster intent").

## Goal

- Identify top NLQ questions from real usage.
- Group them into stable intent buckets.
- Mark which questions can be handled by fixed MCP tools (no free-form SQL).

## Data Sources

- `public.nlq_query_memory`: reusable question memory with usage counters.  
  If missing, run `supabase/sql/015_nlq_query_memory.sql` first.
- Admin FE presets in `backend-local/public/admin/index.html`.
- Preset matcher in `backend-local/admin-server.mjs` (`matchPresetQuestion`).

## SQL: Pull Real Top Questions

Run in Supabase SQL Editor.

**注意：** Supabase 的 SQL Editor 只接受纯 SQL。请**不要**把 Markdown 的 `` ``` `` 围栏一起粘贴进去（否则会报 `42601` 语法错误）。

### 1) Top normalized questions (primary)

select
  normalized_question,
  max(question) as sample_question,
  sum(coalesce(success_count, 0)) as total_hits,
  max(last_used_at) as last_used_at
from public.nlq_query_memory
group by normalized_question
order by total_hits desc, last_used_at desc
limit 100;

### 2) Long-tail questions (for future tool coverage)

select
  question as sample_question,
  coalesce(success_count, 0) as total_hits,
  last_used_at
from public.nlq_query_memory
where coalesce(success_count, 0) <= 2
order by last_used_at desc nulls last
limit 100;

## Initial Intent Buckets (from current product behavior)

Use these buckets to tag the top 100 questions:

1. `user_growth`  
   Example: today/yesterday registrations, daily new users.
2. `user_mix`  
   Example: email users vs anonymous users.
3. `usage_top_user`  
   Example: who used most conversations/prompts, daily average.
4. `anonymous_activity`  
   Example: anonymous users active 3 consecutive days, today's anonymous list.
5. `url_insights`  
   Example: conversations containing URLs, URL list/count.
6. `share_growth`  
   Example: share visits/funnel and attribution stats.
7. `model_usage`  
   Example: model route/volume/users/conversations.
8. `inquiries`  
   Example: inquiry status and volume.
9. `user_360`  
   Example: one-user deep inspection (conversation, share, inquiry).
10. `other`  
    Keep temporarily for low-frequency uncategorized requests.

## Top Tool Candidates (first batch)

After tagging, select top intents by hit ratio and map to tools:

- `get_overview_metrics`
- `get_user_growth`
- `get_user_mix`
- `get_conversation_usage`
- `get_model_usage`
- `get_model_replies`
- `get_user_360`
- `get_inquiries_summary`

## Output Format (fill this table)

| rank | normalized_question | sample_question | total_hits | bucket | target_tool |
|---|---|---|---:|---|---|
| 1 | ... | ... | 123 | user_growth | get_user_growth |
| 2 | ... | ... | 95 | model_usage | get_model_usage |

## Exit Criteria for Step 1

- Top 100 questions exported and bucketed.
- Top 10 high-frequency questions selected.
- Each of top 10 has a target MCP tool name.
- Unknown/ambiguous items marked in `other`.
