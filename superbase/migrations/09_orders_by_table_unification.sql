-- Unificacao de pedidos por mesa/sessao ativa.
-- Esta migracao e para ambiente existente (incremental).

alter table if exists public.settings
  add column if not exists order_approval_mode text;

update public.settings
set order_approval_mode = coalesce(order_approval_mode, 'HOST')
where id = 1;

alter table if exists public.settings
  alter column order_approval_mode set default 'HOST';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'settings_order_approval_mode_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_order_approval_mode_check
      check (order_approval_mode in ('HOST', 'SELF'));
  end if;
end $$;

alter table if exists public.sessions
  add column if not exists closed_at timestamp with time zone;

create unique index if not exists uq_sessions_one_open_per_table
on public.sessions(table_id)
where status = 'OPEN';

alter table if exists public.orders
  add column if not exists created_by_guest_id uuid references public.session_guests(id) on delete set null;

alter table if exists public.orders
  add column if not exists approval_status text;

alter table if exists public.orders
  add column if not exists approved_by_guest_id uuid references public.session_guests(id) on delete set null;

alter table if exists public.orders
  add column if not exists approved_at timestamp with time zone;

update public.orders
set approval_status = coalesce(approval_status, 'APPROVED');

alter table if exists public.orders
  alter column approval_status set default 'PENDING_APPROVAL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_approval_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_approval_status_check
      check (approval_status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'));
  end if;
end $$;

alter table if exists public.order_items
  add column if not exists status text;

update public.order_items
set status = coalesce(status, 'PENDING');

alter table if exists public.order_items
  alter column status set default 'PENDING';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_status_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_status_check
      check (status in ('PENDING', 'READY'));
  end if;
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
