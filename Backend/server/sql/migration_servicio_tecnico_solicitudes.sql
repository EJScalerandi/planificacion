-- Migración: Solicitudes de Servicio Técnico (Fase 0)
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- Contexto: hoy Servicio Técnico (public.st_ordenes, routes/admin/servicioTecnico.js)
-- solo permite crear órdenes que entran DIRECTO al flujo de producción. Esto es
-- un paso ANTES: Diego carga acá la solicitud (con o sin NV/NP vinculado),
-- arma el historial (admin/técnico) y después organiza los viajes de
-- servicio técnico + medición pendiente (igual que Logística de Viajes, pero
-- para este dominio). No reemplaza ni modifica st_ordenes - son cosas
-- separadas; una solicitud puede eventualmente derivar en una st_orden, pero
-- eso no está automatizado todavía.

create table if not exists public.servicio_tecnico_solicitudes (
  id serial primary key,
  nv int, -- NV/NP si existe (número solo, sin prefijo - mismo patrón que el resto de la app)
  nombre_cliente text,
  distribuidor text,
  direccion text,
  maps_url text,
  telefono text,
  fecha_venta date, -- snapshot de fecha_nv al momento de vincular el NV, si había
  descripcion text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'planificado', 'en_viaje', 'resuelto', 'cancelado')),
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_st_solicitudes_nv on public.servicio_tecnico_solicitudes(nv);
create index if not exists idx_st_solicitudes_estado on public.servicio_tecnico_solicitudes(estado);

-- Historial separado por audiencia: admin (oficina) vs técnico (a campo).
create table if not exists public.servicio_tecnico_historial (
  id serial primary key,
  solicitud_id int not null references public.servicio_tecnico_solicitudes(id) on delete cascade,
  tipo text not null check (tipo in ('admin', 'tecnico')),
  autor text,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_st_historial_solicitud on public.servicio_tecnico_historial(solicitud_id);

-- Imágenes adjuntas (a la solicitud directamente, o a una entrada puntual del
-- historial). Tabla lista desde ya; el mecanismo real de subida (Supabase
-- Storage, todavía sin usar en el proyecto) se resuelve en una fase
-- posterior - por ahora "url" queda vacía hasta que se implemente.
create table if not exists public.servicio_tecnico_imagenes (
  id serial primary key,
  solicitud_id int not null references public.servicio_tecnico_solicitudes(id) on delete cascade,
  historial_id int references public.servicio_tecnico_historial(id) on delete cascade,
  url text not null,
  nombre_archivo text,
  subido_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_st_imagenes_solicitud on public.servicio_tecnico_imagenes(solicitud_id);
