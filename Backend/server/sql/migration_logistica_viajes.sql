-- Migración: Logística de Viajes (despacho + instalación por semana)
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- Contexto: /a (preproduccion_valores) carga fecha_salida_imput (despacho) y
-- fecha_llegada_imput (instalación) por NV. Esta migración agrega las tablas para
-- armar "viajes" (fecha + zona + cuadrilla + vehículo) y repartir en ellos los
-- portones (unidades físicas de public.portones) de despacho/instalación de una
-- semana ISO, hasta poder cerrar la semana.
--
-- Granularidad: un "portón" acá es una fila de public.portones (unidad física),
-- no una fila de preproduccion_valores (que es 1 por NV). La fecha y las medidas
-- se siguen resolviendo por join a preproduccion_valores vía portones.nv.

create table if not exists public.logistica_zonas (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.logistica_vehiculos (
  id serial primary key,
  nombre text not null unique,
  -- Cantidad de "portones base" que puede llevar para despacho. 0 = no lleva
  -- despacho (ej. una Partner que solo traslada cuadrilla para instalar).
  capacidad_portones int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.logistica_cuadrillas (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.logistica_cuadrilla_miembros (
  cuadrilla_id int not null references public.logistica_cuadrillas(id) on delete cascade,
  qc_user_id bigint not null references public.qc_users(id) on delete cascade,
  primary key (cuadrilla_id, qc_user_id)
);

-- Regla "si mide más de X, cuenta como N portones" para el descuento de
-- capacidad del vehículo. Gana la primera regla activa (por prioridad asc) que
-- matchee; si ninguna matchea, el portón pesa 1 (patrón "primer match gana",
-- igual que las reglas de Sistema -> Fecha Salida que ya existen en /a).
create table if not exists public.logistica_reglas_capacidad (
  id serial primary key,
  nombre text,
  campo text not null default 'max_mm' check (campo in ('alto_mm', 'ancho_mm', 'max_mm')),
  operador text not null default '>' check (operador in ('>', '>=', '<', '<=', '=')),
  valor_mm numeric not null,
  peso numeric not null default 2,
  prioridad int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.logistica_viajes (
  id serial primary key,
  semana text not null, -- ISO "AAAA-Www", mismo formato que ya usa /a
  fecha date not null,
  zona_id int references public.logistica_zonas(id),
  cuadrilla_id int references public.logistica_cuadrillas(id),
  vehiculo_id int references public.logistica_vehiculos(id),
  nombre text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_logistica_viajes_semana on public.logistica_viajes(semana);

create table if not exists public.logistica_viaje_portones (
  id serial primary key,
  viaje_id int not null references public.logistica_viajes(id) on delete cascade,
  porton_id uuid not null references public.portones(id) on delete cascade,
  tipo text not null check (tipo in ('despacho', 'instalacion')),
  -- snapshot del peso (según logistica_reglas_capacidad) al momento de asignar
  peso numeric not null default 1,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  -- Un portón puede estar una vez como despacho y otra como instalación
  -- (en el mismo viaje o en viajes distintos), pero no dos veces con el mismo tipo.
  unique (porton_id, tipo)
);

create index if not exists idx_logistica_viaje_portones_viaje on public.logistica_viaje_portones(viaje_id);
create index if not exists idx_logistica_viaje_portones_porton on public.logistica_viaje_portones(porton_id);

-- Cierre de semana: por ahora solo el flag. El alcance de qué bloquea
-- exactamente (además del propio tablero de viajes) se define después.
create table if not exists public.logistica_semanas (
  semana text primary key,
  cerrada boolean not null default false,
  cerrada_at timestamptz,
  cerrada_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
