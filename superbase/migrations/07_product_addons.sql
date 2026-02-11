-- Adicionais avulsos por produto (sem grupos)
-- Cada produto define se o cliente pode escolher 1 ou multiplos adicionais.

alter table public.products
  add column if not exists addon_selection_mode text not null default 'MULTIPLE'
  check (addon_selection_mode in ('SINGLE', 'MULTIPLE'));

create table if not exists public.product_addons (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_product_addons_product_id on public.product_addons(product_id);

