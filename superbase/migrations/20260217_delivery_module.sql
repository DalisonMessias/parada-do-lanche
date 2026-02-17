-- Delivery module: toggle + public flow + payment-on-delivery fields
-- Safe to run in existing environments (idempotent where possible).

create extension if not exists "pgcrypto";

alter table if exists public.settings
  add column if not exists enable_delivery_module boolean not null default false;

alter table if exists public.products
  add column if not exists available_on_table boolean not null default true;
alter table if exists public.products
  add column if not exists available_on_delivery boolean not null default true;

alter table if exists public.orders
  add column if not exists delivery_payment_method text;
alter table if exists public.orders
  add column if not exists delivery_cash_change_for_cents integer not null default 0;

update public.settings
set enable_delivery_module = coalesce(enable_delivery_module, false)
where id = 1;

update public.products
set
  available_on_table = coalesce(available_on_table, true),
  available_on_delivery = coalesce(available_on_delivery, true);

update public.orders
set
  delivery_payment_method = case
    when coalesce(service_type, 'ON_TABLE') in ('ENTREGA', 'RETIRADA')
      and upper(coalesce(delivery_payment_method, '')) in ('PIX', 'CASH', 'CARD')
      then upper(coalesce(delivery_payment_method, ''))
    else null
  end,
  delivery_cash_change_for_cents = case
    when coalesce(service_type, 'ON_TABLE') in ('ENTREGA', 'RETIRADA')
      and upper(coalesce(delivery_payment_method, '')) = 'CASH'
      then greatest(coalesce(delivery_cash_change_for_cents, 0), 0)
    else 0
  end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_payment_method_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_payment_method_check
      check (
        delivery_payment_method is null
        or delivery_payment_method in ('PIX', 'CASH', 'CARD')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_cash_change_for_cents_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_cash_change_for_cents_check
      check (
        delivery_cash_change_for_cents >= 0
        and (
          delivery_payment_method = 'CASH'
          or coalesce(delivery_cash_change_for_cents, 0) = 0
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_payment_service_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_payment_service_type_check
      check (
        (
          coalesce(service_type, 'ON_TABLE') in ('ENTREGA', 'RETIRADA')
        )
        or
        delivery_payment_method is null
      );
  end if;
end $$;

create or replace function public.get_public_receipt_by_token(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_items jsonb := '[]'::jsonb;
  v_delivery_address jsonb;
  v_store_name text := 'Loja';
begin
  if p_token is null or btrim(p_token) = '' then
    return null;
  end if;

  select
    o.id,
    o.session_id,
    o.table_id,
    o.service_type,
    o.status,
    o.approval_status,
    o.created_at,
    s.closed_at,
    o.customer_name,
    o.customer_phone,
    o.delivery_address,
    o.delivery_fee_cents,
    o.delivery_payment_method,
    o.delivery_cash_change_for_cents,
    o.subtotal_cents,
    o.discount_mode,
    o.discount_value,
    o.discount_cents,
    o.total_cents,
    t.name as table_name
    into v_order
  from public.orders o
  left join public.sessions s on s.id = o.session_id
  left join public.tables t on t.id = o.table_id
  where o.receipt_token = p_token
    and o.service_type in ('ENTREGA', 'RETIRADA')
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(nullif(trim(coalesce(s.store_name, '')), ''), 'Loja')
    into v_store_name
  from public.settings s
  where s.id = 1
  limit 1;

  v_delivery_address := case
    when v_order.delivery_address is null then null
    when jsonb_typeof(v_order.delivery_address) = 'object' then v_order.delivery_address - 'city'
    else v_order.delivery_address
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'name_snapshot', oi.name_snapshot,
        'original_unit_price_cents', oi.original_unit_price_cents,
        'unit_price_cents', oi.unit_price_cents,
        'qty', oi.qty,
        'promo_name', oi.promo_name,
        'promo_discount_type', oi.promo_discount_type,
        'promo_discount_value', oi.promo_discount_value,
        'promo_discount_cents', oi.promo_discount_cents,
        'note', oi.note
      )
      order by oi.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'store_name', v_store_name,
    'order', jsonb_build_object(
      'id', v_order.id,
      'session_id', v_order.session_id,
      'table_id', v_order.table_id,
      'table_name', v_order.table_name,
      'service_type', v_order.service_type,
      'status', v_order.status,
      'approval_status', v_order.approval_status,
      'opened_at', v_order.created_at,
      'closed_at', v_order.closed_at,
      'customer_name', v_order.customer_name,
      'customer_phone', v_order.customer_phone,
      'delivery_address', v_delivery_address,
      'delivery_fee_cents', greatest(coalesce(v_order.delivery_fee_cents, 0), 0),
      'delivery_payment_method', v_order.delivery_payment_method,
      'delivery_cash_change_for_cents', greatest(coalesce(v_order.delivery_cash_change_for_cents, 0), 0),
      'subtotal_cents', greatest(coalesce(v_order.subtotal_cents, 0), 0),
      'discount_mode', coalesce(v_order.discount_mode, 'NONE'),
      'discount_value', greatest(coalesce(v_order.discount_value, 0), 0),
      'discount_cents', greatest(coalesce(v_order.discount_cents, 0), 0),
      'total_cents', greatest(coalesce(v_order.total_cents, 0), 0),
      'receipt_token', p_token,
      'receipt_url', '/cupom/' || p_token
    ),
    'items', v_items
  );
end;
$$;

drop function if exists public.create_staff_order(
  uuid,
  uuid,
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  integer,
  jsonb
);

create or replace function public.create_staff_order(
  p_session_id uuid,
  p_table_id uuid,
  p_origin text,
  p_created_by_profile_id uuid,
  p_added_by_name text,
  p_parent_order_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_general_note text default null,
  p_service_type text default 'RETIRADA',
  p_delivery_address jsonb default null,
  p_delivery_fee_cents integer default 0,
  p_discount_mode text default 'NONE',
  p_discount_value integer default 0,
  p_delivery_payment_method text default null,
  p_delivery_cash_change_for_cents integer default 0,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_round integer;
  v_origin text;
  v_service_type text;
  v_discount_mode text;
  v_discount_value integer;
  v_subtotal integer;
  v_discount integer;
  v_delivery_fee integer;
  v_delivery_address jsonb;
  v_delivery_payment_method text;
  v_delivery_cash_change_for_cents integer;
  v_total integer;
  v_parent_order_id uuid;
begin
  if p_session_id is null then
    raise exception 'p_session_id e obrigatorio';
  end if;
  if p_table_id is null then
    raise exception 'p_table_id e obrigatorio';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items precisa ser um array jsonb com itens';
  end if;

  v_origin := case
    when p_origin in ('CUSTOMER', 'WAITER', 'BALCAO') then p_origin
    else 'CUSTOMER'
  end;

  v_discount_mode := case
    when p_discount_mode in ('NONE', 'AMOUNT', 'PERCENT') then p_discount_mode
    else 'NONE'
  end;
  v_service_type := case
    when p_service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA', 'CONSUMO_LOCAL') then p_service_type
    else null
  end;

  v_discount_value := greatest(coalesce(p_discount_value, 0), 0);
  v_delivery_fee := greatest(coalesce(p_delivery_fee_cents, 0), 0);
  v_delivery_address := case
    when p_delivery_address is null or p_delivery_address = 'null'::jsonb then null
    when jsonb_typeof(p_delivery_address) = 'object' then p_delivery_address - 'city'
    else p_delivery_address
  end;
  v_delivery_payment_method := case
    when upper(coalesce(p_delivery_payment_method, '')) in ('PIX', 'CASH', 'CARD')
      then upper(coalesce(p_delivery_payment_method, ''))
    else null
  end;
  v_delivery_cash_change_for_cents := greatest(coalesce(p_delivery_cash_change_for_cents, 0), 0);

  if p_parent_order_id is not null then
    select id
      into v_parent_order_id
    from public.orders
    where id = p_parent_order_id
      and session_id = p_session_id
    limit 1;
  end if;

  perform 1
  from public.sessions
  where id = p_session_id
  for update;

  select coalesce(max(round_number), 0) + 1
    into v_round
  from public.orders
  where session_id = p_session_id;

  select coalesce(sum((greatest(coalesce(i.qty, 1), 1) * greatest(coalesce(i.unit_price_cents, 0), 0))::integer), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as i(
    product_id uuid,
    name_snapshot text,
    unit_price_cents integer,
    original_unit_price_cents integer,
    promo_name text,
    promo_discount_type text,
    promo_discount_value integer,
    promo_discount_cents integer,
    qty integer,
    note text,
    added_by_name text,
    status text
  );

  if v_discount_mode = 'AMOUNT' then
    v_discount := least(v_discount_value, v_subtotal);
  elsif v_discount_mode = 'PERCENT' then
    v_discount_value := least(v_discount_value, 100);
    v_discount := round(v_subtotal * (v_discount_value::numeric / 100.0))::integer;
  else
    v_discount := 0;
    v_discount_value := 0;
  end if;

  if v_origin <> 'BALCAO' then
    v_service_type := 'ON_TABLE';
    v_delivery_fee := 0;
    v_delivery_address := null;
    v_delivery_payment_method := null;
    v_delivery_cash_change_for_cents := 0;
  else
    if v_service_type is null or v_service_type = 'ON_TABLE' then
      v_service_type := 'RETIRADA';
    end if;
    if v_delivery_payment_method is null then
      v_delivery_payment_method := 'CARD';
    end if;
    if v_service_type <> 'ENTREGA' then
      v_delivery_fee := 0;
      v_delivery_address := null;
    elsif
      nullif(trim(coalesce(p_customer_name, '')), '') is null or
      v_delivery_address is null or
      nullif(trim(coalesce(v_delivery_address->>'street', '')), '') is null or
      nullif(trim(coalesce(v_delivery_address->>'number', '')), '') is null or
      nullif(trim(coalesce(v_delivery_address->>'neighborhood', '')), '') is null
    then
      raise exception 'pedido de entrega requer customer_name e delivery_address com street, number e neighborhood';
    end if;
    if v_delivery_payment_method <> 'CASH' then
      v_delivery_cash_change_for_cents := 0;
    end if;
    if v_service_type not in ('ENTREGA', 'RETIRADA') then
      v_delivery_payment_method := null;
      v_delivery_cash_change_for_cents := 0;
    end if;
  end if;

  v_total := greatest(v_subtotal - v_discount + v_delivery_fee, 0);

  insert into public.orders (
    table_id,
    session_id,
    origin,
    parent_order_id,
    created_by_profile_id,
    customer_name,
    customer_phone,
    general_note,
    service_type,
    delivery_address,
    delivery_fee_cents,
    delivery_payment_method,
    delivery_cash_change_for_cents,
    approval_status,
    round_number,
    status,
    subtotal_cents,
    discount_mode,
    discount_value,
    discount_cents,
    total_cents
  )
  values (
    p_table_id,
    p_session_id,
    v_origin,
    v_parent_order_id,
    p_created_by_profile_id,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_general_note, '')), ''),
    v_service_type,
    v_delivery_address,
    v_delivery_fee,
    v_delivery_payment_method,
    v_delivery_cash_change_for_cents,
    'APPROVED',
    v_round,
    'PENDING',
    v_subtotal,
    v_discount_mode,
    v_discount_value,
    v_discount,
    v_total
  )
  returning id into v_order_id;

  if v_service_type in ('ENTREGA', 'RETIRADA') then
    perform public.ensure_order_receipt_token(v_order_id);
  end if;

  insert into public.order_items (
    order_id,
    product_id,
    name_snapshot,
    original_unit_price_cents,
    unit_price_cents,
    qty,
    note,
    promo_name,
    promo_discount_type,
    promo_discount_value,
    promo_discount_cents,
    added_by_name,
    status
  )
  with normalized_items as (
    select
      i.product_id,
      coalesce(nullif(trim(coalesce(i.name_snapshot, '')), ''), 'Item') as name_snapshot,
      greatest(coalesce(i.original_unit_price_cents, i.unit_price_cents, 0), 0) as original_unit_price_cents,
      greatest(coalesce(i.unit_price_cents, 0), 0) as unit_price_cents,
      greatest(coalesce(i.qty, 1), 1) as qty,
      nullif(trim(coalesce(i.note, '')), '') as note,
      nullif(trim(coalesce(i.promo_name, '')), '') as promo_name,
      case
        when i.promo_discount_type in ('AMOUNT', 'PERCENT') then i.promo_discount_type
        else null
      end as promo_discount_type,
      greatest(coalesce(i.promo_discount_value, 0), 0) as promo_discount_value,
      greatest(coalesce(i.promo_discount_cents, 0), 0) as promo_discount_cents,
      coalesce(nullif(i.added_by_name, ''), nullif(trim(coalesce(p_added_by_name, '')), ''), 'Operador') as added_by_name,
      coalesce(nullif(i.status, ''), 'PENDING') as status
    from jsonb_to_recordset(p_items) as i(
      product_id uuid,
      name_snapshot text,
      unit_price_cents integer,
      original_unit_price_cents integer,
      promo_name text,
      promo_discount_type text,
      promo_discount_value integer,
      promo_discount_cents integer,
      qty integer,
      note text,
      added_by_name text,
      status text
    )
  ),
  grouped_items as (
    select
      min(product_id::text)::uuid as product_id,
      name_snapshot,
      original_unit_price_cents,
      unit_price_cents,
      sum(qty)::integer as qty,
      note,
      promo_name,
      promo_discount_type,
      promo_discount_value,
      promo_discount_cents,
      added_by_name,
      status
    from normalized_items
    group by name_snapshot, original_unit_price_cents, unit_price_cents, note, promo_name, promo_discount_type, promo_discount_value, promo_discount_cents, added_by_name, status
  )
  select
    v_order_id,
    g.product_id,
    g.name_snapshot,
    g.original_unit_price_cents,
    g.unit_price_cents,
    g.qty,
    g.note,
    g.promo_name,
    g.promo_discount_type,
    g.promo_discount_value,
    g.promo_discount_cents,
    g.added_by_name,
    g.status
  from grouped_items g;

  perform public.register_session_event(
    p_session_id,
    p_table_id,
    'ORDER_CREATED',
    jsonb_build_object(
      'order_id', v_order_id,
      'origin', v_origin,
      'parent_order_id', v_parent_order_id,
      'created_by_profile_id', p_created_by_profile_id,
      'round_number', v_round,
      'service_type', v_service_type,
      'delivery_fee_cents', v_delivery_fee,
      'delivery_address', v_delivery_address,
      'delivery_payment_method', v_delivery_payment_method,
      'delivery_cash_change_for_cents', v_delivery_cash_change_for_cents,
      'subtotal_cents', v_subtotal,
      'discount_mode', v_discount_mode,
      'discount_value', v_discount_value,
      'discount_cents', v_discount,
      'total_cents', v_total
    )
  );

  return v_order_id;
end;
$$;

create or replace function public.create_public_delivery_order(
  p_customer_name text,
  p_customer_phone text,
  p_general_note text default null,
  p_delivery_address jsonb default null,
  p_delivery_payment_method text default 'CARD',
  p_delivery_cash_change_for_cents integer default 0,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_delivery_enabled boolean := false;
  v_default_delivery_fee_cents integer := 0;
  v_pix_key text;
  v_payment_method text;
  v_cash_change integer := 0;
  v_delivery_address jsonb;
  v_subtotal integer := 0;
  v_total integer := 0;
  v_table_id uuid;
  v_session_id uuid;
  v_order_id uuid;
  v_receipt_token text;
  v_table_token text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items precisa ser um array jsonb com itens';
  end if;

  select
    coalesce(enable_delivery_module, false),
    greatest(coalesce(default_delivery_fee_cents, 0), 0),
    nullif(trim(coalesce(pix_key_value, '')), '')
    into v_delivery_enabled, v_default_delivery_fee_cents, v_pix_key
  from public.settings
  where id = 1
  limit 1;

  if coalesce(v_delivery_enabled, false) = false then
    raise exception 'modulo de entrega desativado';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'customer_name e obrigatorio';
  end if;

  if nullif(trim(coalesce(p_customer_phone, '')), '') is null then
    raise exception 'customer_phone e obrigatorio';
  end if;

  v_payment_method := upper(coalesce(p_delivery_payment_method, ''));
  if v_payment_method not in ('PIX', 'CASH', 'CARD') then
    raise exception 'metodo de pagamento invalido';
  end if;

  if v_payment_method = 'PIX' and v_pix_key is null then
    raise exception 'pix indisponivel: chave pix nao cadastrada';
  end if;

  v_cash_change := greatest(coalesce(p_delivery_cash_change_for_cents, 0), 0);
  if v_payment_method <> 'CASH' then
    v_cash_change := 0;
  end if;

  v_delivery_address := case
    when p_delivery_address is null or p_delivery_address = 'null'::jsonb then null
    when jsonb_typeof(p_delivery_address) = 'object' then p_delivery_address - 'city'
    else p_delivery_address
  end;

  if v_delivery_address is null then
    raise exception 'delivery_address e obrigatorio';
  end if;
  if nullif(trim(coalesce(v_delivery_address->>'street', '')), '') is null then
    raise exception 'delivery_address.street e obrigatorio';
  end if;
  if nullif(trim(coalesce(v_delivery_address->>'number', '')), '') is null then
    raise exception 'delivery_address.number e obrigatorio';
  end if;
  if nullif(trim(coalesce(v_delivery_address->>'neighborhood', '')), '') is null then
    raise exception 'delivery_address.neighborhood e obrigatorio';
  end if;

  select coalesce(sum((greatest(coalesce(i.qty, 1), 1) * greatest(coalesce(i.unit_price_cents, 0), 0))::integer), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as i(
    product_id uuid,
    name_snapshot text,
    unit_price_cents integer,
    original_unit_price_cents integer,
    promo_name text,
    promo_discount_type text,
    promo_discount_value integer,
    promo_discount_cents integer,
    qty integer,
    note text,
    added_by_name text,
    status text
  );

  if coalesce(v_subtotal, 0) <= 0 then
    raise exception 'subtotal invalido para pedido de entrega';
  end if;

  v_total := greatest(v_subtotal + v_default_delivery_fee_cents, 0);
  v_table_token := 'delivery-public-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.tables (name, token, table_type, status)
  values ('ENTREGA', v_table_token, 'COUNTER', 'OCCUPIED')
  returning id into v_table_id;

  insert into public.sessions (table_id, status)
  values (v_table_id, 'OPEN')
  returning id into v_session_id;

  insert into public.orders (
    table_id,
    session_id,
    origin,
    customer_name,
    customer_phone,
    general_note,
    service_type,
    delivery_address,
    delivery_fee_cents,
    delivery_payment_method,
    delivery_cash_change_for_cents,
    approval_status,
    round_number,
    status,
    subtotal_cents,
    discount_mode,
    discount_value,
    discount_cents,
    total_cents
  )
  values (
    v_table_id,
    v_session_id,
    'CUSTOMER',
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_general_note, '')), ''),
    'ENTREGA',
    v_delivery_address,
    v_default_delivery_fee_cents,
    v_payment_method,
    v_cash_change,
    'APPROVED',
    1,
    'PENDING',
    v_subtotal,
    'NONE',
    0,
    0,
    v_total
  )
  returning id into v_order_id;

  perform public.ensure_order_receipt_token(v_order_id);

  insert into public.order_items (
    order_id,
    product_id,
    name_snapshot,
    original_unit_price_cents,
    unit_price_cents,
    qty,
    note,
    promo_name,
    promo_discount_type,
    promo_discount_value,
    promo_discount_cents,
    added_by_name,
    status
  )
  with normalized_items as (
    select
      i.product_id,
      coalesce(nullif(trim(coalesce(i.name_snapshot, '')), ''), 'Item') as name_snapshot,
      greatest(coalesce(i.original_unit_price_cents, i.unit_price_cents, 0), 0) as original_unit_price_cents,
      greatest(coalesce(i.unit_price_cents, 0), 0) as unit_price_cents,
      greatest(coalesce(i.qty, 1), 1) as qty,
      nullif(trim(coalesce(i.note, '')), '') as note,
      nullif(trim(coalesce(i.promo_name, '')), '') as promo_name,
      case
        when i.promo_discount_type in ('AMOUNT', 'PERCENT') then i.promo_discount_type
        else null
      end as promo_discount_type,
      greatest(coalesce(i.promo_discount_value, 0), 0) as promo_discount_value,
      greatest(coalesce(i.promo_discount_cents, 0), 0) as promo_discount_cents,
      coalesce(nullif(trim(coalesce(i.added_by_name, '')), ''), 'Cliente') as added_by_name,
      coalesce(nullif(i.status, ''), 'PENDING') as status
    from jsonb_to_recordset(p_items) as i(
      product_id uuid,
      name_snapshot text,
      unit_price_cents integer,
      original_unit_price_cents integer,
      promo_name text,
      promo_discount_type text,
      promo_discount_value integer,
      promo_discount_cents integer,
      qty integer,
      note text,
      added_by_name text,
      status text
    )
  ),
  grouped_items as (
    select
      min(product_id::text)::uuid as product_id,
      name_snapshot,
      original_unit_price_cents,
      unit_price_cents,
      sum(qty)::integer as qty,
      note,
      promo_name,
      promo_discount_type,
      promo_discount_value,
      promo_discount_cents,
      added_by_name,
      status
    from normalized_items
    group by name_snapshot, original_unit_price_cents, unit_price_cents, note, promo_name, promo_discount_type, promo_discount_value, promo_discount_cents, added_by_name, status
  )
  select
    v_order_id,
    g.product_id,
    g.name_snapshot,
    g.original_unit_price_cents,
    g.unit_price_cents,
    g.qty,
    g.note,
    g.promo_name,
    g.promo_discount_type,
    g.promo_discount_value,
    g.promo_discount_cents,
    g.added_by_name,
    g.status
  from grouped_items g;

  select receipt_token
    into v_receipt_token
  from public.orders
  where id = v_order_id
  limit 1;

  perform public.register_session_event(
    v_session_id,
    v_table_id,
    'ORDER_CREATED',
    jsonb_build_object(
      'order_id', v_order_id,
      'origin', 'CUSTOMER',
      'round_number', 1,
      'service_type', 'ENTREGA',
      'delivery_fee_cents', v_default_delivery_fee_cents,
      'delivery_address', v_delivery_address,
      'delivery_payment_method', v_payment_method,
      'delivery_cash_change_for_cents', v_cash_change,
      'subtotal_cents', v_subtotal,
      'discount_mode', 'NONE',
      'discount_value', 0,
      'discount_cents', 0,
      'total_cents', v_total
    )
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'session_id', v_session_id,
    'table_id', v_table_id,
    'receipt_token', coalesce(v_receipt_token, '')
  );
end;
$$;

