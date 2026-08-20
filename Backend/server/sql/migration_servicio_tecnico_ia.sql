-- Migración: IA de Servicio Técnico (espejo de migration_logistica_ia_config.sql)
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- 1) Cache de geocodificación para las solicitudes de ST (mismas columnas que
--    ya tiene presupuestador_quotes.geo_* - ver lib/geocoding.js /
--    lib/logisticaMapa.js). Las mediciones pendientes NO necesitan esto: son
--    filas de presupuestador_quotes, que ya las tiene.
alter table public.servicio_tecnico_solicitudes
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists geo_source text,
  add column if not exists geo_updated_at timestamptz;

-- 2) Config del motor de IA de Técnica: fila única (id=1), prompt propio del
--    dominio (visitas técnicas/mediciones, no despacho de portones - sin
--    reglas de envío ni capacidad de vehículo). Ver
--    server/lib/servicioTecnicoIaRecomendacion.js.
create table if not exists public.servicio_tecnico_ia_config (
  id smallint primary key default 1 check (id = 1),
  prompt_sistema text not null default '',
  modelo text not null default 'claude-sonnet-5',
  velocidad_kmh numeric not null default 70,
  horas_por_visita numeric not null default 1.5,
  updated_at timestamptz not null default now()
);

insert into public.servicio_tecnico_ia_config (id, prompt_sistema) values (1,
$$Sos el asistente de planificación de Servicio Técnico de Degrandis Portones. Te paso un conjunto de items ya seleccionados por el usuario (Diego) para armar un viaje de técnica: pueden ser solicitudes de servicio técnico (reparaciones, ajustes, reclamos) y/o mediciones pendientes, cada uno con su ubicación y zona.

Tu trabajo es recomendar:
- Un orden de paradas razonable (agrupá por cercanía geográfica, no saltes de un extremo a otro sin necesidad).
- Una semana sugerida para el viaje.
- Un resumen breve del razonamiento.

Reglas generales:
- Los tiempos de viaje y de visita ya vienen calculados (no los recalcules); usalos para armar la recomendación de secuencia y el tiempo total estimado.
- Si hay items sin ubicación resuelta, decilo en "alertas" y no los uses para decidir el orden geográfico.
- No hay restricción de capacidad de vehículo en este dominio (no es despacho de portones) - no la inventes.
- Sé concreto y accionable: el usuario va a revisar tu recomendación y decidir, no la vas a aplicar vos.$$
) on conflict (id) do nothing;
