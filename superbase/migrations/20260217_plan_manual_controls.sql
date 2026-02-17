-- Controles manuais de plano: alterar vencimento e bloquear/desbloquear imediatamente

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

