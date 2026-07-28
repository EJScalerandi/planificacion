-- Pedidos diarios de insumos por sección (tablet) + dashboard "Compras".
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.
--
-- "seccion" acá es el SLUG DE RUTA/TABLET (App.jsx ROUTES[].path sin la barra inicial):
-- diseno, laser, corte, plegado, prefabricados, armado-primario, pintura, inyeccion,
-- revestimiento, armado-final, despacho. OJO: usa guión medio (armado-primario), a
-- diferencia de los stage_key de workflow (armado_primario, guión bajo) — son universos
-- distintos, no confundir.

create table if not exists public.insumos_categoria_seccion (
  categ_id integer primary key,
  categ_nombre text,
  seccion text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insumos_categoria_seccion_seccion_check check (
    seccion = any (array[
      'diseno','laser','corte','plegado','prefabricados','armado-primario',
      'pintura','inyeccion','revestimiento','armado-final','despacho'
    ])
  )
);
create index if not exists idx_insumos_categoria_seccion_seccion on public.insumos_categoria_seccion(seccion);

create table if not exists public.insumos_pedidos (
  id serial primary key,
  seccion text not null,
  fecha date not null,
  status text not null default 'ABIERTO',
  confirmed_by_user_id int references public.qc_users(id),
  confirmed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insumos_pedidos_seccion_check check (
    seccion = any (array[
      'diseno','laser','corte','plegado','prefabricados','armado-primario',
      'pintura','inyeccion','revestimiento','armado-final','despacho'
    ])
  ),
  constraint insumos_pedidos_status_check check (
    status = any (array['ABIERTO','CONFIRMADO','CERRADO','CERRADO_VACIO'])
  ),
  constraint insumos_pedidos_seccion_fecha_uniq unique (seccion, fecha)
);
create index if not exists idx_insumos_pedidos_fecha on public.insumos_pedidos(fecha);
create index if not exists idx_insumos_pedidos_seccion_status on public.insumos_pedidos(seccion, status);

create table if not exists public.insumos_pedido_items (
  id serial primary key,
  pedido_id int not null references public.insumos_pedidos(id) on delete cascade,
  producto_odoo_id int not null,
  producto_nombre text not null,
  producto_codigo text,
  unidad text,
  categoria_odoo_id int,
  cantidad_pedida numeric(12,2) not null default 0,
  cantidad_entregada numeric(12,2),
  no_disponible boolean not null default false,
  no_disponible_note text,
  is_carryover boolean not null default false,
  carried_over_from_item_id int references public.insumos_pedido_items(id),
  carryover_consumed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insumos_pedido_items_cantidad_check check (cantidad_pedida >= 0)
);
create unique index if not exists uq_insumos_pedido_items_pedido_producto
  on public.insumos_pedido_items(pedido_id, producto_odoo_id);
create index if not exists idx_insumos_pedido_items_pedido on public.insumos_pedido_items(pedido_id);
create index if not exists idx_insumos_pedido_items_pendientes
  on public.insumos_pedido_items(carryover_consumed) where carryover_consumed = false;

-- QC: nueva línea 'insumos' (mismo patrón que migration_orden_externa.sql).
alter table public.qc_event drop constraint if exists qc_event_line_check;
alter table public.qc_event add constraint qc_event_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos']));

alter table public.qc_user_scope drop constraint if exists qc_user_scope_line_check;
alter table public.qc_user_scope add constraint qc_user_scope_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos']));

alter table public.qc_motive drop constraint if exists qc_motive_line_check;
alter table public.qc_motive add constraint qc_motive_line_check
  check (line = any (array['portones','ipanel','prefabricados','servicio_tecnico','orden_externa','insumos']));
