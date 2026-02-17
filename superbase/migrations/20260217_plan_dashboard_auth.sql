-- Painel de pagamentos com login (usuario + senha) e historico completo

alter table public.settings
  add column if not exists plan_name text not null default 'Basico',
  add column if not exists plan_price numeric not null default 19.90,
  add column if not exists plan_next_price numeric,
  add column if not exists plan_due_day integer not null default 15,
  add column if not exists plan_current_due_date date not null default (date_trunc('month', current_date)::date + 14),
  add column if not exists plan_status text not null default 'PAID',
  add column if not exists plan_paid_at timestamp with time zone,
  add column if not exists plan_last_checked_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_status_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_status_check
      check (plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_due_day_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_due_day_check
      check (plan_due_day between 1 and 28);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_price_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_price_check
      check (plan_price >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_plan_next_price_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_plan_next_price_check
      check (plan_next_price is null or plan_next_price >= 0);
  end if;
end $$;

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

update public.settings
set
  plan_name = coalesce(nullif(trim(coalesce(plan_name, '')), ''), 'Basico'),
  plan_price = greatest(coalesce(plan_price, 19.90), 0),
  plan_next_price = case
    when plan_next_price is null then null
    else greatest(plan_next_price, 0)
  end,
  plan_due_day = least(greatest(coalesce(plan_due_day, 15), 1), 28),
  plan_status = case
    when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
    else 'PAID'
  end,
  plan_current_due_date = coalesce(
    plan_current_due_date,
    date_trunc('month', current_date)::date + (least(greatest(coalesce(plan_due_day, 15), 1), 28) - 1)
  ),
  updated_at = coalesce(updated_at, timezone('utc'::text, now()))
where id = 1;

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

create or replace function public.get_plan_payment_dashboard(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_days_to_due integer := null;
  v_is_overdue boolean := false;
  v_is_due_soon boolean := false;
  v_amount_pending numeric := 0;
  v_pending jsonb := '[]'::jsonb;
  v_due_soon jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  insert into public.settings (id)
  values (1)
  on conflict (id) do nothing;

  select
    id,
    coalesce(nullif(trim(coalesce(plan_name, '')), ''), 'Basico') as plan_name,
    greatest(coalesce(plan_price, 19.90), 0) as plan_price,
    case
      when plan_next_price is null then null
      else greatest(plan_next_price, 0)
    end as plan_next_price,
    least(greatest(coalesce(plan_due_day, 15), 1), 28) as plan_due_day,
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end as plan_status,
    plan_current_due_date,
    plan_paid_at
    into v_settings
  from public.settings
  where id = 1
  limit 1;

  if v_settings.plan_current_due_date is not null then
    v_days_to_due := (v_settings.plan_current_due_date - current_date);
  end if;

  v_is_overdue := coalesce(v_settings.plan_status, 'PAID') in ('OVERDUE', 'SUSPENDED')
                  or coalesce(v_days_to_due, 0) < 0;
  v_is_due_soon := coalesce(v_days_to_due, 9999) between 0 and 7;

  if coalesce(v_settings.plan_status, 'PAID') in ('OPEN', 'OVERDUE', 'SUSPENDED') then
    v_amount_pending := greatest(coalesce(v_settings.plan_price, 0), 0);
  end if;

  if v_amount_pending > 0 then
    v_pending := jsonb_build_array(
      jsonb_build_object(
        'title', 'Mensalidade pendente',
        'due_date', v_settings.plan_current_due_date,
        'status', v_settings.plan_status,
        'amount', v_amount_pending,
        'days_to_due', v_days_to_due
      )
    );
  end if;

  if v_is_due_soon then
    v_due_soon := jsonb_build_array(
      jsonb_build_object(
        'title', 'Vencimento proximo',
        'due_date', v_settings.plan_current_due_date,
        'status', v_settings.plan_status,
        'amount', greatest(coalesce(v_settings.plan_price, 0), 0),
        'days_to_due', v_days_to_due
      )
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'confirmed_at', h.confirmed_at,
        'actor_username', h.actor_username,
        'paid_amount', h.paid_amount,
        'previous_status', h.previous_status,
        'previous_due_date', h.previous_due_date,
        'new_due_date', h.new_due_date,
        'payload', h.payload
      )
      order by h.confirmed_at desc
    ),
    '[]'::jsonb
  )
    into v_history
  from (
    select *
    from public.plan_payment_history
    where settings_id = 1
    order by confirmed_at desc
    limit 200
  ) h;

  return jsonb_build_object(
    'success', true,
    'message', 'Acesso liberado.',
    'snapshot', jsonb_build_object(
      'plan_name', v_settings.plan_name,
      'plan_price', v_settings.plan_price,
      'next_plan_price', v_settings.plan_next_price,
      'plan_due_day', v_settings.plan_due_day,
      'plan_status', v_settings.plan_status,
      'current_due_date', v_settings.plan_current_due_date,
      'plan_paid_at', v_settings.plan_paid_at,
      'days_to_due', v_days_to_due,
      'amount_pending', v_amount_pending,
      'is_overdue', v_is_overdue,
      'is_due_soon', v_is_due_soon
    ),
    'pending_items', v_pending,
    'due_soon_items', v_due_soon,
    'history', v_history
  );
end;
$$;

create or replace function public.confirm_plan_payment(
  p_username text,
  p_password text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings_id integer := 1;
  v_current_due_date date;
  v_new_due_date date;
  v_due_day integer := 15;
  v_previous_status text := 'PAID';
  v_plan_price numeric := 0;
  v_next_plan_price numeric := null;
  v_actor_username text;
  v_history_id uuid;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object('success', false, 'message', 'Usuario ou senha incorretos.');
  end if;

  v_actor_username := lower(trim(coalesce(p_username, '')));

  insert into public.settings (id)
  values (v_settings_id)
  on conflict (id) do nothing;

  select
    plan_current_due_date,
    least(greatest(coalesce(plan_due_day, 15), 1), 28),
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end,
    greatest(coalesce(plan_price, 0), 0),
    case
      when plan_next_price is null then null
      else greatest(plan_next_price, 0)
    end
    into v_current_due_date, v_due_day, v_previous_status, v_plan_price, v_next_plan_price
  from public.settings
  where id = v_settings_id
  for update;

  v_new_due_date := date_trunc(
    'month',
    greatest(coalesce(v_current_due_date, current_date), current_date)::timestamp + interval '1 month'
  )::date + (v_due_day - 1);

  if v_new_due_date <= current_date then
    v_new_due_date := date_trunc('month', current_date::timestamp + interval '1 month')::date + (v_due_day - 1);
  end if;

  update public.settings
  set
    plan_status = 'PAID',
    plan_paid_at = timezone('utc'::text, now()),
    plan_current_due_date = v_new_due_date,
    plan_price = coalesce(v_next_plan_price, plan_price),
    plan_next_price = case
      when v_next_plan_price is null then plan_next_price
      else null
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
    v_plan_price,
    v_previous_status,
    v_current_due_date,
    v_new_due_date,
    jsonb_build_object(
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'confirmed_by', v_actor_username,
      'applied_next_price', v_next_plan_price
    )
  )
  returning id into v_history_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Pagamento confirmado com sucesso!',
    'new_due_date', v_new_due_date,
    'history_id', v_history_id
  );
end;
$$;

create or replace function public.set_plan_next_price(
  p_username text,
  p_password text,
  p_next_price numeric,
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
  v_previous_next_price numeric := null;
  v_next_price numeric := 0;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  if p_next_price is null or p_next_price < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Valor invalido. Informe um numero maior ou igual a zero.'
    );
  end if;

  v_actor_username := lower(trim(coalesce(p_username, '')));
  v_next_price := round(greatest(coalesce(p_next_price, 0), 0)::numeric, 2);

  insert into public.settings (id)
  values (v_settings_id)
  on conflict (id) do nothing;

  select
    plan_current_due_date,
    case
      when plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED') then plan_status
      else 'PAID'
    end,
    case
      when plan_next_price is null then null
      else greatest(plan_next_price, 0)
    end
    into v_previous_due_date, v_previous_status, v_previous_next_price
  from public.settings
  where id = v_settings_id
  for update;

  update public.settings
  set
    plan_next_price = v_next_price,
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
    coalesce(v_previous_due_date, current_date),
    jsonb_build_object(
      'action', 'SET_NEXT_PRICE',
      'previous_next_price', v_previous_next_price,
      'new_next_price', v_next_price,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Valor do proximo mes atualizado.',
    'next_plan_price', v_next_price
  );
end;
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

-- Compatibilidade com cliente antigo (senha apenas).
create or replace function public.confirm_plan_payment(
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.confirm_plan_payment('uaitech', p_password, null);
end;
$$;
