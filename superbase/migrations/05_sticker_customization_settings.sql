-- Personalizacao de adesivos (QR de mesa) salva em settings

alter table public.settings
  add column if not exists sticker_bg_color text not null default '#ffffff',
  add column if not exists sticker_text_color text not null default '#111827',
  add column if not exists sticker_border_color text not null default '#111111',
  add column if not exists sticker_muted_text_color text not null default '#9ca3af',
  add column if not exists sticker_qr_frame_color text not null default '#111111';

update public.settings
set
  sticker_bg_color = coalesce(sticker_bg_color, '#ffffff'),
  sticker_text_color = coalesce(sticker_text_color, '#111827'),
  sticker_border_color = coalesce(sticker_border_color, '#111111'),
  sticker_muted_text_color = coalesce(sticker_muted_text_color, '#9ca3af'),
  sticker_qr_frame_color = coalesce(sticker_qr_frame_color, '#111111')
where id = 1;

