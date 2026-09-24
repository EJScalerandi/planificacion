-- Nombre de contacto editable a mano para el chat de WhatsApp - pedido
-- explícito del usuario: el nombre resuelto automáticamente contra
-- presupuestador_quotes a veces sale mal (mezcla nombre + descripción de
-- producto, según cómo haya quedado cargado el presupuesto). Si hay una fila
-- acá para el teléfono, pisa a la resolución automática.
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

create table if not exists public.logistica_whatsapp_contactos (
  telefono text primary key,
  nombre text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
