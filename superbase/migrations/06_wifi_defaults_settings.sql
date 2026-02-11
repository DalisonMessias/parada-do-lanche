-- Salva configuracao padrao de Wi-Fi para uso nos adesivos

alter table public.settings
  add column if not exists wifi_ssid text not null default '',
  add column if not exists wifi_password text not null default '';

update public.settings
set
  wifi_ssid = coalesce(wifi_ssid, ''),
  wifi_password = coalesce(wifi_password, '')
where id = 1;

