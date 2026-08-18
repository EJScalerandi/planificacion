-- Migración: Config del motor de logística IA (Fase 1)
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- Fila única (id=1) con el prompt del sistema (editable desde el planificador
-- - acá van las reglas de negocio en lenguaje natural que el usuario quiera
-- que la IA tenga en cuenta al razonar) y los parámetros operativos
-- (velocidad de viaje, horas por instalación, modelo de Claude a usar).
-- Ver server/lib/logisticaIaRecomendacion.js.
create table if not exists public.logistica_ia_config (
  id smallint primary key default 1 check (id = 1),
  prompt_sistema text not null default '',
  modelo text not null default 'claude-sonnet-5',
  velocidad_kmh numeric not null default 70,
  horas_por_instalacion numeric not null default 2,
  updated_at timestamptz not null default now()
);

insert into public.logistica_ia_config (id, prompt_sistema) values (1,
$$Sos el asistente de logística de Degrandis Portones. Te paso un conjunto de portones ya seleccionados por el usuario para armar un viaje, junto con su ubicación, zona, y si cumplen o no las reglas de envío configuradas.

Tu trabajo es recomendar:
- Un orden de paradas razonable (agrupá por cercanía geográfica, no saltes de un extremo a otro sin necesidad).
- Una semana sugerida para el viaje (considerando que portones que todavía no cumplen su regla de envío no deberían despacharse antes de estar habilitados).
- Un resumen breve del razonamiento.

Reglas generales (además de las reglas de envío puntuales que te paso como dato):
- Nunca recomiendes despachar un portón antes de la fecha en que queda habilitado según su regla de envío. Si el usuario seleccionó alguno que no cumple todavía, avisá en "alertas" en vez de ignorarlo.
- Los tiempos de viaje y de instalación ya vienen calculados (no los recalcules); usalos para armar la recomendación de secuencia y para el tiempo total estimado.
- Si hay portones sin ubicación resuelta, decilo en "alertas" y no los uses para decidir el orden geográfico.
- Sé concreto y accionable: el usuario va a revisar tu recomendación y decidir, no la vas a aplicar vos.$$
) on conflict (id) do nothing;
