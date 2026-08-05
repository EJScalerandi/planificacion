-- Nombre "para mostrar" de un insumo en el planificador (tablets), editable
-- desde Admin · Compras · Config categorías↔sección, sin tocar el nombre real
-- del producto en Odoo. Si no hay fila para un producto, se muestra el
-- nombre de Odoo tal cual (ver merge en public/insumos.js y admin/insumos.js).
-- Correr a mano contra la base (Supabase), igual que el resto de server/sql/*.sql.

create table if not exists public.insumos_producto_nombre_display (
  producto_odoo_id integer primary key,
  nombre_display text not null,
  updated_at timestamptz not null default now()
);
