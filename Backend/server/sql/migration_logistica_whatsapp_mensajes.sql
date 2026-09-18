-- Bandeja de WhatsApp Business: TODOS los mensajes (entrantes por webhook +
-- salientes desde la app) en una sola tabla, agrupados por teléfono, para
-- mostrar el hilo de conversación tipo WhatsApp Web - pedido explícito del
-- usuario. Correr a mano contra la base (Supabase), igual que el resto de
-- server/sql/*.sql.

create table if not exists public.logistica_whatsapp_mensajes (
  id bigserial primary key,
  telefono text not null,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  tipo text not null default 'text',
  contenido text,
  media_id text,
  wa_message_id text,
  estado text not null default 'enviado',
  detalle_error text,
  enviado_por text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_logistica_whatsapp_mensajes_telefono
  on public.logistica_whatsapp_mensajes (telefono, created_at);

create unique index if not exists idx_logistica_whatsapp_mensajes_wa_id
  on public.logistica_whatsapp_mensajes (wa_message_id)
  where wa_message_id is not null;

-- Imagen/video/audio/documento entrante: se baja UNA vez de Meta (la URL que
-- da la API expira en minutos) y se resube al mismo bucket privado de
-- Storage que ya usa el collage - acá queda el path para armar la URL
-- firmada al mostrar el chat.
alter table public.logistica_whatsapp_mensajes
  add column if not exists media_storage_path text;
