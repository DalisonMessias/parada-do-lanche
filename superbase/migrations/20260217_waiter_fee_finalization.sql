-- Align session finalization totals with waiter fee rules:
-- - apply only when enable_waiter_fee = true
-- - apply only over ON_TABLE approved orders
-- - never apply to delivery/pickup orders

create or replace function public.finalize_session_with_history(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_orders_total integer := 0;
  v_total integer := 0;
  v_items integer := 0;
  v_waiter_fee_enabled boolean := false;
  v_waiter_fee_mode text := 'PERCENT';
  v_waiter_fee_value integer := 10;
  v_on_table_subtotal integer := 0;
  v_waiter_fee_cents integer := 0;
begin
  select table_id into v_table_id
  from public.sessions
  where id = p_session_id
  for update;

  if v_table_id is null then
    return;
  end if;

  select
    coalesce(enable_waiter_fee, false),
    case
      when waiter_fee_mode in ('PERCENT', 'FIXED') then waiter_fee_mode
      else 'PERCENT'
    end,
    case
      when (case when waiter_fee_mode in ('PERCENT', 'FIXED') then waiter_fee_mode else 'PERCENT' end) = 'PERCENT'
        then least(greatest(coalesce(waiter_fee_value, 10), 0), 100)
      else greatest(coalesce(waiter_fee_value, 0), 0)
    end
    into v_waiter_fee_enabled, v_waiter_fee_mode, v_waiter_fee_value
  from public.settings
  where id = 1
  limit 1;

  select coalesce(sum(o.total_cents), 0)
    into v_orders_total
  from public.orders o
  where o.session_id = p_session_id
    and o.approval_status = 'APPROVED'
    and o.status <> 'CANCELLED';

  select coalesce(sum(o.total_cents), 0)
    into v_on_table_subtotal
  from public.orders o
  where o.session_id = p_session_id
    and o.approval_status = 'APPROVED'
    and o.status <> 'CANCELLED'
    and coalesce(o.service_type, 'ON_TABLE') = 'ON_TABLE';

  if coalesce(v_waiter_fee_enabled, false) and v_on_table_subtotal > 0 then
    if v_waiter_fee_mode = 'FIXED' then
      v_waiter_fee_cents := greatest(coalesce(v_waiter_fee_value, 0), 0);
    else
      v_waiter_fee_cents := round(v_on_table_subtotal * (greatest(coalesce(v_waiter_fee_value, 0), 0)::numeric / 100.0))::integer;
    end if;
  end if;

  v_total := greatest(v_orders_total + v_waiter_fee_cents, 0);

  select coalesce(sum(oi.qty), 0)
    into v_items
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.session_id = p_session_id
    and o.approval_status = 'APPROVED'
    and o.status <> 'CANCELLED';

  update public.sessions
    set status = 'EXPIRED',
        closed_at = coalesce(closed_at, timezone('utc'::text, now())),
        total_final = v_total,
        items_total_final = v_items
  where id = p_session_id;

  update public.tables
    set status = 'FREE'
  where id = v_table_id;

  update public.orders
    set status = 'FINISHED'
  where session_id = p_session_id
    and approval_status = 'APPROVED'
    and status <> 'CANCELLED';

  update public.orders
    set status = 'CANCELLED',
        approval_status = 'REJECTED'
  where session_id = p_session_id
    and approval_status = 'PENDING_APPROVAL';

  perform public.register_session_event(
    p_session_id,
    v_table_id,
    'SESSION_FINALIZED',
    jsonb_build_object(
      'orders_total_cents', v_orders_total,
      'waiter_fee_cents', v_waiter_fee_cents,
      'total_final', v_total,
      'items_total_final', v_items
    )
  );

  perform public.log_staff_action(
    'SESSION_PAID',
    p_session_id,
    v_table_id,
    null,
    jsonb_build_object(
      'orders_total_cents', v_orders_total,
      'waiter_fee_cents', v_waiter_fee_cents,
      'total_final', v_total,
      'items_total_final', v_items
    )
  );
end;
$$;
