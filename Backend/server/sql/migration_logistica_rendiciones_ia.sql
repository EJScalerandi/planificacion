-- Rendiciones con verificación por IA - pedido explícito del usuario.
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql
-- (también vive en el array MIGRATIONS de server/index.js, se aplica sola en
-- cada arranque).

-- hora_llegada_real: la marca "finalizar viaje" que le faltaba a
-- marcar-salida/hora_salida_real - define el fin del rango de fechas válido
-- para los gastos del viaje, y logística no puede aprobar la rendición hasta
-- que esté cargada.
-- rendicion_aprobada_*: el "ok" final de logística sobre TODOS los gastos.
alter table public.logistica_viajes
  add column if not exists hora_llegada_real timestamptz,
  add column if not exists rendicion_aprobada_por text,
  add column if not exists rendicion_aprobada_at timestamptz;

-- Por gasto: qué leyó la IA del comprobante y si hizo falta revisión humana.
alter table public.logistica_gastos
  add column if not exists tipo_comprobante text,
  add column if not exists medio_pago text,
  add column if not exists estado_revision text not null default 'pendiente',
  add column if not exists detalle_revision text,
  add column if not exists campos_inciertos text[];

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'logistica_gastos_estado_revision_check'
  ) then
    alter table public.logistica_gastos
      add constraint logistica_gastos_estado_revision_check
      check (estado_revision in ('pendiente','ok','revisar'));
  end if;
end $$;
