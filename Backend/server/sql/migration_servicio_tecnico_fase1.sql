-- Migración: Servicio Técnico - Fase 1 (fechas + viajes) y ajuste de adjuntos
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

-- Adjuntos: un archivo (imagen/PDF/video) por entrada de historial, igual
-- patrón que ya usa el Presupuestador para los tickets
-- (presupuestador_technical_ticket_messages.attachment jsonb) - base64 en
-- data_url, sin storage externo. Reemplaza la tabla servicio_tecnico_imagenes
-- (vacía, nunca se usó) por ser más simple y ya probado en producción.
alter table public.servicio_tecnico_historial
  add column if not exists attachment jsonb null;

drop table if exists public.servicio_tecnico_imagenes;

-- fecha_programada: cuándo se va a atender la solicitud (arrastrada a una
-- semana en Planificación de Fechas de Técnica) - mismo rol que
-- fecha_salida_imput/fecha_llegada_imput para Logística, o
-- measurement_scheduled_for para medición (ver lib/servicioTecnicoMedicionDb.js).
alter table public.servicio_tecnico_solicitudes
  add column if not exists fecha_programada date;

-- ===========================================================================
-- Viajes de Servicio Técnico (espejo de logistica_viajes/logistica_viaje_
-- portones, ver migration_logistica_viajes.sql) - reutiliza las MISMAS zonas
-- geográficas que Logística (public.logistica_zonas), pero con su propio
-- listado de vehículos y cuadrillas (equipo de Técnica, distinto del de
-- despacho).
-- ===========================================================================

create table if not exists public.servicio_tecnico_vehiculos (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.servicio_tecnico_cuadrillas (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.servicio_tecnico_cuadrilla_miembros (
  cuadrilla_id int not null references public.servicio_tecnico_cuadrillas(id) on delete cascade,
  qc_user_id bigint not null references public.qc_users(id) on delete cascade,
  primary key (cuadrilla_id, qc_user_id)
);

create table if not exists public.servicio_tecnico_viajes (
  id serial primary key,
  semana text not null, -- ISO "AAAA-Www", mismo formato que el resto de la app
  fecha date not null,
  zona_id int references public.logistica_zonas(id),
  cuadrilla_id int references public.servicio_tecnico_cuadrillas(id),
  vehiculo_id int references public.servicio_tecnico_vehiculos(id),
  nombre text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_st_viajes_semana on public.servicio_tecnico_viajes(semana);

-- Un item de viaje es una solicitud de ST O una medición pendiente (nunca
-- ambas) - se guarda el quote_id (uuid de presupuestador_quotes) para
-- medición porque esa entidad no vive en Planta.
create table if not exists public.servicio_tecnico_viaje_items (
  id serial primary key,
  viaje_id int not null references public.servicio_tecnico_viajes(id) on delete cascade,
  tipo text not null check (tipo in ('solicitud', 'medicion')),
  solicitud_id int references public.servicio_tecnico_solicitudes(id) on delete cascade,
  quote_id uuid,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  constraint chk_st_viaje_items_referencia check (
    (tipo = 'solicitud' and solicitud_id is not null and quote_id is null) or
    (tipo = 'medicion' and quote_id is not null and solicitud_id is null)
  ),
  unique (solicitud_id),
  unique (quote_id)
);

create index if not exists idx_st_viaje_items_viaje on public.servicio_tecnico_viaje_items(viaje_id);

-- Cierre de semana, mismo patrón que logistica_semanas.
create table if not exists public.servicio_tecnico_semanas (
  semana text primary key,
  cerrada boolean not null default false,
  cerrada_at timestamptz,
  cerrada_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
