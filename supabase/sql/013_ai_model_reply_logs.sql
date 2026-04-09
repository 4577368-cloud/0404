-- =============================================================================
-- AI 模型回复日志（记录每轮回复使用了哪个模型）
-- 依赖：Supabase Auth（auth.uid）
-- =============================================================================

begin;

create table if not exists public.ai_model_reply_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null default '',
  model_id text not null,
  model_route text not null default 'primary', -- primary / secondary
  has_image boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_model_reply_user_time
  on public.ai_model_reply_logs (user_id, created_at desc);

create index if not exists idx_ai_model_reply_conv_time
  on public.ai_model_reply_logs (conversation_id, created_at desc);

create or replace function public.log_ai_model_reply(
  p_conversation_id text default '',
  p_model_id text default '',
  p_model_route text default 'primary',
  p_has_image boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if trim(coalesce(p_model_id, '')) = '' then return; end if;

  insert into public.ai_model_reply_logs (
    user_id, conversation_id, model_id, model_route, has_image
  ) values (
    uid,
    coalesce(p_conversation_id, ''),
    trim(p_model_id),
    case when lower(coalesce(p_model_route, '')) = 'secondary' then 'secondary' else 'primary' end,
    coalesce(p_has_image, false)
  );
end;
$$;

alter table public.ai_model_reply_logs enable row level security;

drop policy if exists "ai_model_reply_logs_select_own" on public.ai_model_reply_logs;
create policy "ai_model_reply_logs_select_own" on public.ai_model_reply_logs
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.ai_model_reply_logs from public, anon;
grant select on public.ai_model_reply_logs to authenticated;

revoke all on function public.log_ai_model_reply(text, text, text, boolean) from public, anon;
grant execute on function public.log_ai_model_reply(text, text, text, boolean) to authenticated;

commit;

-- select * from public.ai_model_reply_logs order by id desc limit 20;
