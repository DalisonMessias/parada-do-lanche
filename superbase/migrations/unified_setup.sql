-- Setup unificado do app (schema + ajustes de policies + recursos extras)
-- Execute este arquivo em ambiente novo para subir tudo de uma vez.
-- Em ambiente existente, tambem e seguro (idempotente na maior parte).

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.settings (
  id integer primary key default 1,
  store_name text not null default 'Parada do Lanche',
  primary_color text not null default '#f97316',
  logo_url text,
  wifi_ssid text not null default '',
  wifi_password text not null default '',
  order_approval_mode text not null default 'HOST' check (order_approval_mode in ('HOST', 'SELF')),
  enable_counter_module boolean not null default true,
  default_delivery_fee_cents integer not null default 0,
  sticker_bg_color text not null default '#ffffff',
  sticker_text_color text not null default '#111827',
  sticker_border_color text not null default '#111111',
  sticker_muted_text_color text not null default '#9ca3af',
  sticker_qr_frame_color text not null default '#111111',
  constraint single_row check (id = 1)
);
alter table if exists public.settings
  add column if not exists wifi_ssid text not null default '';
alter table if exists public.settings
  add column if not exists wifi_password text not null default '';
alter table if exists public.settings
  add column if not exists order_approval_mode text not null default 'HOST';
alter table if exists public.settings
  add column if not exists enable_counter_module boolean not null default true;
alter table if exists public.settings
  add column if not exists default_delivery_fee_cents integer not null default 0;
alter table if exists public.settings
  add column if not exists sticker_bg_color text not null default '#ffffff';
alter table if exists public.settings
  add column if not exists sticker_text_color text not null default '#111827';
alter table if exists public.settings
  add column if not exists sticker_border_color text not null default '#111111';
alter table if exists public.settings
  add column if not exists sticker_muted_text_color text not null default '#9ca3af';
alter table if exists public.settings
  add column if not exists sticker_qr_frame_color text not null default '#111111';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_order_approval_mode_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_order_approval_mode_check
      check (order_approval_mode in ('HOST', 'SELF'));
  end if;
end $$;

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  name text not null,
  role text not null default 'WAITER' check (role in ('ADMIN', 'MANAGER', 'WAITER')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.products (
  id uuid default uuid_generate_v4() primary key,
  category_id uuid references public.categories(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null,
  image_url text,
  addon_selection_mode text not null default 'MULTIPLE' check (addon_selection_mode in ('SINGLE', 'MULTIPLE')),
  active boolean default true,
  out_of_stock boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table if exists public.products
  add column if not exists addon_selection_mode text not null default 'MULTIPLE';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_addon_selection_mode_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_addon_selection_mode_check
      check (addon_selection_mode in ('SINGLE', 'MULTIPLE'));
  end if;
end $$;

create table if not exists public.product_addons (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_product_addons_product_id on public.product_addons(product_id);

create table if not exists public.tables (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  token text unique not null,
  table_type text not null default 'DINING' check (table_type in ('DINING', 'COUNTER')),
  status text default 'FREE' check (status in ('FREE', 'OCCUPIED')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table if exists public.tables
  add column if not exists table_type text not null default 'DINING';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tables_table_type_check'
      and conrelid = 'public.tables'::regclass
  ) then
    alter table public.tables
      add constraint tables_table_type_check
      check (table_type in ('DINING', 'COUNTER'));
  end if;
end $$;

create table if not exists public.sessions (
  id uuid default uuid_generate_v4() primary key,
  table_id uuid references public.tables(id) on delete cascade,
  status text default 'OPEN' check (status in ('OPEN', 'LOCKED', 'EXPIRED')),
  host_guest_id uuid,
  closed_at timestamp with time zone,
  total_final integer,
  items_total_final integer,
  last_print_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table if exists public.sessions
  add column if not exists closed_at timestamp with time zone;
alter table if exists public.sessions
  add column if not exists total_final integer;
alter table if exists public.sessions
  add column if not exists items_total_final integer;
alter table if exists public.sessions
  add column if not exists last_print_at timestamp with time zone;

-- Corrige legado: se existir mais de uma sessao OPEN na mesma mesa, mantem apenas a mais recente.
do $$
begin
  update public.sessions s
  set
    status = 'EXPIRED',
    closed_at = coalesce(s.closed_at, timezone('utc'::text, now()))
  from (
    select id
    from (
      select
        id,
        row_number() over (
          partition by table_id
          order by created_at desc, id desc
        ) as rn
      from public.sessions
      where status = 'OPEN'
    ) ranked
    where ranked.rn > 1
  ) dup
  where s.id = dup.id;
end $$;

create unique index if not exists uq_sessions_one_open_per_table
on public.sessions(table_id)
where status = 'OPEN';

create table if not exists public.session_guests (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  name text not null,
  is_host boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.cart_items (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  guest_id uuid references public.session_guests(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  qty integer not null default 1,
  note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.orders (
  id uuid default uuid_generate_v4() primary key,
  table_id uuid references public.tables(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  origin text not null default 'CUSTOMER' check (origin in ('CUSTOMER', 'WAITER', 'BALCAO')),
  parent_order_id uuid references public.orders(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  customer_phone text,
  general_note text,
  service_type text not null default 'ON_TABLE' check (service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA')),
  delivery_address jsonb,
  delivery_fee_cents integer not null default 0,
  created_by_guest_id uuid references public.session_guests(id) on delete set null,
  approval_status text not null default 'PENDING_APPROVAL' check (approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  approved_by_guest_id uuid references public.session_guests(id) on delete set null,
  approved_at timestamp with time zone,
  round_number integer not null default 1,
  printed_at timestamp with time zone,
  printed_count integer not null default 0,
  subtotal_cents integer not null default 0,
  discount_mode text not null default 'NONE' check (discount_mode in ('NONE', 'AMOUNT', 'PERCENT')),
  discount_value integer not null default 0,
  discount_cents integer not null default 0,
  -- Valores internos do banco (nao alterar sem migracao completa do app):
  -- PENDING, PREPARING, READY, FINISHED, CANCELLED
  -- Rotulos PT-BR na interface:
  -- Pendente, Em preparo, Pronto, Finalizado, Cancelado
  status text default 'PENDING' check (status in ('PENDING', 'PREPARING', 'READY', 'FINISHED', 'CANCELLED')),
  total_cents integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table if exists public.orders
  add column if not exists origin text not null default 'CUSTOMER';
alter table if exists public.orders
  add column if not exists parent_order_id uuid references public.orders(id) on delete set null;
alter table if exists public.orders
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null;
alter table if exists public.orders
  add column if not exists customer_name text;
alter table if exists public.orders
  add column if not exists customer_phone text;
alter table if exists public.orders
  add column if not exists general_note text;
alter table if exists public.orders
  add column if not exists service_type text not null default 'ON_TABLE';
alter table if exists public.orders
  add column if not exists delivery_address jsonb;
alter table if exists public.orders
  add column if not exists delivery_fee_cents integer not null default 0;
alter table if exists public.orders
  add column if not exists created_by_guest_id uuid references public.session_guests(id) on delete set null;
alter table if exists public.orders
  add column if not exists approval_status text not null default 'PENDING_APPROVAL';
alter table if exists public.orders
  add column if not exists approved_by_guest_id uuid references public.session_guests(id) on delete set null;
alter table if exists public.orders
  add column if not exists approved_at timestamp with time zone;
alter table if exists public.orders
  add column if not exists round_number integer not null default 1;
alter table if exists public.orders
  add column if not exists printed_at timestamp with time zone;
alter table if exists public.orders
  add column if not exists printed_count integer not null default 0;
alter table if exists public.orders
  add column if not exists subtotal_cents integer not null default 0;
alter table if exists public.orders
  add column if not exists discount_mode text not null default 'NONE';
alter table if exists public.orders
  add column if not exists discount_value integer not null default 0;
alter table if exists public.orders
  add column if not exists discount_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_approval_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_approval_status_check
      check (approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_service_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_service_type_check
      check (service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_origin_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_origin_check
      check (origin in ('CUSTOMER', 'WAITER', 'BALCAO'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_discount_mode_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_discount_mode_check
      check (discount_mode in ('NONE', 'AMOUNT', 'PERCENT'));
  end if;
end $$;

create table if not exists public.order_items (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name_snapshot text not null,
  unit_price_cents integer not null,
  qty integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'READY')),
  printed_at timestamp with time zone,
  note text,
  added_by_name text not null
);
alter table if exists public.order_items
  add column if not exists status text not null default 'PENDING';
alter table if exists public.order_items
  add column if not exists printed_at timestamp with time zone;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_status_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_status_check
      check (status in ('PENDING', 'READY'));
  end if;
end $$;

create index if not exists idx_orders_session_printed on public.orders(session_id, printed_at);
create index if not exists idx_orders_session_round on public.orders(session_id, round_number desc);
create index if not exists idx_orders_session_origin_printed on public.orders(session_id, origin, printed_at);
create index if not exists idx_orders_parent_order_id on public.orders(parent_order_id);
create index if not exists idx_order_items_order_printed on public.order_items(order_id, printed_at);

create table if not exists public.session_events (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_session_events_session_created_at on public.session_events(session_id, created_at desc);

create table if not exists public.staff_password_audit (
  id uuid default uuid_generate_v4() primary key,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  changed_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_staff_password_audit_changed_at on public.staff_password_audit(changed_at desc);

insert into public.settings (id, store_name, primary_color)
values (1, 'Parada do Lanche', '#f97316')
on conflict (id) do nothing;

update public.settings
set
  wifi_ssid = coalesce(wifi_ssid, ''),
  wifi_password = coalesce(wifi_password, ''),
  order_approval_mode = coalesce(order_approval_mode, 'HOST'),
  enable_counter_module = coalesce(enable_counter_module, true),
  default_delivery_fee_cents = greatest(coalesce(default_delivery_fee_cents, 0), 0),
  sticker_bg_color = coalesce(sticker_bg_color, '#ffffff'),
  sticker_text_color = coalesce(sticker_text_color, '#111827'),
  sticker_border_color = coalesce(sticker_border_color, '#111111'),
  sticker_muted_text_color = coalesce(sticker_muted_text_color, '#9ca3af'),
  sticker_qr_frame_color = coalesce(sticker_qr_frame_color, '#111111')
where id = 1;

update public.orders
set
  origin = coalesce(origin, 'CUSTOMER'),
  subtotal_cents = case when coalesce(subtotal_cents, 0) <= 0 then coalesce(total_cents, 0) else subtotal_cents end,
  discount_mode = coalesce(discount_mode, 'NONE'),
  discount_value = coalesce(discount_value, 0),
  discount_cents = coalesce(discount_cents, 0),
  service_type = coalesce(service_type, 'ON_TABLE'),
  delivery_fee_cents = greatest(coalesce(delivery_fee_cents, 0), 0);

-- Mantem o app funcionando com RLS habilitado, sem bloquear o fluxo atual.
-- As policies abaixo sao abertas (to public) e devem ser endurecidas depois.
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);

    execute format('drop policy if exists rls_public_select on public.%I', r.tablename);
    execute format('create policy rls_public_select on public.%I for select to public using (true)', r.tablename);

    execute format('drop policy if exists rls_public_insert on public.%I', r.tablename);
    execute format('create policy rls_public_insert on public.%I for insert to public with check (true)', r.tablename);

    execute format('drop policy if exists rls_public_update on public.%I', r.tablename);
    execute format('create policy rls_public_update on public.%I for update to public using (true) with check (true)', r.tablename);

    execute format('drop policy if exists rls_public_delete on public.%I', r.tablename);
    execute format('create policy rls_public_delete on public.%I for delete to public using (true)', r.tablename);
  end loop;
end $$;

create or replace function public.get_or_create_open_session(p_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  insert into public.sessions (table_id, status)
  values (p_table_id, 'OPEN')
  on conflict (table_id) where (status = 'OPEN')
  do update set table_id = excluded.table_id
  returning id into v_session_id;

  update public.tables
    set status = 'OCCUPIED'
  where id = p_table_id;

  return v_session_id;
end;
$$;

create or replace function public.get_or_create_counter_session(
  p_profile_id uuid,
  p_profile_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_session_id uuid;
  v_token text;
  v_table_name text;
begin
  if p_profile_id is null then
    raise exception 'p_profile_id e obrigatorio';
  end if;

  v_token := 'counter-' || p_profile_id::text;
  v_table_name := 'BALCAO ' || coalesce(nullif(trim(p_profile_name), ''), substring(p_profile_id::text, 1, 8));

  insert into public.tables (name, token, table_type, status)
  values (v_table_name, v_token, 'COUNTER', 'OCCUPIED')
  on conflict (token)
  do update
    set name = excluded.name,
        table_type = 'COUNTER',
        status = 'OCCUPIED'
  returning id into v_table_id;

  insert into public.sessions (table_id, status)
  values (v_table_id, 'OPEN')
  on conflict (table_id) where (status = 'OPEN')
  do update set table_id = excluded.table_id
  returning id into v_session_id;

  update public.tables
    set status = 'OCCUPIED'
  where id = v_table_id;

  return v_session_id;
end;
$$;

create or replace function public.create_waiter_virtual_session(
  p_profile_id uuid,
  p_profile_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_table_id uuid;
  v_session_id uuid;
  v_code text;
  v_table_name text;
  v_token text;
begin
  if p_profile_id is null then
    raise exception 'p_profile_id e obrigatorio';
  end if;

  select role
    into v_role
  from public.profiles
  where id = p_profile_id
  limit 1;

  if coalesce(v_role, '') <> 'WAITER' then
    raise exception 'apenas garcom pode criar mesa virtual';
  end if;

  v_code := upper(substring(replace(uuid_generate_v4()::text, '-', '') from 1 for 6));
  v_table_name := 'MV-' || v_code;
  v_token := 'waiter-virtual-' || replace(uuid_generate_v4()::text, '-', '');

  insert into public.tables (name, token, table_type, status)
  values (v_table_name, v_token, 'DINING', 'OCCUPIED')
  returning id into v_table_id;

  insert into public.sessions (table_id, status)
  values (v_table_id, 'OPEN')
  on conflict (table_id) where (status = 'OPEN')
  do update set table_id = excluded.table_id
  returning id into v_session_id;

  update public.tables
    set status = 'OCCUPIED'
  where id = v_table_id;

  insert into public.session_events (session_id, table_id, event_type, payload)
  values (
    v_session_id,
    v_table_id,
    'WAITER_VIRTUAL_TABLE_CREATED',
    jsonb_build_object(
      'created_by_profile_id', p_profile_id,
      'created_by_name', coalesce(nullif(trim(p_profile_name), ''), 'Garcom')
    )
  );

  return v_session_id;
end;
$$;

create or replace function public.admin_set_user_password(
  p_actor_profile_id uuid,
  p_actor_name text,
  p_target_profile_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_role text;
begin
  if p_actor_profile_id is null then
    raise exception 'p_actor_profile_id e obrigatorio';
  end if;
  if p_target_profile_id is null then
    raise exception 'p_target_profile_id e obrigatorio';
  end if;
  if p_new_password is null or length(trim(p_new_password)) < 8 then
    raise exception 'a senha deve ter no minimo 8 caracteres';
  end if;

  select role
    into v_actor_role
  from public.profiles
  where id = p_actor_profile_id
  limit 1;

  if coalesce(v_actor_role, '') <> 'ADMIN' then
    raise exception 'permissao insuficiente para alterar senha';
  end if;

  update auth.users
    set encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
        updated_at = timezone('utc'::text, now()),
        email_confirmed_at = coalesce(email_confirmed_at, timezone('utc'::text, now()))
  where id = p_target_profile_id;

  if not found then
    raise exception 'usuario nao encontrado para troca de senha';
  end if;

  insert into public.staff_password_audit (
    actor_profile_id,
    actor_name,
    target_profile_id
  )
  values (
    p_actor_profile_id,
    nullif(trim(coalesce(p_actor_name, '')), ''),
    p_target_profile_id
  );
end;
$$;

create or replace function public.register_session_event(
  p_session_id uuid,
  p_table_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.session_events (session_id, table_id, event_type, payload)
  values (p_session_id, p_table_id, p_event_type, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.create_individual_order(
  p_session_id uuid,
  p_table_id uuid,
  p_guest_id uuid,
  p_guest_name text,
  p_approval_status text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_total integer;
  v_round integer;
  v_approval text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items precisa ser um array jsonb com itens';
  end if;

  v_approval := case when p_approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    then p_approval_status
    else 'PENDING_APPROVAL'
  end;

  perform 1
  from public.sessions
  where id = p_session_id
  for update;

  select coalesce(max(round_number), 0) + 1
    into v_round
  from public.orders
  where session_id = p_session_id;

  select coalesce(sum((i.qty * i.unit_price_cents)::integer), 0)
    into v_total
  from jsonb_to_recordset(p_items) as i(
    product_id uuid,
    name_snapshot text,
    unit_price_cents integer,
    qty integer,
    note text,
    added_by_name text,
    status text
  );

  insert into public.orders (
    table_id,
    session_id,
    origin,
    service_type,
    delivery_fee_cents,
    created_by_guest_id,
    approval_status,
    approved_by_guest_id,
    approved_at,
    round_number,
    subtotal_cents,
    discount_mode,
    discount_value,
    discount_cents,
    total_cents,
    status
  )
  values (
    p_table_id,
    p_session_id,
    'CUSTOMER',
    'ON_TABLE',
    0,
    p_guest_id,
    v_approval,
    case when v_approval = 'APPROVED' then p_guest_id else null end,
    case when v_approval = 'APPROVED' then timezone('utc'::text, now()) else null end,
    v_round,
    v_total,
    'NONE',
    0,
    0,
    v_total,
    'PENDING'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    name_snapshot,
    unit_price_cents,
    qty,
    note,
    added_by_name,
    status
  )
  select
    v_order_id,
    i.product_id,
    coalesce(i.name_snapshot, 'Item'),
    i.unit_price_cents,
    i.qty,
    i.note,
    coalesce(i.added_by_name, p_guest_name),
    coalesce(i.status, 'PENDING')
  from jsonb_to_recordset(p_items) as i(
    product_id uuid,
    name_snapshot text,
    unit_price_cents integer,
    qty integer,
    note text,
    added_by_name text,
    status text
  );

  delete from public.cart_items
  where session_id = p_session_id
    and guest_id = p_guest_id;

  perform public.register_session_event(
    p_session_id,
    p_table_id,
    'ORDER_CREATED',
    jsonb_build_object(
      'order_id', v_order_id,
      'guest_id', p_guest_id,
      'guest_name', p_guest_name,
      'approval_status', v_approval,
      'round_number', v_round,
      'total_cents', v_total
    )
  );

  return v_order_id;
end;
$$;

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
    when p_service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA') then p_service_type
    else null
  end;

  v_discount_value := greatest(coalesce(p_discount_value, 0), 0);
  v_delivery_fee := greatest(coalesce(p_delivery_fee_cents, 0), 0);
  v_delivery_address := case
    when p_delivery_address is null or p_delivery_address = 'null'::jsonb then null
    else p_delivery_address
  end;

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
  else
    if v_service_type is null or v_service_type = 'ON_TABLE' then
      v_service_type := 'RETIRADA';
    end if;
    if v_service_type <> 'ENTREGA' then
      v_delivery_fee := 0;
      v_delivery_address := null;
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

  insert into public.order_items (
    order_id,
    product_id,
    name_snapshot,
    unit_price_cents,
    qty,
    note,
    added_by_name,
    status
  )
  select
    v_order_id,
    i.product_id,
    coalesce(nullif(i.name_snapshot, ''), 'Item'),
    greatest(coalesce(i.unit_price_cents, 0), 0),
    greatest(coalesce(i.qty, 1), 1),
    i.note,
    coalesce(nullif(i.added_by_name, ''), nullif(trim(coalesce(p_added_by_name, '')), ''), 'Operador'),
    coalesce(nullif(i.status, ''), 'PENDING')
  from jsonb_to_recordset(p_items) as i(
    product_id uuid,
    name_snapshot text,
    unit_price_cents integer,
    qty integer,
    note text,
    added_by_name text,
    status text
  );

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

create or replace function public.mark_orders_printed(
  p_session_id uuid,
  p_order_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return 0;
  end if;

  with updated_orders as (
    update public.orders
      set printed_at = coalesce(printed_at, timezone('utc'::text, now())),
          printed_count = coalesce(printed_count, 0) + 1
    where session_id = p_session_id
      and id = any(p_order_ids)
    returning id
  )
  select count(*) into v_count from updated_orders;

  update public.order_items
    set printed_at = coalesce(printed_at, timezone('utc'::text, now()))
  where order_id = any(p_order_ids);

  update public.sessions
    set last_print_at = timezone('utc'::text, now())
  where id = p_session_id;

  perform public.register_session_event(
    p_session_id,
    (select table_id from public.sessions where id = p_session_id),
    'KITCHEN_PRINT',
    jsonb_build_object('order_ids', p_order_ids, 'printed_count', v_count)
  );

  return v_count;
end;
$$;

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
  v_total integer := 0;
  v_items integer := 0;
begin
  select table_id into v_table_id
  from public.sessions
  where id = p_session_id
  for update;

  if v_table_id is null then
    return;
  end if;

  select coalesce(sum(o.total_cents), 0)
    into v_total
  from public.orders o
  where o.session_id = p_session_id
    and o.approval_status = 'APPROVED'
    and o.status <> 'CANCELLED';

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
    jsonb_build_object('total_final', v_total, 'items_total_final', v_items)
  );
end;
$$;

-- Garante refresh do schema cache da API (PostgREST/Supabase)
select pg_notify('pgrst', 'reload schema');

-- Storage bucket e policies para assets (logo/fotos)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

drop policy if exists "assets_select_public" on storage.objects;
create policy "assets_select_public"
on storage.objects
for select
to public
using (bucket_id = 'assets');

drop policy if exists "assets_insert_public" on storage.objects;
create policy "assets_insert_public"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'assets');

drop policy if exists "assets_update_public" on storage.objects;
create policy "assets_update_public"
on storage.objects
for update
to authenticated
using (bucket_id = 'assets')
with check (bucket_id = 'assets');

drop policy if exists "assets_delete_public" on storage.objects;
create policy "assets_delete_public"
on storage.objects
for delete
to authenticated
using (bucket_id = 'assets');
