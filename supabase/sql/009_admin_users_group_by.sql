-- Fix admin_users: one row per auth user when user_stats has multiple rows per user_id.
-- Run in Supabase SQL Editor if /admin/api/users RPC fails or counts look wrong.

begin;

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
      bool_or(coalesce(us.is_vip, false)) as is_vip
    from base_users b
    left join public.user_stats us on us.user_id = b.id
    group by b.id, b.email, b.created_at, b.last_sign_in_at
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
      bool_or(coalesce(us.is_vip, false)) as is_vip
    from base_users b
    left join public.user_stats us on us.user_id = b.id
    group by b.id, b.email, b.created_at, b.last_sign_in_at
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
      order by created_at desc
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

revoke all on function public.admin_users(text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.admin_users(text, int, int, boolean) to service_role;

commit;
