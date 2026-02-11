-- Corrige RLS do Supabase Storage para o bucket usado no app: "assets"
-- Necessario para upload de logo em AdminSettings.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update
set public = true;

-- Permissoes para visualizar arquivos do bucket assets
drop policy if exists "assets_select_public" on storage.objects;
create policy "assets_select_public"
on storage.objects
for select
to public
using (bucket_id = 'assets');

-- Permissoes para upload no bucket assets
drop policy if exists "assets_insert_public" on storage.objects;
create policy "assets_insert_public"
on storage.objects
for insert
to public
with check (bucket_id = 'assets');

-- Permissoes para atualizar arquivos no bucket assets
drop policy if exists "assets_update_public" on storage.objects;
create policy "assets_update_public"
on storage.objects
for update
to public
using (bucket_id = 'assets')
with check (bucket_id = 'assets');

-- Permissoes para deletar arquivos no bucket assets
drop policy if exists "assets_delete_public" on storage.objects;
create policy "assets_delete_public"
on storage.objects
for delete
to public
using (bucket_id = 'assets');

