create or replace function public.delete_table_safe(
  p_table_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid;
  v_actor_role text;
  v_session_ids uuid[] := '{}'::uuid[];
  v_order_ids uuid[] := '{}'::uuid[];
begin
  if p_table_id is null then
    raise exception 'p_table_id e obrigatorio';
  end if;

  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'usuario autenticado invalido para excluir mesa';
  end if;

  select role
    into v_actor_role
  from public.profiles
  where id = v_auth_uid
  limit 1;

  if coalesce(v_actor_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'permissao insuficiente para excluir mesa';
  end if;

  select coalesce(array_agg(s.id), '{}'::uuid[])
    into v_session_ids
  from public.sessions s
  where s.table_id = p_table_id;

  select coalesce(array_agg(o.id), '{}'::uuid[])
    into v_order_ids
  from public.orders o
  where o.table_id = p_table_id
     or o.session_id = any(v_session_ids);

  if array_length(v_order_ids, 1) is not null then
    delete from public.order_items
    where order_id = any(v_order_ids);

    delete from public.order_cancellation_audit
    where order_id = any(v_order_ids);

    delete from public.staff_action_audit
    where order_ids && v_order_ids;
  end if;

  if array_length(v_session_ids, 1) is not null then
    delete from public.cart_items
    where session_id = any(v_session_ids);

    delete from public.session_events
    where session_id = any(v_session_ids);

    delete from public.order_cancellation_audit
    where session_id = any(v_session_ids);

    delete from public.staff_action_audit
    where session_id = any(v_session_ids);
  end if;

  delete from public.orders
  where table_id = p_table_id
     or session_id = any(v_session_ids);

  if array_length(v_session_ids, 1) is not null then
    delete from public.session_guests
    where session_id = any(v_session_ids);

    delete from public.sessions
    where id = any(v_session_ids);
  end if;

  delete from public.session_events
  where table_id = p_table_id;

  delete from public.order_cancellation_audit
  where table_id = p_table_id;

  delete from public.staff_action_audit
  where table_id = p_table_id;

  delete from public.tables
  where id = p_table_id;

  return found;
end;
$$;

