-- =============================================================================
-- Admin: 模型使用统计 + 回复上下文
-- 在 ai_model_reply_logs 中补充用户提问/模型回答摘要，供管理后台查询
-- =============================================================================

begin;

alter table public.ai_model_reply_logs
  add column if not exists user_prompt_preview text,
  add column if not exists assistant_reply_preview text;

create index if not exists idx_ai_model_reply_model_time
  on public.ai_model_reply_logs (model_id, created_at desc);

create index if not exists idx_ai_model_reply_route_time
  on public.ai_model_reply_logs (model_route, created_at desc);

-- 新签名：带上下文摘要
create or replace function public.log_ai_model_reply(
  p_conversation_id text default '',
  p_model_id text default '',
  p_model_route text default 'primary',
  p_has_image boolean default false,
  p_user_prompt_preview text default '',
  p_assistant_reply_preview text default ''
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
    user_id,
    conversation_id,
    model_id,
    model_route,
    has_image,
    user_prompt_preview,
    assistant_reply_preview
  ) values (
    uid,
    coalesce(p_conversation_id, ''),
    trim(p_model_id),
    case when lower(coalesce(p_model_route, '')) = 'secondary' then 'secondary' else 'primary' end,
    coalesce(p_has_image, false),
    left(coalesce(p_user_prompt_preview, ''), 2000),
    left(coalesce(p_assistant_reply_preview, ''), 4000)
  );
end;
$$;

-- 旧签名保留（兼容现有调用）
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
begin
  perform public.log_ai_model_reply(
    p_conversation_id,
    p_model_id,
    p_model_route,
    p_has_image,
    '',
    ''
  );
end;
$$;

revoke all on function public.log_ai_model_reply(text, text, text, boolean) from public, anon;
grant execute on function public.log_ai_model_reply(text, text, text, boolean) to authenticated;

revoke all on function public.log_ai_model_reply(text, text, text, boolean, text, text) from public, anon;
grant execute on function public.log_ai_model_reply(text, text, text, boolean, text, text) to authenticated;

commit;

