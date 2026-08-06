-- Horario de cierre (auto-cierre de pedidos) configurable por sección de
-- insumos, en vez del horario fijo de las 20:00 para todas. Una sección sin
-- fila acá usa el default de 20:00 (ver getHorasCierre en insumosPedidos.js).
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

create table if not exists public.insumos_seccion_cierre (
  seccion text primary key,
  hora_cierre time not null default '20:00:00',
  updated_at timestamptz not null default now(),
  constraint insumos_seccion_cierre_seccion_check check (
    seccion = any (array[
      'diseno','laser','corte','plegado','prefabricados','armado-primario',
      'pintura','inyeccion','revestimiento','armado-final','despacho'
    ])
  )
);
