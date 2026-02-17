-- Fila de comprovantes do checkout de plano: cria pendencia e aprova no painel /uaitech

create table if not exists public.plan_payment_requests (
  id uuid default gen_random_uuid() primary key,
  settings_id integer not null default 1,
  plan_name text not null default 'Plano mensal',
  plan_description text,
  plan_value numeric,
  pix_payload text,
  requester_note text,
  requester_contact text,
  status text not null default 'PENDING',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  processed_at timestamp with time zone,
  processed_by text,
  process_note text,
  payload jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'plan_payment_requests_status_check'
      and conrelid = 'public.plan_payment_requests'::regclass
  ) then
    alter table public.plan_payment_requests
      add constraint plan_payment_requests_status_check
      check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'plan_payment_requests_plan_value_check'
      and conrelid = 'public.plan_payment_requests'::regclass
  ) then
    alter table public.plan_payment_requests
      add constraint plan_payment_requests_plan_value_check
      check (plan_value is null or plan_value >= 0);
  end if;
end $$;

create index if not exists idx_plan_payment_requests_status_created_at
  on public.plan_payment_requests(status, created_at desc);
create index if not exists idx_plan_payment_requests_created_at
  on public.plan_payment_requests(created_at desc);

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.submit_plan_payment_request(
  p_plan_name text default null,
  p_plan_description text default null,
  p_plan_value numeric default null,
  p_pix_payload text default null,
  p_requester_note text default null,
  p_requester_contact text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_plan_value numeric := null;
begin
  if p_plan_value is not null and p_plan_value < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Valor do plano invalido.'
    );
  end if;

  v_plan_value := case
    when p_plan_value is null then null
    else round(greatest(p_plan_value, 0)::numeric, 2)
  end;

  insert into public.settings (id)
  values (1)
  on conflict (id) do nothing;

  select id
    into v_request_id
  from public.plan_payment_requests
  where settings_id = 1
    and status = 'PENDING'
  order by created_at desc
  limit 1;

  if v_request_id is not null then
    return jsonb_build_object(
      'success', true,
      'message', 'Ja existe uma solicitacao pendente. Aguarde a liberacao no /uaitech.',
      'request_id', v_request_id
    );
  end if;

  insert into public.plan_payment_requests (
    settings_id,
    plan_name,
    plan_description,
    plan_value,
    pix_payload,
    requester_note,
    requester_contact,
    status,
    payload
  )
  values (
    1,
    coalesce(nullif(trim(coalesce(p_plan_name, '')), ''), 'Plano mensal'),
    nullif(trim(coalesce(p_plan_description, '')), ''),
    v_plan_value,
    nullif(trim(coalesce(p_pix_payload, '')), ''),
    nullif(trim(coalesce(p_requester_note, '')), ''),
    nullif(trim(coalesce(p_requester_contact, '')), ''),
    'PENDING',
    jsonb_build_object(
      'origin', 'CHECKOUT_PLANO',
      'created_from', '/checkout/plano'
    )
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Comprovante enviado. Aguardando liberacao no /uaitech.',
    'request_id', v_request_id
  );
end;
$$;

create or replace function public.list_plan_payment_requests(
  p_username text,
  p_password text,
  p_status text default 'PENDING',
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(trim(coalesce(p_status, 'PENDING')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 200));
  v_requests jsonb := '[]'::jsonb;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  if v_status not in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL') then
    return jsonb_build_object(
      'success', false,
      'message', 'Status invalido para filtro.'
    );
  end if;

  if v_status = 'ALL' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'plan_name', r.plan_name,
          'plan_description', r.plan_description,
          'plan_value', r.plan_value,
          'status', r.status,
          'requester_note', r.requester_note,
          'requester_contact', r.requester_contact,
          'created_at', r.created_at,
          'processed_at', r.processed_at,
          'processed_by', r.processed_by,
          'process_note', r.process_note
        )
        order by r.created_at desc
      ),
      '[]'::jsonb
    )
      into v_requests
    from (
      select *
      from public.plan_payment_requests
      order by created_at desc
      limit v_limit
    ) r;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'plan_name', r.plan_name,
          'plan_description', r.plan_description,
          'plan_value', r.plan_value,
          'status', r.status,
          'requester_note', r.requester_note,
          'requester_contact', r.requester_contact,
          'created_at', r.created_at,
          'processed_at', r.processed_at,
          'processed_by', r.processed_by,
          'process_note', r.process_note
        )
        order by r.created_at desc
      ),
      '[]'::jsonb
    )
      into v_requests
    from (
      select *
      from public.plan_payment_requests
      where status = v_status
      order by created_at desc
      limit v_limit
    ) r;
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Solicitacoes carregadas.',
    'requests', v_requests
  );
end;
$$;

create or replace function public.approve_plan_payment_request(
  p_username text,
  p_password text,
  p_request_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_actor_username text;
  v_confirm jsonb;
  v_success boolean := false;
begin
  if not public.is_plan_access_valid(p_username, p_password) then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuario ou senha incorretos.'
    );
  end if;

  if p_request_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Solicitacao invalida.'
    );
  end if;

  v_actor_username := lower(trim(coalesce(p_username, '')));

  select *
    into v_request
  from public.plan_payment_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'Solicitacao nao encontrada.'
    );
  end if;

  if coalesce(v_request.status, '') <> 'PENDING' then
    return jsonb_build_object(
      'success', false,
      'message', 'Solicitacao ja processada.'
    );
  end if;

  v_confirm := public.confirm_plan_payment(
    p_username,
    p_password,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Aprovacao de comprovante no /uaitech')
  );

  v_success := coalesce((v_confirm ->> 'success')::boolean, false);
  if not v_success then
    return jsonb_build_object(
      'success', false,
      'message', coalesce(v_confirm ->> 'message', 'Falha ao confirmar pagamento do plano.'),
      'confirm_response', v_confirm
    );
  end if;

  update public.plan_payment_requests
  set
    status = 'APPROVED',
    processed_at = timezone('utc'::text, now()),
    processed_by = v_actor_username,
    process_note = nullif(trim(coalesce(p_note, '')), ''),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('approval_result', v_confirm)
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Acesso liberado e plano marcado como pago.',
    'request_id', p_request_id,
    'confirm_response', v_confirm
  );
end;
$$;
