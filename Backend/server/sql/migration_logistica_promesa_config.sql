-- Migración: config de "semana prometida" del viaje (Logística de Fechas - mapa)
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- La "semana prometida" de un NV es la semana de producción que el Presupuestador
-- ya calcula y reserva por capacidad (presupuestador_quotes.production_delivery_week_start/
-- _end, ver cotizador-back/src/productionPlanning.js - lo mismo que se le muestra al
-- cliente como "Fin de producción estimada" en PortonesEstadoPage) + N semanas de margen,
-- configurable acá. Fila única (id=1).
create table if not exists public.logistica_promesa_config (
  id smallint primary key default 1 check (id = 1),
  semanas_despues_produccion int not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.logistica_promesa_config (id, semanas_despues_produccion)
values (1, 1)
on conflict (id) do nothing;
