-- Migración: líneas nuevas "Prefabricados" y "Servicio Técnico"
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- Prefabricados: productos de stock (ej. "Cabezal 75mm") con workflow fijo por tipo,
-- pedidos manualmente por una sección habilitada (seccion_solicitante).
-- Servicio Técnico: órdenes ad-hoc ligadas a un NV existente, con workflow armado
-- a mano por el usuario del panel admin al crear la orden.
--
-- Ambas reusan el patrón EAV de porton_etapas_estado/tiempos, pero con "etapa" como
-- text (no enum) porque el conjunto de etapas válidas varía por tipo/orden y se
-- valida en la aplicación.

create sequence if not exists public.prefabricado_seq;

create table if not exists public.prefabricado_tipos (
  id serial primary key,
  nombre text not null,
  seccion_solicitante text[] not null default '{}',
  workflow_stages text[] not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prefabricado_ordenes (
  id serial primary key,
  numero int not null default nextval('public.prefabricado_seq'),
  tipo_id int not null references public.prefabricado_tipos(id),
  solicitado_por_seccion text,
  created_at timestamptz not null default now()
);

create table if not exists public.prefabricado_orden_etapas_estado (
  orden_id int not null references public.prefabricado_ordenes(id),
  etapa text not null,
  estado text not null,
  primary key (orden_id, etapa)
);

create table if not exists public.prefabricado_orden_etapas_tiempos (
  orden_id int not null references public.prefabricado_ordenes(id),
  etapa text not null,
  inicio timestamptz,
  fin timestamptz,
  primary key (orden_id, etapa)
);

create table if not exists public.st_ordenes (
  id serial primary key,
  nv int not null,
  cantidad int not null,
  descripcion text not null,
  workflow_stages text[] not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.st_orden_etapas_estado (
  orden_id int not null references public.st_ordenes(id),
  etapa text not null,
  estado text not null,
  primary key (orden_id, etapa)
);

create table if not exists public.st_orden_etapas_tiempos (
  orden_id int not null references public.st_ordenes(id),
  etapa text not null,
  inicio timestamptz,
  fin timestamptz,
  primary key (orden_id, etapa)
);
