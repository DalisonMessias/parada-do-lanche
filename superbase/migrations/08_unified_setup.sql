-- Setup unificado do app (schema + ajustes de policies + recursos extras)
-- Execute este arquivo em ambiente novo para subir tudo de uma vez.
-- Em ambiente existente, tambem e seguro (idempotente na maior parte).

create extension if not exists "uuid-ossp";

create table if not exists public.settings (
  id integer primary key default 1,
  store_name text not null default 'Parada do Lanche',
  primary_color text not null default '#f97316',
  logo_url text,
  wifi_ssid text not null default '',
  wifi_password text not null default '',
  order_approval_mode text not null default 'HOST' check (order_approval_mode in ('HOST', 'SELF')),
  sticker_bg_color text not null default '#ffffff',
  sticker_text_color text not null default '#111827',
  sticker_border_color text not null default '#111111',
  sticker_muted_text_color text not null default '#9ca3af',
  sticker_qr_frame_color text not null default '#111111',
  constraint single_row check (id = 1)
);

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
  status text default 'FREE' check (status in ('FREE', 'OCCUPIED')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.sessions (
  id uuid default uuid_generate_v4() primary key,
  table_id uuid references public.tables(id) on delete cascade,
  status text default 'OPEN' check (status in ('OPEN', 'LOCKED', 'EXPIRED')),
  host_guest_id uuid,
  closed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
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
  created_by_guest_id uuid references public.session_guests(id) on delete set null,
  approval_status text not null default 'PENDING_APPROVAL' check (approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  approved_by_guest_id uuid references public.session_guests(id) on delete set null,
  approved_at timestamp with time zone,
  -- Valores internos do banco (nao alterar sem migracao completa do app):
  -- PENDING, PREPARING, READY, FINISHED, CANCELLED
  -- Rotulos PT-BR na interface:
  -- Pendente, Em preparo, Pronto, Finalizado, Cancelado
  status text default 'PENDING' check (status in ('PENDING', 'PREPARING', 'READY', 'FINISHED', 'CANCELLED')),
  total_cents integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.order_items (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name_snapshot text not null,
  unit_price_cents integer not null,
  qty integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'READY')),
  note text,
  added_by_name text not null
);

insert into public.settings (id, store_name, primary_color)
values (1, 'Parada do Lanche', '#f97316')
on conflict (id) do nothing;

update public.settings
set
  wifi_ssid = coalesce(wifi_ssid, ''),
  wifi_password = coalesce(wifi_password, ''),
  order_approval_mode = coalesce(order_approval_mode, 'HOST'),
  sticker_bg_color = coalesce(sticker_bg_color, '#ffffff'),
  sticker_text_color = coalesce(sticker_text_color, '#111827'),
  sticker_border_color = coalesce(sticker_border_color, '#111111'),
  sticker_muted_text_color = coalesce(sticker_muted_text_color, '#9ca3af'),
  sticker_qr_frame_color = coalesce(sticker_qr_frame_color, '#111111')
where id = 1;

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
