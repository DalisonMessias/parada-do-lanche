-- Habilita RLS em todo o app sem quebrar o fluxo atual.
-- Observacao: as policies abaixo sao abertas (to public), entao o comportamento
-- fica equivalente a "liberado", mas com RLS tecnicamente habilitado.
-- Depois, substitua por policies restritivas por perfil.

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
