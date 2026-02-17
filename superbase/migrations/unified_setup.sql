-- Setup unificado do app (schema + ajustes de policies + recursos extras)
-- Execute este arquivo em ambiente novo para subir tudo de uma vez.
-- Em ambiente existente, tambem e seguro (idempotente na maior parte).

create extension if not exists "pgcrypto";

create table if not exists public.settings (
  id integer primary key default 1,
  logo_url text,
  store_name text not null default 'Loja',
  wifi_ssid text not null default '',
  wifi_password text not null default '',
  has_thermal_printer boolean not null default false,
  order_approval_mode text not null default 'HOST' check (order_approval_mode in ('HOST', 'SELF')),
  enable_counter_module boolean not null default true,
  enable_delivery_module boolean not null default false,
  enable_waiter_fee boolean not null default false,
  waiter_fee_mode text not null default 'PERCENT' check (waiter_fee_mode in ('PERCENT', 'FIXED')),
  waiter_fee_value integer not null default 10,
  default_delivery_fee_cents integer not null default 0,
  pix_key_type text,
  pix_key_value text,
  notification_sound_enabled boolean not null default false,
  notification_sound_url text not null default '',
  auto_print_menu_digital boolean not null default false,
  sticker_bg_color text not null default '#ffffff',
  sticker_text_color text not null default '#111827',
  sticker_border_color text not null default '#111111',
  sticker_muted_text_color text not null default '#9ca3af',
  sticker_qr_frame_color text not null default '#111111',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint single_row check (id = 1)
);
alter table if exists public.settings
  drop column if exists primary_color;
alter table if exists public.settings
  add column if not exists store_name text not null default 'Loja';
alter table if exists public.settings
  add column if not exists wifi_ssid text not null default '';
alter table if exists public.settings
  add column if not exists wifi_password text not null default '';
alter table if exists public.settings
  add column if not exists has_thermal_printer boolean not null default false;
alter table if exists public.settings
  add column if not exists order_approval_mode text not null default 'HOST';
alter table if exists public.settings
  add column if not exists enable_counter_module boolean not null default true;
alter table if exists public.settings
  add column if not exists enable_delivery_module boolean not null default false;
alter table if exists public.settings
  add column if not exists enable_waiter_fee boolean not null default false;
alter table if exists public.settings
  add column if not exists waiter_fee_mode text not null default 'PERCENT';
alter table if exists public.settings
  add column if not exists waiter_fee_value integer not null default 10;
alter table if exists public.settings
  add column if not exists default_delivery_fee_cents integer not null default 0;
alter table if exists public.settings
  add column if not exists pix_key_type text;
alter table if exists public.settings
  add column if not exists pix_key_value text;
alter table if exists public.settings
  add column if not exists notification_sound_enabled boolean not null default false;
alter table if exists public.settings
  add column if not exists notification_sound_url text not null default '';
alter table if exists public.settings
  add column if not exists auto_print_menu_digital boolean not null default false;
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
alter table if exists public.settings
  add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

update public.settings
set
  store_name = coalesce(nullif(trim(coalesce(store_name, '')), ''), 'Loja'),
  has_thermal_printer = coalesce(has_thermal_printer, false),
  enable_delivery_module = coalesce(enable_delivery_module, false),
  waiter_fee_mode = case
    when waiter_fee_mode in ('PERCENT', 'FIXED') then waiter_fee_mode
    else 'PERCENT'
  end,
  waiter_fee_value = case
    when (case when waiter_fee_mode in ('PERCENT', 'FIXED') then waiter_fee_mode else 'PERCENT' end) = 'PERCENT'
      then least(greatest(coalesce(waiter_fee_value, 10), 0), 100)
    else greatest(coalesce(waiter_fee_value, 0), 0)
  end,
  pix_key_type = case
    when pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random') then pix_key_type
    else null
  end,
  notification_sound_enabled = coalesce(notification_sound_enabled, false),
  notification_sound_url = coalesce(notification_sound_url, ''),
  auto_print_menu_digital = case
    when coalesce(has_thermal_printer, false) then coalesce(auto_print_menu_digital, false)
    else false
  end,
  updated_at = coalesce(updated_at, timezone('utc'::text, now()));

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_waiter_fee_mode_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_waiter_fee_mode_check
      check (waiter_fee_mode in ('PERCENT', 'FIXED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_waiter_fee_value_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_waiter_fee_value_check
      check (
        (waiter_fee_mode = 'PERCENT' and waiter_fee_value between 0 and 100)
        or
        (waiter_fee_mode = 'FIXED' and waiter_fee_value >= 0)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_pix_key_type_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_pix_key_type_check
      check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_notification_sound_url_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_notification_sound_url_check
      check (notification_sound_url is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_default_delivery_fee_cents_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_default_delivery_fee_cents_check
      check (default_delivery_fee_cents >= 0);
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
  id uuid default gen_random_uuid() primary key,
  name text not null,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  category_id uuid references public.categories(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null,
  image_url text,
  addon_selection_mode text not null default 'MULTIPLE' check (addon_selection_mode in ('SINGLE', 'MULTIPLE')),
  available_on_table boolean not null default true,
  available_on_delivery boolean not null default true,
  active boolean default true,
  is_featured boolean not null default false,
  out_of_stock boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table if exists public.products
  add column if not exists addon_selection_mode text not null default 'MULTIPLE';
alter table if exists public.products
  add column if not exists is_featured boolean not null default false;
alter table if exists public.products
  add column if not exists available_on_table boolean not null default true;
alter table if exists public.products
  add column if not exists available_on_delivery boolean not null default true;
update public.products
set
  is_featured = coalesce(is_featured, false),
  available_on_table = coalesce(available_on_table, true),
  available_on_delivery = coalesce(available_on_delivery, true);
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
  id uuid default gen_random_uuid() primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_product_addons_product_id on public.product_addons(product_id);

create table if not exists public.promotions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  scope text not null check (scope in ('GLOBAL', 'PRODUCT')),
  discount_type text not null check (discount_type in ('AMOUNT', 'PERCENT')),
  discount_value integer not null default 0,
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table if exists public.promotions
  add column if not exists weekdays smallint[] not null default '{0,1,2,3,4,5,6}';
alter table if exists public.promotions
  add column if not exists active boolean not null default true;
alter table if exists public.promotions
  add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promotions_scope_check'
      and conrelid = 'public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_scope_check
      check (scope in ('GLOBAL', 'PRODUCT'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promotions_discount_type_check'
      and conrelid = 'public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_discount_type_check
      check (discount_type in ('AMOUNT', 'PERCENT'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promotions_discount_value_check'
      and conrelid = 'public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promotions_weekdays_check'
      and conrelid = 'public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_weekdays_check
      check (coalesce(array_length(weekdays, 1), 0) > 0);
  end if;
end $$;
create index if not exists idx_promotions_active on public.promotions(active);
create index if not exists idx_promotions_scope on public.promotions(scope);

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (promotion_id, product_id)
);
create index if not exists idx_promotion_products_product_id on public.promotion_products(product_id);

create table if not exists public.store_feedback (
  id uuid default gen_random_uuid() primary key,
  store_id integer not null default 1,
  stars integer not null check (stars between 1 and 5),
  comment text,
  customer_name text,
  source text not null default 'cardapio_digital',
  table_id uuid,
  session_id uuid,
  order_id uuid,
  device_token text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_store_feedback_created_at on public.store_feedback(created_at desc);
create index if not exists idx_store_feedback_stars on public.store_feedback(stars);

create table if not exists public.tables (
  id uuid default gen_random_uuid() primary key,
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
  id uuid default gen_random_uuid() primary key,
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
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  name text not null,
  is_host boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.cart_items (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  guest_id uuid references public.session_guests(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  qty integer not null default 1,
  note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  table_id uuid references public.tables(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  origin text not null default 'CUSTOMER' check (origin in ('CUSTOMER', 'WAITER', 'BALCAO')),
  parent_order_id uuid references public.orders(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  customer_phone text,
  general_note text,
  service_type text not null default 'ON_TABLE' check (service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA', 'CONSUMO_LOCAL')),
  delivery_address jsonb,
  delivery_fee_cents integer not null default 0,
  delivery_payment_method text,
  delivery_cash_change_for_cents integer not null default 0,
  created_by_guest_id uuid references public.session_guests(id) on delete set null,
  approval_status text not null default 'PENDING_APPROVAL' check (approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  approved_by_guest_id uuid references public.session_guests(id) on delete set null,
  approved_at timestamp with time zone,
  round_number integer not null default 1,
  printed_at timestamp with time zone,
  printed_count integer not null default 0,
  receipt_token text,
  receipt_token_created_at timestamp with time zone,
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
  add column if not exists delivery_payment_method text;
alter table if exists public.orders
  add column if not exists delivery_cash_change_for_cents integer not null default 0;
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
  add column if not exists receipt_token text;
alter table if exists public.orders
  add column if not exists receipt_token_created_at timestamp with time zone;
alter table if exists public.orders
  add column if not exists subtotal_cents integer not null default 0;
alter table if exists public.orders
  add column if not exists discount_mode text not null default 'NONE';
alter table if exists public.orders
  add column if not exists discount_value integer not null default 0;
alter table if exists public.orders
  add column if not exists discount_cents integer not null default 0;

-- Saneia dados legados antes de aplicar constraints para evitar quebra em bases antigas.
update public.orders
set
  approval_status = case
    when approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED') then approval_status
    else 'PENDING_APPROVAL'
  end,
  origin = case
    when origin in ('CUSTOMER', 'WAITER', 'BALCAO') then origin
    else 'CUSTOMER'
  end,
  subtotal_cents = case
    when coalesce(subtotal_cents, 0) <= 0 then coalesce(total_cents, 0)
    else subtotal_cents
  end,
  discount_mode = case
    when discount_mode in ('NONE', 'AMOUNT', 'PERCENT') then discount_mode
    else 'NONE'
  end,
  discount_value = greatest(coalesce(discount_value, 0), 0),
  discount_cents = greatest(coalesce(discount_cents, 0), 0),
  service_type = case
    when service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA', 'CONSUMO_LOCAL') then service_type
    when (case when origin in ('CUSTOMER', 'WAITER', 'BALCAO') then origin else 'CUSTOMER' end) = 'BALCAO'
      then 'RETIRADA'
    else 'ON_TABLE'
  end,
  delivery_address = case
    when delivery_address is null then null
    when jsonb_typeof(delivery_address) = 'object' then delivery_address - 'city'
    else delivery_address
  end,
  delivery_fee_cents = greatest(coalesce(delivery_fee_cents, 0), 0);
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
      check (service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA', 'CONSUMO_LOCAL'));
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

create table if not exists public.order_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name_snapshot text not null,
  original_unit_price_cents integer,
  unit_price_cents integer not null,
  qty integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'READY')),
  printed_at timestamp with time zone,
  note text,
  promo_name text,
  promo_discount_type text,
  promo_discount_value integer,
  promo_discount_cents integer not null default 0,
  added_by_name text not null
);
alter table if exists public.order_items
  add column if not exists original_unit_price_cents integer;
alter table if exists public.order_items
  add column if not exists status text not null default 'PENDING';
alter table if exists public.order_items
  add column if not exists printed_at timestamp with time zone;
alter table if exists public.order_items
  add column if not exists promo_name text;
alter table if exists public.order_items
  add column if not exists promo_discount_type text;
alter table if exists public.order_items
  add column if not exists promo_discount_value integer;
alter table if exists public.order_items
  add column if not exists promo_discount_cents integer not null default 0;
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
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_original_unit_price_cents_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_original_unit_price_cents_check
      check (original_unit_price_cents is null or original_unit_price_cents >= 0);
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_promo_discount_type_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_promo_discount_type_check
      check (promo_discount_type is null or promo_discount_type in ('AMOUNT', 'PERCENT'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_promo_discount_cents_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_promo_discount_cents_check
      check (promo_discount_cents >= 0);
  end if;
end $$;

create index if not exists idx_orders_session_printed on public.orders(session_id, printed_at);
create index if not exists idx_orders_session_round on public.orders(session_id, round_number desc);
create index if not exists idx_orders_session_origin_printed on public.orders(session_id, origin, printed_at);
create index if not exists idx_orders_parent_order_id on public.orders(parent_order_id);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_created_at_service_status on public.orders(created_at desc, service_type, status, approval_status);
create unique index if not exists uq_orders_receipt_token
on public.orders(receipt_token)
where receipt_token is not null;
create index if not exists idx_order_items_order_printed on public.order_items(order_id, printed_at);

create table if not exists public.session_events (
  id uuid default gen_random_uuid() primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_session_events_session_created_at on public.session_events(session_id, created_at desc);

create table if not exists public.staff_password_audit (
  id uuid default gen_random_uuid() primary key,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  changed_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_staff_password_audit_changed_at on public.staff_password_audit(changed_at desc);

create table if not exists public.order_cancellation_audit (
  id uuid default gen_random_uuid() primary key,
  action_scope text not null check (action_scope in ('SINGLE', 'BULK')),
  batch_id uuid,
  order_id uuid not null references public.orders(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  table_id uuid references public.tables(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  actor_name text,
  previous_status text,
  previous_approval_status text,
  cancelled_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_order_cancellation_audit_cancelled_at on public.order_cancellation_audit(cancelled_at desc);
create index if not exists idx_order_cancellation_audit_order_id on public.order_cancellation_audit(order_id);
create index if not exists idx_order_cancellation_audit_actor_profile_id on public.order_cancellation_audit(actor_profile_id);
create index if not exists idx_order_cancellation_audit_batch_id on public.order_cancellation_audit(batch_id);

create table if not exists public.staff_action_audit (
  id uuid default gen_random_uuid() primary key,
  action_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  actor_name text,
  session_id uuid references public.sessions(id) on delete set null,
  table_id uuid references public.tables(id) on delete set null,
  order_ids uuid[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_staff_action_audit_created_at on public.staff_action_audit(created_at desc);
create index if not exists idx_staff_action_audit_actor_profile_id on public.staff_action_audit(actor_profile_id);
create index if not exists idx_staff_action_audit_action_type on public.staff_action_audit(action_type);
create index if not exists idx_staff_action_audit_session_id on public.staff_action_audit(session_id);

-- Garante default UUID consistente mesmo em bases antigas que ainda usam uuid_generate_v4().
alter table if exists public.categories alter column id set default gen_random_uuid();
alter table if exists public.products alter column id set default gen_random_uuid();
alter table if exists public.product_addons alter column id set default gen_random_uuid();
alter table if exists public.tables alter column id set default gen_random_uuid();
alter table if exists public.sessions alter column id set default gen_random_uuid();
alter table if exists public.session_guests alter column id set default gen_random_uuid();
alter table if exists public.cart_items alter column id set default gen_random_uuid();
alter table if exists public.orders alter column id set default gen_random_uuid();
alter table if exists public.order_items alter column id set default gen_random_uuid();
alter table if exists public.session_events alter column id set default gen_random_uuid();
alter table if exists public.staff_password_audit alter column id set default gen_random_uuid();
alter table if exists public.order_cancellation_audit alter column id set default gen_random_uuid();
alter table if exists public.staff_action_audit alter column id set default gen_random_uuid();

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

update public.settings
set
  store_name = coalesce(nullif(trim(coalesce(store_name, '')), ''), 'Loja'),
  wifi_ssid = coalesce(wifi_ssid, ''),
  wifi_password = coalesce(wifi_password, ''),
  has_thermal_printer = coalesce(has_thermal_printer, false),
  order_approval_mode = coalesce(order_approval_mode, 'HOST'),
  enable_counter_module = coalesce(enable_counter_module, true),
  enable_delivery_module = coalesce(enable_delivery_module, false),
  enable_waiter_fee = coalesce(enable_waiter_fee, false),
  waiter_fee_mode = case
    when waiter_fee_mode in ('PERCENT', 'FIXED') then waiter_fee_mode
    else 'PERCENT'
  end,
  waiter_fee_value = case
    when (case when waiter_fee_mode in ('PERCENT', 'FIXED') then waiter_fee_mode else 'PERCENT' end) = 'PERCENT'
      then least(greatest(coalesce(waiter_fee_value, 10), 0), 100)
    else greatest(coalesce(waiter_fee_value, 0), 0)
  end,
  default_delivery_fee_cents = greatest(coalesce(default_delivery_fee_cents, 0), 0),
  pix_key_type = case
    when pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random') then pix_key_type
    else null
  end,
  pix_key_value = nullif(trim(coalesce(pix_key_value, '')), ''),
  notification_sound_enabled = coalesce(notification_sound_enabled, false),
  notification_sound_url = coalesce(notification_sound_url, ''),
  auto_print_menu_digital = case
    when coalesce(has_thermal_printer, false) then coalesce(auto_print_menu_digital, false)
    else false
  end,
  sticker_bg_color = coalesce(sticker_bg_color, '#ffffff'),
  sticker_text_color = coalesce(sticker_text_color, '#111827'),
  sticker_border_color = coalesce(sticker_border_color, '#111111'),
  sticker_muted_text_color = coalesce(sticker_muted_text_color, '#9ca3af'),
  sticker_qr_frame_color = coalesce(sticker_qr_frame_color, '#111111'),
  updated_at = coalesce(updated_at, timezone('utc'::text, now()))
where id = 1;

update public.orders
set
  origin = case
    when origin in ('CUSTOMER', 'WAITER', 'BALCAO') then origin
    else 'CUSTOMER'
  end,
  subtotal_cents = case
    when coalesce(subtotal_cents, 0) <= 0 then coalesce(total_cents, 0)
    else subtotal_cents
  end,
  discount_mode = case
    when discount_mode in ('NONE', 'AMOUNT', 'PERCENT') then discount_mode
    else 'NONE'
  end,
  discount_value = greatest(coalesce(discount_value, 0), 0),
  discount_cents = greatest(coalesce(discount_cents, 0), 0),
  service_type = case
    when service_type in ('ON_TABLE', 'RETIRADA', 'ENTREGA', 'CONSUMO_LOCAL') then service_type
    when origin = 'BALCAO' then 'RETIRADA'
    else 'ON_TABLE'
  end,
  delivery_address = case
    when delivery_address is null then null
    when jsonb_typeof(delivery_address) = 'object' then delivery_address - 'city'
    else delivery_address
  end,
  delivery_fee_cents = greatest(coalesce(delivery_fee_cents, 0), 0),
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

update public.products
set
  available_on_table = coalesce(available_on_table, true),
  available_on_delivery = coalesce(available_on_delivery, true);

update public.orders
set receipt_token_created_at = coalesce(receipt_token_created_at, timezone('utc'::text, now()))
where receipt_token is not null
  and receipt_token_created_at is null;

update public.orders
set
  receipt_token = encode(
    extensions.digest(
      coalesce(id::text, '') || '-' ||
      coalesce(created_at::text, '') || '-' ||
      gen_random_uuid()::text || '-' ||
      random()::text || '-' ||
      clock_timestamp()::text,
      'sha256'
    ),
    'hex'
  ),
  receipt_token_created_at = coalesce(receipt_token_created_at, timezone('utc'::text, now()))
where service_type in ('ENTREGA', 'RETIRADA')
  and (receipt_token is null or btrim(receipt_token) = '');

update public.order_items
set
  original_unit_price_cents = greatest(
    coalesce(original_unit_price_cents, unit_price_cents, 0),
    0
  ),
  promo_discount_type = case
    when promo_discount_type in ('AMOUNT', 'PERCENT') then promo_discount_type
    else null
  end,
  promo_discount_value = greatest(coalesce(promo_discount_value, 0), 0),
  promo_discount_cents = greatest(coalesce(promo_discount_cents, 0), 0);

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

-- Endurecimento incremental de RLS para areas administrativas/sensiveis.
-- Mantem fluxo publico de cliente (mesa, pedidos, carrinho) sem quebra.
create or replace function public.current_profile_role(
  p_profile_id uuid default auth.uid()
)
returns text
language sql
security definer
stable
set search_path = public, auth
as $$
  select role
  from public.profiles
  where id = coalesce(p_profile_id, auth.uid())
  limit 1;
$$;

create or replace function public.is_profile_in_roles(
  p_roles text[],
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    public.current_profile_role(coalesce(p_profile_id, auth.uid())) = any(p_roles),
    false
  );
$$;

create or replace function public.log_staff_action(
  p_action_type text,
  p_session_id uuid default null,
  p_table_id uuid default null,
  p_order_ids uuid[] default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_name text;
begin
  v_actor_profile_id := auth.uid();
  if v_actor_profile_id is null then
    return;
  end if;

  select role, name
    into v_actor_role, v_actor_name
  from public.profiles
  where id = v_actor_profile_id
  limit 1;

  if coalesce(v_actor_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    return;
  end if;

  insert into public.staff_action_audit (
    action_type,
    actor_profile_id,
    actor_role,
    actor_name,
    session_id,
    table_id,
    order_ids,
    payload
  )
  values (
    coalesce(nullif(trim(coalesce(p_action_type, '')), ''), 'UNKNOWN'),
    v_actor_profile_id,
    v_actor_role,
    nullif(trim(coalesce(v_actor_name, '')), ''),
    p_session_id,
    p_table_id,
    p_order_ids,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.audit_admin_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_name text;
begin
  v_actor_profile_id := auth.uid();
  if v_actor_profile_id is null then
    return coalesce(new, old);
  end if;

  select role, name
    into v_actor_role, v_actor_name
  from public.profiles
  where id = v_actor_profile_id
  limit 1;

  if coalesce(v_actor_role, '') not in ('ADMIN', 'MANAGER') then
    return coalesce(new, old);
  end if;

  insert into public.staff_action_audit (
    action_type,
    actor_profile_id,
    actor_role,
    actor_name,
    payload
  )
  values (
    'ADMIN_TABLE_MUTATION',
    v_actor_profile_id,
    v_actor_role,
    nullif(trim(coalesce(v_actor_name, '')), ''),
    jsonb_build_object(
      'table', tg_table_name,
      'operation', tg_op,
      'new', case when tg_op <> 'DELETE' then to_jsonb(new) else null end,
      'old', case when tg_op <> 'INSERT' then to_jsonb(old) else null end
    )
  );

  return coalesce(new, old);
end;
$$;

-- SETTINGS: leitura publica, escrita apenas ADMIN.
drop policy if exists settings_select_public on public.settings;
drop policy if exists settings_insert_admin on public.settings;
drop policy if exists settings_update_admin on public.settings;
drop policy if exists settings_delete_admin on public.settings;
drop policy if exists rls_public_select on public.settings;
drop policy if exists rls_public_insert on public.settings;
drop policy if exists rls_public_update on public.settings;
drop policy if exists rls_public_delete on public.settings;

create policy settings_select_public
on public.settings
for select
to public
using (true);

create policy settings_insert_admin
on public.settings
for insert
to authenticated
with check (public.is_profile_in_roles(array['ADMIN']::text[]));

create policy settings_update_admin
on public.settings
for update
to authenticated
using (public.is_profile_in_roles(array['ADMIN']::text[]))
with check (public.is_profile_in_roles(array['ADMIN']::text[]));

create policy settings_delete_admin
on public.settings
for delete
to authenticated
using (public.is_profile_in_roles(array['ADMIN']::text[]));

-- CARDAPIO/PROMOCOES: leitura publica, escrita para ADMIN e MANAGER.
drop policy if exists menu_select_public_categories on public.categories;
drop policy if exists menu_write_staff_categories on public.categories;
drop policy if exists rls_public_select on public.categories;
drop policy if exists rls_public_insert on public.categories;
drop policy if exists rls_public_update on public.categories;
drop policy if exists rls_public_delete on public.categories;

create policy menu_select_public_categories
on public.categories
for select
to public
using (true);

create policy menu_write_staff_categories
on public.categories
for all
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]))
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

drop policy if exists menu_select_public_products on public.products;
drop policy if exists menu_write_staff_products on public.products;
drop policy if exists rls_public_select on public.products;
drop policy if exists rls_public_insert on public.products;
drop policy if exists rls_public_update on public.products;
drop policy if exists rls_public_delete on public.products;

create policy menu_select_public_products
on public.products
for select
to public
using (true);

create policy menu_write_staff_products
on public.products
for all
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]))
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

drop policy if exists menu_select_public_product_addons on public.product_addons;
drop policy if exists menu_write_staff_product_addons on public.product_addons;
drop policy if exists rls_public_select on public.product_addons;
drop policy if exists rls_public_insert on public.product_addons;
drop policy if exists rls_public_update on public.product_addons;
drop policy if exists rls_public_delete on public.product_addons;

create policy menu_select_public_product_addons
on public.product_addons
for select
to public
using (true);

create policy menu_write_staff_product_addons
on public.product_addons
for all
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]))
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

drop policy if exists promotions_select_public on public.promotions;
drop policy if exists promotions_write_staff on public.promotions;
drop policy if exists rls_public_select on public.promotions;
drop policy if exists rls_public_insert on public.promotions;
drop policy if exists rls_public_update on public.promotions;
drop policy if exists rls_public_delete on public.promotions;

create policy promotions_select_public
on public.promotions
for select
to public
using (true);

create policy promotions_write_staff
on public.promotions
for all
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]))
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

drop policy if exists promotions_products_select_public on public.promotion_products;
drop policy if exists promotions_products_write_staff on public.promotion_products;
drop policy if exists rls_public_select on public.promotion_products;
drop policy if exists rls_public_insert on public.promotion_products;
drop policy if exists rls_public_update on public.promotion_products;
drop policy if exists rls_public_delete on public.promotion_products;

create policy promotions_products_select_public
on public.promotion_products
for select
to public
using (true);

create policy promotions_products_write_staff
on public.promotion_products
for all
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]))
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

-- AUDITORIAS: sem acesso publico; leitura para staff autorizado.
drop policy if exists staff_password_audit_read_admin on public.staff_password_audit;
drop policy if exists staff_password_audit_write_admin on public.staff_password_audit;
drop policy if exists rls_public_select on public.staff_password_audit;
drop policy if exists rls_public_insert on public.staff_password_audit;
drop policy if exists rls_public_update on public.staff_password_audit;
drop policy if exists rls_public_delete on public.staff_password_audit;

create policy staff_password_audit_read_admin
on public.staff_password_audit
for select
to authenticated
using (public.is_profile_in_roles(array['ADMIN']::text[]));

create policy staff_password_audit_write_admin
on public.staff_password_audit
for insert
to authenticated
with check (public.is_profile_in_roles(array['ADMIN']::text[]));

drop policy if exists order_cancellation_audit_read_staff on public.order_cancellation_audit;
drop policy if exists order_cancellation_audit_write_staff on public.order_cancellation_audit;
drop policy if exists rls_public_select on public.order_cancellation_audit;
drop policy if exists rls_public_insert on public.order_cancellation_audit;
drop policy if exists rls_public_update on public.order_cancellation_audit;
drop policy if exists rls_public_delete on public.order_cancellation_audit;

create policy order_cancellation_audit_read_staff
on public.order_cancellation_audit
for select
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

create policy order_cancellation_audit_write_staff
on public.order_cancellation_audit
for insert
to authenticated
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

drop policy if exists staff_action_audit_read_staff on public.staff_action_audit;
drop policy if exists staff_action_audit_write_staff on public.staff_action_audit;
drop policy if exists rls_public_select on public.staff_action_audit;
drop policy if exists rls_public_insert on public.staff_action_audit;
drop policy if exists rls_public_update on public.staff_action_audit;
drop policy if exists rls_public_delete on public.staff_action_audit;

create policy staff_action_audit_read_staff
on public.staff_action_audit
for select
to authenticated
using (public.is_profile_in_roles(array['ADMIN', 'MANAGER']::text[]));

create policy staff_action_audit_write_staff
on public.staff_action_audit
for insert
to authenticated
with check (public.is_profile_in_roles(array['ADMIN', 'MANAGER', 'WAITER']::text[]));

drop trigger if exists trg_audit_settings_mutation on public.settings;
create trigger trg_audit_settings_mutation
after insert or update or delete on public.settings
for each row execute function public.audit_admin_table_changes();

drop trigger if exists trg_audit_categories_mutation on public.categories;
create trigger trg_audit_categories_mutation
after insert or update or delete on public.categories
for each row execute function public.audit_admin_table_changes();

drop trigger if exists trg_audit_products_mutation on public.products;
create trigger trg_audit_products_mutation
after insert or update or delete on public.products
for each row execute function public.audit_admin_table_changes();

drop trigger if exists trg_audit_product_addons_mutation on public.product_addons;
create trigger trg_audit_product_addons_mutation
after insert or update or delete on public.product_addons
for each row execute function public.audit_admin_table_changes();

drop trigger if exists trg_audit_promotions_mutation on public.promotions;
create trigger trg_audit_promotions_mutation
after insert or update or delete on public.promotions
for each row execute function public.audit_admin_table_changes();

drop trigger if exists trg_audit_promotion_products_mutation on public.promotion_products;
create trigger trg_audit_promotion_products_mutation
after insert or update or delete on public.promotion_products
for each row execute function public.audit_admin_table_changes();

-- Garante que as tabelas criticas estejam na publicacao realtime do Supabase.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.sessions';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.orders';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.order_items';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.cart_items';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
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
set search_path = public, extensions
as $$
declare
  v_role text;
  v_table_id uuid;
  v_session_id uuid;
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

  v_table_name := 'Garcom';
  v_token := 'waiter-virtual-' || replace(gen_random_uuid()::text, '-', '');

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

-- Padroniza nome legado de mesa virtual (MV-...) para Garcom.
update public.tables
set name = 'Garcom'
where token like 'waiter-virtual-%'
  and (
    upper(coalesce(name, '')) like 'MV-%'
    or upper(coalesce(name, '')) like 'GARCOM%'
  );

create or replace function public.admin_set_user_password(
  p_actor_profile_id uuid,
  p_actor_name text,
  p_target_profile_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
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

  perform public.log_staff_action(
    'PASSWORD_CHANGED',
    null,
    null,
    null,
    jsonb_build_object('target_profile_id', p_target_profile_id)
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

create or replace function public.create_store_feedback(
  p_stars integer,
  p_comment text default null,
  p_customer_name text default null,
  p_table_id uuid default null,
  p_session_id uuid default null,
  p_order_id uuid default null,
  p_device_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feedback_id uuid;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'nota invalida: use de 1 a 5 estrelas';
  end if;

  if nullif(trim(coalesce(p_device_token, '')), '') is not null then
    perform 1
    from public.store_feedback
    where device_token = trim(p_device_token)
      and created_at >= timezone('utc'::text, now()) - interval '3 minutes'
    limit 1;

    if found then
      raise exception 'aguarde alguns minutos antes de enviar nova avaliacao';
    end if;
  end if;

  insert into public.store_feedback (
    store_id,
    stars,
    comment,
    customer_name,
    source,
    table_id,
    session_id,
    order_id,
    device_token
  )
  values (
    1,
    p_stars,
    nullif(trim(coalesce(p_comment, '')), ''),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    'cardapio_digital',
    p_table_id,
    p_session_id,
    p_order_id,
    nullif(trim(coalesce(p_device_token, '')), '')
  )
  returning id into v_feedback_id;

  return v_feedback_id;
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
      coalesce(nullif(trim(coalesce(i.added_by_name, '')), ''), nullif(trim(coalesce(p_guest_name, '')), ''), 'Cliente') as added_by_name,
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

create or replace function public.ensure_order_receipt_token(
  p_order_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_service_type text;
  v_token text;
  v_candidate text;
begin
  if p_order_id is null then
    return null;
  end if;

  select service_type, receipt_token
    into v_service_type, v_token
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'pedido nao encontrado para gerar receipt_token';
  end if;

  if nullif(btrim(coalesce(v_token, '')), '') is not null then
    return v_token;
  end if;

  if v_service_type not in ('ENTREGA', 'RETIRADA') then
    return null;
  end if;

  loop
    v_candidate := encode(
      extensions.digest(
        p_order_id::text || '-' ||
        gen_random_uuid()::text || '-' ||
        clock_timestamp()::text || '-' ||
        random()::text,
        'sha256'
      ),
      'hex'
    );

    begin
      update public.orders
      set
        receipt_token = v_candidate,
        receipt_token_created_at = coalesce(receipt_token_created_at, timezone('utc'::text, now()))
      where id = p_order_id
        and (receipt_token is null or btrim(receipt_token) = '')
      returning receipt_token into v_token;

      if nullif(btrim(coalesce(v_token, '')), '') is not null then
        return v_token;
      end if;

      select receipt_token
        into v_token
      from public.orders
      where id = p_order_id
      limit 1;

      if nullif(btrim(coalesce(v_token, '')), '') is not null then
        return v_token;
      end if;
    exception
      when unique_violation then
        -- Gera novo token e tenta novamente.
        null;
    end;
  end loop;
end;
$$;

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

-- Remove assinatura legada para evitar ambiguidade no PostgREST RPC.
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

create or replace function public.cancel_order_as_staff(
  p_actor_profile_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid;
  v_actor_role text;
  v_actor_name text;
  v_prev_status text;
  v_prev_approval_status text;
  v_session_id uuid;
  v_table_id uuid;
begin
  if p_actor_profile_id is null then
    raise exception 'p_actor_profile_id e obrigatorio';
  end if;
  if p_order_id is null then
    raise exception 'p_order_id e obrigatorio';
  end if;

  v_auth_uid := auth.uid();
  if v_auth_uid is null or v_auth_uid <> p_actor_profile_id then
    raise exception 'usuario autenticado invalido para cancelar pedido';
  end if;

  select role, name
    into v_actor_role, v_actor_name
  from public.profiles
  where id = p_actor_profile_id
  limit 1;

  if coalesce(v_actor_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'permissao insuficiente para cancelar pedido';
  end if;

  select status, approval_status, session_id, table_id
    into v_prev_status, v_prev_approval_status, v_session_id, v_table_id
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'pedido nao encontrado';
  end if;

  if v_prev_status not in ('PENDING', 'PREPARING', 'READY') then
    return jsonb_build_object(
      'updated', false,
      'order_id', p_order_id,
      'previous_status', v_prev_status,
      'previous_approval_status', v_prev_approval_status
    );
  end if;

  update public.orders
    set status = 'CANCELLED',
        approval_status = 'REJECTED'
  where id = p_order_id;

  insert into public.order_cancellation_audit (
    action_scope,
    batch_id,
    order_id,
    session_id,
    table_id,
    actor_profile_id,
    actor_role,
    actor_name,
    previous_status,
    previous_approval_status
  )
  values (
    'SINGLE',
    null,
    p_order_id,
    v_session_id,
    v_table_id,
    p_actor_profile_id,
    v_actor_role,
    nullif(trim(coalesce(v_actor_name, '')), ''),
    v_prev_status,
    v_prev_approval_status
  );

  perform public.log_staff_action(
    'ORDER_CANCELLED_SINGLE',
    v_session_id,
    v_table_id,
    array[p_order_id],
    jsonb_build_object(
      'previous_status', v_prev_status,
      'previous_approval_status', v_prev_approval_status
    )
  );

  return jsonb_build_object(
    'updated', true,
    'order_id', p_order_id,
    'previous_status', v_prev_status,
    'previous_approval_status', v_prev_approval_status,
    'current_status', 'CANCELLED',
    'current_approval_status', 'REJECTED'
  );
end;
$$;

create or replace function public.cancel_orders_bulk_as_staff(
  p_actor_profile_id uuid,
  p_order_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid;
  v_actor_role text;
  v_actor_name text;
  v_batch_id uuid := gen_random_uuid();
  v_requested_ids uuid[];
  v_requested_count integer := 0;
  v_updated_count integer := 0;
  v_skipped_count integer := 0;
  v_updated_order_ids uuid[] := '{}'::uuid[];
begin
  if p_actor_profile_id is null then
    raise exception 'p_actor_profile_id e obrigatorio';
  end if;

  v_auth_uid := auth.uid();
  if v_auth_uid is null or v_auth_uid <> p_actor_profile_id then
    raise exception 'usuario autenticado invalido para cancelamento em massa';
  end if;

  select role, name
    into v_actor_role, v_actor_name
  from public.profiles
  where id = p_actor_profile_id
  limit 1;

  if coalesce(v_actor_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'permissao insuficiente para cancelamento em massa';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object(
      'batch_id', null,
      'requested_count', 0,
      'updated_count', 0,
      'skipped_count', 0,
      'updated_order_ids', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_requested_ids
  from (
    select distinct unnest(p_order_ids) as id
  ) dedup
  where id is not null;

  v_requested_count := coalesce(array_length(v_requested_ids, 1), 0);
  if v_requested_count = 0 then
    return jsonb_build_object(
      'batch_id', null,
      'requested_count', 0,
      'updated_count', 0,
      'skipped_count', 0,
      'updated_order_ids', '[]'::jsonb
    );
  end if;

  with target_orders as (
    select
      o.id,
      o.session_id,
      o.table_id,
      o.status,
      o.approval_status
    from public.orders o
    where o.id = any(v_requested_ids)
    for update
  ),
  cancellable as (
    select *
    from target_orders
    where status in ('PENDING', 'PREPARING', 'READY')
  ),
  updated as (
    update public.orders o
      set status = 'CANCELLED',
          approval_status = 'REJECTED'
    from cancellable c
    where o.id = c.id
    returning o.id
  ),
  audit_rows as (
    insert into public.order_cancellation_audit (
      action_scope,
      batch_id,
      order_id,
      session_id,
      table_id,
      actor_profile_id,
      actor_role,
      actor_name,
      previous_status,
      previous_approval_status
    )
    select
      'BULK',
      v_batch_id,
      c.id,
      c.session_id,
      c.table_id,
      p_actor_profile_id,
      v_actor_role,
      nullif(trim(coalesce(v_actor_name, '')), ''),
      c.status,
      c.approval_status
    from cancellable c
    inner join updated u on u.id = c.id
    returning order_id
  )
  select
    coalesce(array_agg(a.order_id), '{}'::uuid[]),
    coalesce(count(*), 0)::integer
  into v_updated_order_ids, v_updated_count
  from audit_rows a;

  v_skipped_count := greatest(v_requested_count - v_updated_count, 0);

  if v_updated_count > 0 then
    perform public.log_staff_action(
      'ORDER_CANCELLED_BULK',
      null,
      null,
      v_updated_order_ids,
      jsonb_build_object(
        'batch_id', v_batch_id,
        'requested_count', v_requested_count,
        'updated_count', v_updated_count,
        'skipped_count', v_skipped_count
      )
    );
  end if;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'requested_count', v_requested_count,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count,
    'updated_order_ids', coalesce(to_jsonb(v_updated_order_ids), '[]'::jsonb)
  );
end;
$$;

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

alter table public.settings
  add column if not exists plan_name text not null default 'Basico',
  add column if not exists plan_price numeric not null default 19.90,
  add column if not exists plan_next_price numeric,
  add column if not exists plan_due_day integer not null default 15,
  add column if not exists plan_current_due_date date not null default (date_trunc('month', current_date)::date + 14),
  add column if not exists plan_status text not null default 'PAID',
  add column if not exists plan_paid_at timestamp with time zone,
  add column if not exists plan_last_checked_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_status_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_status_check
      check (plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_due_day_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_due_day_check
      check (plan_due_day between 1 and 28);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_price_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_price_check
      check (plan_price >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_next_price_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_next_price_check
      check (plan_next_price is null or plan_next_price >= 0);
  end if;
end $$;

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

update public.settings
set
  plan_name = coalesce(nullif(trim(coalesce(plan_name, '')), ''), 'Basico'),
  plan_price = greatest(coalesce(plan_price, 19.90), 0),
  plan_next_price = case
    when plan_next_price is null then null
    else greatest(plan_next_price, 0)
  end,
  plan_due_day = least(greatest(coalesce(plan_due_day, 15), 1), 28),
  plan_status = case
    when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
    else 'PAID'
  end,
  plan_current_due_date = coalesce(
    plan_current_due_date,
    date_trunc('month', current_date)::date + (least(greatest(coalesce(plan_due_day, 15), 1), 28) - 1)
  ),
  updated_at = coalesce(updated_at, timezone('utc'::text, now()))
where id = 1;

create table if not exists public.plan_payment_history (
  id uuid default gen_random_uuid() primary key,
  settings_id integer not null default 1,
  actor_username text not null,
  paid_amount numeric not null default 0,
  previous_status text not null,
  previous_due_date date,
  new_due_date date not null,
  confirmed_at timestamp with time zone not null default timezone('utc'::text, now()),
  payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_plan_payment_history_confirmed_at
  on public.plan_payment_history(confirmed_at desc);
create index if not exists idx_plan_payment_history_settings_id
  on public.plan_payment_history(settings_id);

create or replace function public.is_plan_access_valid(
  p_username text,
  p_password text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    lower(trim(coalesce(p_username, ''))) = 'uaitech'
    and coalesce(p_password, '') = '102192';
$$;

create or replace function public.get_plan_payment_dashboard(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_days_to_due integer := null;
  v_is_overdue boolean := false;
  v_is_due_soon boolean := false;
  v_amount_pending numeric := 0;
  v_pending jsonb := '[]'::jsonb;
  v_due_soon jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  insert into public.settings (id)
  values (1)
  on conflict (id) do nothing;

  select
    id,
    coalesce(nullif(trim(coalesce(plan_name, '')), ''), 'Basico') as plan_name,
    greatest(coalesce(plan_price, 19.90), 0) as plan_price,
    case
      when plan_next_price is null then null
      else greatest(plan_next_price, 0)
    end as plan_next_price,
    least(greatest(coalesce(plan_due_day, 15), 1), 28) as plan_due_day,
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end as plan_status,
    plan_current_due_date,
    plan_paid_at
    into v_settings
  from public.settings
  where id = 1
  limit 1;

  if v_settings.plan_current_due_date is not null then
    v_days_to_due := (v_settings.plan_current_due_date - current_date);
  end if;

  v_is_overdue := coalesce(v_settings.plan_status, 'PAID') in ('OVERDUE', 'SUSPENDED')
                  or coalesce(v_days_to_due, 0) < 0;
  v_is_due_soon := coalesce(v_days_to_due, 9999) between 0 and 7;

  if coalesce(v_settings.plan_status, 'PAID') in ('OPEN', 'OVERDUE', 'SUSPENDED') then
    v_amount_pending := greatest(coalesce(v_settings.plan_price, 0), 0);
  end if;

  if v_amount_pending > 0 then
    v_pending := jsonb_build_array(
      jsonb_build_object(
        'title', 'Mensalidade pendente',
        'due_date', v_settings.plan_current_due_date,
        'status', v_settings.plan_status,
        'amount', v_amount_pending,
        'days_to_due', v_days_to_due
      )
    );
  end if;

  if v_is_due_soon then
    v_due_soon := jsonb_build_array(
      jsonb_build_object(
        'title', 'Vencimento proximo',
        'due_date', v_settings.plan_current_due_date,
        'status', v_settings.plan_status,
        'amount', greatest(coalesce(v_settings.plan_price, 0), 0),
        'days_to_due', v_days_to_due
      )
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'confirmed_at', h.confirmed_at,
        'actor_username', h.actor_username,
        'paid_amount', h.paid_amount,
        'previous_status', h.previous_status,
        'previous_due_date', h.previous_due_date,
        'new_due_date', h.new_due_date,
        'payload', h.payload
      )
      order by h.confirmed_at desc
    ),
    '[]'::jsonb
  )
    into v_history
  from (
    select *
    from public.plan_payment_history
    where settings_id = 1
    order by confirmed_at desc
    limit 200
  ) h;

  return jsonb_build_object(
    'success', true,
    'message', 'Acesso liberado.',
    'snapshot', jsonb_build_object(
      'plan_name', v_settings.plan_name,
      'plan_price', v_settings.plan_price,
      'next_plan_price', v_settings.plan_next_price,
      'plan_due_day', v_settings.plan_due_day,
      'plan_status', v_settings.plan_status,
      'current_due_date', v_settings.plan_current_due_date,
      'plan_paid_at', v_settings.plan_paid_at,
      'days_to_due', v_days_to_due,
      'amount_pending', v_amount_pending,
      'is_overdue', v_is_overdue,
      'is_due_soon', v_is_due_soon
    ),
    'pending_items', v_pending,
    'due_soon_items', v_due_soon,
    'history', v_history
  );
end;
$$;

create or replace function public.confirm_plan_payment(
  p_username text,
  p_password text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings_id integer := 1;
  v_current_due_date date;
  v_new_due_date date;
  v_due_day integer := 15;
  v_previous_status text := 'PAID';
  v_plan_price numeric := 0;
  v_next_plan_price numeric := null;
  v_actor_username text;
  v_history_id uuid;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object('success', false, 'message', 'Usuario ou senha incorretos.');
  end if;

  v_actor_username := lower(trim(coalesce(p_username, '')));

  insert into public.settings (id)
  values (v_settings_id)
  on conflict (id) do nothing;

  select
    plan_current_due_date,
    least(greatest(coalesce(plan_due_day, 15), 1), 28),
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end,
    greatest(coalesce(plan_price, 0), 0),
    case
      when plan_next_price is null then null
      else greatest(plan_next_price, 0)
    end
    into v_current_due_date, v_due_day, v_previous_status, v_plan_price, v_next_plan_price
  from public.settings
  where id = v_settings_id
  for update;

  v_new_due_date := date_trunc(
    'month',
    greatest(coalesce(v_current_due_date, current_date), current_date)::timestamp + interval '1 month'
  )::date + (v_due_day - 1);

  if v_new_due_date <= current_date then
    v_new_due_date := date_trunc('month', current_date::timestamp + interval '1 month')::date + (v_due_day - 1);
  end if;

  update public.settings
  set
    plan_status = 'PAID',
    plan_paid_at = timezone('utc'::text, now()),
    plan_current_due_date = v_new_due_date,
    plan_price = coalesce(v_next_plan_price, plan_price),
    plan_next_price = case
      when v_next_plan_price is null then plan_next_price
      else null
    end,
    updated_at = timezone('utc'::text, now())
  where id = v_settings_id;

  insert into public.plan_payment_history (
    settings_id,
    actor_username,
    paid_amount,
    previous_status,
    previous_due_date,
    new_due_date,
    payload
  )
  values (
    v_settings_id,
    v_actor_username,
    v_plan_price,
    v_previous_status,
    v_current_due_date,
    v_new_due_date,
    jsonb_build_object(
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'confirmed_by', v_actor_username,
      'applied_next_price', v_next_plan_price
    )
  )
  returning id into v_history_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Pagamento confirmado com sucesso!',
    'new_due_date', v_new_due_date,
    'history_id', v_history_id
  );
end;
$$;

create or replace function public.set_plan_next_price(
  p_username text,
  p_password text,
  p_next_price numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings_id integer := 1;
  v_actor_username text;
  v_previous_due_date date;
  v_previous_status text;
  v_previous_next_price numeric := null;
  v_next_price numeric := 0;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  if p_next_price is null or p_next_price < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Valor invalido. Informe um numero maior ou igual a zero.'
    );
  end if;

  v_actor_username := lower(trim(coalesce(p_username, '')));
  v_next_price := round(greatest(coalesce(p_next_price, 0), 0)::numeric, 2);

  insert into public.settings (id)
  values (v_settings_id)
  on conflict (id) do nothing;

  select
    plan_current_due_date,
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end,
    case
      when plan_next_price is null then null
      else greatest(plan_next_price, 0)
    end
    into v_previous_due_date, v_previous_status, v_previous_next_price
  from public.settings
  where id = v_settings_id
  for update;

  update public.settings
  set
    plan_next_price = v_next_price,
    updated_at = timezone('utc'::text, now())
  where id = v_settings_id;

  insert into public.plan_payment_history (
    settings_id,
    actor_username,
    paid_amount,
    previous_status,
    previous_due_date,
    new_due_date,
    payload
  )
  values (
    v_settings_id,
    v_actor_username,
    0,
    coalesce(v_previous_status, 'PAID'),
    v_previous_due_date,
    coalesce(v_previous_due_date, current_date),
    jsonb_build_object(
      'action', 'SET_NEXT_PRICE',
      'previous_next_price', v_previous_next_price,
      'new_next_price', v_next_price,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Valor do proximo mes atualizado.',
    'next_plan_price', v_next_price
  );
end;
$$;

create or replace function public.set_plan_management_state(
  p_username text,
  p_password text,
  p_new_due_date date default null,
  p_new_status text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings_id integer := 1;
  v_actor_username text;
  v_previous_due_date date;
  v_previous_status text;
  v_next_due_date date;
  v_next_status text;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  v_actor_username := lower(trim(coalesce(p_username, '')));

  insert into public.settings (id)
  values (v_settings_id)
  on conflict (id) do nothing;

  select
    plan_current_due_date,
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end
    into v_previous_due_date, v_previous_status
  from public.settings
  where id = v_settings_id
  for update;

  v_next_due_date := coalesce(p_new_due_date, v_previous_due_date, current_date);

  if p_new_status is null or btrim(p_new_status) = '' then
    v_next_status := v_previous_status;
  else
    v_next_status := upper(trim(p_new_status));
    if v_next_status not in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then
      return jsonb_build_object(
        'success', false,
        'message', 'Status invalido. Use: PAID, OPEN, OVERDUE ou SUSPENDED.'
      );
    end if;
  end if;

  update public.settings
  set
    plan_current_due_date = v_next_due_date,
    plan_status = v_next_status,
    plan_paid_at = case
      when v_next_status = 'PAID' then coalesce(plan_paid_at, timezone('utc'::text, now()))
      else plan_paid_at
    end,
    updated_at = timezone('utc'::text, now())
  where id = v_settings_id;

  insert into public.plan_payment_history (
    settings_id,
    actor_username,
    paid_amount,
    previous_status,
    previous_due_date,
    new_due_date,
    payload
  )
  values (
    v_settings_id,
    v_actor_username,
    0,
    coalesce(v_previous_status, 'PAID'),
    v_previous_due_date,
    v_next_due_date,
    jsonb_build_object(
      'action', 'MANUAL_PLAN_UPDATE',
      'new_status', v_next_status,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Ajustes aplicados com sucesso.',
    'current_due_date', v_next_due_date,
    'plan_status', v_next_status
  );
end;
$$;

create or replace function public.confirm_plan_payment(
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.confirm_plan_payment('uaitech', p_password, null);
end;
$$;

create or replace function public.get_performance_dashboard(
  p_actor_profile_id uuid,
  p_period text default 'WEEK',
  p_from date default null,
  p_to date default null,
  p_order_type text default 'ALL',
  p_order_status text default 'ALL',
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid;
  v_actor_role text;
  v_timezone text;
  v_period text;
  v_order_type text;
  v_order_status text;
  v_today date;
  v_dow integer;
  v_from date;
  v_to date;
  v_period_days integer := 1;
  v_prev_from date;
  v_prev_to date;
  v_from_utc timestamp with time zone;
  v_to_exclusive_utc timestamp with time zone;
  v_prev_from_utc timestamp with time zone;
  v_prev_to_exclusive_utc timestamp with time zone;
  v_tmp date;
  v_total_orders integer := 0;
  v_cancelled_orders integer := 0;
  v_revenue_orders integer := 0;
  v_revenue_cents bigint := 0;
  v_prev_total_orders integer := 0;
  v_prev_cancelled_orders integer := 0;
  v_prev_revenue_orders integer := 0;
  v_prev_revenue_cents bigint := 0;
  v_prev_average_ticket_cents bigint := 0;
  v_delta_orders_pct numeric := 0;
  v_delta_revenue_pct numeric := 0;
  v_series jsonb := '[]'::jsonb;
  v_distribution jsonb := '[]'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
  v_ticket_by_type jsonb := '[]'::jsonb;
begin
  if p_actor_profile_id is null then
    raise exception 'p_actor_profile_id e obrigatorio';
  end if;

  v_auth_uid := auth.uid();
  if v_auth_uid is null or v_auth_uid <> p_actor_profile_id then
    raise exception 'usuario autenticado invalido para consultar desempenho';
  end if;

  select role
    into v_actor_role
  from public.profiles
  where id = p_actor_profile_id
  limit 1;

  if coalesce(v_actor_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'permissao insuficiente para consultar desempenho';
  end if;

  v_timezone := nullif(trim(coalesce(p_timezone, '')), '');
  if v_timezone is null then
    v_timezone := 'UTC';
  end if;
  if not exists (
    select 1
    from pg_timezone_names
    where name = v_timezone
  ) then
    v_timezone := 'UTC';
  end if;

  v_period := upper(coalesce(p_period, 'DAY'));
  if v_period not in ('DAY', 'WEEK', 'MONTH', 'CUSTOM') then
    v_period := 'DAY';
  end if;

  v_order_type := upper(coalesce(p_order_type, 'ALL'));
  if v_order_type not in ('ALL', 'MESA', 'ENTREGA', 'RETIRADA') then
    v_order_type := 'ALL';
  end if;

  v_order_status := upper(coalesce(p_order_status, 'ALL'));
  if v_order_status not in ('ALL', 'PENDING', 'PREPARING', 'READY', 'FINISHED', 'CANCELLED') then
    v_order_status := 'ALL';
  end if;

  v_today := timezone(v_timezone, now())::date;
  if v_period = 'CUSTOM' then
    v_from := coalesce(p_from, v_today);
    v_to := coalesce(p_to, v_today);
  elsif v_period = 'DAY' then
    v_from := v_today;
    v_to := v_today;
  elsif v_period = 'MONTH' then
    v_from := date_trunc('month', v_today::timestamp)::date;
    v_to := (date_trunc('month', v_today::timestamp) + interval '1 month - 1 day')::date;
  else
    -- Semana atual com inicio no domingo (0), conforme decisoes do produto.
    v_dow := extract(dow from v_today)::integer;
    v_from := v_today - v_dow;
    v_to := v_from + 6;
  end if;

  if v_from > v_to then
    v_tmp := v_from;
    v_from := v_to;
    v_to := v_tmp;
  end if;

  v_period_days := greatest((v_to - v_from) + 1, 1);
  v_prev_to := v_from - 1;
  v_prev_from := v_prev_to - (v_period_days - 1);

  -- Converte intervalos locais para UTC para permitir uso do indice em created_at.
  v_from_utc := (v_from::timestamp at time zone v_timezone);
  v_to_exclusive_utc := ((v_to + 1)::timestamp at time zone v_timezone);
  v_prev_from_utc := (v_prev_from::timestamp at time zone v_timezone);
  v_prev_to_exclusive_utc := ((v_prev_to + 1)::timestamp at time zone v_timezone);

  with filtered_orders as (
    select
      o.id,
      o.status,
      o.approval_status,
      greatest(coalesce(o.total_cents, 0), 0)::bigint as total_cents,
      timezone(v_timezone, o.created_at)::date as local_date,
      case
        when coalesce(o.service_type, 'ON_TABLE') = 'ENTREGA' then 'ENTREGA'
        when coalesce(o.service_type, 'ON_TABLE') = 'RETIRADA' then 'RETIRADA'
        else 'MESA'
      end as order_type
    from public.orders o
    where o.created_at >= v_from_utc
      and o.created_at < v_to_exclusive_utc
      and (
        v_order_type = 'ALL'
        or (v_order_type = 'MESA' and coalesce(o.service_type, 'ON_TABLE') = 'ON_TABLE')
        or (v_order_type = 'ENTREGA' and coalesce(o.service_type, 'ON_TABLE') = 'ENTREGA')
        or (v_order_type = 'RETIRADA' and coalesce(o.service_type, 'ON_TABLE') = 'RETIRADA')
      )
      and (
        v_order_status = 'ALL'
        or o.status = v_order_status
      )
  ),
  previous_filtered_orders as (
    select
      o.id,
      o.status,
      o.approval_status,
      greatest(coalesce(o.total_cents, 0), 0)::bigint as total_cents
    from public.orders o
    where o.created_at >= v_prev_from_utc
      and o.created_at < v_prev_to_exclusive_utc
      and (
        v_order_type = 'ALL'
        or (v_order_type = 'MESA' and coalesce(o.service_type, 'ON_TABLE') = 'ON_TABLE')
        or (v_order_type = 'ENTREGA' and coalesce(o.service_type, 'ON_TABLE') = 'ENTREGA')
        or (v_order_type = 'RETIRADA' and coalesce(o.service_type, 'ON_TABLE') = 'RETIRADA')
      )
      and (
        v_order_status = 'ALL'
        or o.status = v_order_status
      )
  ),
  kpis as (
    select
      count(*)::integer as total_orders,
      count(*) filter (where status = 'CANCELLED')::integer as cancelled_orders,
      count(*) filter (where approval_status = 'APPROVED' and status <> 'CANCELLED')::integer as revenue_orders,
      coalesce(sum(total_cents) filter (where approval_status = 'APPROVED' and status <> 'CANCELLED'), 0)::bigint as revenue_cents
    from filtered_orders
  ),
  previous_kpis as (
    select
      count(*)::integer as total_orders,
      count(*) filter (where status = 'CANCELLED')::integer as cancelled_orders,
      count(*) filter (where approval_status = 'APPROVED' and status <> 'CANCELLED')::integer as revenue_orders,
      coalesce(sum(total_cents) filter (where approval_status = 'APPROVED' and status <> 'CANCELLED'), 0)::bigint as revenue_cents
    from previous_filtered_orders
  ),
  days as (
    select generate_series(v_from::timestamp, v_to::timestamp, interval '1 day')::date as day
  ),
  series as (
    select
      d.day,
      coalesce(count(f.id), 0)::integer as orders,
      coalesce(sum(
        case
          when f.approval_status = 'APPROVED' and f.status <> 'CANCELLED' then f.total_cents
          else 0
        end
      ), 0)::bigint as revenue_cents
    from days d
    left join filtered_orders f on f.local_date = d.day
    group by d.day
    order by d.day
  ),
  distribution as (
    select
      t.order_type,
      coalesce(count(f.id), 0)::integer as orders,
      coalesce(sum(
        case
          when f.approval_status = 'APPROVED' and f.status <> 'CANCELLED' then f.total_cents
          else 0
        end
      ), 0)::bigint as revenue_cents
    from (values ('MESA'), ('ENTREGA'), ('RETIRADA')) as t(order_type)
    left join filtered_orders f on f.order_type = t.order_type
    group by t.order_type
  ),
  ticket_by_type as (
    select
      t.order_type,
      coalesce(count(f.id), 0)::integer as total_orders,
      coalesce(
        count(f.id) filter (where f.approval_status = 'APPROVED' and f.status <> 'CANCELLED'),
        0
      )::integer as revenue_orders,
      coalesce(
        sum(
          case
            when f.approval_status = 'APPROVED' and f.status <> 'CANCELLED' then f.total_cents
            else 0
          end
        ),
        0
      )::bigint as revenue_cents
    from (values ('MESA'), ('ENTREGA'), ('RETIRADA')) as t(order_type)
    left join filtered_orders f on f.order_type = t.order_type
    group by t.order_type
  ),
  top_products as (
    select
      coalesce(nullif(trim(oi.name_snapshot), ''), 'Item') as product_name,
      coalesce(sum(greatest(coalesce(oi.qty, 0), 0)), 0)::integer as qty,
      coalesce(
        sum(
          greatest(
            (
              greatest(coalesce(oi.qty, 0), 0) * greatest(coalesce(oi.unit_price_cents, 0), 0)
            ) - greatest(coalesce(oi.promo_discount_cents, 0), 0),
            0
          )
        ),
        0
      )::bigint as revenue_cents
    from filtered_orders f
    join public.order_items oi on oi.order_id = f.id
    where f.approval_status = 'APPROVED'
      and f.status <> 'CANCELLED'
    group by coalesce(nullif(trim(oi.name_snapshot), ''), 'Item')
    order by revenue_cents desc, qty desc, product_name asc
    limit 5
  )
  select
    k.total_orders,
    k.cancelled_orders,
    k.revenue_orders,
    k.revenue_cents,
    pk.total_orders,
    pk.cancelled_orders,
    pk.revenue_orders,
    pk.revenue_cents,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(s.day, 'YYYY-MM-DD'),
          'label', to_char(s.day, 'DD/MM'),
          'orders', s.orders,
          'revenue_cents', s.revenue_cents
        )
        order by s.day
      )
      from series s
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type', d.order_type,
          'label', case
            when d.order_type = 'MESA' then 'Mesa'
            when d.order_type = 'ENTREGA' then 'Entrega'
            when d.order_type = 'RETIRADA' then 'Retirada'
            else d.order_type
          end,
          'orders', d.orders,
          'revenue_cents', d.revenue_cents
        )
        order by case
          when d.order_type = 'MESA' then 1
          when d.order_type = 'ENTREGA' then 2
          when d.order_type = 'RETIRADA' then 3
          else 99
        end
      )
      from distribution d
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name_snapshot', tp.product_name,
          'qty', tp.qty,
          'revenue_cents', tp.revenue_cents
        )
        order by tp.revenue_cents desc, tp.qty desc, tp.product_name asc
      )
      from top_products tp
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type', tb.order_type,
          'label', case
            when tb.order_type = 'MESA' then 'Mesa'
            when tb.order_type = 'ENTREGA' then 'Entrega'
            when tb.order_type = 'RETIRADA' then 'Retirada'
            else tb.order_type
          end,
          'total_orders', tb.total_orders,
          'revenue_orders', tb.revenue_orders,
          'revenue_cents', tb.revenue_cents,
          'average_ticket_cents', case
            when tb.revenue_orders > 0 then round(tb.revenue_cents::numeric / tb.revenue_orders)::bigint
            else 0
          end
        )
        order by case
          when tb.order_type = 'MESA' then 1
          when tb.order_type = 'ENTREGA' then 2
          when tb.order_type = 'RETIRADA' then 3
          else 99
        end
      )
      from ticket_by_type tb
    ), '[]'::jsonb)
  into
    v_total_orders,
    v_cancelled_orders,
    v_revenue_orders,
    v_revenue_cents,
    v_prev_total_orders,
    v_prev_cancelled_orders,
    v_prev_revenue_orders,
    v_prev_revenue_cents,
    v_series,
    v_distribution,
    v_top_products,
    v_ticket_by_type
  from kpis k
  cross join previous_kpis pk;

  v_prev_average_ticket_cents := case
    when coalesce(v_prev_revenue_orders, 0) > 0 then round(v_prev_revenue_cents::numeric / v_prev_revenue_orders)::bigint
    else 0
  end;

  v_delta_orders_pct := case
    when coalesce(v_prev_total_orders, 0) > 0 then
      ((v_total_orders - v_prev_total_orders)::numeric * 100.0) / v_prev_total_orders
    when coalesce(v_total_orders, 0) > 0 then 100
    else 0
  end;

  v_delta_revenue_pct := case
    when coalesce(v_prev_revenue_cents, 0) > 0 then
      ((v_revenue_cents - v_prev_revenue_cents)::numeric * 100.0) / v_prev_revenue_cents
    when coalesce(v_revenue_cents, 0) > 0 then 100
    else 0
  end;

  return jsonb_build_object(
    'period', v_period,
    'timezone', v_timezone,
    'from', to_char(v_from, 'YYYY-MM-DD'),
    'to', to_char(v_to, 'YYYY-MM-DD'),
    'filters', jsonb_build_object(
      'order_type', v_order_type,
      'order_status', v_order_status
    ),
    'kpis', jsonb_build_object(
      'total_orders', coalesce(v_total_orders, 0),
      'total_revenue_cents', coalesce(v_revenue_cents, 0),
      'average_ticket_cents', case
        when coalesce(v_revenue_orders, 0) > 0 then round(v_revenue_cents::numeric / v_revenue_orders)::bigint
        else 0
      end,
      'cancelled_orders', coalesce(v_cancelled_orders, 0),
      'revenue_orders', coalesce(v_revenue_orders, 0)
    ),
    'comparison_previous', jsonb_build_object(
      'from', to_char(v_prev_from, 'YYYY-MM-DD'),
      'to', to_char(v_prev_to, 'YYYY-MM-DD'),
      'kpis', jsonb_build_object(
        'total_orders', coalesce(v_prev_total_orders, 0),
        'total_revenue_cents', coalesce(v_prev_revenue_cents, 0),
        'average_ticket_cents', coalesce(v_prev_average_ticket_cents, 0),
        'cancelled_orders', coalesce(v_prev_cancelled_orders, 0),
        'revenue_orders', coalesce(v_prev_revenue_orders, 0)
      ),
      'delta_orders_pct', round(coalesce(v_delta_orders_pct, 0), 2),
      'delta_revenue_pct', round(coalesce(v_delta_revenue_pct, 0), 2)
    ),
    'series_daily', coalesce(v_series, '[]'::jsonb),
    'distribution_by_type', coalesce(v_distribution, '[]'::jsonb),
    'top_products', coalesce(v_top_products, '[]'::jsonb),
    'ticket_by_type', coalesce(v_ticket_by_type, '[]'::jsonb)
  );
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

  perform public.log_staff_action(
    'KITCHEN_PRINT',
    p_session_id,
    (select table_id from public.sessions where id = p_session_id),
    p_order_ids,
    jsonb_build_object('printed_count', v_count)
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


-- Compatibilidade: garante store_name sem sobrescrever nome ja configurado.
alter table public.settings
  add column if not exists store_name text not null default 'Loja';
alter table public.settings
  add column if not exists enable_delivery_module boolean not null default false;
alter table public.products
  add column if not exists available_on_table boolean not null default true;
alter table public.products
  add column if not exists available_on_delivery boolean not null default true;

update public.settings
set
  store_name = coalesce(nullif(trim(coalesce(store_name, '')), ''), 'Loja'),
  enable_delivery_module = coalesce(enable_delivery_module, false)
where id = 1;

update public.products
set
  available_on_table = coalesce(available_on_table, true),
  available_on_delivery = coalesce(available_on_delivery, true);
