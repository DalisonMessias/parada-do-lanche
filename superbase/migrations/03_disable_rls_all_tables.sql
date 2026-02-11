-- Aplicacao ampla para evitar bloqueios de RLS em todo o app.
-- ATENCAO: isto reduz a seguranca (uso recomendado apenas enquanto ajusta regras finais).

alter table if exists public.settings disable row level security;
alter table if exists public.profiles disable row level security;
alter table if exists public.categories disable row level security;
alter table if exists public.products disable row level security;
alter table if exists public.tables disable row level security;
alter table if exists public.sessions disable row level security;
alter table if exists public.session_guests disable row level security;
alter table if exists public.cart_items disable row level security;
alter table if exists public.orders disable row level security;
alter table if exists public.order_items disable row level security;

