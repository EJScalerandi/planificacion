-- Migración: Zonificación geográfica + reglas de envío (motor IA de logística)
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- Contexto: primer paso de la funcionalidad de recomendación de rutas asistida
-- por IA. Antes de meter IA en nada, resolvemos determinísticamente a qué zona
-- (public.logistica_zonas, ya existente) pertenece un portón según su
-- ubicación: cada zona tiene una o más "referencias" (localidades
-- geocodificadas, ej. Zona Sur 1 = Rosario + Bs As), y un portón se clasifica
-- por la referencia más cercana (distancia haversine). Ver
-- server/lib/logisticaZonificacion.js.
--
-- logistica_reglas_envio: reglas de negocio editables tipo "un portón no puede
-- despacharse antes de N días desde tal fecha, y si es de tal tipo, antes de M
-- días" (ejemplo real del usuario: 45 días desde firma del link, 60 si es
-- Coplanar). Mismo patrón "primer match gana por prioridad" que ya usa
-- logistica_reglas_capacidad. fecha_referencia_campo default 'fecha_nv'
-- (fecha de venta) como proxy de "firma del link" hasta que el usuario
-- confirme el campo exacto — no bloquea cargar las reglas mientras tanto.

create table if not exists public.logistica_zona_referencias (
  id serial primary key,
  zona_id int not null references public.logistica_zonas(id) on delete cascade,
  nombre text not null, -- localidad de referencia, ej "Rosario"
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_logistica_zona_referencias_zona
  on public.logistica_zona_referencias(zona_id);

create table if not exists public.logistica_reglas_envio (
  id serial primary key,
  nombre text not null,
  descripcion text,
  dias_minimos int not null,
  fecha_referencia_campo text not null default 'fecha_nv',
  -- condición opcional de a qué portones aplica (null = regla base, aplica a
  -- todos); mismo patrón que logistica_reglas_capacidad.
  campo text,
  operador text default '=',
  valor text,
  prioridad int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_logistica_reglas_envio_prioridad
  on public.logistica_reglas_envio(prioridad);
