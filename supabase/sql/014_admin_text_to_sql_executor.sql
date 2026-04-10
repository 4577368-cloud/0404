-- =============================================================================
-- Admin Text-to-SQL: safe SELECT executor
-- SECURITY: service_role only; SELECT/CTE only; blocks mutation/DDL keywords.
-- =============================================================================

begin;

create or replace function public.admin_execute_select_sql(p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sql text := trim(coalesce(p_sql, ''));
  v_rows jsonb := '[]'::jsonb;
begin
  if v_sql = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_sql');
  end if;

  -- Basic hard guards
  if v_sql ~ ';' then
    return jsonb_build_object('ok', false, 'error', 'semicolon_not_allowed');
  end if;
  if not (
    lower(ltrim(v_sql)) like 'select %'
    or lower(ltrim(v_sql)) like 'with %'
  ) then
    return jsonb_build_object('ok', false, 'error', 'only_select_or_with_allowed');
  end if;
  if v_sql ~* '\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|comment|refresh|vacuum|analyze|execute|call|do|copy)\b' then
    return jsonb_build_object('ok', false, 'error', 'forbidden_keyword');
  end if;
  if v_sql ~* '--|/\*|\*/' then
    return jsonb_build_object('ok', false, 'error', 'sql_comment_not_allowed');
  end if;

  -- Protect backend latency
  perform set_config('statement_timeout', '6000', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) as t',
    v_sql
  ) into v_rows;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'row_count', coalesce(jsonb_array_length(v_rows), 0)
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

comment on function public.admin_execute_select_sql(text) is 'Executes guarded SELECT/CTE SQL for admin NLQ.';

revoke all on function public.admin_execute_select_sql(text) from public, anon, authenticated;
grant execute on function public.admin_execute_select_sql(text) to service_role;

commit;

-- select public.admin_execute_select_sql('select count(*) as users from auth.users');
