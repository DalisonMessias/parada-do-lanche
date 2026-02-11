-- Corrige RLS da tabela public.tables
-- Objetivo:
-- 1) permitir leitura publica das mesas (necessario para lookup via token no menu)
-- 2) permitir criar/editar/excluir mesas apenas para usuarios autenticados

alter table public.tables enable row level security;

drop policy if exists "tables_select_all" on public.tables;
create policy "tables_select_all"
on public.tables
for select
using (true);

drop policy if exists "tables_insert_authenticated" on public.tables;
create policy "tables_insert_authenticated"
on public.tables
for insert
to authenticated
with check (true);

drop policy if exists "tables_update_authenticated" on public.tables;
create policy "tables_update_authenticated"
on public.tables
for update
to authenticated
using (true)
with check (true);

drop policy if exists "tables_delete_authenticated" on public.tables;
create policy "tables_delete_authenticated"
on public.tables
for delete
to authenticated
using (true);

