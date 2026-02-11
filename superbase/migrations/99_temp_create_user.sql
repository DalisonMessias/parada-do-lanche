-- SQL temporario para criar usuario manualmente no Supabase
-- Este script tambem corrige o trigger handle_auth_user_created para o schema atual.
-- Uso: edite v_email, v_password, v_name e v_role e execute no SQL Editor.
-- Depois de criar os usuarios necessarios, remova este arquivo.

create extension if not exists pgcrypto;

-- Policies RLS minimas para profiles (acesso ao proprio perfil)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Garante que profiles.id referencia auth.users(id)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Remove triggers customizados antigos em auth.users (fonte comum de "Database error creating new user")
do $$
declare
  r record;
begin
  for r in
    select tgname
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
  end loop;
end $$;

-- Corrige trigger legado que tentava usar full_name/avatar_url/CLIENT
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'WAITER',
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, public.profiles.name);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

-- Corrige trigger legado de update que usava user_metadata/full_name/avatar_url
create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'WAITER',
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, public.profiles.name);

  return new;
end;
$$;

create trigger on_auth_user_updated
after update on auth.users
for each row
execute function public.handle_auth_user_updated();

do $$
declare
  v_email text := 'admin@paradadolanche.com';
  v_password text := 'TroqueAgora123!';
  v_name text := 'Administrador';
  v_role text := 'ADMIN'; -- ADMIN | MANAGER | WAITER
  v_user_id uuid;
begin
  if v_role not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'role invalida: %', v_role;
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('name', v_name),
      now(),
      now()
    );
  else
    update auth.users
      set encrypted_password = crypt(v_password, gen_salt('bf')),
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', v_name),
          updated_at = now()
    where id = v_user_id;
  end if;

  -- Garante que realmente existe em auth.users antes de mexer em public.profiles
  perform 1 from auth.users where id = v_user_id and lower(email) = lower(v_email);
  if not found then
    raise exception 'Usuario nao foi criado em auth.users para o email %', v_email;
  end if;

  insert into public.profiles (id, email, name, role)
  values (v_user_id, v_email, v_name, v_role)
  on conflict (id) do update
    set email = excluded.email,
        name = excluded.name,
        role = excluded.role;
end $$;
