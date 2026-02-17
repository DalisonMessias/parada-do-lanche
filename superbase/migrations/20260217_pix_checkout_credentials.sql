-- Credenciais de checkout Pix interno (/uaitech e /checkout/plano)

alter table public.settings
  add column if not exists pix_checkout_chave text,
  add column if not exists pix_checkout_nome_recebedor text,
  add column if not exists pix_checkout_cidade_recebedor text,
  add column if not exists pix_checkout_descricao text,
  add column if not exists pix_checkout_txid text,
  add column if not exists pix_checkout_reutilizavel boolean not null default true;

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

update public.settings
set
  pix_checkout_chave = nullif(trim(coalesce(pix_checkout_chave, '')), ''),
  pix_checkout_nome_recebedor = nullif(trim(coalesce(pix_checkout_nome_recebedor, '')), ''),
  pix_checkout_cidade_recebedor = nullif(trim(coalesce(pix_checkout_cidade_recebedor, '')), ''),
  pix_checkout_descricao = nullif(trim(coalesce(pix_checkout_descricao, '')), ''),
  pix_checkout_txid = coalesce(nullif(trim(coalesce(pix_checkout_txid, '')), ''), '***'),
  pix_checkout_reutilizavel = coalesce(pix_checkout_reutilizavel, true),
  updated_at = timezone('utc'::text, now())
where id = 1;
