-- Migration: Add Plan Management to Settings
-- Add columns to settings table for plan tracking

alter table public.settings
  add column if not exists plan_name text not null default 'Básico',
  add column if not exists plan_price numeric not null default 19.90,
  add column if not exists plan_due_day integer not null default 15,
  add column if not exists plan_current_due_date date not null default date_trunc('month', current_date) + interval '14 days', -- Default to 15th of current month
  add column if not exists plan_status text not null default 'PAID' check (plan_status in ('PAID', 'OPEN', 'OVERDUE', 'SUSPENDED')),
  add column if not exists plan_paid_at timestamp with time zone,
  add column if not exists plan_last_checked_at timestamp with time zone; -- optimization to avoid checking every request

-- Function to securely confirm payment via the secret route
create or replace function public.confirm_plan_payment(p_password text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings_id integer := 1;
  v_current_due_date date;
  v_new_due_date date;
begin
  -- 1. Validate Password (HARDCODED as requested)
  if p_password != '102192' then
    return jsonb_build_object('success', false, 'message', 'Senha incorreta.');
  end if;

  -- 2. Get current state
  select plan_current_due_date into v_current_due_date
  from public.settings
  where id = v_settings_id;

  -- 3. Calculate next due date (15th of next month)
  -- Logic: If paying today, we assume it's for the current open/overdue period.
  -- Setting the NEXT due date to the 15th of next month relative to TODAY or the current due date?
  -- Simplest robust logic: Set to 15th of NEXT month from 'now', or if we are verifying "past" payments, just bump month.
  -- Let's stick to: Always move due date to next month's 15th relative to current_due_date to avoid skipping months if multiple are late?
  -- OR, simply: set to 15th of next month from NOW.
  v_new_due_date := date_trunc('month', current_date + interval '1 month') + interval '14 days';
  
  -- If the calculated new date is in the past (edge case), force it to future.
  if v_new_due_date <= current_date then
      v_new_due_date := date_trunc('month', current_date + interval '2 month') + interval '14 days';
  end if;

  -- 4. Update Settings
  update public.settings
  set
    plan_status = 'PAID',
    plan_paid_at = now(),
    plan_current_due_date = v_new_due_date,
    updated_at = now()
  where id = v_settings_id;

  return jsonb_build_object(
    'success', true, 
    'message', 'Pagamento confirmado com sucesso!',
    'new_due_date', v_new_due_date
  );
end;
$$;
