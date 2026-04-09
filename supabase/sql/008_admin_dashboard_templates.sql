-- Admin analytics SQL templates for local backend usage.
-- Purpose:
-- 1) Provide overview metrics (total users, vip users, new users)
-- 2) Provide paginated user list with email/vip status
-- 3) Provide daily growth trend
--
-- Security model:
-- - These RPCs are intended for local backend with service_role only.
-- - Do NOT expose directly to client-side anon/authenticated roles.

begin;

-- Optional performance indexes
create index if not exists idx_user_stats_user_id on public.user_stats (user_id);
create index if not exists idx_user_stats_is_vip on public.user_stats (is_vip);
create index if not exists idx_user_stats_updated_at on public.user_stats (updated_at desc);

-- =========================================================
-- 1) Overview RPC
-- =========================================================
create or replace function public.admin_overview()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with base_users as (
    select
      u.id,
      u.email,
      u.created_at
    from auth.users u
    where coalesce(u.is_anonymous, false) = false
  ),
  vip_users as (
    select distinct us.user_id
    from public.user_stats us
    where coalesce(us.is_vip, false) = true
  ),
  merged as (
    select
      b.id,
      b.email,
      b.created_at,
      (v.user_id is not null) as is_vip
    from base_users b
    left join vip_users v on v.user_id = b.id
  )
  select jsonb_build_object(
    'total_users', count(*)::int,
    'vip_users', count(*) filter (where is_vip)::int,
    'vip_ratio', case when count(*) = 0 then 0 else round((count(*) filter (where is_vip)::numeric / count(*)::numeric) * 100, 2) end,
    'new_users_7d', count(*) filter (where created_at >= now() - interval '7 days')::int,
    'new_users_30d', count(*) filter (where created_at >= now() - interval '30 days')::int
  )
  from merged;
$$;

-- =========================================================
-- 2) User list RPC (pagination + keyword + vip filter)
-- =========================================================
create or replace function public.admin_users(
  p_keyword text default '',
  p_page int default 1,
  p_page_size int default 20,
  p_vip_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_page_size int := least(greatest(coalesce(p_page_size, 20), 1), 200);
  v_offset int := (v_page - 1) * v_page_size;
  v_kw text := trim(coalesce(p_keyword, ''));
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  with base_users as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    where coalesce(u.is_anonymous, false) = false
  ),
  merged as (
    select
      b.id,
      b.email,
      b.created_at,
      b.last_sign_in_at,
      coalesce(us.is_vip, false) as is_vip
    from base_users b
    left join public.user_stats us on us.user_id = b.id
  ),
  filtered as (
    select *
    from merged
    where
      (v_kw = '' or coalesce(email, '') ilike ('%' || v_kw || '%') or id::text ilike ('%' || v_kw || '%'))
      and (not p_vip_only or is_vip = true)
  )
  select count(*) into v_total from filtered;

  with base_users as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    where coalesce(u.is_anonymous, false) = false
  ),
  merged as (
    select
      b.id,
      b.email,
      b.created_at,
      b.last_sign_in_at,
      coalesce(us.is_vip, false) as is_vip
    from base_users b
    left join public.user_stats us on us.user_id = b.id
  ),
  filtered as (
    select *
    from merged
    where
      (v_kw = '' or coalesce(email, '') ilike ('%' || v_kw || '%') or id::text ilike ('%' || v_kw || '%'))
      and (not p_vip_only or is_vip = true)
    order by created_at desc
    limit v_page_size
    offset v_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'email', email,
        'created_at', created_at,
        'last_sign_in_at', last_sign_in_at,
        'is_vip', is_vip
      )
    ),
    '[]'::jsonb
  )
  into v_rows
  from filtered;

  return jsonb_build_object(
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'rows', v_rows
  );
end;
$$;

-- =========================================================
-- 3) Daily trend RPC (new users + new vip users)
-- =========================================================
create or replace function public.admin_trends(
  p_days int default 30
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with d as (
    select generate_series(
      (current_date - (greatest(coalesce(p_days, 30), 1) - 1))::date,
      current_date::date,
      interval '1 day'
    )::date as day
  ),
  users_daily as (
    select
      date_trunc('day', u.created_at)::date as day,
      count(*)::int as new_users
    from auth.users u
    where
      coalesce(u.is_anonymous, false) = false
      and u.created_at >= (current_date - (greatest(coalesce(p_days, 30), 1) - 1))
    group by 1
  ),
  vip_daily as (
    -- "new vip" here is approximated by user_stats.updated_at day where is_vip = true.
    -- If you have a dedicated vip_activated_at field, replace this logic with that field.
    select
      date_trunc('day', us.updated_at)::date as day,
      count(distinct us.user_id)::int as new_vip_users
    from public.user_stats us
    where
      coalesce(us.is_vip, false) = true
      and us.updated_at >= (current_date - (greatest(coalesce(p_days, 30), 1) - 1))
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'date', d.day,
      'new_users', coalesce(u.new_users, 0),
      'new_vip_users', coalesce(v.new_vip_users, 0)
    )
    order by d.day
  )
  from d
  left join users_daily u on u.day = d.day
  left join vip_daily v on v.day = d.day;
$$;

-- =========================================================
-- Permissions (service_role only)
-- =========================================================
revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_users(text, int, int, boolean) from public, anon, authenticated;
revoke all on function public.admin_trends(int) from public, anon, authenticated;

grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_users(text, int, int, boolean) to service_role;
grant execute on function public.admin_trends(int) to service_role;

commit;

-- =============================
-- Example calls (SQL editor):
-- =============================
-- select public.admin_overview();
-- select public.admin_users('', 1, 20, false);
-- select public.admin_users('gmail.com', 1, 20, true);
-- select public.admin_trends(30);
