
-- Habilitar extensões necessárias
create extension if not exists "uuid-ossp";

-- TABELA DE CONFIGURAÇÕES DA LOJA
create table if not exists public.settings (
    id integer primary key default 1,
    store_name text not null default 'Parada do Lanche',
    primary_color text not null default '#f97316',
    logo_url text,
    constraint single_row check (id = 1)
);

-- TABELA DE PERFIS (EQUIPE)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text unique not null,
    name text not null,
    role text not null default 'WAITER' check (role in ('ADMIN', 'MANAGER', 'WAITER')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE CATEGORIAS
create table if not exists public.categories (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    sort_order integer default 0,
    active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE PRODUTOS
create table if not exists public.products (
    id uuid default uuid_generate_v4() primary key,
    category_id uuid references public.categories(id) on delete cascade,
    name text not null,
    description text,
    price_cents integer not null,
    image_url text,
    active boolean default true,
    out_of_stock boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE MESAS
create table if not exists public.tables (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    token text unique not null,
    status text default 'FREE' check (status in ('FREE', 'OCCUPIED')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE SESSÕES (MESAS ATIVAS)
create table if not exists public.sessions (
    id uuid default uuid_generate_v4() primary key,
    table_id uuid references public.tables(id) on delete cascade,
    status text default 'OPEN' check (status in ('OPEN', 'LOCKED', 'EXPIRED')),
    host_guest_id uuid,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE CLIENTES NA MESA
create table if not exists public.session_guests (
    id uuid default uuid_generate_v4() primary key,
    session_id uuid references public.sessions(id) on delete cascade,
    name text not null,
    is_host boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE ITENS NO CARRINHO
create table if not exists public.cart_items (
    id uuid default uuid_generate_v4() primary key,
    session_id uuid references public.sessions(id) on delete cascade,
    guest_id uuid references public.session_guests(id) on delete cascade,
    product_id uuid references public.products(id) on delete cascade,
    qty integer not null default 1,
    note text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE PEDIDOS (ENVIADOS PARA COZINHA)
create table if not exists public.orders (
    id uuid default uuid_generate_v4() primary key,
    table_id uuid references public.tables(id) on delete cascade,
    session_id uuid references public.sessions(id) on delete cascade,
    status text default 'PENDING' check (status in ('PENDING', 'PREPARING', 'READY', 'FINISHED', 'CANCELLED')),
    total_cents integer not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE ITENS DO PEDIDO
create table if not exists public.order_items (
    id uuid default uuid_generate_v4() primary key,
    order_id uuid references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    name_snapshot text not null,
    unit_price_cents integer not null,
    qty integer not null,
    note text,
    added_by_name text not null
);

-- INSERIR CONFIGURAÇÃO INICIAL (SE NÃO EXISTIR)
insert into public.settings (id, store_name, primary_color) values (1, 'Parada do Lanche', '#f97316') on conflict (id) do nothing;
