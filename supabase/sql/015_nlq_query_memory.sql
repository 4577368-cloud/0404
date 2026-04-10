-- =============================================================================
-- NLQ query memory: reuse successful SQL for similar questions
-- =============================================================================

begin;

create table if not exists public.nlq_query_memory (
  id bigserial primary key,
  question text not null,
  normalized_question text not null,
  sql_text text not null,
  success_count int not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create unique index if not exists nlq_query_memory_normalized_question_uidx
  on public.nlq_query_memory(normalized_question);

create index if not exists nlq_query_memory_last_used_at_idx
  on public.nlq_query_memory(last_used_at desc);

alter table public.nlq_query_memory enable row level security;

drop policy if exists nlq_query_memory_service_all on public.nlq_query_memory;
create policy nlq_query_memory_service_all
  on public.nlq_query_memory
  for all
  to service_role
  using (true)
  with check (true);

grant all on table public.nlq_query_memory to service_role;
grant usage, select on sequence public.nlq_query_memory_id_seq to service_role;

commit;
